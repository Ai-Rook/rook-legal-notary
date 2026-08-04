const crypto = require("crypto");

/**
 * Build a proof packet — the court-facing chain of custody artifact.
 * Contains: document hash, x402 settlement proof, HCS anchor data, optional Merkle proof.
 */
function buildProofPacket({ documentBuffer, filename, x402Settlement, hcsAnchor, merchantSignature, merkleProof, merkleRoot }) {
  const hash = crypto.createHash("sha256").update(documentBuffer).digest("hex");
  return {
    version: "1.0",
    document_hash: "sha256:" + hash,
    document_filename: filename,
    retrieved_at: new Date().toISOString(),
    x402_settlement: x402Settlement || null,
    hcs_anchor: hcsAnchor || null,
    merchant_signature: merchantSignature || null,
    merkle_proof: merkleProof || null,
    merkle_root: merkleRoot || null,
  };
}

/**
 * Verify a proof packet against a document buffer.
 * Re-hash the document and check against the stored hash.
 */
function verifyProofPacket(packet, documentBuffer) {
  const computedHash = crypto.createHash("sha256").update(documentBuffer).digest("hex");
  const storedHash = packet.document_hash.replace("sha256:", "");
  return computedHash === storedHash;
}

module.exports = { buildProofPacket, verifyProofPacket };
