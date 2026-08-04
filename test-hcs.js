// Quick integration test: hash → HCS anchor → proof packet → verify
require("dotenv").config();
const crypto = require("crypto");
const { HCSClient } = require("./hcs-client");
const { buildProofPacket, verifyProofPacket } = require("./proof-packet");

async function test() {
  console.log("=== HCS Integration Test ===\n");
  console.log("Account: " + process.env.HEDERA_ACCOUNT_ID);
  console.log("Topic: " + process.env.HCS_TOPIC_ID);
  console.log("Network: " + (process.env.HEDERA_NETWORK || "testnet"));
  console.log("Key length: " + (process.env.HEDERA_PRIVATE_KEY ? process.env.HEDERA_PRIVATE_KEY.length : "MISSING"));

  // 1. Create a fake document
  var doc = Buffer.from("Test legal document - Smith v. Jones 2024");
  var hash = crypto.createHash("sha256").update(doc).digest("hex");
  console.log("\n1. Document hash: " + hash);

  // 2. Anchor on HCS
  console.log("\n2. Anchoring on HCS (mainnet)...");
  try {
    var hcs = new HCSClient({
      accountId: process.env.HEDERA_ACCOUNT_ID,
      privateKey: process.env.HEDERA_PRIVATE_KEY,
      topicId: process.env.HCS_TOPIC_ID,
      network: process.env.HEDERA_NETWORK || "testnet",
    });
    var anchor = await hcs.anchorHash(hash);
    console.log("   HCS anchor confirmed!");
    console.log("   Topic: " + anchor.topic_id);
    console.log("   Sequence: " + anchor.sequence_number);
    console.log("   Consensus: " + anchor.consensus_timestamp);
    console.log("   Tx: " + anchor.tx_id);
    hcs.close();

    // 3. Build proof packet
    var packet = buildProofPacket({
      documentBuffer: doc,
      filename: "test-doc.txt",
      x402Settlement: { transaction: "0xtest123", amount: "1000" },
      hcsAnchor: anchor,
    });
    console.log("\n3. Proof packet built:");
    console.log("   Hash: " + packet.document_hash);
    console.log("   HCS tx: " + packet.hcs_anchor.tx_id);

    // 4. Verify
    var valid = verifyProofPacket(packet, doc);
    console.log("\n4. Verification: " + (valid ? "PASS" : "FAIL"));
    console.log("\n=== TEST PASSED ===");
  } catch (err) {
    console.log("   Error: " + err.message);
    console.log("\n=== TEST FAILED ===");
  }
}

test();
