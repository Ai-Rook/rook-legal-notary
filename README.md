# Rook Legal Notary Agent

## Onchain Provenance for Legal Research

Autonomous AI agent that pays for legal document retrieval via x402 micropayments, then notarizes each document on Hedera Consensus Service (HCS) — producing a court-facing chain of custody proof embedded inside the PDF itself.

### Why Courts Care

When legal documents are retrieved from databases during research or discovery, the chain of custody is often opaque — no cryptographic proof of what was retrieved, when, or whether it was altered afterward. This agent solves that by anchoring a SHA-256 hash of each document on Hedera Consensus Service at the moment of acquisition, producing a consensus timestamp and transaction ID that any third party can independently verify against a public ledger. Under US Federal Rules of Evidence 902(13) and 902(14), self-authenticating electronic records with hash verification are already recognized as an authentication pathway — this tool implements that pathway, it doesn't invent a new legal theory. This is an authentication aid that supports admissibility, not a claim of automatic admissibility. The independent verification script (`verify.js`) lets anyone confirm document integrity in seconds without trusting us.

### How It Works

```
1. DISCOVER → Agent reads llms.txt → finds paid legal research endpoints
2. PAY     → x402 402 challenge → CDP wallet → USDC on Base → document returned
3. HASH    → SHA-256 of retrieved document
4. ANCHOR  → HCS submitMessage(document hash) → consensus timestamp + tx ID
5. PROOF   → Bundle JSON proof packet: hash, HCS tx, consensus timestamp, x402 settlement
6. EMBED   → Attach proof packet to PDF (trailing append after %%EOF)
7. VERIFY  → Re-hash PDF → check HCS via public mirror node → pass/fail
```

### Proof Packet

Every notarized document carries a JSON proof packet embedded in the PDF:

- **document_hash** — SHA-256 of the document bytes
- **hcs_anchor** — HCS topic ID, sequence number, consensus timestamp, running hash, tx ID
- **x402_settlement** — endpoint called, amount, USDC tx hash on Base
- **merkle_proof** — inclusion proof if batched (one HCS anchor for multiple docs)

Anyone can re-hash the document and verify against the HCS record to prove nothing was altered post-retrieval.

### Independent Verification

Zero dependencies — just Node.js:

```bash
node verify.js notarized-document.pdf
```

Output:
```
[1/4] Extracting proof packet from PDF...  PASS
[2/4] Re-hashing document...               PASS
[3/4] Querying Hedera Consensus Service...  PASS
[4/4] Verdict: VERIFIED

Document integrity (hash match): PASS
Onchain provenance (HCS match):  PASS

Anyone can independently verify this at:
https://mainnet-public.mirrornode.hedera.com/api/v1/topics/0.0.10791674/messages/11
```

### Batch Mode (Merkle)

For research sessions pulling multiple documents, the agent Merkle-trees all document hashes and anchors a single root to HCS. Each document's inclusion is independently verifiable. One transaction for the whole batch.

### Quick Start

```bash
git clone https://github.com/Ai-Rook/rook-legal-notary.git
cd rook-legal-notary
npm install

# Start the CourtListener x402 proxy
node courtlistener-proxy.js

# Run the agent (separate terminal)
node agent.js

# Verify a notarized document
node verify.js /tmp/legal-doc-notarized.pdf
```

### Environment Variables

```bash
# x402 Payment
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...
CDP_WALLET_SECRET=...
X402_WALLET_NAME=x402-client-wallet-1
LEGAL_API_URL=http://localhost:3090

# Hedera HCS (mainnet)
HEDERA_ACCOUNT_ID=0.0.xxxxx
HEDERA_PRIVATE_KEY=0x...
HCS_TOPIC_ID=0.0.xxxxx
HEDERA_NETWORK=mainnet
```

### Tech Stack

- **Node.js 22** — runtime
- **@coinbase/cdp-sdk** — wallet + EIP-3009 x402 payments
- **@x402/fetch** — x402 payment-aware HTTP client
- **@hashgraph/sdk** — Hedera Consensus Service (HCS) anchoring
- **pdf-lib** — PDF generation from case law text
- **CourtListener API** — free legal data source (9M+ court opinions)
- **dotenv** — environment management

### Files

| File | Description |
|------|-------------|
| `agent.js` | Main agent flow (7 steps: discover → verify) |
| `x402-client.js` | CDP + x402 payment handling |
| `hcs-client.js` | Hedera Consensus Service anchoring |
| `proof-packet.js` | Chain of custody JSON artifact (build + verify) |
| `pdf-embed.js` | Embed/extract proof packet in PDF |
| `merkle.js` | Merkle tree for batch document sessions |
| `courtlistener-proxy.js` | x402 paywall proxy around CourtListener API |
| `verify.js` | Independent zero-dependency verification script |
| `mock-server.js` | Mock legal doc server for testing |
| `e2e-test.sh` | End-to-end test suite |
| `test-merkle.js` | Merkle batch mode test |

### Built For

**BLI Legal Tech Hackathon 2** — Blockchain Legal Institute
Judging: Nov 5 - Dec 5, 2026 | Awards: Dec 12, 2026
Bounty partners: Chainlink (CRE), ICP/DFINITY, Story, Constellation

### Links

- **GitHub**: https://github.com/Ai-Rook/rook-legal-notary
- **Spec**: `specs/2026-08-04-bli-legal-notary-agent.md`
- **HCS Topic**: 0.0.10791674 (Hedera mainnet)
- **CourtListener**: https://www.courtlistener.com
