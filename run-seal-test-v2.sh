#!/bin/bash
cd /opt/rook-legal-notary

# Kill any existing proxy
fuser -k 3090/tcp 2>/dev/null
sleep 1

# Start proxy
node courtlistener-proxy.js &
PROXY_PID=$!
sleep 2

echo "=== Proxy started ==="

# Run the full flow: fetch → seal → hash → anchor → embed → verify
node -e '
require("dotenv").config();
const http = require("http");
const { addProvenanceSeal, embedProofPacket } = require("./pdf-embed");
const { buildProofPacket, verifyProofPacket } = require("./proof-packet");
const { HCSClient } = require("./hcs-client");
const crypto = require("crypto");
const fs = require("fs");

async function run() {
  // 1. Fetch document
  var body = JSON.stringify({ query: "Miranda rights" });
  var res = await new Promise(function(resolve, reject) {
    var req = http.request({ hostname: "localhost", port: 3090, path: "/api/legal-research", method: "POST", headers: { "Content-Type": "application/json", "X-Payment": "demo", "Content-Length": Buffer.byteLength(body) } }, function(r) {
      var chunks = []; r.on("data", function(c) { chunks.push(c); });
      r.on("end", function() { var data = Buffer.concat(chunks); var s = r.headers["x-payment-response"]; var settlement = null; if (s) { try { settlement = JSON.parse(Buffer.from(s, "base64").toString()); } catch(e){} } resolve({ data: data, settlement: settlement }); });
    });
    req.on("error", reject); req.write(body); req.end();
  });
  
  console.log("1. Document fetched:", res.data.length, "bytes");
  console.log("   Case:", res.settlement ? res.settlement.caseName : "unknown");
  
  // 2. Add visible provenance seal page (BEFORE hashing)
  var sealedPdf = await addProvenanceSeal(res.data, {
    documentHash: "sha256:" + crypto.createHash("sha256").update(res.data).digest("hex"),
    retrievedAt: new Date().toISOString(),
    caseName: res.settlement ? res.settlement.caseName : null,
    x402Amount: "0.001",
    hcsTopic: process.env.HCS_TOPIC_ID,
  });
  console.log("2. Provenance seal page added:", sealedPdf.length, "bytes");
  
  // 3. Hash the SEALED PDF (not the original)
  var sealedHash = crypto.createHash("sha256").update(sealedPdf).digest("hex");
  console.log("3. Sealed PDF hash:", "sha256:" + sealedHash.substring(0, 32) + "...");
  
  // 4. Anchor the sealed hash on HCS
  var hcs = new HCSClient({ accountId: process.env.HEDERA_ACCOUNT_ID, privateKey: process.env.HEDERA_PRIVATE_KEY, topicId: process.env.HCS_TOPIC_ID, network: "mainnet" });
  var anchor = await hcs.anchorHash(sealedHash);
  hcs.close();
  console.log("4. HCS anchored:", anchor.topic_id, "seq", anchor.sequence_number, "ts", anchor.consensus_timestamp);
  
  // 5. Build proof packet (v1.1 — stores both original and sealed hashes)
  var packet = buildProofPacket({
    documentBuffer: res.data,
    sealedBuffer: sealedPdf,
    filename: "miranda-rights-case-law.pdf",
    x402Settlement: res.settlement,
    hcsAnchor: anchor,
  });
  console.log("5. Proof packet v" + packet.version + " built");
  console.log("   Original hash:", packet.document_hash.substring(0, 42) + "...");
  console.log("   Sealed hash:  ", packet.sealed_hash.substring(0, 42) + "...");
  
  // 6. Embed machine-readable proof packet
  var finalPdf = embedProofPacket(sealedPdf, packet);
  fs.writeFileSync("/tmp/legal-doc-notarized.pdf", finalPdf);
  console.log("6. Proof embedded. Final PDF:", finalPdf.length, "bytes");
  console.log("   Saved: /tmp/legal-doc-notarized.pdf");
  
  // 7. Verify
  var valid = verifyProofPacket(packet, sealedPdf);
  console.log("7. Verification:", valid ? "PASS" : "FAIL");
  
  console.log("");
  console.log("=== FULL FLOW COMPLETE ===");
}

run().catch(function(e) { console.log("ERROR:", e.message, e.stack); process.exit(1); });
' 2>&1

# Cleanup
kill $PROXY_PID 2>/dev/null
echo "=== Proxy stopped ==="
