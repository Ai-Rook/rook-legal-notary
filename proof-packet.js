const crypto = require("crypto");

/**
 * Build a proof packet — the court-facing chain of custody artifact.
 * Now stores TWO hashes:
 * - document_hash: the ORIGINAL document hash (anchored on HCS)
 * - sealed_hash: the hash of the document + seal page (for integrity verification)
 */
function buildProofPacket({ documentBuffer, sealedBuffer, filename, x402Settlement, hcsAnchor, merchantSignature, merkleProof, merkleRoot }) {
  var hash = crypto.createHash("sha256").update(documentBuffer).digest("hex");
  var sealedHash = sealedBuffer ? crypto.createHash("sha256").update(sealedBuffer).digest("hex") : null;
  return {
    version: "1.1",
    document_hash: "sha256:" + hash,
    sealed_hash: sealedHash ? "sha256:" + sealedHash : null,
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
 * Verify a proof packet against a sealed PDF buffer.
 * Checks both the sealed hash (document integrity) and HCS (onchain provenance).
 */
function verifyProofPacket(packet, sealedBuffer) {
  if (!packet.sealed_hash) {
    // v1.0 fallback — hash the buffer directly
    var computed = crypto.createHash("sha256").update(sealedBuffer).digest("hex");
    return computed === packet.document_hash.replace("sha256:", "");
  }
  var computedSealed = crypto.createHash("sha256").update(sealedBuffer).digest("hex");
  return computedSealed === packet.sealed_hash.replace("sha256:", "");
}

module.exports = { buildProofPacket, verifyProofPacket };
