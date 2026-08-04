// PDF embed using trailing append after %%EOF — byte-safe, no string conversion
const PROOF_MARKER = Buffer.from("ROOK_PROOF_PACKET:", "utf-8");
const PROOF_END_MARKER = Buffer.from(":END_PROOF_PACKET", "utf-8");

function findMarkerInBuffer(haystack, needle, fromPos) {
  for (var i = fromPos || 0; i <= haystack.length - needle.length; i++) {
    var match = true;
    for (var j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) { match = false; break; }
    }
    if (match) return i;
  }
  return -1;
}

function embedProofPacket(pdfBuffer, proofPacket) {
  var json = Buffer.from(JSON.stringify(proofPacket), "utf-8");
  var newline = Buffer.from("\n", "utf-8");
  return Buffer.concat([pdfBuffer, newline, PROOF_MARKER, json, PROOF_END_MARKER, newline]);
}

function extractProofPacket(pdfBuffer) {
  var startIdx = findMarkerInBuffer(pdfBuffer, PROOF_MARKER);
  if (startIdx === -1) return null;
  var jsonStart = startIdx + PROOF_MARKER.length;
  var endIdx = findMarkerInBuffer(pdfBuffer, PROOF_END_MARKER, jsonStart);
  if (endIdx === -1) return null;
  var jsonBuf = pdfBuffer.subarray(jsonStart, endIdx);
  try {
    return JSON.parse(jsonBuf.toString("utf-8"));
  } catch(e) {
    return null;
  }
}

function getOriginalPdf(pdfBuffer) {
  var startIdx = findMarkerInBuffer(pdfBuffer, PROOF_MARKER);
  if (startIdx === -1) return pdfBuffer;
  // Strip the newline before the marker too
  var cutAt = startIdx;
  if (cutAt > 0 && pdfBuffer[cutAt - 1] === 0x0A) cutAt--;
  return pdfBuffer.subarray(0, cutAt);
}

module.exports = { embedProofPacket, extractProofPacket, getOriginalPdf };
