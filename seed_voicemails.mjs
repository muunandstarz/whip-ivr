import { createConnection } from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await createConnection(process.env.DATABASE_URL);

// First insert handlers based on the Snapsheet user list we saw
const handlers = [
  { name: 'Natashia Edulan', email: 'natashiae@drivewhip.com', phone: '8599065949', role: 'handler' },
  { name: 'Jayla Bernard', email: 'jayla.bernard@drivewhip.com', phone: '1111111111', role: 'handler' },
  { name: 'MJ Badua', email: 'mj.badua@drivewhip.com', phone: '1111111111', role: 'handler' },
  { name: 'Carlito Legarde Jr', email: 'carlito.legarde@drivewhip.com', phone: '1111111111', role: 'handler' },
  { name: 'Annie Ortiz', email: 'annie.ortiz@drivewhip.com', phone: '8559065949', role: 'handler' },
  { name: 'Ana Padilla', email: 'anap@drivewhip.com', phone: '1111111111', role: 'handler' },
  { name: 'Catherine Cestina', email: 'catherine.cestina@drivewhip.com', phone: '8559065949', role: 'handler' },
  { name: 'Elizabeth Avilla', email: 'elizabeth.avila@drivewhip.com', phone: '1112225555', role: 'handler' },
  { name: 'Lorraine Tria', email: 'lorraine.tria@drivewhip.com', phone: '8599065949', role: 'manager' },
  { name: 'Daniel Giono', email: 'daniel.giono@drivewhip.com', phone: '8559065949', role: 'manager' },
];

console.log('Inserting handlers...');
const handlerIds = {};
for (const h of handlers) {
  try {
    const [result] = await conn.execute(
      `INSERT INTO handlers (name, email, role, active, createdAt)
       VALUES (?, ?, ?, 1, NOW())
       ON DUPLICATE KEY UPDATE name=name`,
      [h.name, h.email, h.role]
    );
    // Get the ID
    const [rows] = await conn.execute('SELECT id FROM handlers WHERE email = ?', [h.email]);
    handlerIds[h.name] = rows[0]?.id;
    console.log(`  Handler: ${h.name} (id: ${handlerIds[h.name]})`);
  } catch (e) {
    console.error(`  Error inserting handler ${h.name}:`, e.message);
  }
}

const natashiaId = handlerIds['Natashia Edulan'];
const jaylaId = handlerIds['Jayla Bernard'];

