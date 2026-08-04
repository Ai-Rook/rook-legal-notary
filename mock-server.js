const http = require("http");

// Mock legal document server — serves a sample case law PDF with x402 402 challenge
const PORT = 3090;
const PAY_TO = "0xF3082fAf6b1bfe7188cD91309b5F716f0594048f";
const AMOUNT = "1000"; // $0.001 USDC (micros)

// Minimal valid PDF (1-page blank)
const PDF_BYTES = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF",
  "utf-8"
);

const server = http.createServer((req, res) => {
  if (req.url === "/llms.txt") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("# Legal Research API\n\n## Endpoints\n- /api/legal-research: Case law and statute retrieval\n- /api/case-law: Case law search\n- /api/statute-lookup: Statute lookup\n");
    return;
  }

  if (req.url === "/api/legal-research" && req.method === "POST") {
    // Check for payment
    const authHeader = req.headers["x-payment"];
    if (!authHeader) {
      // Return 402 challenge
      const challenge = {
        accepts: [{
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          amount: AMOUNT,
          payTo: PAY_TO,
          description: "$0.001 USDC for legal document retrieval",
        }],
      };
      const encoded = Buffer.from(JSON.stringify(challenge)).toString("base64");
      res.writeHead(402, {
        "Content-Type": "application/json",
        "X-Payment-Required": encoded,
      });
      res.end(JSON.stringify({ error: "Payment required", challenge }));
      return;
    }

    // Payment received — return document
    const settlement = {
      transaction: "0x8251416505d31887d592ec465eb87cbb06e95fcce9eebfd6a59ffe29a28394a1",
      network: "base",
      amount: AMOUNT,
    };
    const settlementEncoded = Buffer.from(JSON.stringify(settlement)).toString("base64");
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "X-Payment-Response": settlementEncoded,
    });
    res.end(PDF_BYTES);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log("Mock legal doc server on port " + PORT);
});
