import https from 'https';

const id = process.env.AIRCALL_API_ID;
const token = process.env.AIRCALL_API_TOKEN;
const auth = Buffer.from(id + ':' + token).toString('base64');

function fetchCalls(numberId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.aircall.io',
      path: `/v1/calls?per_page=50&order=DESC&number_id=${numberId}`,
      headers: { 'Authorization': 'Basic ' + auth, 'Accept': 'application/json' }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

const result = await fetchCalls(1125090);
const calls = result.calls || [];

const withAgent = calls.filter(c => c.user);
const noAgent = calls.filter(c => !c.user);
const transferred = calls.filter(c => c.transferred_to);

console.log('Total calls fetched:', calls.length);
console.log('With named agent:', withAgent.length);
console.log('No agent (ring group only):', noAgent.length);
console.log('Transferred calls:', transferred.length);

console.log('\nSample calls WITH agent:');
withAgent.slice(0, 5).forEach(c => {
  console.log(JSON.stringify({
    id: c.id,
    direction: c.direction,
    status: c.status,
    user: c.user?.name,
    transferred_to: c.transferred_to,
    raw_digits: c.raw_digits,
    duration: c.duration,
    has_recording: !!(c.recording)
  }));
});

if (transferred.length > 0) {
  console.log('\nSample transferred call full data:');
  console.log(JSON.stringify(transferred[0], null, 2));
}

// Also check Claims Outbound line
const result2 = await fetchCalls(1128372);
const calls2 = result2.calls || [];
const withAgent2 = calls2.filter(c => c.user);
console.log('\n=== Claims Outbound line ===');
console.log('Total:', calls2.length, '| With agent:', withAgent2.length);
withAgent2.slice(0, 3).forEach(c => {
  console.log(JSON.stringify({ id: c.id, direction: c.direction, status: c.status, user: c.user?.name, raw_digits: c.raw_digits }));
});
