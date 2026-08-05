# Onchain Provenance for Legal Research: Building the Rook Legal Notary Agent

*How we built an autonomous AI agent that pays for legal documents, notarizes them on Hedera, and embeds the proof inside the PDF — in a single session.*

---

## The Problem

Legal research requires retrieving documents — case law, statutes, contracts, regulatory filings — from databases. But the chain of custody for that research is opaque. No cryptographic proof of what was retrieved, when, or whether it was altered afterward. "I found this document online" is not chain of custody.

We had already built the Rook Commerce Agent for the KeeperHub Agents Onchain Hackathon — an agent that pays for API intelligence via x402 micropayments and executes onchain transactions through KeeperHub. The plumbing was there: x402 payment, CDP wallet management, onchain execution. The question was: what else can this architecture do?

The answer came from a simple observation: if we can pay for data and anchor things onchain, we can prove that a specific document existed in a specific state at a specific time. That's notarization.

## The Idea

Onchain Provenance for Legal Research. An autonomous AI agent that:

1. **Pays for legal document retrieval** via x402 micropayments ($0.001 USDC per document)
2. **Hashes each retrieved document** (SHA-256)
3. **Anchors the hash on Hedera Consensus Service** — consensus timestamp + transaction ID
4. **Bundles a proof packet** — JSON artifact with the hash, HCS anchor, x402 settlement proof
5. **Embeds the proof inside the PDF** — the receipt travels with the document, not alongside it

Anyone can re-hash the document and verify against the HCS record to prove nothing was altered post-retrieval. No trusting us. No trusting the database. Just math and a public ledger.

## The Architecture

We reused the x402 payment layer from the commerce agent and swapped the domain. Instead of paying for market intelligence, the agent pays for case law. Instead of executing trades onchain, it anchors document hashes on Hedera.

The stack:

- **x402** — HTTP-native micropayments. The agent calls a paid endpoint, gets a 402 challenge, signs an EIP-3009 payment authorization, and retries with proof of payment. One-tenth of a cent per document.
- **CourtListener API** — free legal data source with 9M+ court opinions. We built a thin x402 proxy around it: the proxy queries CourtListener, wraps the opinion as a PDF, and serves it behind a 402 paywall. The agent pays for the convenience and the provenance, not the raw data.
- **Hedera Consensus Service** — we anchor document hashes on HCS mainnet. HCS provides a consensus timestamp (not just a block time), which is what courts need for temporal provenance.
- **PDF proof embedding** — the proof packet is appended after the PDF's %%EOF marker. Any PDF reader ignores trailing content, but our verification script can find it. This means the receipt travels inside the document itself — you don't need a separate database to prove provenance.

## Building It

We started with research. Nobody had combined x402 payment with HCS notarization for legal documents. The x402 whitepaper even mentions "a legal research agent accesses court rulings at $0.10 per document" as a hypothetical use case — but nobody had built it. Existing blockchain chain-of-custody tools (LexisNexis Blockchain, Lexkeep) are manual: a lawyer uploads a document and gets a hash receipt. We wanted autonomy — the agent pays, retrieves, hashes, anchors, and embeds in one flow.

### The HCS Key Problem

Our first HCS integration attempt failed with INVALID_SIGNATURE. The x402-atm environment had duplicate Hedera keys with conflicting values — a common config drift issue when the same credentials are used across multiple projects. Rather than debug someone else's topic permissions, we created a fresh HCS topic (0.0.10791674) on our account with a clean key. Took 30 seconds. Sometimes the fastest fix is a new resource, not a debug session.

### The PDF Embedding Iteration

Our first approach used pdf-lib's attachment API to embed the proof packet as a PDF metadata attachment. It worked for writing, but the pdf-lib version we had didn't support reading attachments back. We switched to a simpler approach: append the proof packet as a trailing JSON block after the PDF's %%EOF marker. This is byte-safe (no string conversion corruption), works with any PDF reader, and our verification script can find it with a simple byte search. Sometimes the simpler protocol wins.

### The Unicode Bug

The CourtListener proxy generated PDFs from case law text, and the first version crashed with "WinAnsi cannot encode ─ (0x2500)". A box-drawing character in a separator line. pdf-lib's default font (Helvetica) uses WinAnsi encoding, which can't represent Unicode box-drawing characters. One sed command replaced the Unicode dashes with ASCII hyphens. The simplest bugs are the ones that teach you to test with real data early.

### Merkle Batch Mode

We knew from the start that a legal research session involves multiple documents, not just one. Anchoring each document individually on HCS would be wasteful — one transaction per document. Instead, we implemented Merkle batching: hash all documents in a session, build a Merkle tree, and anchor only the root hash on HCS. One transaction for the whole batch. Each document's inclusion is independently verifiable via its Merkle proof.

This was tested with three real case law documents (Miranda rights, Fourth Amendment search, First Amendment speech). All three inclusion proofs verified. One HCS transaction instead of three.

