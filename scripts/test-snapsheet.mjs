const key = "whip_us_api";
const secret = "966b25c04c9ae6ff38b6";
const auth = Buffer.from(`${key}:${secret}`).toString("base64");
const baseUrl = process.env.SNAPSHEET_API_URL;

console.log("SNAPSHEET_API_URL:", baseUrl ?? "(not set)");

const endpoints = [
  "https://api.snapsheet.us",
  "https://app.snapsheet.us/api",
  "https://whip.snapsheet.us/api",
];

const claimNumbers = [
  "GA-4899-430247-470636",
  "GA489943024747063",
  "GA4899430247470636",
];

async function main() {
  const targets = baseUrl ? [baseUrl] : endpoints;
  for (const ep of targets) {
    for (const cn of claimNumbers) {
      try {
        const url = `${ep}/v1/claims?claim_number=${encodeURIComponent(cn)}`;
        const r = await fetch(url, {
          headers: { Authorization: `Basic ${auth}` },
          signal: AbortSignal.timeout(4000),
        });
        const text = await r.text();
        console.log(`${ep} [${cn}] -> ${r.status}: ${text.slice(0, 150)}`);
      } catch (e) {
        console.log(`${ep} [${cn}] -> ERROR: ${e.message}`);
      }
    }
  }
}

main().catch(console.error);
