const { Client, TopicId, PrivateKey, TopicMessageSubmitTransaction } = require("@hashgraph/sdk");

class HCSClient {
  constructor(opts) {
    this.client = Client.forTestnet();
    this.client.setOperator(opts.accountId, PrivateKey.fromString(opts.privateKey));
    this.topicId = TopicId.fromString(opts.topicId);
  }

  async anchorHash(documentHash) {
    const tx = new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(documentHash);
    const txResponse = await tx.execute(this.client);
    const receipt = await txResponse.getReceipt(this.client);
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