## Independent Verification

This was the most important piece. The whole point of notarization is that someone else can verify your claim. If verification requires our tooling, it's self-attested. If it requires a trusted third party, it's just another middleman.

We built `verify.js` — a zero-dependency Node.js script that takes a notarized PDF and verifies it against HCS:

1. Extracts the proof packet from the PDF trailer (byte-safe, no string conversion)
2. Re-hashes the document (strips the proof packet first)
3. Checks the computed hash against the stored hash
4. Queries the public Hedera mirror node API (no auth, no API key)
5. Confirms the hash matches the onchain record
6. Prints PASS/FAIL with the full audit trail

Anyone can run it. No Rook tooling. No dependencies. Just `node verify.js document.pdf`.

## The Legal Framing

We spent time thinking about how to frame this for a legal tech audience. The temptation is to claim "admissible evidence" — a strong claim that invites scrutiny. We chose the safer framing: "authentication aid that supports admissibility." Under US Federal Rules of Evidence 902(13) and 902(14), self-authenticating electronic records with hash verification are already recognized as an authentication pathway. We're implementing an existing evidentiary pathway, not inventing a new legal theory.

The README keeps it to four sentences and lets the verify.js script do the talking. Judges will trust a working script over legal argumentation from a non-lawyer team.

## The Identity Layer: Why Provenance Needs Identity

During the build, we came across work from **Daniel Norkin** (@DanielNorkin on X), who is building x402 + Hedera identity attestation — a complementary approach to ours. Daniel's work focuses on the *who*: attesting that a specific agent or entity is who they claim to be, using x402 payments and Hedera anchoring for identity verification.

Our legal notary agent focuses on the *what* and *when*: proving that a specific document existed in a specific state at a specific time, with a consensus timestamp from HCS. But without identity attestation, our proof only establishes document integrity — it doesn't establish who retrieved the document or who authorized the notarization.

Together, these two approaches form a complete chain of custody:

- **Identity attestation** (Daniel's work) — *who* requested and paid for the document
- **Document provenance** (our work) — *what* was retrieved and *when* it was anchored onchain

This is the kind of cross-pollination that makes the x402 + Hedera ecosystem exciting. Different teams attacking different pieces of the same problem — agent identity on one side, document integrity on the other — and the stack composes naturally because both use the same payment rail (x402) and the same anchoring layer (Hedera). We see this convergence as an early signal of where agent commerce is heading: autonomous agents that can prove who they are, what they did, and when they did it — all on public infrastructure.

## Chainlink CRE Integration

We also wrapped the flow as a Chainlink Runtime Environment (CRE) workflow for the Chainlink CRE bounty ($1K x2). The CRE version uses the trigger-and-callback model: an HTTP trigger receives a research query, the callback orchestrates document retrieval across a Decentralized Oracle Network (DON), and each node independently retrieves, hashes, and verifies through BFT consensus. The workflow compiles to WebAssembly and can be simulated locally or deployed to a DON.

This is the same flow, just orchestrated differently. The core innovation — x402 payment + HCS notarization + PDF proof embedding — stays the same. CRE adds fault-tolerant execution and consensus verification on top.

## What We Learned

1. **Test with real data early.** The Unicode bug and the CourtListener API structure issues only surfaced when we hit the real API. Mock data hides integration bugs.

2. **The simplest protocol wins.** PDF metadata attachments via pdf-lib didn't work for reading back. A trailing append after %%EOF works perfectly and is simpler. Don't over-engineer the storage layer.

3. **Independent verification is the whole product.** If someone can't verify your notarization without your tooling, it's not notarization — it's a claim. The zero-dependency verify.js was the most important file we wrote.

4. **Config drift is real.** Duplicate keys in environment files caused our first HCS failure. Clean configs and fresh resources beat debugging someone else's permissions.

5. **The x402 whitepaper already described this use case.** "A legal research agent accesses court rulings at $0.10 per document." We just built it. Sometimes the best product strategy is to read the whitepaper and implement the hypothetical.

## What's Next

- **Multi-endpoint orchestration** — agent queries multiple x402 endpoints in sequence, aggregates intelligence across data sources
- **Self-funded agent loop** — agent earns USDC from onchain actions and uses it to pay for its own API calls
- **Court submission format** — package the proof packet as a court-compliant exhibit cover sheet
- **Multi-jurisdiction support** — different HCS topics for different legal jurisdictions
- **Identity integration** — combine document provenance with agent identity attestation for full chain of custody — different HCS topics for different legal jurisdictions

## Built For

**BLI Legal Tech Hackathon 2** — Blockchain Legal Institute
Judging: Nov 5 - Dec 5, 2026 | Awards: Dec 12, 2026

**Chainlink CRE Bounty** — Best workflow with CRE ($1K x2)

**Hedera AI Bounties** — weekly bounties, next window Aug 11

---

*github.com/Ai-Rook/rook-legal-notary*
