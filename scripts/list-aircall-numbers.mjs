import * as dotenv from "dotenv";
dotenv.config();

const AIRCALL_API_BASE = "https://api.aircall.io/v1";

function getAuth() {
  const id = process.env.AIRCALL_API_ID;
  const token = process.env.AIRCALL_API_TOKEN;
  return "Basic " + Buffer.from(`${id}:${token}`).toString("base64");
}

async function aircallFetch(path) {
  const res = await fetch(`${AIRCALL_API_BASE}${path}`, {
    headers: { Authorization: getAuth(), "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Aircall ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  // List all phone numbers
  let page = 1;
  const allNumbers = [];
  while (true) {
    const data = await aircallFetch(`/numbers?per_page=50&page=${page}`);
    const numbers = data.numbers ?? [];
    if (numbers.length === 0) break;
    allNumbers.push(...numbers);
    if (numbers.length < 50) break;
    page++;
  }
  console.log(`Total numbers: ${allNumbers.length}`);
  for (const num of allNumbers) {
    const users = (num.users ?? []).map(u => u.name ?? u.email ?? u.id).join(", ");
    console.log(`  ID=${num.id}  name="${num.name}"  digits=${num.digits}  users=[${users}]`);
  }

  // Also check what the users endpoint actually returns for numbers
  console.log("\n--- First 3 drivewhip users and their numbers ---");
  const usersData = await aircallFetch(`/users?per_page=50&page=1`);
  let shown = 0;
  for (const user of usersData.users ?? []) {
    const email = (user.email ?? "").toLowerCase();
    if (!email.endsWith("@drivewhip.com")) continue;
    console.log(`  User: ${user.name} (${email}) → numbers: ${JSON.stringify(user.numbers ?? [])}`);
    if (++shown >= 3) break;
  }
}

main().catch(err => { console.error(err); process.exit(1); });
