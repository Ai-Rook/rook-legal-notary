const { CdpClient } = require("@coinbase/cdp-sdk");
const { CdpX402Client } = require("@coinbase/cdp-sdk/x402");
const { wrapFetchWithPayment } = require("@x402/fetch");
const dotenv = require("dotenv");

dotenv.config();

const BASE_URL = process.env.LEGAL_API_URL || "https://agents.ai-rook.com";
const WALLET_NAME = process.env.X402_WALLET_NAME || "x402-client-wallet-1";
const NETWORK = "eip155:8453";

let fetchWithPayment = null;

function initX402() {
  const cdp = new CdpClient({
    apiKeyId: process.env.CDP_API_KEY_ID,
    apiKeySecret: process.env.CDP_API_KEY_SECRET,
    walletSecret: process.env.CDP_WALLET_SECRET,
  });
  const x402Client = new CdpX402Client({ cdpClient: cdp, accountName: WALLET_NAME, network: "base" });
  fetchWithPayment = wrapFetchWithPayment(fetch, x402Client);
  return fetchWithPayment;
}

async function discoverEndpoints() {
  const res = await fetch(BASE_URL + "/llms.txt");
  const text = await res.text();
  const endpoints = [];
  for (const line of text.split("\n")) {
    const match = line.match(/(?:^|\s)(\/api\/[^\s]+)/);
    if (match) endpoints.push(match[1]);
  }
  return endpoints;
}

async function retrieveDocument(endpoint, query) {
  if (!fetchWithPayment) initX402();
  const url = BASE_URL + endpoint;
  const res = await fetchWithPayment(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: query }),
  });

  let settlement = null;
  const paymentResponse = res.headers.get("payment-response");
  if (paymentResponse) {
    try {
      settlement = JSON.parse(Buffer.from(paymentResponse, "base64").toString());
    } catch (e) {}
  }

  const data = await res.arrayBuffer();
  return { data: Buffer.from(data), settlement: settlement };
}

module.exports = { initX402, discoverEndpoints, retrieveDocument };
