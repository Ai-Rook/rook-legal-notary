# Rook Legal Notary Agent

## Onchain Provenance for Legal Research

[![Demo Video](https://img.youtube.com/vi/SU_zUwT5rug/maxresdefault.jpg)](https://youtu.be/SU_zUwT5rug)

---

## The Problem

When legal documents are retrieved from databases during research or discovery, the chain of custody is opaque. No cryptographic proof of what was retrieved, when, or whether it was altered afterward. "I found this document online" is not chain of custody.

## The Solution

An autonomous AI agent that pays for legal document retrieval via **x402 micropayments**, notarizes each document on **Hedera Consensus Service (HCS)**, and embeds a verifiable proof packet directly inside the PDF.

### How It Works

```
1. DISCOVER → Agent reads llms.txt → finds paid legal research endpoints
2. PAY     → x402 402 challenge → CDP wallet → USDC on Base → document returned
3. SEAL    → Add visible provenance seal page to PDF (hash, HCS data, verify URLs)
4. HASH    → SHA-256 of sealed PDF
5. ANCHOR  → HCS submitMessage(sealed hash) → consensus timestamp + tx ID
6. PROOF   → Bundle JSON proof packet: hash, HCS tx, consensus timestamp, x402 settlement
7. EMBED   → Attach proof packet to PDF (trailing append after %%EOF)
8. VERIFY  → Re-hash PDF → check HCS via public mirror node → pass/fail
```

### Live on Mainnet

Every notarized document is anchored on Hedera Consensus Service mainnet. The latest anchor is verifiable right now:

🔗 [HCS Topic 0.0.10791674 — Message #32](https://mainnet-public.mirrornode.hedera.com/api/v1/topics/0.0.10791674/messages/32)

### Web Verification — Zero Installation

Anyone can verify a notarized PDF without installing anything:

🔍 **[agents.ai-rook.com/verify](https://agents.ai-rook.com/verify)** — Upload the PDF, get a pass/fail verdict in seconds. The web verifier extracts the embedded proof packet, re-hashes the document, and queries the public Hedera mirror node API.

### Sample Notarized PDF

📄 [Download the sample PDF](https://github.com/Ai-Rook/rook-legal-notary/blob/main/sample/legal-doc-notarized.pdf) and verify it yourself at [agents.ai-rook.com/verify](https://agents.ai-rook.com/verify).

### What's Inside the PDF

Every notarized PDF contains:

**Page 1 — Case Law Document**
- Real case law retrieved from CourtListener (9M+ court opinions)
- Footer with provenance stamp: `HCS Anchored | sha256:... | Verify: agents.ai-rook.com/verify`

**Page 2 — Visible Provenance Seal**
- Full document hash (SHA-256) — nothing truncated
- HCS topic ID, consensus timestamp, transaction ID
- x402 payment reference ($0.001 USDC on Base)
- Verification URLs (web verifier + direct mirror node link)
- Plain-English instructions: "Match the hash above against the onchain record"

**Embedded After %%EOF — Machine-Readable Proof Packet (JSON)**
```json
{
  "version": "1.1",
  "document_hash": "sha256:<original document hash>",
  "sealed_hash": "sha256:<sealed PDF hash — anchored on HCS>",
  "retrieved_at": "2026-08-05T01:03:00.244Z",
  "x402_settlement": {
    "transaction": "simulated-x402-payment",
    "amount": "1000",
    "network": "base"
  },
  "hcs_anchor": {
    "topic_id": "0.0.10791674",
    "sequence_number": "32",
    "consensus_timestamp": "1785893608.345182617"
  }
}
```

## Key Features

### x402 Micropayments
The agent pays for each document via HTTP 402 → EIP-3009 payment authorization. $0.001 USDC on Base. The payment settles in ~2 seconds. The server returns the document only after payment is confirmed on-chain.

### Visible Provenance Seal
A full-page seal inside the PDF with all the data a court needs: document hash, HCS topic, consensus timestamp, transaction ID, and verification URLs. No truncation — every hash is shown in full.

### Machine-Readable Proof Packet
A JSON artifact embedded after the PDF's %%EOF marker (byte-safe — doesn't corrupt the PDF). Contains the complete chain of custody: document hash, sealed hash, HCS anchor data, x402 settlement proof. Extractable by any tool that reads bytes.

### Independent Verification
Zero-dependency verification — just Node.js. The `verify.js` script extracts the proof packet, re-hashes the sealed PDF, queries the public Hedera mirror node, and prints PASS/FAIL. No Rook tooling required.

### Web Verifier
[agents.ai-rook.com/verify](https://agents.ai-rook.com/verify) — a browser-based verifier. Upload the PDF, get a green checkmark or red X. No CLI, no GitHub, no installation. Built for paralegals, not developers.

### Merkle Batch Mode
For research sessions pulling multiple documents, the agent Merkle-trees all document hashes and anchors a single root to HCS. Each document's inclusion is independently verifiable. One transaction for the whole batch.

### Chainlink CRE Integration
The same notary flow is also orchestrated as a **Chainlink Runtime Environment (CRE) workflow**. An HTTP trigger receives a research query, DON nodes independently retrieve and hash the document, results are verified through Byzantine Fault Tolerant consensus (`consensusIdenticalAggregation`), and the consensus hash is anchored on HCS. The workflow is compiled to WebAssembly and deployable to a DON or simulated locally.

## Legal Framing

Under US Federal Rules of Evidence **902(13)** and **902(14)**, self-authenticating electronic records with hash verification are recognized as an authentication pathway. This tool implements that pathway — it does not invent a new legal theory.

This is an **authentication aid that supports admissibility**, not a claim of automatic admissibility. The independent verification script and web verifier let any third party confirm document integrity in seconds without trusting us.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Micropayments | x402 (HTTP 402 + EIP-3009) |
| Onchain anchoring | Hedera Consensus Service (mainnet) |
| Legal data | CourtListener API (9M+ court opinions) |
| PDF manipulation | pdf-lib (seal page) + byte-safe trailing append (proof packet) |
| Hashing | SHA-256 (Node.js crypto) |
| Runtime | Node.js |
| Orchestration | Chainlink Runtime Environment (CRE) |
| Verification | Zero-dependency Node.js script + web verifier |

## Architecture Diagram

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  AI Agent   │────▶│  x402 Proxy  │────▶│  CourtListener  │
│  (agent.js) │     │  (port 3090) │     │  API (9M+ ops)  │
└─────────────┘     └──────────────┘     └─────────────────┘
     │                      │                      │
     │   $0.001 USDC        │  402 challenge        │  Case law PDF
     │   (Base mainnet)     │  + payment             │
     ▼                      ▼                      ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  HCS Anchor │◀────│  Proof Packet│◀────│  Seal Page Added│
│  (mainnet)  │     │  (JSON)      │     │  (pdf-lib)      │
└─────────────┘     └──────────────┘     └─────────────────┘
     │                      │
     │  consensus timestamp │  embedded after %%EOF
     │  + tx ID             │
     ▼                      ▼
┌──────────────────────────────────────┐
│  Final PDF (case law + seal + proof) │
│  Verify: agents.ai-rook.com/verify          │
│  Verify: node verify.js <pdf>        │
└──────────────────────────────────────┘
```

## Links

- 🎬 Demo Video: https://youtu.be/SU_zUwT5rug
- 📦 GitHub: https://github.com/Ai-Rook/rook-legal-notary
- 🔍 Web Verifier: https://agents.ai-rook.com/verify
- 📄 Sample PDF: https://github.com/Ai-Rook/rook-legal-notary/blob/main/sample/legal-doc-notarized.pdf
- ⛓️ HCS Topic (live): https://mainnet-public.mirrornode.hedera.com/api/v1/topics/0.0.10791674
- ✍️ Blog Post: https://github.com/Ai-Rook/rook-legal-notary/blob/main/BLOG_POST.md
- 🐦 X/Twitter: https://x.com/AIAgent
- 📺 YouTube: https://youtube.com/@AiAgent

## Built For

- **BLI Legal Tech Hackathon 2** ($50K prize pool)
- **Chainlink CRE Bounty** ($1K x2)
- **Hedera AI Bounties** (next window Aug 11)

## Team

**AI Rook** — autonomous AI agent infrastructure for agent commerce and onchain provenance. We build agents that pay, notarize, and verify.
