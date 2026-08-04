#!/bin/bash
cd /opt/rook-legal-notary

# Kill any existing proxy
fuser -k 3090/tcp 2>/dev/null
sleep 1

# Start proxy in background
node courtlistener-proxy.js &
PROXY_PID=$!
sleep 2

echo "=== Proxy started ==="

# Run the seal test
node -e '
require("dotenv").config();
const http = require("http");
const { addProvenanceSeal, embedProofPacket } = require("./pdf-embed");
const { buildProofPacket, verifyProofPacket } = require("./proof-packet");
const { HCSClient } = require("./hcs-client");
const crypto = require("crypto");
const fs = require("fs");

async function run() {
  var body = JSON.stringify({ query: "Miranda rights" });
  var res = await new Promise(function(resolve, reject) {
    var req = http.request({ hostname: "localhost", port: 3090, path: "/api/legal-research", method: "POST", headers: { "Content-Type": "application/json", "X-Payment": "demo", "Content-Length": Buffer.byteLength(body) } }, function(r) {
      var chunks = []; r.on("data", function(c) { chunks.push(c); });
      r.on("end", function() { var data = Buffer.concat(chunks); var s = r.headers["x-payment-response"]; var settlement = null; if (s) { try { settlement = JSON.parse(Buffer.from(s, "base64").toString()); } catch(e){} } resolve({ data: data, settlement: settlement }); });
    });
    req.on("error", reject); req.write(body); req.end();
  });
  
  console.log("Document:", res.data.length, "bytes");
  console.log("Case:", res.settlement ? res.settlement.caseName : "unknown");
  
  var hash = crypto.createHash("sha256").update(res.data).digest("hex");
  console.log("Hash: sha256:" + hash);
  
  var hcs = new HCSClient({ accountId: process.env.HEDERA_ACCOUNT_ID, privateKey: process.env.HEDERA_PRIVATE_KEY, topicId: process.env.HCS_TOPIC_ID, network: "mainnet" });
  var anchor = await hcs.anchorHash(hash);
  hcs.close();
  console.log("HCS:", anchor.topic_id, "seq", anchor.sequence_number, "ts", anchor.consensus_timestamp);
  
  var packet = buildProofPacket({ documentBuffer: res.data, filename: "miranda-rights-case-law.pdf", x402Settlement: res.settlement, hcsAnchor: anchor });
  
  var sealedPdf = await addProvenanceSeal(res.data, {
    documentHash: packet.document_hash,
    hcsTopic: anchor.topic_id,
    hcsSequence: anchor.sequence_number,
    consensusTimestamp: anchor.consensus_timestamp,
    hcsTxId: anchor.tx_id,
    runningHash: anchor.running_hash,
    x402Tx: res.settlement ? res.settlement.transaction : null,
    x402Amount: "0.001",
    retrievedAt: packet.retrieved_at,
  });
  console.log("Sealed PDF:", sealedPdf.length, "bytes");
  
  var finalPdf = embedProofPacket(sealedPdf, packet);
  fs.writeFileSync("/tmp/legal-doc-notarized.pdf", finalPdf);
  console.log("Final PDF:", finalPdf.length, "bytes");
  console.log("Saved: /tmp/legal-doc-notarized.pdf");
  
  var valid = verifyProofPacket(packet, res.data);
  console.log("Verify:", valid ? "PASS" : "FAIL");
}

run().catch(function(e) { console.log("ERROR:", e.message, e.stack); process.exit(1); });
' 2>&1

# Cleanup
kill $PROXY_PID 2>/dev/null
echo "=== Done ==="
