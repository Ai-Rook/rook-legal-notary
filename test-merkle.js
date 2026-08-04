// Merkle batch test — retrieve 3 documents, tree the hashes, anchor one root
require("dotenv").config();
const crypto = require("crypto");
const http = require("http");
const { HCSClient } = require("./hcs-client");
const { buildProofPacket, verifyProofPacket } = require("./proof-packet");
const { buildMerkleTree, verifyMerkleProof } = require("./merkle");

const PROXY_PORT = 3090;

function fetchDocument(query) {
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify({ query: query });
    var req = http.request({
      hostname: "localhost",
      port: PROXY_PORT,
      path: "/api/legal-research",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Payment": "simulated-batch",
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
  console.log("=== MERKLE BATCH TEST ===\n");

  // Start proxy
  var proxy = require("child_process").spawn("node", ["courtlistener-proxy.js"], {
    cwd: process.cwd(),
    stdio: ["ignore", "ignore", "ignore"],
  });
  await new Promise(function(r) { setTimeout(r, 2000); });
  console.log("Proxy started\n");

  var queries = ["Miranda rights", "Fourth Amendment search", "First Amendment speech"];
  var documents = [];

  // 1. Retrieve 3 documents
  console.log("=== STEP 1: Retrieve 3 documents ===");
  for (var i = 0; i < queries.length; i++) {
    console.log("  Retrieving: " + queries[i] + "...");
    try {
      var result = await fetchDocument(queries[i]);
      if (result.contentType && result.contentType.includes("pdf")) {
        console.log("    PDF: " + result.data.length + " bytes");
        if (result.settlement) {
          console.log("    Case: " + (result.settlement.caseName || "unknown"));
        }
        documents.push({ query: queries[i], data: result.data, settlement: result.settlement });
      } else {
        console.log("    Error: " + result.data.toString().substring(0, 100));
        // Use mock data as fallback
        documents.push({ query: queries[i], data: Buffer.from("Mock document for " + queries[i]), settlement: null });
      }
    } catch(e) {
      console.log("    Error: " + e.message);
      documents.push({ query: queries[i], data: Buffer.from("Mock document for " + queries[i]), settlement: null });
    }
  }

  // 2. Hash all documents
  console.log("\n=== STEP 2: Hash all documents ===");
  var hashes = [];
  for (var d = 0; d < documents.length; d++) {
    var h = crypto.createHash("sha256").update(documents[d].data).digest("hex");
    hashes.push(h);
    console.log("  Doc " + (d+1) + " (" + documents[d].query + "): " + h.substring(0, 20) + "...");
  }

  // 3. Build Merkle tree
  console.log("\n=== STEP 3: Build Merkle tree ===");
  var tree = buildMerkleTree(hashes);
  console.log("  Root: " + tree.root.substring(0, 20) + "...");
  console.log("  Proofs: " + tree.proofs.length + " inclusion proofs generated");

  // 4. Anchor root on HCS (ONE transaction for all 3 docs)
  console.log("\n=== STEP 4: Anchor Merkle root on HCS ===");
  console.log("  Submitting root to HCS mainnet...");
  var hcs = new HCSClient({
    accountId: process.env.HEDERA_ACCOUNT_ID,
    privateKey: process.env.HEDERA_PRIVATE_KEY,
    topicId: process.env.HCS_TOPIC_ID,
    network: "mainnet",
  });
  var anchor = await hcs.anchorHash(tree.root);
  console.log("  HCS anchored!");
  console.log("  Topic: " + anchor.topic_id);
  console.log("  Sequence: " + anchor.sequence_number);
  console.log("  Consensus: " + anchor.consensus_timestamp);
  console.log("  Tx: " + anchor.tx_id);
  hcs.close();

  // 5. Verify each document's inclusion proof
  console.log("\n=== STEP 5: Verify inclusion proofs ===");
  var allValid = true;
  for (var v = 0; v < hashes.length; v++) {
    var valid = verifyMerkleProof(hashes[v], tree.proofs[v], tree.root);
    console.log("  Doc " + (v+1) + " (" + documents[v].query + "): " + (valid ? "PASS" : "FAIL"));
    if (!valid) allValid = false;
  }

  // 6. Build proof packets with Merkle data
  console.log("\n=== STEP 6: Build proof packets with Merkle data ===");
  for (var p = 0; p < documents.length; p++) {
    var packet = buildProofPacket({
      documentBuffer: documents[p].data,
      filename: "case-law-" + (p+1) + ".pdf",
      x402Settlement: documents[p].settlement,
      hcsAnchor: anchor,
      merkleProof: tree.proofs[p],
      merkleRoot: tree.root,
    });
    console.log("  Packet " + (p+1) + ": " + packet.document_hash.substring(0, 20) + "... | Merkle root: " + packet.merkle_root.substring(0, 20) + "...");
  }

  console.log("\n=== SUMMARY ===");
  console.log("  Documents: " + documents.length);
  console.log("  HCS transactions: 1 (batched via Merkle root)");
  console.log("  Root: " + tree.root.substring(0, 20) + "...");
  console.log("  All inclusion proofs: " + (allValid ? "PASS" : "FAIL"));
  console.log("  HCS tx: " + anchor.tx_id);
  console.log("\n=== MERKLE BATCH TEST COMPLETE ===");

  proxy.kill();
}

main().catch(function(e) { console.log("ERROR:", e.message); process.exit(1); });
