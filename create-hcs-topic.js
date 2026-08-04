// Create a new HCS topic on Hedera mainnet
require("dotenv").config({ path: "/opt/x402-atm/.env" });
const { Client, PrivateKey, TopicCreateTransaction, AccountId } = require("@hashgraph/sdk");

async function main() {
  // Try the 0x-prefixed key first (last value in .env wins)
  var accountId = process.env.HEDERA_CLIENT_ID;
  var keyRaw = "0x8358c1b7d7d93f49d9766a8a0393a8b47c7c582898dd5c548e23223a02279d38";
  
  console.log("Account:", accountId);
  console.log("Key (0x):", keyRaw.substring(0, 10) + "...");
  
  var client = Client.forMainnet();
  
  try {
    var pk = PrivateKey.fromStringECDSA(keyRaw);
    client.setOperator(AccountId.fromString(accountId), pk);
    console.log("Operator set successfully");
    
    // Create a new topic
    var tx = new TopicCreateTransaction()
      .setTopicMemo("Rook Legal Notary - Document Provenance Anchoring");
    
    var txResponse = await tx.execute(client);
    var receipt = await txResponse.getReceipt(client);
    
    console.log("NEW TOPIC ID:", receipt.topicId.toString());
    console.log("Tx:", txResponse.transactionId.toString());
    
    // Test submitting a message
    var { TopicMessageSubmitTransaction } = require("@hashgraph/sdk");
    var msgTx = new TopicMessageSubmitTransaction()
      .setTopicId(receipt.topicId)
      .setMessage("Rook Legal Notary - Topic initialized");
    var msgResponse = await msgTx.execute(client);
    var msgReceipt = await msgResponse.getReceipt(client);
    
    console.log("Test message submitted!");
    console.log("Sequence:", msgReceipt.topicSequenceNumber.toString());
    console.log("Consensus:", msgReceipt.topicConsensusTimestamp.toString());
    
    client.close();
  } catch(err) {
    console.log("ERROR with 0x key:", err.message);
    
    // Try the raw hex key
    var keyAlt = "1072cb2905457c028b776061c4ae901f136d894cd7ca14d9b8eed7444bebdcd5";
    console.log("\nTrying raw hex key:", keyAlt.substring(0, 10) + "...");
    
    try {
      var pk2 = PrivateKey.fromStringECDSA("0x" + keyAlt);
      var client2 = Client.forMainnet();
      client2.setOperator(AccountId.fromString(accountId), pk2);
      console.log("Operator set successfully with raw hex key");
      
      var tx2 = new TopicCreateTransaction()
        .setTopicMemo("Rook Legal Notary - Document Provenance Anchoring");
      
      var txResponse2 = await tx2.execute(client2);
      var receipt2 = await txResponse2.getReceipt(client2);
      
      console.log("NEW TOPIC ID:", receipt2.topicId.toString());
      
      client2.close();
    } catch(err2) {
      console.log("ERROR with raw hex key:", err2.message);
    }
  }
}

main();
