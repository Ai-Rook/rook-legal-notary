// Debug: check what getOriginalPdf returns
require("dotenv").config();
const fs = require("fs");
const crypto = require("crypto");

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

var fileBuffer = fs.readFileSync("/tmp/legal-doc-notarized.pdf");
console.log("Notarized file size:", fileBuffer.length);

var markerPos = findMarkerInBuffer(fileBuffer, PROOF_MARKER);
console.log("Marker found at byte:", markerPos);

var endPos = findMarkerInBuffer(fileBuffer, PROOF_END_MARKER, markerPos);
console.log("End marker at byte:", endPos);

var jsonStart = markerPos + PROOF_MARKER.length;
var jsonBuf = fileBuffer.subarray(jsonStart, endPos);
var packet = JSON.parse(jsonBuf.toString("utf-8"));
console.log("Stored hash:", packet.document_hash);

// Strip everything from the newline before the marker
var cutAt = markerPos;
if (cutAt > 0 && fileBuffer[cutAt - 1] === 0x0A) cutAt--;
console.log("Cut at byte:", cutAt);

var original = fileBuffer.subarray(0, cutAt);
console.log("Stripped size:", original.length);

var computedHash = crypto.createHash("sha256").update(original).digest("hex");
console.log("Computed hash:", "sha256:" + computedHash);
console.log("Match:", computedHash === packet.document_hash.replace("sha256:", ""));

// Also check: what does the original PDF look like?
var rawPdf = fs.readFileSync("/tmp/legal-doc-output.pdf");
console.log("\nRaw PDF size:", rawPdf.length);
var rawHash = crypto.createHash("sha256").update(rawPdf).digest("hex");
console.log("Raw PDF hash:", "sha256:" + rawHash);

// Compare byte by byte
var mismatches = 0;
for (var i = 0; i < Math.min(original.length, rawPdf.length); i++) {
  if (original[i] !== rawPdf[i]) {
    if (mismatches < 5) {
      console.log("Mismatch at byte", i, ": stripped=" + original[i], "raw=" + rawPdf[i]);
    }
    mismatches++;
  }
}
console.log("Total byte mismatches:", mismatches);
