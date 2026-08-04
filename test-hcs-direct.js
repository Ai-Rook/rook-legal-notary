// Minimal HCS test using the exact same pattern that worked in create-hcs-topic.js
require("dotenv").config();
const { Client, PrivateKey, TopicId, TopicMessageSubmitTransaction } = require("@hashgraph/sdk");
const crypto = require("crypto");

async function main() {
  console.log("=== HCS Direct Test ===");
  console.log("Account:", process.env.HEDERA_ACCOUNT_ID);
  console.log("Topic:", process.env.HCS_TOPIC_ID);
  
  var client = Client.forMainnet();
  var pk = PrivateKey.fromStringECDSA(process.env.HEDERA_PRIVATE_KEY);
  client.setOperator(process.env.HEDERA_ACCOUNT_ID, pk);
  
  var doc = Buffer.from("Test legal document - Smith v. Jones 2024");
  var hash = crypto.createHash("sha256").update(doc).digest("hex");
  console.log("Hash:", hash);
  
  console.log("Submitting to HCS...");
  var tx = new TopicMessageSubmitTransaction()
    .setTopicId(process.env.HCS_TOPIC_ID)
    .setMessage(hash);
  
  var txResponse = await tx.execute(client);
  var receipt = await txResponse.getReceipt(client);
  
  console.log("Receipt keys:", Object.keys(receipt));
  console.log("topicSequenceNumber:", receipt.topicSequenceNumber);
  console.log("topicConsensusTimestamp:", receipt.topicConsensusTimestamp);
  console.log("topicRunningHash:", receipt.topicRunningHash);
  console.log("status:", receipt.status);
  
  // Try accessing with fallbacks
  var seq = receipt.topicSequenceNumber ? receipt.topicSequenceNumber.toString() : "unknown";
  var ts = receipt.topicConsensusTimestamp ? receipt.topicConsensusTimestamp.toString() : "unknown";
  var rh = receipt.topicRunningHash ? Buffer.from(receipt.topicRunningHash).toString("hex") : "unknown";
  
  console.log("\nAnchor result:");
  console.log("  Sequence:", seq);
  console.log("  Consensus:", ts);
  console.log("  Running hash:", rh);
  console.log("  Tx:", txResponse.transactionId.toString());
  
  client.close();
  console.log("\n=== SUCCESS ===");
}

main().catch(function(err) { console.log("ERROR:", err.message); console.log(err.stack); });
