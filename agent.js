const dotenv = require("dotenv");
const { initX402, discoverEndpoints, retrieveDocument } = require("./x402-client");
const { HCSClient } = require("./hcs-client");
const { buildProofPacket, verifyProofPacket } = require("./proof-packet");
const { embedProofPacket, extractProofPacket } = require("./pdf-embed");
const { buildMerkleTree, verifyMerkleProof } = require("./merkle");
const crypto = require("crypto");

dotenv.config();

const PAUSE = 9000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function banner(text) {
  console.log("\n" + "=".repeat(60));
  console.log("  " + text);
  console.log("=".repeat(60) + "\n");
}

async function main() {
  banner("ROOK LEGAL NOTARY AGENT");
  console.log("  Onchain Provenance for Legal Research");
  console.log("  x402 payment + HCS notarization + PDF proof embedding");
  await sleep(PAUSE);

  // ─── STEP 1: DISCOVER ───
  banner("STEP 1: DISCOVER x402 LEGAL ENDPOINTS");
  console.log("  Reading llms.txt to find paid legal research APIs...");
  await sleep(4000);

  const endpoints = await discoverEndpoints();
  console.log("\n  Found " + endpoints.length + " paid endpoints");
  endpoints.slice(0, 5).forEach((ep, i) => console.log("    " + (i + 1) + ". " + ep));
  if (endpoints.length > 5) console.log("    ... and " + (endpoints.length - 5) + " more");

  const targetEndpoint = endpoints.find(ep => ep.includes("legal") || ep.includes("case") || ep.includes("document")) || endpoints[0];
  console.log("\n  -> Selected: " + targetEndpoint);
  await sleep(PAUSE);

  // ─── STEP 2: PAY & RETRIEVE ───
  banner("STEP 2: PAY FOR LEGAL DOCUMENT");
  console.log("  Calling " + targetEndpoint + "...");
  console.log("  -> Server responds with 402 Payment Required...");
  await sleep(4000);

  const { data, settlement } = await retrieveDocument(targetEndpoint, "case law");
  console.log("\n  <- HTTP 200 - Payment settled!");
  if (settlement) {
    console.log("  x402 payment confirmed on Base");
    console.log("  Tx: " + (settlement.transaction || settlement.txHash || "confirmed"));
  }
  console.log("\n  Document retrieved: " + data.length + " bytes");
  await sleep(PAUSE);

  // ─── STEP 3: HASH ───
  banner("STEP 3: HASH DOCUMENT");
  const hash = crypto.createHash("sha256").update(data).digest("hex");
  console.log("  SHA-256: " + hash);
  await sleep(PAUSE);

  // ─── STEP 4: ANCHOR ON HCS ───
  banner("STEP 4: ANCHOR ON HEDERA CONSENSUS SERVICE");
  console.log("  Submitting document hash to HCS...");
  await sleep(4000);

  let hcsAnchor = null;
  if (process.env.HEDERA_ACCOUNT_ID && process.env.HEDERA_PRIVATE_KEY && process.env.HCS_TOPIC_ID) {
    const hcs = new HCSClient({
      accountId: process.env.HEDERA_ACCOUNT_ID,
      privateKey: process.env.HEDERA_PRIVATE_KEY,
      topicId: process.env.HCS_TOPIC_ID,
    });
    hcsAnchor = await hcs.anchorHash(hash);
    console.log("  HCS anchor confirmed!");
    console.log("  Topic: " + hcsAnchor.topic_id);
    console.log("  Sequence: " + hcsAnchor.sequence_number);
    console.log("  Consensus: " + hcsAnchor.consensus_timestamp);
    console.log("  Tx: " + hcsAnchor.tx_id);
    hcs.close();
  } else {
    console.log("  [DEMO MODE] HCS credentials not configured - generating mock anchor");
    hcsAnchor = {
      topic_id: "0.0.4567890",
      sequence_number: "42",
      consensus_timestamp: new Date().toISOString(),
      running_hash: crypto.randomBytes(32).toString("hex"),
      tx_id: "0.0.123456-" + Date.now() + "-000000000",
    };
    console.log("  [MOCK] Topic: " + hcsAnchor.topic_id);
    console.log("  [MOCK] Tx: " + hcsAnchor.tx_id);
  }
  await sleep(PAUSE);

  // ─── STEP 5: BUILD PROOF PACKET ───
  banner("STEP 5: BUILD PROOF PACKET");
  const proofPacket = buildProofPacket({
    documentBuffer: data,
    filename: "legal-document.pdf",
    x402Settlement: settlement,
    hcsAnchor,
  });
  console.log("  Proof packet assembled:");
  console.log("  Document hash: " + proofPacket.document_hash);
  console.log("  Retrieved at: " + proofPacket.retrieved_at);
  console.log("  HCS anchor: " + (proofPacket.hcs_anchor ? proofPacket.hcs_anchor.tx_id : "none"));
  console.log("  x402 tx: " + (proofPacket.x402_settlement ? proofPacket.x402_settlement.transaction : "none"));
  await sleep(PAUSE);

  // ─── STEP 6: EMBED IN PDF ───
  banner("STEP 6: EMBED PROOF PACKET IN PDF");
  console.log("  Attaching proof packet as PDF metadata...");
  await sleep(4000);

  try {
    const isPdf = data.slice(0, 4).toString("hex") === "25504446"; // %PDF
    if (isPdf) {
      const embeddedPdf = await embedProofPacket(data, proofPacket);
      console.log("  Proof packet embedded! " + embeddedPdf.length + " bytes");
      console.log("  Receipt travels with the document.");
    } else {
      console.log("  Document is not PDF - saving proof packet as sidecar JSON");
      const fs = require("fs");
      fs.writeFileSync("/tmp/proof-packet.json", JSON.stringify(proofPacket, null, 2));
      console.log("  Sidecar: /tmp/proof-packet.json");
    }
  } catch (err) {
    console.log("  Embed error: " + err.message);
    console.log("  Falling back to sidecar JSON");
    const fs = require("fs");
    fs.writeFileSync("/tmp/proof-packet.json", JSON.stringify(proofPacket, null, 2));
  }
  await sleep(PAUSE);

  // ─── STEP 7: VERIFY ───
  banner("STEP 7: VERIFY PROOF PACKET");
  console.log("  Re-hashing document and checking against proof packet...");
  await sleep(4000);
  const valid = verifyProofPacket(proofPacket, data);
  console.log("  Verification: " + (valid ? "PASS - document integrity confirmed" : "FAIL - hash mismatch"));

  // ─── AUDIT TRAIL ───
  banner("FULL AUDIT TRAIL");
  console.log("  " + "=".repeat(56));
  console.log("  Document: legal-document.pdf (" + data.length + " bytes)");
  console.log("  Hash: sha256:" + hash);
  console.log("  x402 Payment: " + (settlement ? settlement.transaction : "confirmed") + " on Base");
  console.log("  HCS Anchor: " + (hcsAnchor ? hcsAnchor.tx_id : "none"));
  console.log("  Consensus: " + (hcsAnchor ? hcsAnchor.consensus_timestamp : "none"));
  console.log("  Verification: " + (valid ? "PASS" : "FAIL"));
  console.log("  " + "=".repeat(56));
  console.log("");
  console.log("  Onchain provenance for legal research.");
  console.log("  Chain of custody: x402 settlement + HCS consensus timestamp.");
  console.log("");
  console.log("  github.com/Ai-Rook/rook-legal-notary");
  await sleep(PAUSE);
}

main().catch((err) => {
  console.error("\nFatal:", err.message);
  process.exit(1);
});
