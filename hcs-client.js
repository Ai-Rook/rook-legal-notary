const { Client, TopicId, PrivateKey, TopicMessageSubmitTransaction } = require("@hashgraph/sdk");

class HCSClient {
  constructor(opts) {
    var network = opts.network || "testnet";
    if (network === "mainnet") {
      this.client = Client.forMainnet();
    } else {
      this.client = Client.forTestnet();
    }
    // Handle raw hex, 0x-prefixed hex, or DER format
    var keyStr = opts.privateKey;
    if (keyStr.startsWith("0x")) {
      keyStr = keyStr.slice(2);
    }
    // If it's raw hex (64 chars = ECDSA secp256k1 private key), prefix with 0x for fromStringECDSA
    if (keyStr.length === 64 && /^[0-9a-fA-F]+$/.test(keyStr)) {
      this.client.setOperator(opts.accountId, PrivateKey.fromStringECDSA("0x" + keyStr));
    } else {
      // DER or other format
      this.client.setOperator(opts.accountId, PrivateKey.fromString(keyStr));
    }
    this.topicId = TopicId.fromString(opts.topicId);
  }

  async anchorHash(documentHash) {
    var tx = new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(documentHash);
    var txResponse = await tx.execute(this.client);
    var receipt = await txResponse.getReceipt(this.client);
    return {
      topic_id: this.topicId.toString(),
      sequence_number: receipt.topicSequenceNumber.toString(),
      consensus_timestamp: receipt.topicConsensusTimestamp.toString(),
      running_hash: Buffer.from(receipt.topicRunningHash).toString("hex"),
      tx_id: txResponse.transactionId.toString(),
    };
  }

  async anchorMerkleRoot(merkleRoot) {
    return this.anchorHash(merkleRoot);
  }

  close() {
    this.client.close();
  }
}

module.exports = { HCSClient };
