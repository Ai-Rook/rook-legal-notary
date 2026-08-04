const crypto = require("crypto");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

/**
 * Add a visible provenance seal page to an existing PDF.
 * Only contains data known BEFORE HCS anchoring (document hash, x402 payment, timestamp).
 * HCS-specific data (sequence, consensus timestamp, tx ID) lives in the machine-readable proof packet.
 * This way the sealed PDF hash is stable and can be anchored on HCS.
 */
async function addProvenanceSeal(pdfBuffer, sealData) {
  var pdfDoc = await PDFDocument.load(pdfBuffer);
  var font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  var boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  var monoFont = await pdfDoc.embedFont(StandardFonts.Courier);

  var page = pdfDoc.addPage([612, 792]);
  var margin = 50;
  var y = 720;

  function drawText(text, size, f) {
    page.drawText(text, { x: margin, y: y, size: size, font: f || font, color: rgb(0, 0, 0) });
  }

  function wrapText(text, maxChars) {
    var words = text.split(/\s+/);
    var lines = [];
    var current = "";
    for (var i = 0; i < words.length; i++) {
      if ((current + " " + words[i]).length > maxChars) {
        lines.push(current);
        current = words[i];
      } else {
        current = current ? current + " " + words[i] : words[i];
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  // Top border
  drawText("==========================================================", 9, monoFont); y -= 20;
  drawText("  ONCHAIN PROVENANCE SEAL", 14, boldFont); y -= 20;
  drawText("  Rook Legal Notary Agent v1.0", 11); y -= 20;
  drawText("==========================================================", 9, monoFont); y -= 25;

  // Document hash — FULL, not truncated
  drawText("  Document Hash (SHA-256):", 11, boldFont); y -= 16;
  var hashLines = wrapText(sealData.documentHash, 70);
  for (var i = 0; i < hashLines.length; i++) {
    drawText("  " + hashLines[i], 10, monoFont); y -= 14;
  }
  y -= 10;

  // Retrieved at
  if (sealData.retrievedAt) {
    drawText("  Retrieved At:", 11, boldFont); y -= 16;
    drawText("  " + sealData.retrievedAt, 10, monoFont); y -= 20;
  }

  // Case info
  if (sealData.caseName) {
    drawText("  Case:", 11, boldFont); y -= 16;
    var caseLines = wrapText(sealData.caseName, 70);
    for (var cl = 0; cl < caseLines.length; cl++) {
      drawText("  " + caseLines[cl], 10); y -= 14;
    }
    y -= 10;
  }

  // x402 Payment
  if (sealData.x402Amount) {
    drawText("  x402 Payment:", 11, boldFont); y -= 16;
    drawText("  $" + sealData.x402Amount + " USDC on Base", 10, monoFont); y -= 20;
  }

  // HCS topic (known beforehand, not anchor-specific data)
  if (sealData.hcsTopic) {
    drawText("  HCS Topic ID:", 11, boldFont); y -= 16;
    drawText("  " + sealData.hcsTopic, 10, monoFont); y -= 20;
  }

  // Verification instructions — no CLI, no GitHub, just URLs
  drawText("  Verify This Document:", 11, boldFont); y -= 16;
  drawText("  Upload this PDF at:", 10); y -= 14;
  drawText("  https://ai-rook.com/verify", 10, monoFont); y -= 20;
  drawText("  Or check directly on Hedera:", 10); y -= 14;
  var mirrorUrl = "https://mainnet-public.mirrornode.hedera.com/api/v1/topics/" + sealData.hcsTopic;
  var urlLines = wrapText(mirrorUrl, 70);
  for (var u = 0; u < urlLines.length; u++) {
    drawText("  " + urlLines[u], 10, monoFont); y -= 14;
  }
  y -= 10;
  drawText("  Match the hash above against the onchain record.", 9); y -= 25;

  // Bottom border
  drawText("==========================================================", 9, monoFont); y -= 16;
  drawText("  This document has been cryptographically notarized.", 9); y -= 14;
  drawText("  Any alteration will invalidate the hash on verification.", 9); y -= 14;
  drawText("  Full HCS anchor details in embedded proof packet.", 9); y -= 16;
  drawText("==========================================================", 9, monoFont);

  var modifiedPdf = await pdfDoc.save();
  return Buffer.from(modifiedPdf);
}

// Trailing append embed (byte-safe)
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
  try { return JSON.parse(jsonBuf.toString("utf-8")); } catch(e) { return null; }
}

function getOriginalPdf(pdfBuffer) {
  var startIdx = findMarkerInBuffer(pdfBuffer, PROOF_MARKER);
  if (startIdx === -1) return pdfBuffer;
  var cutAt = startIdx;
  if (cutAt > 0 && pdfBuffer[cutAt - 1] === 0x0A) cutAt--;
  return pdfBuffer.subarray(0, cutAt);
}

module.exports = { embedProofPacket, extractProofPacket, getOriginalPdf, addProvenanceSeal };