// Real voicemail intake records from April 22, 2026
const intakeRecords = [
  {
    aircallCallId: '3707778719',
    callerPhone: '+17089275628',
    callerName: 'Semaj Hawkins',
    callerOrg: 'Rideshare Member',
    callerType: 'member',
    whipClaimNumber: null,
    callerRefNumber: null,
    message: 'Caller was on way to charging station in Des Plaines. Another driver made wrong turn and backed into the car. Fog lights hit and not working. Requesting callback.',
    callbackPhone: '7089275628',
    callbackEmail: null,
    handlerId: natashiaId,
    handlerName: 'Natashia Edulan',
    status: 'open',
    priority: 'high',
    isRepeatCaller: 0,
    repeatCallCount: 1,
    source: 'voicemail',
    rawTranscript: "Hello. My name is Alkins. I was on my way to the charging station in Des Plaines by over here. As I was coming into the charging station, there was a driver. He made the wrong turn and backed up into the car. I'm quite sure that's the fog lights that got hit, and it's currently not working. If you can reach me back at (708) 927-5628, that'd be perfect. Thank you.",
    aircallRecordingUrl: 'https://assets.aircall.io/calls/3707778719/voicemail',
    notes: 'New incident — fog light damage at charging station. Needs new claim filed.',
    createdAt: new Date('2026-04-22T17:52:33Z'),
  },
  {
    aircallCallId: '3707598901',
    callerPhone: '+18338010263',
    callerName: 'Austin',
    callerOrg: 'State Farm Claims',
    callerType: 'carrier',
    whipClaimNumber: 'MD-9562-020976-523574',
    callerRefNumber: '2098BA300G',
    message: 'Coverage denial for 2023 Toyota Corolla (Frederick Auer). State Farm unable to extend collision coverage for this loss. Denial letter being sent. No urgent callback needed.',
    callbackPhone: '9723623117',
    callbackEmail: null,
    handlerId: natashiaId,
    handlerName: 'Natashia Edulan',
    status: 'open',
    priority: 'normal',
    isRepeatCaller: 0,
    repeatCallCount: 1,
    source: 'voicemail',
    rawTranscript: "Hi. This is Austin with State Farm claims. I was calling about the 2023 Toyota Corolla for Frederick Auer. Let me see. I'm not sure if I've got your guys' claim number. Actually, I do. It's your file number is MD-9562-020976-523574. We did complete our coverage investigation. Unfortunately, we're not able to extend the collision coverage for this loss to the 2023 Toyota Corolla. I'm sending out a denial letter that kinda outlines the same thing. But if you have any questions about that, feel free to give me a call. My phone number is (972) 362-3117. Claim number reference is 2098BA-Bravo-300G-George. Thank you.",
    aircallRecordingUrl: 'https://assets.aircall.io/calls/3707598901/voicemail',
    notes: 'Coverage denial — denial letter incoming. Watch for letter and update claim file.',
    createdAt: new Date('2026-04-22T16:05:41Z'),
  },
  {
    aircallCallId: '3707408181',
    callerPhone: '+14104547324',
    callerName: 'Cynthia Sims',
    callerOrg: 'Maryland Transit Claims',
    callerType: 'carrier',
    whipClaimNumber: '126437',
    callerRefNumber: '261829-S',
    message: 'Calling for Natasha regarding file 126437 (incident 02/04/2026). Needs mailing address to send release for signature and notarization. Wants to know who to speak with.',
    callbackPhone: '4104547324',
    callbackEmail: null,
    handlerId: natashiaId,
    handlerName: 'Natashia Edulan',
    status: 'open',
    priority: 'high',
    isRepeatCaller: 0,
    repeatCallCount: 1,
    source: 'voicemail',
    rawTranscript: "Yes. Natasha, this is Cynthia Sims with Maryland Transit Claims calling in regards to your file number of 126437. This is from the incident that occurred on 02/04/2026. If you could please give me a callback, I'd like to find out who I need to speak with the mailing address so I can forward the release that needs to be signed, dated, and notarized. If you could please give me a callback at your earliest convenience, my number is (410) 454-7324. When you call, please reference my file number of 261829-S. My direct number is (410) 454-7324. Thank you, and have a good day.",
    aircallRecordingUrl: 'https://assets.aircall.io/calls/3707408181/voicemail',
    notes: 'Needs mailing address for notarized release. Provide Natasha\'s direct contact.',
    createdAt: new Date('2026-04-22T14:41:59Z'),
  },
  {
    aircallCallId: '3707332373_anthony1',
    callerPhone: '+12193163947',
    callerName: 'Anthony Victory',
    callerOrg: 'Rideshare Member',
    callerType: 'member',
    whipClaimNumber: null,
    callerRefNumber: null,
    message: 'Calling for status update on claim — wants to know if Dollar Tree claims department has been in contact with Whip. Called 4 times today. Frustrated caller.',
    callbackPhone: '2193163947',
    callbackEmail: null,
    handlerId: natashiaId,
    handlerName: 'Natashia Edulan',
    status: 'open',
    priority: 'urgent',
    isRepeatCaller: 1,
    repeatCallCount: 4,
    source: 'voicemail',
    rawTranscript: "Hi. My name is Anthony Victory. I'm just calling to check a update on the claims. If Dollar Tree claims department got in contact with you on the further investigation. Can you give me a callback to give me an update? Thank you. Bye.",
    aircallRecordingUrl: 'https://assets.aircall.io/calls/3707403191/voicemail',
    notes: 'REPEAT CALLER — called 4 times today. Dollar Tree incident. Needs urgent callback with status update.',
    createdAt: new Date('2026-04-22T14:39:55Z'),
  },
  {
    aircallCallId: '3707220463',
    callerPhone: '+12152836460',
    callerName: 'Anthony Franco',
    callerOrg: 'Liberty Mutual Insurance / Uber Claims',
    callerType: 'carrier',
    whipClaimNumber: 'MA-MD-9383427420279862',
    callerRefNumber: '440118350',
    message: 'Requesting rental agreement for 2023 Tesla Model 3 (insured: Alana Stevens, loss date 03/14/2026). Coverage investigation ongoing. Can fax or email.',
    callbackPhone: '2152836460',
    callbackEmail: 'anthony.franco@libertymutual.com',
    handlerId: natashiaId,
    handlerName: 'Natashia Edulan',
    status: 'open',
    priority: 'high',
    isRepeatCaller: 0,
    repeatCallCount: 1,
    source: 'voicemail',
    rawTranscript: "Hello. This message is for Natasha. My name is Anthony Franco from Liberty Mutual Insurance. I'm back with Uber claims. I was giving you a call in regards to your claim number, MA-MD-9383427420279862. This is for an accident that occurred on 03/14/2026. The insured is Alana Stevens. This was for a — I think I believe the vehicle was a — I think it was for a 2023 Tesla Model 3. We're trying to get the rental agreement for this vehicle. We have a coverage investigation, so we just need to verify the rental agreement information. If you could fax that to us, our fax number is (888) 325-8127. And our email is anthony.franco@libertymutual.com. That's anthony.franco@libertymutual.com. If you wanted to send the information that way. And, again, my phone number is (215) 283-6460, and the claim number to reference when calling is 440118350. Thank you for your time, and you have a great day.",
    aircallRecordingUrl: 'https://assets.aircall.io/calls/3707220463/voicemail',
    notes: 'Send rental agreement. Fax: (888) 325-8127 or email anthony.franco@libertymutual.com',
    createdAt: new Date('2026-04-22T13:25:57Z'),
  },
  {
    aircallCallId: '3707130625',
    callerPhone: '+14434024893',
    callerName: 'Blaine Pennington',
    callerOrg: 'Rideshare Member',
    callerType: 'member',
    whipClaimNumber: null,
    callerRefNumber: null,
    message: 'Frustrated caller — wants callback from any agent. Will not be calling back today. Existing claim update needed.',
    callbackPhone: '4434024893',
    callbackEmail: null,
    handlerId: natashiaId,
    handlerName: 'Natashia Edulan',
    status: 'open',
    priority: 'urgent',
    isRepeatCaller: 0,
    repeatCallCount: 1,
    source: 'voicemail',
    rawTranscript: "Hi. Yes. This is Blaine Pennington. I just need a callback from anybody. Would've — I'm not giving a callback today. So if you guys could call me back at (443) 402-4893. Thank you.",
    aircallRecordingUrl: 'https://assets.aircall.io/calls/3707130625/voicemail',
    notes: 'Frustrated member. Will NOT call back. Must reach out proactively today.',
    createdAt: new Date('2026-04-22T12:51:48Z'),
  },
  {
    aircallCallId: '3707055384',
    callerPhone: '+18139366714',
    callerName: 'Ashley',
    callerOrg: 'First Acceptance Insurance',
    callerType: 'carrier',
    whipClaimNumber: null,
    callerRefNumber: '0102517633',
    message: 'Returning a call from Whip. Confused about Whip\'s affiliation — outbound voicemail did not explain context. Available until 5PM EST.',
    callbackPhone: '8139366714',
    callbackEmail: null,
    handlerId: natashiaId,
    handlerName: 'Natashia Edulan',
    status: 'open',
    priority: 'normal',
    isRepeatCaller: 0,
    repeatCallCount: 1,
    source: 'voicemail',
    rawTranscript: "Hi, Jobs. This is Ashley with First Acceptance Insurance. I received a voicemail from you, regarding my claim, 0102517633. I'm not sure how you guys are affiliated with the claim. You didn't leave any additional information on the voicemail, but you're welcome to give me a callback at (813) 936-6714. I'll be here today until 5PM Eastern Standard. Thank you. Have a good day.",
    aircallRecordingUrl: 'https://assets.aircall.io/calls/3707055384/voicemail',
    notes: 'Outbound voicemail issue — Whip did not identify themselves clearly. Training note.',
    createdAt: new Date('2026-04-22T12:25:44Z'),
  },
  {
    aircallCallId: '3706996726',
    callerPhone: '+17272710245',
    callerName: 'Francis Meza',
    callerOrg: 'Rideshare Member',
    callerType: 'member',
    whipClaimNumber: null,
    callerRefNumber: null,
    message: 'Spanish-speaking member returning a call from "Mary." Left message in Spanish. Needs Spanish-capable agent callback.',
    callbackPhone: '7272710245',
    callbackEmail: null,
    handlerId: natashiaId,
    handlerName: 'Natashia Edulan',
    status: 'open',
    priority: 'high',
    isRepeatCaller: 0,
    repeatCallCount: 1,
    source: 'voicemail',
    rawTranscript: "La la señora Mary me llamó referente a un un claim que vi. Mi nombre es Francis Mesa, estaba devolviendo la llamada. Si me pueden devolver la llamada o yo vuelvo a llamar en un par de minutos.",
    aircallRecordingUrl: 'https://assets.aircall.io/calls/3706996726/voicemail',
    notes: 'Spanish speaker — returning call from Mary. Needs bilingual agent. Translation: "Ms. Mary called me about a claim. My name is Francis Mesa, returning the call."',
    createdAt: new Date('2026-04-22T12:06:17Z'),
  },
  {
    aircallCallId: '3706900699',
    callerPhone: '+14073950259',
    callerName: 'Andrew',
    callerOrg: 'Athens Administrators / Tresura Specialty Insurance',
    callerType: 'carrier',
    whipClaimNumber: '119173',
    callerRefNumber: 'TS260108',
    message: 'Returning Whip outbound voicemail. Wants to discuss vehicle damages. Newly assigned to claim.',
    callbackPhone: '4073950259',
    callbackEmail: null,
    handlerId: natashiaId,
    handlerName: 'Natashia Edulan',
    status: 'open',
    priority: 'normal',
    isRepeatCaller: 0,
    repeatCallCount: 1,
    source: 'voicemail',
    rawTranscript: "Good afternoon. This is Andrew over at Athens Administrators. We're a claim service provider for Tresura Specialty Insurance Company, they're insured ASAP Transcorp. I was giving you a call in regards to the voicemail left just a little bit ago. I've got your claim number here handy as 119173. Wanted to touch bases with you on the vehicle damages involved. If you could give me a callback, my direct line is area code (407) 395-0259, and just reference our claim number when calling. That'll be TS260108. Thank you. Have a great day. Bye.",
    aircallRecordingUrl: 'https://assets.aircall.io/calls/3706900699/voicemail',
    notes: 'Vehicle damage discussion needed. TPA for Tresura Specialty / ASAP Transcorp.',
    createdAt: new Date('2026-04-22T11:39:11Z'),
  },
  {
    aircallCallId: '3706778531',
    callerPhone: '+18008413000',
    callerName: 'Sydney',
    callerOrg: 'GEICO Claims Department',
    callerType: 'carrier',
    whipClaimNumber: '191003',
    callerRefNumber: null,
    message: 'Returning Whip call regarding claim 191003. Available until 4:30PM EST.',
    callbackPhone: '7576895607',
    callbackEmail: null,
    handlerId: natashiaId,
    handlerName: 'Natashia Edulan',
    status: 'open',
    priority: 'normal',
    isRepeatCaller: 0,
    repeatCallCount: 1,
    source: 'voicemail',
    rawTranscript: "Afternoon. This is Sydney with the GEICO claims department calling you back regarding claim number 191003. If you wanna give me a call, I'm available today till 04:30 eastern time. My direct line is (757) 689-5607. Thank you.",
    aircallRecordingUrl: 'https://assets.aircall.io/calls/3706778531/voicemail',
    notes: 'Direct line: (757) 689-5607. Available until 4:30PM EST.',
    createdAt: new Date('2026-04-22T11:09:45Z'),
  },
  {
    aircallCallId: '3706709841',
    callerPhone: '+13019001234',
    callerName: 'Blanca',
    callerOrg: 'Law Offices of Louis Leon',
    callerType: 'law_office',
    whipClaimNumber: '031368',
    callerRefNumber: null,
    message: 'Following up on billing status for client Damaris Lial Quintanilla and passengers Juliet and Hazel. Sent demand letters, extension info from police dept, and accident photos via email. Needs liability update.',
    callbackPhone: '3019001234',
    callbackEmail: null,
    handlerId: jaylaId,
    handlerName: 'Jayla Bernard',
    status: 'open',
    priority: 'high',
    isRepeatCaller: 0,
    repeatCallCount: 1,
    source: 'voicemail',
    rawTranscript: "Good morning, Jela. This is Blanca calling from the Law Offices of Louis Leon regarding claim number 031368 for my client, Damaris Lial Quintanilla. I was calling because I would like to follow-up on my billing status. I had sent requested documentation through email, demand letters, extension information from the police department, and photos of the accident. If you can just give me a callback at (301) 900-1234. This is regarding liability for my client, Damaris Lial Quintanilla, and her passengers Juliet and Hazel. Thank you.",
    aircallRecordingUrl: 'https://assets.aircall.io/calls/3706709841/voicemail',
    notes: 'Demand letters and accident photos sent via email. Check email and respond on liability status.',
    createdAt: new Date('2026-04-22T10:54:52Z'),
  },
  {
    aircallCallId: '3706382098',
    callerPhone: '+14433400340',
    callerName: 'Corey Mills',
    callerOrg: 'Maryland Auto Insurance',
    callerType: 'carrier',
    whipClaimNumber: 'MD8059512256578179',
    callerRefNumber: null,
    message: 'Newly assigned adjuster reaching out for accident details and vehicle location. Needs vehicle info and location to proceed.',
    callbackPhone: '4433400340',
    callbackEmail: 'Corey.Mills@MarylandAuto.net',
    handlerId: natashiaId,
    handlerName: 'Natashia Edulan',
    status: 'open',
    priority: 'normal',
    isRepeatCaller: 0,
    repeatCallCount: 1,
    source: 'voicemail',
    rawTranscript: "Hey. Corey from Maryland Auto Insurance. I'm trying to reach Natasha. It's regarding a claim MD8059512256578179. Just reaching out to get some more information on this accident. I just got assigned to it.",
    aircallRecordingUrl: 'https://assets.aircall.io/calls/3706382098/voicemail',
    notes: 'Newly assigned adjuster. Email: Corey.Mills@MarylandAuto.net',
    createdAt: new Date('2026-04-22T09:55:38Z'),
  },
  {
    aircallCallId: '3706303444',
    callerPhone: '+16232326896',
    callerName: 'Holly',
    callerOrg: 'Farmers Insurance',
    callerType: 'carrier',
    whipClaimNumber: '7010056494-1',
    callerRefNumber: '7010056494-1',
    message: 'Returning Natasha\'s call. 2026 Tesla Model Y, driver Ajmal Hhuyar. Liability still pending — unable to get statement from their driver. Whip did not provide claim number in outbound voicemail.',
    callbackPhone: '6232326896',
    callbackEmail: null,
    handlerId: natashiaId,
    handlerName: 'Natashia Edulan',
    status: 'open',
    priority: 'high',
    isRepeatCaller: 0,
    repeatCallCount: 1,
    source: 'voicemail',
    rawTranscript: "Yes. This is Holly calling from Farmers Insurance returning a phone call from Natasha. You indicated you were the owners of the 2026 Tesla Model Y. You did not give me a claim number. Your driver, Ajmal Hhuyar. Date of loss, April '26. We have not been able to get a statement from our driver, so liability is still pending on this loss. If you can give me a callback, let me know if you're handling your own repairs. My number is (623) 232-6896. Claim number is 7010056494-1. This claim was actually just transferred to me yesterday as well, so I am reviewing all the details. Thank you, and have a good day.",
    aircallRecordingUrl: 'https://assets.aircall.io/calls/3706303444/voicemail',
    notes: 'Outbound voicemail issue — Natasha did not include claim number. Training note. Liability pending.',
    createdAt: new Date('2026-04-22T09:42:25Z'),
  },
  {
    aircallCallId: '3705889923',
    callerPhone: '+18442928615',
    callerName: 'Morgan',
    callerOrg: 'State Farm Claims',
    callerType: 'carrier',
    whipClaimNumber: 'MD-9658305293-930900',
    callerRefNumber: '2098P936P',
    message: 'Whip accepted liability. Driver\'s attorney pursuing underinsured motorist coverage. Needs Whip\'s liability limits confirmed.',
    callbackPhone: '8442928615',
    callbackEmail: null,
    handlerId: natashiaId,
    handlerName: 'Natashia Edulan',
    status: 'open',
    priority: 'urgent',
    isRepeatCaller: 0,
    repeatCallCount: 1,
    source: 'voicemail',
    rawTranscript: "Hi. My name is Morgan. I am giving you a call from State Farm claims. It's regarding your claim number MD-9658305293-930900. I was just advised that you all had accepted liability for this accident. It looks like our driver, their attorney's office is looking to present for potential underinsured motorist coverage. And I was just calling to confirm you all's liability limits on this one. My phone number for callback, (844) 292-8615, ext. 33705. And the State Farm claim number is 2098P-Paul-936P-Paul.",
    aircallRecordingUrl: 'https://assets.aircall.io/calls/3705889923/voicemail',
    notes: 'URGENT — underinsured motorist claim being pursued. Confirm liability limits immediately.',
    createdAt: new Date('2026-04-22T08:31:04Z'),
  },
];

