import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const records = [
  {
    aircallCallId: '3646354851',
    callerPhone: '+13054284161',
    callerName: 'Wilson Hickman',
    callerOrg: "Farmers Insurance",
    callerType: 'carrier',
    callbackPhone: '+13054284161',
    callbackEmail: null,
    callerRefNumber: null,
    whipClaimNumber: '921007',
    message: "Wilson Hickman from Farmers Insurance returning a voicemail for Mary Ann regarding claim 921007. No claim number on their end. Requesting callback at 305-428-4161.",
    rawTranscript: "Hello, it's Wilson Hickman here calling from Farmer's Insurance, returning the voicemail to Mary Ann, I believe, in reference to number 921007. I did not get a claim number for our end of it. Whenever you get the voicemail, feel free to give us a call back. My phone number is area code 305-428-4161. Now, please reference our claim number if possible.",
    handlerId: 30002,
    handlerName: 'Lorraine Tria',
    priority: 'normal',
  },
  {
    aircallCallId: '3646392337',
    callerPhone: '+12166172557',
    callerName: 'Michael Henderson',
    callerOrg: 'Sedgwick Claims Management Services',
    callerType: 'carrier',
    callbackPhone: '+12166172557',
    callbackEmail: 'michael.henderson@sedgwick.com',
    callerRefNumber: '268-002825',
    whipClaimNumber: 'AU0000203231',
    message: "Michael Henderson from Sedgwick (handling for Tokyo Marine) calling about PD claim. Their claim 268-002825, Whip ref AU0000203231, ref 501732. Driver statement obtained — driver 100% at fault. Requesting insurance info. Callback 216-617-2557 or email michael.henderson@sedgwick.com.",
    rawTranscript: "Hello, my name is Michael. I'm calling you from Sedgwick Claims Management Services. I'm following up with you on the voicemail you left for Tokyo Marine. My company, Sedgwick, handles insurance claims on behalf of Tokyo Marine. Our claim number is 268-002825, if you can note that. You left their claim number of AU0000203231. Your reference number is 501732. I'm the assigned handling adjuster. I just wanted to touch bases with you. We did get a statement from your driver. It looks like it was pretty clear that he's at fault for this accident. So I wanted to see how I can help you additionally and to obtain your insurance information. Our vehicle was a rental, so the driver's personal insurance carrier would be primary for any liability. But like I said, it looks like your driver was 100% at fault based on the statement. So you can call me back with any additional questions. My number is 216-617-2557. Again, reference my claim number of 268-002825. Also, email is really the quickest way to get in contact with me, which is michael.henderson at Sedgwick.com. Thank you so much, and have a great day.",
    handlerId: 30007,
    handlerName: 'Carlito Legarde Jr',
    priority: 'high',
  },
  {
    aircallCallId: '3646408656',
    callerPhone: '+12023086303',
    callerName: 'Jeff',
    callerOrg: 'Erie Insurance',
    callerType: 'carrier',
    callbackPhone: '+12023086303',
    callbackEmail: null,
    callerRefNumber: null,
    whipClaimNumber: null,
    message: "Jeff from Erie Insurance calling about a Toyota Corolla that got damaged. Requesting callback at 202-308-6303. (First call, Apr 1 at 8:42am)",
    rawTranscript: "Yes, hi, this is Jeff with Erie Insurance. The time now is 842 on Wednesday, April 1st. I was calling concerning about the Toyota Corolla that got damaged. If you would, please give me a call. My number is 202-308-6303. Thank you.",
    handlerId: 30005,
    handlerName: 'Demily Flores',
    priority: 'normal',
  },
  {
    aircallCallId: '3646419277',
    callerPhone: '+14704822636',
    callerName: 'Felicia',
    callerOrg: 'Liberty Mutual Claims Department',
    callerType: 'carrier',
    callbackPhone: '+14704822636',
    callbackEmail: null,
    callerRefNumber: 'AB949-721-993',
    whipClaimNumber: '706084',
    message: "Felicia from Liberty Mutual calling about PIP claim for Craig Colbert. Whip claim 706084. Their claim AB949-721-993. Callback 470-482-2636.",
    rawTranscript: "Hello, my name is Felicia. I'm calling from Liberty Mutual Claims Department. Your claim number is 706084. I'm calling you regarding the status of a PIP claim for Craig Colbert. I can be reached at 470-482-2636. Please reference our claim number, A as in apple, B as in boy, 949-721-993. Thank you and have a great day.",
    handlerId: 30006,
    handlerName: 'Jayla Bernard',
    priority: 'normal',
  },
  {
    aircallCallId: '3649963813',
    callerPhone: '+12023086303',
    callerName: 'Jeff',
    callerOrg: 'Erie Insurance',
    callerType: 'carrier',
    callbackPhone: '+12023086303',
    callbackEmail: null,
    callerRefNumber: null,
    whipClaimNumber: null,
    message: "Jeff from Erie Insurance following up — Toyota Corolla is a total loss. Needs vehicle moved. Has emailed and left multiple messages. Callback 202-308-6303. (Second call, Apr 2 at 8:21am)",
    rawTranscript: "Yes, hi, this is Jeff with Erie Insurance. The time now is 821 on Thursday, April 2nd. I was reaching out to you concerning about the Toyota Corolla that got hit and damaged. I wanted to talk to you to let you know that vehicle is going to come up as a total loss. So I need to be able to speak to you about getting the vehicle moved. If you would, please give me a call, 202-308-6303. And I had emailed you yesterday and have been leaving a couple of messages. So if you would, please give me a call. Thank you.",
    handlerId: 30005,
    handlerName: 'Demily Flores',
    priority: 'urgent',
  },
];

for (const r of records) {
  const [existing] = await conn.query(
    'SELECT id FROM intake_records WHERE aircallCallId = ?',
    [r.aircallCallId]
  );

  if (existing.length > 0) {
    await conn.query(`
      UPDATE intake_records SET
        callerName = ?,
        callerOrg = ?,
        callerType = ?,
        callbackPhone = ?,
        callbackEmail = ?,
        callerRefNumber = ?,
        whipClaimNumber = ?,
        message = ?,
        rawTranscript = ?,
        handlerId = ?,
        handlerName = ?,
        status = 'open',
        priority = ?,
        notes = NULL
      WHERE aircallCallId = ?
    `, [
      r.callerName, r.callerOrg, r.callerType,
      r.callbackPhone, r.callbackEmail, r.callerRefNumber,
      r.whipClaimNumber, r.message, r.rawTranscript,
      r.handlerId, r.handlerName, r.priority,
      r.aircallCallId
    ]);
    console.log(`Updated: ${r.aircallCallId} → ${r.callerName} (${r.callerOrg}) → ${r.handlerName}`);
  } else {
    console.log(`Not found: ${r.aircallCallId}`);
  }
}

await conn.end();
console.log('\nDone.');
