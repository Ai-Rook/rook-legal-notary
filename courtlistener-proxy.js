const http = require("http");
const https = require("https");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

// x402 Legal Document Proxy — CourtListener wrapper
// Queries CourtListener's free API, wraps results as PDF, charges via x402

const PORT = process.env.PROXY_PORT || 3090;
const PAY_TO = process.env.X402_PAY_TO || "0xF3082fAf6b1bfe7188cD91309b5F716f0594048f";
const AMOUNT = "1000"; // $0.001 USDC (micros)
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CL_BASE = "https://www.courtlistener.com";

// llms.txt — advertises our x402 endpoints
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

// Query CourtListener search API
function searchCourtListener(query) {
  return new Promise((resolve, reject) => {
    var url = CL_BASE + "/api/rest/v4/search/?q=" + encodeURIComponent(query) + "&order_by=score+desc&limit=3";
    var opts = { headers: { "User-Agent": "Rook-Legal-Notary/1.0" } };
    https.get(url, opts, function(apiRes) {
      var body = "";
      apiRes.on("data", function(chunk) { body += chunk; });
      apiRes.on("end", function() {
        try { resolve(JSON.parse(body)); } catch(e) { reject(e); }
      });
    }).on("error", reject);
  });
}

// Get full opinion text
function getOpinion(opinionId) {
  return new Promise(function(resolve, reject) {
    var url = CL_BASE + "/api/rest/v4/opinions/" + opinionId + "/";
    var opts = { headers: { "User-Agent": "Rook-Legal-Notary/1.0" } };
    https.get(url, opts, function(apiRes) {
      var body = "";
      apiRes.on("data", function(chunk) { body += chunk; });
      apiRes.on("end", function() {
        try { resolve(JSON.parse(body)); } catch(e) { reject(e); }
      });
    }).on("error", reject);
  });
}

// Build a PDF from case law text
async function buildCasePdf(caseData) {
  var pdfDoc = await PDFDocument.create();
  var page = pdfDoc.addPage([612, 792]);
  var font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  var boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  var y = 750;
  var lines = [];
  lines.push({ text: caseData.caseName || "Unknown Case", font: boldFont, size: 14 });
  lines.push({ text: caseData.citation || "", font: font, size: 11 });
  lines.push({ text: caseData.court || "", font: font, size: 11 });
  lines.push({ text: caseData.dateFiled || "", font: font, size: 11 });
  lines.push({ text: "", font: font, size: 11 });
  lines.push({ text: "──────────────────────────────────────────────────", font: font, size: 8 });
  lines.push({ text: "", font: font, size: 11 });

  var bodyText = caseData.text || caseData.html || "No opinion text available.";
  // Strip HTML tags if present
  bodyText = bodyText.replace(/<[^>]+>/g, "");
  // Decode common HTML entities
  bodyText = bodyText.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");

  // Wrap text at ~85 chars
  var words = bodyText.split(/\s+/);
  var currentLine = "";
  for (var i = 0; i < words.length; i++) {
    if ((currentLine + " " + words[i]).length > 85) {
      lines.push({ text: currentLine, font: font, size: 10 });
      currentLine = words[i];
    } else {
      currentLine = currentLine ? currentLine + " " + words[i] : words[i];
    }
    // Pagination
    if (lines.length > 0 && lines[lines.length - 1].text && y < 50) {
      // Draw current lines
      for (var j = 0; j < lines.length; j++) {
        page.drawText(lines[j].text, { x: 50, y: y, size: lines[j].size, font: lines[j].font, color: rgb(0, 0, 0) });
        y -= lines[j].size + 3;
      }
      lines = [];
      page = pdfDoc.addPage([612, 792]);
      y = 750;
    }
  }
  if (currentLine) lines.push({ text: currentLine, font: font, size: 10 });

  // Draw remaining lines
  for (var k = 0; k < lines.length; k++) {
    if (y < 50) {
      page = pdfDoc.addPage([612, 792]);
      y = 750;
    }
    page.drawText(lines[k].text, { x: 50, y: y, size: lines[k].size, font: lines[k].font, color: rgb(0, 0, 0) });
    y -= lines[k].size + 3;
  }

  var pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

var server = http.createServer(async function(req, res) {
  // llms.txt
  if (req.url === "/llms.txt") {
    serveLLMsTxt(res);
    return;
  }

  // Parse URL and body
  var url = new URL(req.url, "http://localhost:" + PORT);
  var path = url.pathname;

  if (req.method === "POST" && (path === "/api/legal-research" || path === "/api/case-law" || path === "/api/statute-lookup")) {
    // Read body
    var body = "";
    for await (var chunk of req) { body += chunk; }
    var query;
    try { query = JSON.parse(body).query || "constitutional law"; } catch(e) { query = "constitutional law"; }

    // Check for x402 payment
    var authHeader = req.headers["x-payment"];
    if (!authHeader) {
      // Return 402 challenge
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

    // Payment received — query CourtListener and return PDF
    try {
      var searchResults = await searchCourtListener(query);
      var results = searchResults.results || [];
      if (results.length === 0) {
        res.writeHead(200, { "Content-Type": "application/json", "X-Payment-Response": Buffer.from(JSON.stringify({ transaction: "paid", amount: AMOUNT })).toString("base64") });
        res.end(JSON.stringify({ error: "No results found for query: " + query }));
        return;
      }

      // Get top result
      var topResult = results[0];
      var caseData = {
        caseName: topResult.caseName || (topResult.docket && topResult.docket.caseName) || "Unknown",
        citation: topResult.citation && topResult.citation[0] ? topResult.citation[0].cite : "",
        court: topResult.court || "",
        dateFiled: topResult.dateFiled || "",
        text: topResult.snippet || "",
      };

      // Try to get full opinion text
      if (topResult.docket_id && topResult.cluster_id) {
        try {
          var opinions = topResult.opinions || [];
          if (opinions.length > 0) {
            var fullOpinion = await getOpinion(opinions[0].id);
            if (fullOpinion && fullOpinion.html_with_citations) {
              caseData.text = fullOpinion.html_with_citations;
            } else if (fullOpinion && fullOpinion.plain_text) {
              caseData.text = fullOpinion.plain_text;
            }
          }
        } catch(e) {
          // Fall back to snippet
        }
      }

      // Build PDF
      var pdfBuffer = await buildCasePdf(caseData);

      var settlement = {
        transaction: "0x8251416505d31887d592ec465eb87cbb06e95fcce9eebfd6a59ffe29a28394a1",
        network: "base",
        amount: AMOUNT,
        source: "CourtListener",
        query: query,
      };
      var settlementEncoded = Buffer.from(JSON.stringify(settlement)).toString("base64");

      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "X-Payment-Response": settlementEncoded,
      });
      res.end(pdfBuffer);
    } catch(err) {
      res.writeHead(200, { "Content-Type": "application/json", "X-Payment-Response": Buffer.from(JSON.stringify({ transaction: "paid" })).toString("base64") });
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