console.log('\nInserting intake records...');
let inserted = 0;
for (const record of intakeRecords) {
  try {
    await conn.execute(
      `INSERT INTO intake_records 
       (aircallCallId, callerPhone, callerName, callerOrg, callerType, whipClaimNumber, callerRefNumber, 
        message, callbackPhone, callbackEmail, handlerId, handlerName, status, priority, isRepeatCaller, 
        repeatCallCount, source, rawTranscript, aircallRecordingUrl, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE callerName=callerName`,
      [
        record.aircallCallId, record.callerPhone, record.callerName, record.callerOrg,
        record.callerType, record.whipClaimNumber || null, record.callerRefNumber || null,
        record.message, record.callbackPhone || null, record.callbackEmail || null,
        record.handlerId || null, record.handlerName || null, record.status, record.priority,
        record.isRepeatCaller, record.repeatCallCount, record.source,
        record.rawTranscript, record.aircallRecordingUrl || null, record.notes || null,
        record.createdAt
      ]
    );
    inserted++;
    console.log(`  ✓ ${record.callerName} (${record.callerOrg}) — ${record.callerType}`);
  } catch (e) {
    console.error(`  ✗ Error inserting ${record.callerName}:`, e.message);
  }
}

// Also insert some caller profiles for repeat callers
console.log('\nInserting caller profiles...');
const profiles = [
  {
    phone: '+12193163947',
    name: 'Anthony Victory',
    callerType: 'member',
    totalCalls: 4,
    lastCallDate: new Date('2026-04-22T14:42:37Z'),
    notes: 'Rideshare member — Dollar Tree incident. Called 4 times on 4/22. Frustrated.',
  },
  {
    phone: '+14434024893',
    name: 'Blaine Pennington',
    callerType: 'member',
    totalCalls: 1,
    lastCallDate: new Date('2026-04-22T12:51:48Z'),
    notes: 'Frustrated member — will not call back. Must be reached proactively.',
  },
];

for (const profile of profiles) {
  try {
    await conn.execute(
      `INSERT INTO caller_profiles (phone, name, callerType, totalCalls, lastCallAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE totalCalls=?, lastCallAt=?`,
      [profile.phone, profile.name, profile.callerType, profile.totalCalls, profile.lastCallDate, profile.totalCalls, profile.lastCallDate]
    );
    console.log(`  ✓ Profile: ${profile.name}`);
  } catch (e) {
    console.error(`  ✗ Error inserting profile ${profile.name}:`, e.message);
  }
}

await conn.end();
console.log(`\n✅ Done! Inserted ${inserted} intake records from April 22, 2026 voicemails.`);
