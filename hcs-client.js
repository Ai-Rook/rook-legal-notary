const { Client, TopicId, PrivateKey, TopicMessageSubmitTransaction } = require("@hashgraph/sdk");

class HCSClient {
  constructor(opts) {
    var network = opts.network || "testnet";
    if (network === "mainnet") {
      this.client = Client.forMainnet();
    } else {
      this.client = Client.forTestnet();
    }
    var keyStr = opts.privateKey;
    if (keyStr.startsWith("0x")) {
      this.client.setOperator(opts.accountId, PrivateKey.fromStringECDSA(keyStr));
    } else if (keyStr.length === 64 && /^[0-9a-fA-F]+$/.test(keyStr)) {
      this.client.setOperator(opts.accountId, PrivateKey.fromStringECDSA("0x" + keyStr));
    } else {
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

    // Consensus timestamp comes from the record, not the receipt
    var record = await txResponse.getRecord(this.client);
    var consensusTimestamp = record.consensusTimestamp;

    return {
      topic_id: this.topicId.toString(),
      sequence_number: receipt.topicSequenceNumber.toString(),
      consensus_timestamp: consensusTimestamp ? consensusTimestamp.toString() : new Date().toISOString(),
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
