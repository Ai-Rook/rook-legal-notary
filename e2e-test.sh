#!/bin/bash
# Start proxy, run end-to-end test, kill proxy — all in one process
cd /opt/rook-legal-notary

# Start proxy in background
node courtlistener-proxy.js &
PROXY_PID=$!
sleep 2

echo "=== Proxy started (PID $PROXY_PID) ==="

# Test 1: llms.txt
echo "=== TEST 1: llms.txt ==="
curl -s http://localhost:3090/llms.txt
echo ""

# Test 2: 402 challenge (no payment header)
echo "=== TEST 2: 402 Challenge ==="
curl -s -X POST http://localhost:3090/api/legal-research \
  -H "Content-Type: application/json" \
  -d '{"query":"Miranda rights"}' \
  -w "\nHTTP_STATUS: %{http_code}\n" | head -10
echo ""

# Test 3: Paid request (simulated payment header)
echo "=== TEST 3: Paid Request (simulated x402) ==="
curl -s -X POST http://localhost:3090/api/legal-research \
  -H "Content-Type: application/json" \
  -H "X-Payment: simulated-payment-proof" \
  -d '{"query":"Miranda rights"}' \
  -o /tmp/legal-doc-output.pdf \
  -w "HTTP_STATUS: %{http_code}\nCONTENT_TYPE: %{content_type}\nSIZE: %{size_download}\n"
echo ""

# Check if we got a PDF
echo "=== TEST 4: Verify PDF ==="
file /tmp/legal-doc-output.pdf
head -c 20 /tmp/legal-doc-output.pdf | xxd | head -2
echo ""

# Test 5: Full agent flow (HCS anchor + proof packet)
echo "=== TEST 5: Full Agent Flow ==="
node -e "
require('dotenv').config();
const crypto = require('crypto');
const { HCSClient } = require('./hcs-client');
const { buildProofPacket, verifyProofPacket } = require('./proof-packet');
const { embedProofPacket } = require('./pdf-embed');
const fs = require('fs');

async function run() {
  // Read the PDF we just retrieved
  var doc = fs.readFileSync('/tmp/legal-doc-output.pdf');
  console.log('Document size:', doc.length, 'bytes');
  
  // Hash it
  var hash = crypto.createHash('sha256').update(doc).digest('hex');
  console.log('SHA-256:', hash);
  
  // Anchor on HCS
  console.log('Anchoring on HCS mainnet...');
  var hcs = new HCSClient({
    accountId: process.env.HEDERA_ACCOUNT_ID,
    privateKey: process.env.HEDERA_PRIVATE_KEY,
    topicId: process.env.HCS_TOPIC_ID,
    network: 'mainnet',
  });
  var anchor = await hcs.anchorHash(hash);
  console.log('HCS anchored!');
  console.log('  Topic:', anchor.topic_id);
  console.log('  Sequence:', anchor.sequence_number);
  console.log('  Consensus:', anchor.consensus_timestamp);
  console.log('  Tx:', anchor.tx_id);
  hcs.close();
  
  // Build proof packet
  var packet = buildProofPacket({
    documentBuffer: doc,
    filename: 'miranda-rights-case-law.pdf',
    x402Settlement: { transaction: 'simulated-x402-payment', amount: '1000', network: 'base' },
    hcsAnchor: anchor,
  });
  console.log('Proof packet built');
  console.log('  Hash:', packet.document_hash);
  
  // Embed in PDF
  console.log('Embedding proof packet in PDF...');
  try {
    var embedded = await embedProofPacket(doc, packet);
    fs.writeFileSync('/tmp/legal-doc-notarized.pdf', embedded);
    console.log('Embedded! Size:', embedded.length, 'bytes');
    console.log('Saved: /tmp/legal-doc-notarized.pdf');
  } catch(e) {
    console.log('Embed failed:', e.message);
    console.log('Saving proof packet as sidecar');
    fs.writeFileSync('/tmp/proof-packet.json', JSON.stringify(packet, null, 2));
  }
  
  // Verify
  var valid = verifyProofPacket(packet, doc);
  console.log('Verification:', valid ? 'PASS' : 'FAIL');
  console.log('');
  console.log('=== END-TO-END TEST COMPLETE ===');
}

run().catch(function(e) { console.log('ERROR:', e.message); process.exit(1); });
"

# Cleanup
kill $PROXY_PID 2>/dev/null
echo "=== Proxy stopped ==="
