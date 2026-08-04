# Rook Legal Notary Agent

## Onchain Provenance for Legal Research

Autonomous AI agent that pays for legal document retrieval via x402 micropayments, then notarizes each document on Hedera Consensus Service (HCS) — producing a court-facing chain of custody proof embedded inside the PDF itself.

### How It Works

```
1. DISCOVER → Agent reads llms.txt → finds paid legal research endpoints
2. PAY     → x402 402 challenge → CDP wallet → USDC on Base → document returned
3. HASH    → SHA-256 of retrieved document
4. ANCHOR  → HCS submitMessage(document hash) → consensus timestamp + tx ID
5. PROOF   → Bundle JSON proof packet: hash, HCS tx, consensus timestamp, x402 settlement
6. EMBED   → Attach proof packet inside PDF as metadata — receipt travels with the doc
7. VERIFY  → Re-hash PDF → check HCS → verify x402 tx → pass/fail
```

### Proof Packet

Every notarized document carries a JSON proof packet embedded in the PDF:

- **document_hash** — SHA-256 of the document bytes
- **hcs_anchor** — HCS topic ID, sequence number, consensus timestamp, running hash, tx ID
- **x402_settlement** — endpoint called, amount, USDC tx hash on Base
- **merkle_proof** — inclusion proof if batched (one HCS anchor for multiple docs)

Anyone can re-hash the document and verify against the HCS record to prove nothing was altered post-retrieval.

### Batch Mode (Merkle)

For research sessions pulling multiple documents, the agent Merkle-trees all document hashes and anchors a single root to HCS. Each document's inclusion is independently verifiable. Cheaper, same provenance.

### Tech Stack

- **Node.js 22** — runtime
- **@coinbase/cdp-sdk** — wallet + EIP-3009 x402 payments
- **@x402/fetch** — x402 payment-aware HTTP client
- **@hashgraph/sdk** — Hedera Consensus Service (HCS) anchoring
- **pdf-lib** — PDF metadata attachment embedding
- **dotenv** — environment management

### Quick Start

```bash
git clone https://github.com/Ai-Rook/rook-legal-notary.git
cd rook-legal-notary
npm install

# Configure .env (see .env.example)
cp .env.example .env

# Run
node agent.js
```

### Environment Variables

```
# x402 Payment
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...
CDP_WALLET_SECRET=...
X402_WALLET_NAME=x402-client-wallet-1
LEGAL_API_URL=https://agents.ai-rook.com

# Hedera HCS
HEDERA_ACCOUNT_ID=0.0.xxx
HEDERA_PRIVATE_KEY=...
HCS_TOPIC_ID=0.0.xxx
```

### Built For

**BLI Legal Tech Hackathon 2** — Blockchain Legal Institute
Judging: Nov 5 - Dec 5, 2026 | Awards: Dec 12, 2026

### Links

- **GitHub**: https://github.com/Ai-Rook/rook-legal-notary
- **Spec**: Full architecture spec available in repo
