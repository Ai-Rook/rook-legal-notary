#!/usr/bin/env node
/**
 * Independent Verification Script
 * 
 * Takes a notarized PDF and verifies it against HCS — no Rook tooling needed.
 * Zero dependencies — just Node.js.
 * 
 * Usage: node verify.js <notarized-pdf-path>
 */

const crypto = require("crypto");
const https = require("https");
const fs = require("fs");

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

function queryHCS(topicId, seqNum) {
  var url = "https://mainnet-public.mirrornode.hedera.com/api/v1/topics/" + topicId + "/messages/" + seqNum;
  return new Promise(function(resolve) {
    https.get(url, function(res) {
      var body = "";
      res.on("data", function(chunk) { body += chunk; });
      res.on("end", function() {
        try {
          var msg = JSON.parse(body);
          if (msg.message) {
            var onchainHash = Buffer.from(msg.message, "base64").toString("utf-8");
            resolve({
              found: true,
              onchain_hash: onchainHash,
              consensus_timestamp: msg.consensus_timestamp,
              topic_id: msg.topic_id,
              sequence_number: msg.sequence_number,
              url: url,
            });
          } else {
            resolve({ found: false, url: url });
          }
        } catch(e) {
          resolve({ found: false, error: e.message, url: url });
        }
      });
    }).on("error", function(e) {
      resolve({ found: false, error: e.message, url: url });
    });
  });
}

async function main() {
  var pdfPath = process.argv[2];
  
  if (!pdfPath) {
    console.log("Usage: node verify.js <notarized-pdf-path>");
    console.log("");
    console.log("Verifies a Rook-notarized PDF against Hedera Consensus Service.");
    console.log("Zero dependencies — just Node.js.");
    process.exit(1);
  }

  if (!fs.existsSync(pdfPath)) {
    console.log("ERROR: File not found: " + pdfPath);
    process.exit(1);
  }

  console.log("=== Independent Verification ===");
  console.log("File: " + pdfPath);
  console.log("");

  // Step 1: Extract proof packet
  console.log("[1/4] Extracting proof packet from PDF...");
  var fileBuffer = fs.readFileSync(pdfPath);
  var packet = extractProofPacket(fileBuffer);
  if (!packet) {
    console.log("  FAIL: No proof packet found in PDF");
    console.log("  This PDF was not notarized by Rook Legal Notary Agent.");
    process.exit(1);
  }
  console.log("  Found proof packet v" + packet.version);
  console.log("  Document hash: " + packet.document_hash);
  console.log("  Retrieved at: " + packet.retrieved_at);
  if (packet.x402_settlement) {
    console.log("  x402 payment: " + (packet.x402_settlement.transaction || "confirmed"));
    var usdAmt = Number(packet.x402_settlement.amount) / 1e6;
    console.log("  Amount: $" + usdAmt + " USDC on " + (packet.x402_settlement.network || "base"));
  }
  if (packet.hcs_anchor) {
    console.log("  HCS topic: " + packet.hcs_anchor.topic_id);
    console.log("  HCS sequence: " + packet.hcs_anchor.sequence_number);
    console.log("  HCS consensus: " + packet.hcs_anchor.consensus_timestamp);
  }
  if (packet.merkle_root) {
    console.log("  Merkle root: " + packet.merkle_root);
    console.log("  (Document is part of a batch)");
  }
  console.log("");

  // Step 2: Re-hash the original document (strip proof packet bytes)
  console.log("[2/4] Re-hashing document...");
  var originalPdf = getOriginalPdf(fileBuffer);
  var computedHash = crypto.createHash("sha256").update(originalPdf).digest("hex");
  var storedHash = packet.document_hash.replace("sha256:", "");
  var hashMatch = (computedHash === storedHash);
  console.log("  Computed: sha256:" + computedHash.substring(0, 32) + "...");
  console.log("  Stored:   sha256:" + storedHash.substring(0, 32) + "...");
  console.log("  Match: " + (hashMatch ? "PASS" : "FAIL"));
  console.log("");

  // Step 3: Verify against HCS via public mirror node
  console.log("[3/4] Querying Hedera Consensus Service (public mirror node)...");
  if (!packet.hcs_anchor) {
    console.log("  FAIL: No HCS anchor in proof packet");
    process.exit(1);
  }

  var hashToVerify = packet.merkle_root || storedHash;
  var hcsResult = await queryHCS(packet.hcs_anchor.topic_id, packet.hcs_anchor.sequence_number);
  
  if (hcsResult.found) {
    var onchainMatch = (hcsResult.onchain_hash === hashToVerify);
    console.log("  HCS record found!");
    console.log("  Onchain hash:  " + hcsResult.onchain_hash.substring(0, 32) + "...");
    console.log("  Expected hash: " + hashToVerify.substring(0, 32) + "...");
    console.log("  Match: " + (onchainMatch ? "PASS" : "FAIL"));
    console.log("  Consensus timestamp: " + hcsResult.consensus_timestamp);
    console.log("  Mirror node URL: " + hcsResult.url);
  } else {
    console.log("  FAIL: HCS record not found");
    if (hcsResult.error) console.log("  Error: " + hcsResult.error);
    console.log("  Query URL: " + hcsResult.url);
  }
  console.log("");

  // Step 4: Verdict
  console.log("[4/4] Verdict");
  console.log("  " + "=".repeat(50));
  var docIntegrity = hashMatch;
  var onchainVerified = hcsResult.found && (hcsResult.onchain_hash === hashToVerify);
  
  console.log("  Document integrity (hash match): " + (docIntegrity ? "PASS" : "FAIL"));
  console.log("  Onchain provenance (HCS match):  " + (onchainVerified ? "PASS" : "FAIL"));
  console.log("");
  
  if (docIntegrity && onchainVerified) {
    console.log("  VERIFIED -- Document integrity and onchain provenance confirmed.");
    console.log("  This document has not been altered since it was notarized");
    console.log("  at consensus timestamp " + hcsResult.consensus_timestamp);
    console.log("");
    console.log("  Anyone can independently verify this at:");
    console.log("  " + hcsResult.url);
    if (packet.merkle_root) {
      console.log("");
      console.log("  Batch mode: Merkle root anchored to HCS.");
      console.log("  Root: " + packet.merkle_root.substring(0, 32) + "...");
    }
  } else {
    console.log("  VERIFICATION FAILED");
    if (!docIntegrity) console.log("  Document has been altered since notarization.");
    if (!onchainVerified) console.log("  Onchain record does not match document hash.");
  }
  console.log("  " + "=".repeat(50));
}

main().catch(function(e) {
  console.log("ERROR:", e.message);
  process.exit(1);
});
