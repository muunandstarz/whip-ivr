import fs from 'fs';

const AIRCALL_API_ID = process.env.AIRCALL_API_ID;
const AIRCALL_API_TOKEN = process.env.AIRCALL_API_TOKEN;
const auth = Buffer.from(AIRCALL_API_ID + ':' + AIRCALL_API_TOKEN).toString('base64');

// The 4 records the user flagged, plus fetch ALL closed "no voicemail" records
const callIds = ['3646354851', '3646392337', '3646408656', '3646419277', '3649963813'];

for (const callId of callIds) {
  const res = await fetch(`https://api.aircall.io/v1/calls/${callId}`, {
    headers: { Authorization: 'Basic ' + auth }
  });
  const data = await res.json();
  const vmUrl = data.call?.voicemail || data.call?.recording;
  if (!vmUrl) {
    console.log(`${callId}: No voicemail URL in Aircall`);
    continue;
  }
  const audioRes = await fetch(vmUrl);
  const buf = Buffer.from(await audioRes.arrayBuffer());
  console.log(`${callId}: ${buf.length} bytes | URL: ${vmUrl.slice(0, 60)}`);
  if (buf.length > 1000) {
    const path = `/tmp/vm-${callId}.mp3`;
    fs.writeFileSync(path, buf);
    console.log(`  → Saved to ${path} (has real audio!)`);
  } else {
    console.log(`  → Too small, no real audio`);
  }
}
