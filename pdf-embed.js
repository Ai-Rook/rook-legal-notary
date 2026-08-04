const { PDFDocument } = require("pdf-lib");

async function embedProofPacket(pdfBuffer, proofPacket) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const jsonBytes = Buffer.from(JSON.stringify(proofPacket, null, 2));
  pdfDoc.attach(jsonBytes, "proof-packet.json", {
    mimeType: "application/json",
    description: "Onchain provenance proof packet - x402 settlement + HCS anchor",
    creationDate: new Date(),
    modificationDate: new Date(),
  });
  pdfDoc.setSubject("Anchored: " + proofPacket.document_hash);
  pdfDoc.setKeywords(["x402", "HCS", "provenance", "notarized", proofPacket.hcs_anchor ? proofPacket.hcs_anchor.topic_id : ""]);
  pdfDoc.setProducer("Rook Legal Notary Agent v1.0");
  const modifiedPdf = await pdfDoc.save();
  return Buffer.from(modifiedPdf);
}

async function extractProofPacket(pdfBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const attachments = pdfDoc.listAttachments();
  for (const name of attachments) {
    if (name === "proof-packet.json") {
      const embedded = pdfDoc.getAttachment(name);
      const json = Buffer.from(embedded).toString("utf-8");
      return JSON.parse(json);
    }
  }
  return null;
}

module.exports = { embedProofPacket, extractProofPacket };
