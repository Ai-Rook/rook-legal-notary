const http = require("http");
const https = require("https");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const PORT = process.env.PROXY_PORT || 3090;
const PAY_TO = process.env.X402_PAY_TO || "0xF3082fAf6b1bfe7188cD91309b5F716f0594048f";
const AMOUNT = "1000";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CL_BASE = "https://www.courtlistener.com";

function serveLLMsTxt(res) {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end([
    "# Rook Legal Notary — x402 Legal Research API",
    "",
    "## Endpoints",
    "- /api/legal-research: Search and retrieve case law with onchain provenance",
    "- /api/case-law: Retrieve full opinion text as PDF",
    "- /api/statute-lookup: Search US statutes and regulations",
  ].join("\n"));
}

function fetchJSON(url) {
  return new Promise(function(resolve, reject) {
    https.get(url, { headers: { "User-Agent": "Rook-Legal-Notary/1.0" } }, function(apiRes) {
      var body = "";
      apiRes.on("data", function(chunk) { body += chunk; });
      apiRes.on("end", function() {
        try { resolve(JSON.parse(body)); } catch(e) { reject(e); }
      });
    }).on("error", reject);
  });
}

async function buildCasePdf(caseData, provenanceData) {
  var pdfDoc = await PDFDocument.create();
  var font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  var boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  var monoFont = await pdfDoc.embedFont(StandardFonts.Courier);

  var margin = 50;
  var maxWidth = 85;

  function addPage() {
    var p = pdfDoc.addPage([612, 792]);
    return p;
  }

  var page = addPage();
  var y = 750;

  function drawText(text, x, yVal, size, f, p) {
    var targetPage = p || page;
    targetPage.drawText(text, { x: x, y: yVal, size: size, font: f || font, color: rgb(0, 0, 0) });
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

  // Title
  drawText(caseData.caseName || "Unknown Case", margin, y, 14, boldFont);
  y -= 20;
  if (caseData.citation) { drawText(caseData.citation, margin, y, 11); y -= 16; }
  if (caseData.court) { drawText(caseData.court, margin, y, 11); y -= 16; }
  if (caseData.dateFiled) { drawText("Filed: " + caseData.dateFiled, margin, y, 11); y -= 16; }
  if (caseData.docketNumber) { drawText("Docket: " + caseData.docketNumber, margin, y, 11); y -= 16; }
  drawText("----------------------------------------------------------", margin, y, 8);
  y -= 20;

  // Body text
  var bodyText = caseData.text || "No opinion text available.";
  bodyText = bodyText.replace(/<[^>]+>/g, "");
  bodyText = bodyText.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  bodyText = bodyText.replace(/\n{3,}/g, "\n\n");

  var paragraphs = bodyText.split(/\n\n+/);
  for (var p = 0; p < paragraphs.length; p++) {
    var lines = wrapText(paragraphs[p].trim(), maxWidth);
    for (var li = 0; li < lines.length; li++) {
      if (y < 50) { page = addPage(); y = 750; }
      drawText(lines[li], margin, y, 10);
      y -= 14;
    }
    y -= 6;
  }

  // Footer
  if (y < 80) { page = addPage(); y = 750; }
  y -= 30;
  drawText("Retrieved via Rook Legal Notary Agent | CourtListener API", margin, y, 8);
  y -= 12;
  drawText("Provenance: x402 payment + HCS notarization", margin, y, 8);

  // ─── VISIBLE PROVENANCE SEAL ───
  // Add a new page for the provenance seal so it's always on its own page
  page = addPage();
  y = 720;

  // Top border
  drawText("==========================================================", margin, y, 9, monoFont);
  y -= 20;
  drawText("  ONCHAIN PROVENANCE SEAL", margin, y, 14, boldFont);
  y -= 20;
  drawText("  Rook Legal Notary Agent v1.0", margin, y, 11);
  y -= 20;
  drawText("==========================================================", margin, y, 9, monoFont);
  y -= 25;

  if (provenanceData) {
    // Document hash — FULL, not truncated
    drawText("  Document Hash:", margin, y, 11, boldFont);
    y -= 16;
    var hashLines = wrapText(provenanceData.documentHash, 70);
    for (var hl = 0; hl < hashLines.length; hl++) {
      drawText("  " + hashLines[hl], margin, y, 10, monoFont);
      y -= 14;
    }
    y -= 10;

    // HCS anchor data — FULL
    if (provenanceData.hcsTopic) {
      drawText("  HCS Topic ID:", margin, y, 11, boldFont);
      y -= 16;
      drawText("  " + provenanceData.hcsTopic, margin, y, 10, monoFont);
      y -= 20;
    }
    if (provenanceData.hcsSequence) {
      drawText("  HCS Sequence:", margin, y, 11, boldFont);
      y -= 16;
      drawText("  " + provenanceData.hcsSequence, margin, y, 10, monoFont);
      y -= 20;
    }
    if (provenanceData.consensusTimestamp) {
      drawText("  Consensus Timestamp:", margin, y, 11, boldFont);
      y -= 16;
      drawText("  " + provenanceData.consensusTimestamp, margin, y, 10, monoFont);
      y -= 20;
    }
    if (provenanceData.hcsTxId) {
      drawText("  HCS Transaction ID:", margin, y, 11, boldFont);
      y -= 16;
      var txLines = wrapText(provenanceData.hcsTxId, 70);
      for (var tl = 0; tl < txLines.length; tl++) {
        drawText("  " + txLines[tl], margin, y, 10, monoFont);
        y -= 14;
      }
      y -= 10;
    }
    if (provenanceData.runningHash) {
      drawText("  Running Hash:", margin, y, 11, boldFont);
      y -= 16;
      var rhLines = wrapText(provenanceData.runningHash, 70);
      for (var rh = 0; rh < rhLines.length; rh++) {
        drawText("  " + rhLines[rh], margin, y, 10, monoFont);
        y -= 14;
      }
      y -= 10;
    }

    // x402 payment
    if (provenanceData.x402Tx) {
      drawText("  x402 Payment:", margin, y, 11, boldFont);
      y -= 16;
      drawText("  " + provenanceData.x402Tx, margin, y, 10, monoFont);
      y -= 16;
    }
    if (provenanceData.x402Amount) {
      drawText("  Amount: $" + provenanceData.x402Amount + " USDC on Base", margin, y, 10, monoFont);
      y -= 20;
    }

    // Retrieved at
    if (provenanceData.retrievedAt) {
      drawText("  Retrieved At:", margin, y, 11, boldFont);
      y -= 16;
      drawText("  " + provenanceData.retrievedAt, margin, y, 10, monoFont);
      y -= 25;
    }

    // Verification URL — FULL
    drawText("  Independent Verification:", margin, y, 11, boldFont);
    y -= 16;
    var verifyUrl = "https://mainnet-public.mirrornode.hedera.com/api/v1/topics/" + provenanceData.hcsTopic + "/messages/" + provenanceData.hcsSequence;
    var urlLines = wrapText(verifyUrl, 70);
    for (var ul = 0; ul < urlLines.length; ul++) {
      drawText("  " + urlLines[ul], margin, y, 10, monoFont);
      y -= 14;
    }
    y -= 15;
    drawText("  Run: node verify.js this-file.pdf", margin, y, 10, monoFont);
    y -= 25;

    // Merkle batch info
    if (provenanceData.merkleRoot) {
      drawText("  Merkle Batch Root:", margin, y, 11, boldFont);
      y -= 16;
      var mrLines = wrapText(provenanceData.merkleRoot, 70);
      for (var mr = 0; mr < mrLines.length; mr++) {
        drawText("  " + mrLines[mr], margin, y, 10, monoFont);
        y -= 14;
      }
      y -= 10;
      drawText("  (Document is part of a verified batch)", margin, y, 10);
      y -= 20;
    }
  }

  // Bottom border
  if (y < 60) { page = addPage(); y = 750; }
  y -= 20;
  drawText("==========================================================", margin, y, 9, monoFont);
  y -= 16;
  drawText("  This document has been cryptographically notarized.", margin, y, 9);
  y -= 14;
  drawText("  Any alteration will invalidate the hash on verification.", margin, y, 9);
  y -= 16;
  drawText("==========================================================", margin, y, 9, monoFont);

  var pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

var server = http.createServer(async function(req, res) {
  if (req.url === "/llms.txt") {
    serveLLMsTxt(res);
    return;
  }

  var urlObj = new URL(req.url, "http://localhost:" + PORT);
  var path = urlObj.pathname;

  if (req.method === "POST" && (path === "/api/legal-research" || path === "/api/case-law" || path === "/api/statute-lookup")) {
    var body = "";
    for await (var chunk of req) { body += chunk; }
    var query;
    try { query = JSON.parse(body).query || "constitutional law"; } catch(e) { query = "constitutional law"; }

    var authHeader = req.headers["x-payment"];
    if (!authHeader) {
      var challenge = {
        accepts: [{
          network: "eip155:8453",
          asset: USDC_BASE,
          amount: AMOUNT,
          payTo: PAY_TO,
          description: "$0.001 USDC for legal document retrieval via CourtListener",
        }],
      };
      var encoded = Buffer.from(JSON.stringify(challenge)).toString("base64");
      res.writeHead(402, { "Content-Type": "application/json", "X-Payment-Required": encoded });
      res.end(JSON.stringify({ error: "Payment required", challenge: challenge }));
      return;
    }

    try {
      var searchUrl = CL_BASE + "/api/rest/v4/search/?q=" + encodeURIComponent(query) + "&order_by=score+desc&limit=1";
      var searchResults = await fetchJSON(searchUrl);
      var results = searchResults.results || [];
      
      if (results.length === 0) {
        var settlementEmpty = Buffer.from(JSON.stringify({ transaction: "simulated", amount: AMOUNT })).toString("base64");
        res.writeHead(200, { "Content-Type": "application/json", "X-Payment-Response": settlementEmpty });
        res.end(JSON.stringify({ error: "No results found for: " + query }));
        return;
      }

      var top = results[0];
      var opinions = top.opinions || [];
      var opinionText = "";
      
      if (opinions.length > 0 && opinions[0].id) {
        try {
          var opinionUrl = CL_BASE + "/api/rest/v4/opinions/" + opinions[0].id + "/";
          var fullOpinion = await fetchJSON(opinionUrl);
          opinionText = fullOpinion.html_with_citations || fullOpinion.plain_text || fullOpinion.html || opinions[0].snippet || "";
        } catch(e) {
          opinionText = opinions[0].snippet || top.snippet || "";
        }
      }

      if (!opinionText) {
        opinionText = top.snippet || top.syllabus || "No opinion text available.";
      }

      var caseData = {
        caseName: top.caseName || "Unknown",
        citation: (top.citation && top.citation[0]) ? top.citation[0].cite : (top.neutralCite || ""),
        court: top.court || "",
        dateFiled: top.dateFiled || "",
        docketNumber: top.docketNumber || "",
        text: opinionText,
      };

      // Build PDF without provenance seal (added later by agent after HCS anchor)
      var pdfBuffer = await buildCasePdf(caseData, null);

      var settlement = {
        transaction: "simulated-x402-payment",
        network: "base",
        amount: AMOUNT,
        source: "CourtListener",
        query: query,
        caseName: caseData.caseName,
      };
      var settlementEncoded = Buffer.from(JSON.stringify(settlement)).toString("base64");

      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "X-Payment-Response": settlementEncoded,
      });
      res.end(pdfBuffer);
    } catch(err) {
      var errSettlement = Buffer.from(JSON.stringify({ transaction: "simulated" })).toString("base64");
      res.writeHead(200, { "Content-Type": "application/json", "X-Payment-Response": errSettlement });
      res.end(JSON.stringify({ error: "CourtListener query failed: " + err.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, function() {
  console.log("x402 Legal Proxy (CourtListener) on port " + PORT);
});

// Export buildCasePdf for use by the agent
module.exports = { buildCasePdf };
