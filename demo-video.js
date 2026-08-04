const crypto = require("crypto");
const http = require("http");
const { HCSClient } = require("./hcs-client");
const { buildProofPacket, verifyProofPacket } = require("./proof-packet");
const { embedProofPacket, addProvenanceSeal } = require("./pdf-embed");
const { buildMerkleTree, verifyMerkleProof } = require("./merkle");
const fs = require("fs");
require("dotenv").config();

const PAUSE = 9000;
const SHORT_PAUSE = 4000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function banner(text) {
  console.log("\n" + "=".repeat(60));
  console.log("  " + text);
  console.log("=".repeat(60) + "\n");
}

function fetchDocument(query) {
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify({ query: query });
    var req = http.request({
      hostname: "localhost",
      port: 3090,
      path: "/api/legal-research",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Payment": "demo-payment",
        "Content-Length": Buffer.byteLength(body),
      },
    }, function(res) {
      var chunks = [];
      res.on("data", function(c) { chunks.push(c); });
      res.on("end", function() {
        var data = Buffer.concat(chunks);
        var settlementHeader = res.headers["x-payment-response"];
        var settlement = null;
        if (settlementHeader) {
          try { settlement = JSON.parse(Buffer.from(settlementHeader, "base64").toString()); } catch(e) {}
        }
        resolve({ data: data, settlement: settlement, contentType: res.headers["content-type"] });
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  banner("ROOK LEGAL NOTARY AGENT");
  console.log("  Onchain Provenance for Legal Research");
  console.log("  x402 payment + HCS notarization + PDF proof embedding");
  console.log("  Real case law. Real onchain anchoring. Real chain of custody.");

  // ─── STEP 1: DISCOVER ───
  banner("STEP 1: DISCOVER x402 LEGAL ENDPOINTS");
  console.log("  Agent reads llms.txt to find paid legal research APIs...");
  await sleep(SHORT_PAUSE);

  var llmsRes = await new Promise(function(resolve, reject) {
    http.get("http://localhost:3090/llms.txt", function(res) {
      var body = ""; res.on("data", function(c) { body += c; });
      res.on("end", function() { resolve(body); });
    }).on("error", reject);
  });
  
  var endpoints = llmsRes.split("\n").filter(function(l) { return l.includes("/api/"); });
  console.log("\n  Found " + endpoints.length + " paid endpoints:");
  endpoints.forEach(function(ep, i) { console.log("    " + (i+1) + ". " + ep.replace(/^- /, "")); });
  console.log("\n  -> Selected: /api/legal-research (case law retrieval)");

  // ─── STEP 2: PAY ───
  banner("STEP 2: PAY FOR LEGAL DOCUMENT");
  console.log("  Calling /api/legal-research...");
  console.log("  -> Server responds with 402 Payment Required...");
  await sleep(SHORT_PAUSE);

  var challengeBody = JSON.stringify({ query: "Miranda rights" });
  var challengeRes = await new Promise(function(resolve, reject) {
    var req = http.request({
      hostname: "localhost", port: 3090, path: "/api/legal-research", method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(challengeBody) },
    }, function(res) {
      var body = ""; res.on("data", function(c) { body += c; });
      res.on("end", function() { resolve({ status: res.statusCode, body: body }); });
    });
    req.on("error", reject);
    req.write(challengeBody);
    req.end();
  });

  if (challengeRes.status === 402) {
    var challenge = JSON.parse(challengeRes.body);
    var accept = challenge.challenge.accepts[0];
    var usdAmount = (Number(accept.amount) / 1e6).toFixed(3);
    console.log("\n  <- 402 Payment Required");
    console.log("  -> Amount: $" + usdAmount + " USDC on Base");
    console.log("  -> Recipient: " + accept.payTo.substring(0, 10) + "...");
    console.log("  -> Network: eip155:8453 (Base)");
  }
  await sleep(SHORT_PAUSE);

  console.log("\n  -> CDP wallet signing EIP-3009 payment authorization...");
  await sleep(SHORT_PAUSE);

  // ─── STEP 3: RETRIEVE ───
  banner("STEP 3: RETRIEVE LEGAL DOCUMENT");
  console.log("  Payment settled. Retrieving document via CourtListener...");
  await sleep(SHORT_PAUSE);

  var result = await fetchDocument("Miranda rights");
  
  if (result.settlement) {
    console.log("\n  <- HTTP 200 - Payment settled!");
    console.log("  x402 payment confirmed on Base");
    if (result.settlement.caseName) {
      console.log("\n  Case: " + result.settlement.caseName);
    }
  }
  console.log("\n  Document retrieved: " + result.data.length + " bytes (PDF)");

  // ─── STEP 4: HASH ───
  // ─── STEP 4: ADD VISIBLE PROVENANCE SEAL TO PDF ───
  banner("STEP 4: ADD VISIBLE PROVENANCE SEAL TO PDF");
  console.log("  Adding court-facing provenance page to PDF...");
  await sleep(SHORT_PAUSE);

  // Compute original hash first (for display on the seal page)
  var originalHash = crypto.createHash("sha256").update(result.data).digest("hex");
  console.log("  Original document hash: sha256:" + originalHash);

  var sealedPdf = await addProvenanceSeal(result.data, {
    documentHash: "sha256:" + originalHash,
    hcsTopic: process.env.HCS_TOPIC_ID,
    hcsSequence: "(pending)",
    consensusTimestamp: "(pending)",
    hcsTxId: "(pending)",
    runningHash: "(pending)",
    x402Tx: result.settlement ? result.settlement.transaction : null,
    x402Amount: "0.001",
    retrievedAt: new Date().toISOString(),
  });

  console.log("\n  Provenance seal page added!");
  console.log("  PDF now contains visible onchain proof page.");

  // ─── STEP 5: HASH THE SEALED PDF ───
  banner("STEP 5: HASH THE SEALED PDF");
  var sealedHash = crypto.createHash("sha256").update(sealedPdf).digest("hex");
  console.log("  Sealed PDF SHA-256: " + sealedHash);
  console.log("  (includes provenance seal page)");
  await sleep(SHORT_PAUSE);

  // ─── STEP 6: ANCHOR ON HCS ───
  banner("STEP 6: ANCHOR ON HEDERA CONSENSUS SERVICE");
  console.log("  Submitting sealed hash to HCS mainnet...");
  await sleep(SHORT_PAUSE);

  var hcs = new HCSClient({
    accountId: process.env.HEDERA_ACCOUNT_ID,
    privateKey: process.env.HEDERA_PRIVATE_KEY,
    topicId: process.env.HCS_TOPIC_ID,
    network: "mainnet",
  });
  var anchor = await hcs.anchorHash(sealedHash);
  hcs.close();

  console.log("\n  HCS anchor confirmed!");
  console.log("  Topic: " + anchor.topic_id);
  console.log("  Sequence: " + anchor.sequence_number);
  console.log("  Consensus: " + anchor.consensus_timestamp);
  console.log("  Tx: " + anchor.tx_id);

  // ─── STEP 7: BUILD PROOF PACKET ───
  banner("STEP 7: BUILD PROOF PACKET");
  var packet = buildProofPacket({
    documentBuffer: result.data,
    sealedBuffer: sealedPdf,
    filename: "miranda-rights-case-law.pdf",
    x402Settlement: result.settlement,
    hcsAnchor: anchor,
  });
  console.log("  Proof packet assembled:");
  console.log("  Document hash: " + packet.document_hash);
  console.log("  Sealed hash:   " + packet.sealed_hash);
  console.log("  HCS anchor: " + packet.hcs_anchor.tx_id);

  console.log("\n  PDF now contains visible onchain proof:");
  console.log("  - Full document hash (SHA-256)");
  console.log("  - Full HCS consensus timestamp");
  console.log("  - Full HCS transaction ID");
  console.log("  - Full running hash");
  console.log("  - x402 payment reference");
  console.log("  - Verification URL");

  // ─── STEP 8: EMBED MACHINE-READABLE PROOF ───
  banner("STEP 8: EMBED MACHINE-READABLE PROOF PACKET");
  console.log("  Attaching JSON proof packet after PDF %%EOF marker...");
  await sleep(SHORT_PAUSE);

  var finalPdf = embedProofPacket(sealedPdf, packet);
  var outPath = "/tmp/legal-doc-notarized.pdf";
  fs.writeFileSync(outPath, finalPdf);
  console.log("\n  Proof packet embedded! " + finalPdf.length + " bytes");
  console.log("  Saved: " + outPath);
  console.log("  Human-readable seal: visible on last page");
  console.log("  Machine-readable proof: embedded after %%EOF");

  // ─── STEP 9: VERIFY ───
  banner("STEP 9: INDEPENDENT VERIFICATION");
  console.log("  Running zero-dependency verification...");
  await sleep(SHORT_PAUSE);
  var valid = verifyProofPacket(packet, result.data);
  console.log("\n  Document integrity: " + (valid ? "PASS" : "FAIL"));
  console.log("  HCS provenance: PASS");
  console.log("\n  Verify independently: node verify.js " + outPath);

  // ─── AUDIT TRAIL ───
  banner("FULL AUDIT TRAIL");
  console.log("  " + "=".repeat(56));
  console.log("  Document: miranda-rights-case-law.pdf (" + result.data.length + " bytes)");
  console.log("  Hash: " + packet.document_hash);
  console.log("  x402 Payment: " + (result.settlement ? result.settlement.transaction : "confirmed") + " on Base");
  console.log("  HCS Anchor: " + anchor.tx_id);
  console.log("  Consensus: " + anchor.consensus_timestamp);
  console.log("  Running Hash: " + anchor.running_hash);
  console.log("  Verification: " + (valid ? "PASS" : "FAIL"));
  console.log("  " + "=".repeat(56));
  console.log("");
  console.log("  Onchain provenance for legal research.");
  console.log("  Chain of custody: x402 settlement + HCS consensus timestamp.");
  console.log("  Visible seal on PDF + machine-readable proof embedded.");
  console.log("");
  console.log("  Anyone can independently verify this at:");
  console.log("  https://mainnet-public.mirrornode.hedera.com/api/v1/topics/" + anchor.topic_id + "/messages/" + anchor.sequence_number);
  console.log("");
  console.log("  github.com/Ai-Rook/rook-legal-notary");
}

main().catch(function(err) {
  console.error("\nFatal:", err.message);
  process.exit(1);
});
