/**
 * Check Ana's claim call-out activity today in #claims and #claims-remotemarkets
 * Ana's Slack user ID: U091NDYN0E6
 */
import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";

const db = await createConnection(process.env.DATABASE_URL);

// Get today's date range in UTC (business day Jul 20 2026)
const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);
const todayEnd = new Date();
todayEnd.setHours(23, 59, 59, 999);

const todayStartMs = todayStart.getTime();
const todayEndMs = todayEnd.getTime();

console.log(`Checking Ana's activity for today: ${todayStart.toISOString()} → ${todayEnd.toISOString()}`);
console.log(`Ana's Slack user ID: U091NDYN0E6\n`);

// Check loss_intake_claims for Ana's completed/updated claims today
const [claims] = await db.execute(`
  SELECT 
    slackMessageTs,
    channelId,
    channelName,
    stage,
    assignedAgent,
    firstContactAt,
    firstContactMinutes,
    templatePostedAt,
    templatePostMinutesFromContact,
    templatePostMinutesFromReport,
    contactAttempts,
    memberName,
    vinLastSix,
    dateOfLoss,
    qualityScore,
    updatedAt
  FROM loss_intake_claims
  WHERE assignedAgent = 'U091NDYN0E6'
    AND updatedAt >= ?
    AND updatedAt <= ?
  ORDER BY updatedAt DESC
`, [new Date(todayStartMs), new Date(todayEndMs)]);

console.log(`=== Claims assigned to Ana updated today: ${claims.length} ===`);
for (const c of claims) {
  console.log(`\nThread: ${c.threadTs} | Channel: ${c.channelId}`);
  console.log(`  Member: ${c.memberName || 'unknown'} | VIN: ${c.vinLastSix || '—'} | DOL: ${c.dateOfLoss || '—'}`);
  console.log(`  Channel: ${c.channelName || c.channelId} | Stage: ${c.stage}`);
  console.log(`  First Contact: ${c.firstContactAt ? new Date(Number(c.firstContactAt)).toLocaleString('en-US', {timeZone:'America/New_York'}) : '—'} (${c.firstContactMinutes != null ? c.firstContactMinutes + ' min' : '—'})`);
  console.log(`  Template Posted: ${c.templatePostedAt ? new Date(Number(c.templatePostedAt)).toLocaleString('en-US', {timeZone:'America/New_York'}) : '—'} (from contact: ${c.templatePostMinutesFromContact != null ? c.templatePostMinutesFromContact + ' min' : '—'}, from report: ${c.templatePostMinutesFromReport != null ? c.templatePostMinutesFromReport + ' min' : '—'})`);
  console.log(`  Contact Attempts: ${c.contactAttempts ?? 0} | Quality: ${c.qualityScore ?? '—'}/100`);
}

// Also check ALL claims with firstContactAt today (Ana may have contacted on claims not yet assigned to her)
const [contactedToday] = await db.execute(`
  SELECT 
    slackMessageTs,
    channelId,
    channelName,
    stage,
    assignedAgent,
    firstContactAt,
    firstContactMinutes,
    templatePostedAt,
    memberName,
    vinLastSix,
    qualityScore
  FROM loss_intake_claims
  WHERE assignedAgent = 'U091NDYN0E6'
    AND firstContactAt >= ?
    AND firstContactAt <= ?
  ORDER BY firstContactAt DESC
`, [BigInt(todayStartMs), BigInt(todayEndMs)]);

console.log(`\n=== Claims where Ana made first contact today: ${contactedToday.length} ===`);
for (const c of contactedToday) {
  console.log(`  Thread: ${c.slackMessageTs} | Channel: ${c.channelName || c.channelId} | Member: ${c.memberName || 'unknown'}`);
  console.log(`  First Contact: ${new Date(Number(c.firstContactAt)).toLocaleString('en-US', {timeZone:'America/New_York'})} (${c.firstContactMinutes} min) | Stage: ${c.stage}`);
  console.log(`  Template: ${c.templatePostedAt ? '✓ posted' : '✗ not posted'} | Quality: ${c.qualityScore ?? '—'}/100`);
}

// Check completed claims today (templatePostedAt set today)
const [completedToday] = await db.execute(`
  SELECT 
    slackMessageTs,
    channelId,
    channelName,
    stage,
    assignedAgent,
    firstContactAt,
    firstContactMinutes,
    templatePostedAt,
    templatePostMinutesFromContact,
    templatePostMinutesFromReport,
    memberName,
    vinLastSix,
    dateOfLoss,
    qualityScore
  FROM loss_intake_claims
  WHERE assignedAgent = 'U091NDYN0E6'
    AND templatePostedAt >= ?
    AND templatePostedAt <= ?
  ORDER BY templatePostedAt DESC
`, [BigInt(todayStartMs), BigInt(todayEndMs)]);

console.log(`\n=== Claims Ana completed (template posted) today: ${completedToday.length} ===`);
for (const c of completedToday) {
  console.log(`\n  Thread: ${c.slackMessageTs} | Channel: ${c.channelName || c.channelId}`);
  console.log(`  Member: ${c.memberName || 'unknown'} | VIN: ${c.vinLastSix || '—'} | DOL: ${c.dateOfLoss || '—'}`);
  console.log(`  First Contact: ${c.firstContactAt ? new Date(Number(c.firstContactAt)).toLocaleString('en-US', {timeZone:'America/New_York'}) + ' (' + c.firstContactMinutes + ' min)' : '—'}`);
  console.log(`  Template Posted: ${new Date(Number(c.templatePostedAt)).toLocaleString('en-US', {timeZone:'America/New_York'})}`);
  console.log(`  Time from contact to template: ${c.templatePostMinutesFromContact != null ? c.templatePostMinutesFromContact + ' min' : '—'}`);
  console.log(`  Time from report to template: ${c.templatePostMinutesFromReport != null ? c.templatePostMinutesFromReport + ' min' : '—'}`);
  console.log(`  Quality Score: ${c.qualityScore ?? '—'}/100`);
}

// Summary stats
const [summary] = await db.execute(`
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN stage = 'complete' THEN 1 ELSE 0 END) as completed,
    SUM(CASE WHEN firstContactAt >= ? AND firstContactAt <= ? THEN 1 ELSE 0 END) as contactedToday,
    SUM(CASE WHEN templatePostedAt >= ? AND templatePostedAt <= ? THEN 1 ELSE 0 END) as templatedToday,
    AVG(firstContactMinutes) as avgFirstContact,
    AVG(qualityScore) as avgQuality
  FROM loss_intake_claims
  WHERE assignedAgent = 'U091NDYN0E6'
`, [BigInt(todayStartMs), BigInt(todayEndMs), BigInt(todayStartMs), BigInt(todayEndMs)]);

console.log(`\n=== Ana's Overall Summary ===`);
console.log(`Total assigned: ${summary[0].total}`);
console.log(`Completed (all time): ${summary[0].completed}`);
console.log(`First contacts made today: ${summary[0].contactedToday}`);
console.log(`Templates posted today: ${summary[0].templatedToday}`);
console.log(`Avg first contact time: ${summary[0].avgFirstContact != null ? Math.round(summary[0].avgFirstContact) + ' min' : '—'}`);
console.log(`Avg quality score: ${summary[0].avgQuality != null ? Math.round(summary[0].avgQuality) + '/100' : '—'}`);

await db.end();
