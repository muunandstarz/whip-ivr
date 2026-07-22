import https from 'https';

const id = process.env.AIRCALL_API_ID;
const token = process.env.AIRCALL_API_TOKEN;
const auth = Buffer.from(id + ':' + token).toString('base64');

// Claims agents with their Aircall user IDs
const CLAIMS_AGENTS = [
  { name: 'Ana Padilla',       userId: 1794311, ext: '012' },
  { name: 'Bennet Carlos',     userId: 1774596, ext: '175' },
  { name: 'Carlito Legarde',   userId: 1756923, ext: '325' },
  { name: 'Natashia Edulan',   userId: 1756924, ext: '326' },
  { name: 'Demily Flores',     userId: 1763684, ext: '011' },
  { name: 'Daryl Ochate',      userId: 1827146, ext: '017' },
  { name: 'Jovel Villa',       userId: 1836484, ext: '018' },
  { name: 'Annie Ortiz',       userId: 1836944, ext: '019' },
  { name: 'Lorraine Tria',     userId: 1871743, ext: '040' },
  { name: 'MJ Badua',          userId: 1874373, ext: '041' },
  { name: 'Jayla Bernard',     userId: 1881559, ext: '309' },
  { name: 'Daniel Giono',      userId: 1924606, ext: '048' },
  { name: 'Tim Chan',          userId: 1940186, ext: '028' },
  { name: 'Giovanni Cabrera',  userId: 1947062, ext: '996' },
];

function fetchCallsForUser(userId) {
  return new Promise((resolve, reject) => {
    // Use from/to timestamps for last 30 days
    const to = Math.floor(Date.now() / 1000);
    const from = to - (30 * 24 * 60 * 60);
    const options = {
      hostname: 'api.aircall.io',
      path: `/v1/calls?per_page=50&order=DESC&user_id=${userId}&from=${from}&to=${to}`,
      headers: { 'Authorization': 'Basic ' + auth, 'Accept': 'application/json' }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

console.log('Checking calls per agent (last 30 days)...\n');

for (const agent of CLAIMS_AGENTS) {
  const result = await fetchCallsForUser(agent.userId);
  const calls = result.calls || [];
  const meta = result.meta || {};
  
  // Check if the user filter is actually working by seeing if calls belong to this agent
  const agentCalls = calls.filter(c => c.user && c.user.id === agent.userId);
  const otherCalls = calls.filter(c => !c.user || c.user.id !== agent.userId);
  
  console.log(`${agent.name} (ext ${agent.ext}, id ${agent.userId}):`);
  console.log(`  API total: ${meta.total || '?'} | Fetched: ${calls.length} | Actually agent's: ${agentCalls.length} | Other: ${otherCalls.length}`);
  
  if (agentCalls.length > 0) {
    const sample = agentCalls[0];
    console.log(`  Sample: ${sample.direction} ${sample.status} via ${sample.number?.name} from ${sample.raw_digits} (${sample.duration}s)`);
  }
}
