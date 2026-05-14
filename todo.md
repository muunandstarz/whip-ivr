# Whip Claims IVR — Project TODO

Last updated: April 27, 2026

---

## Core Infrastructure

- [x] Aircall API sync (pull call history every 15 min)
- [x] Aircall webhook endpoint POST /api/aircall/webhook
- [x] Handle call.voicemail_left: transcribe with Whisper, extract with LLM, create intake record
- [x] Handle call.ended: update call_history record
- [x] Handle call.answered: mark call as answered in call_history
- [x] Handle call.missed: mark call as missed in call_history
- [x] Clerk Google SSO authentication
- [x] Role-based access control (admin vs handler)
- [x] Admin impersonation dropdown (view as any handler)

---

## Data & Analytics

- [x] 2,548 April 2026 calls synced from Aircall
- [x] 212 historical voicemails backfilled through AI pipeline
- [x] 1,595 calls AI-classified (caller type, summary, IVR eligibility)
- [x] ivrEligible and callSummary columns added to call_history
- [x] rawTranscript, callerOrg, whipClaimNumber, classifiedByAI columns added
- [x] Claims-team-only filter (12 active agents; 5 non-claims agents excluded)
- [x] Repeat caller logic fixed (same phone + different claim = NOT a repeat)
- [x] IVR eligibility breakdown: 363 calls (18.6%) confirmed IVR-eligible
- [x] Batch AI classification panel in Analytics (admin-only trigger)
- [x] Caller type breakdown in Analytics with IVR eligibility flags
- [x] IVR opportunity banner in Analytics

---

## Pages & Features

- [x] Dashboard — KPI cards with InfoTooltip, clickable to detail pages
- [x] Intake Records — handler-scoped view, search, filter, claim match badges
- [x] Intake Detail — full transcript, LLM extraction, Snapsheet link, status update
- [x] New Intake — manual intake form
- [x] Call Tracking — per-agent call log with caller type, IVR eligibility badge
- [x] Analytics — call volume chart, caller type breakdown, agent performance, batch classification
- [x] Weekly QA — per-agent scores, trend lines, AI coaching notes, scorecard push
- [x] Handler Profile — individual QA history, score trends, manager comments
- [x] My Dashboard (HandlerDashboard) — callback queue, call metrics, QA score, AI coaching tips
- [x] Softphone — dial pad, call controls, 20-code disposition system, dynamic call scripts, SMS tab
- [x] IVR Setup — Aircall configuration guide, webhook URL, voice prompt scripts

---

## Softphone Features

- [x] Dial pad with backspace and clear
- [x] Outbound call display — shows number dialed, direction, duration
- [x] Incoming call simulation with accept/reject
- [x] Active call controls (mute, hold, transfer, end)
- [x] 20 disposition codes in 4 groups (Claim Actions, Call Outcomes, Transfers, Other)
- [x] Required wrap-up flow after every call (disposition + note)
- [x] Dynamic call scripts per caller type (carrier, law office, medical, member, claimant, unknown)
- [x] SMS tab (Textline-ready, awaiting API key)
- [x] Recent calls list with disposition tags
- [x] Coaching tips panel in sidebar

---

## Handler Workspace

- [x] Handler nav order: Softphone → My Dashboard → Intake Records → New Intake
- [x] Handler-scoped Intake Records (only shows assigned records)
- [x] Personal call metrics (total, answered, missed, avg duration)
- [x] QA score with color-coded progress bar
- [x] AI coaching tips (adapts based on QA score range)
- [x] Hold reminders card
- [x] Soft transfer tips card
- [x] Callback queue with overdue badges

---

## Data Fixes

- [x] Mary Joy Badua name fix (MJ Badua → Mary Joy Badua across all tables)
- [x] Carlito Legarde Jr name fix (18 call_history rows)
- [x] All 20 agents added to handlers table
- [x] 5 non-claims agents marked inactive (Kim, Rionel, Jiever, Julius, Karl)
- [x] IVR copy updated: Option C → Option 1 / Press 1 across all pages
- [x] Jasmine Lane Acosta set to admin role (both user records)

---

## Pending — Needs External Credential

- [ ] SMS texting panel — live Textline integration (needs `TEXTLINE_API_KEY` from Textline → Settings → Developer API)
- [ ] Snapsheet claim lookup — live data (needs `SNAPSHEET_API_KEY`)
- [ ] Greg Bauder admin role — needs to sign in first, then: `UPDATE users SET role='admin' WHERE email='gbauder@drivewhip.com';`

---

## Pending — Needs Aircall Configuration (Not Code)

- [ ] Aircall webhook pointed at live domain (after Publish: set `https://[domain]/api/aircall/webhook` in Aircall → Integrations → Webhooks)
- [ ] Aircall IVR configured (Key 1 = Voicemail, Key 2 = Ring group — see /ivr-setup page)

---

## Future Build (Phase 2 — Team Manus)

- [ ] Conversational AI IVR engine — caller calls in, AI greets, identifies, routes (requires Aircall Smartflows or Twilio TwiML)
- [ ] Handler availability check via Aircall API (transfer to named handler if available)
- [ ] IVR session state management and call log
- [ ] Aircall webhook signature verification (security hardening)
- [ ] Full claim file integration (member info, vehicle, DOL, exposures)
- [ ] Email integration per claim (SSO-based, not full inbox)
- [ ] Task / diary system with calendar view and overdue alerts
- [ ] AI letter drafting (demand response, coverage denial, PIP acknowledgment)
- [ ] Claims mail routing automation (from #claims-mail Slack)
- [ ] Signed member agreement processing
- [ ] Subrogation section with urgent invoice navigation
- [ ] Fleet database integration
- [ ] Multi-market validation (Atlanta, Chicago, Rockville, etc.)
- [ ] Dark mode / high-contrast accessibility modes
- [ ] User activity monitoring and credential management
- [ ] Repair shop / customer service role views
- [ ] AI-assisted claim creation from unstructured text
- [ ] Automated tagging and tag-based automations
- [ ] Claims search by member name, claimant, VIN, customer number
- [x] Disposition analytics visualization on Dashboard
- [ ] Per-call summaries visible in Call Tracking detail view
- [ ] Remaining ~600 call classifications (use "Start AI Classification" in Analytics)

---

## In Progress

- [x] Add inbound/outbound call split to Dashboard KPI banner (1,285 inbound / 1,455 outbound)

---

## Routing & Enrichment (In Progress)

- [ ] Add reverse phone lookup to voicemail intake pipeline (carrier, line type, business name)
- [ ] Surface lookup results on intake record detail page (show carrier/business name if found)
- [x] Fix default handler routing: unknown/no-info records go to triage queue (MJ or Daryl), not Natashia
- [ ] Add "Unassigned / Triage" as a valid handler option in the routing table
- [ ] Auto-flag robocalls/spam (blank transcript, FEMA/IRS/scam patterns) — skip intake record creation

---

## Routing Rules (Defined by User — Apr 27 2026)

Business routing logic to implement in resolveHandler():

- Subro package / demand / payment (carrier calling) → Madeline
- Active repairs / claim status → First Party team: Lorraine, Jovel, Natashia, Annie (round-robin)
- Total loss → Demily or First Party team
- Injury claims (PIP, BI) → Jayla
- PD claims (3rd party property damage) → Carlito
- Unknown / no info / no handler mentioned → Triage queue (MJ or Daryl)

- [x] Implement keyword-based routing rules in resolveHandler() (subro→Madeline, PIP/BI→Jayla, PD→Carlito, total loss→Demily, repairs/status→first party round-robin)
- [x] Cross-reference caller phone number against call_history to pre-populate name/org on new intake records
- [x] Auto-detect and skip/flag robocall/spam transcripts (FEMA, IRS, press-1 patterns)
- [x] Add Madeline to HANDLER_ROUTING table (Madeline Green, id 30004)
- [x] Add Demily to HANDLER_ROUTING table (Demily Flores, id 30005)

---

## Backfill Data Quality Fix (Critical)

- [ ] Diagnose why 76 intake records have no transcript and 110 have no caller name
- [ ] Re-process all intake records with voicemail URLs but empty transcripts (transcribe + extract)
- [ ] Re-apply new routing rules to all existing records (fix Natashia default assignments)
- [ ] Delete or flag intake records that have no voicemail URL and no transcript (truly empty)

---

## Claim Number & Snapsheet Fixes

- [x] Fix claim number extraction: add regex normalizer for Whip format (MD/GA/TX/FL + digits run-on from Whisper)
- [ ] Set SNAPSHEET_API_URL = https://snapsheetvice.com/ and test claim lookup
- [ ] Re-run claim matching on all existing intake records once Snapsheet is connected

---

## Backfill Reprocess (Priority Fix)

- [x] Attempted re-transcription: 76 empty records had ~209-byte placeholder audio (callers hung up) — marked as 'No message left' and closed
- [x] Re-extracted 31 records with transcripts but missing caller info; 22 junk/placeholder records auto-closed
- [x] Re-routed 104 records using new routing rules — load now spread across team (Jovel 20, Lorraine 20, Annie 19, Natashia 19, Madeline 16, Jayla 15, Carlito 6, MJ 6, Daryl 4, Demily 2)
- [ ] Verify UI: closed/no-message records should not appear in open intake queue
- [ ] Run quality check on remaining open records with null callerName to see if any can be further enriched

---

## Intake Records UI Fix (Urgent)

- [x] Fix Intake Records page to default to showing only 'Open' status records (not all 226)
- [ ] Re-check voicemail audio for +13054284161, +12166172557, +12023086303, +14704822636
- [ ] If audio exists, re-transcribe, extract, and re-route those 4 specific records

---

## Routing Rule Corrections (Apr 27 2026)

- [x] Fix routing: law_office type → Jayla by default, Carlito only if PD explicitly mentioned, never Madeline
- [x] Fix routing: medical_provider → Jayla always (not Madeline)
- [x] Tighten SUBRO_REGEX: removed standalone 'payment' trigger (too broad — medical billing false positives)
- [x] Full sweep: 96 closed records re-transcribed, 89 re-opened with real data and correct routing
- [x] Final handler distribution: Jayla 30, Lorraine 28, Jovel 28, Natashia 27, Annie 25, Madeline 19, MJ 19, Daryl 16, Carlito 13, Demily 4

---

## Claim Number Extraction Improvements (Apr 28 2026)

- [x] Update LLM prompt: recognize old-format Whip claim numbers (6-8 digits, VIN-based, e.g. "501732", "AU0000203231")
- [x] Update LLM prompt: key phrases to trigger Whip claim extraction: "your reference number", "Whip ref", "your ref", "reference number is", "claim number is"
- [x] Update LLM prompt: distinguish caller's own reference number (theirReferenceNumber) vs Whip reference number (whipClaimNumber)
- [ ] Re-run extraction on existing records that may have old-format claim numbers missed

---

## UI & Routing Fixes (Apr 28 2026 — Batch 2)

- [x] Handler Queue: add Expand All / Collapse All buttons to page header
- [x] Handler Queue: fix HANDLER_COLORS map — add "Mary Joy Badua" key (was "MJ Badua")
- [x] Handler metrics (HandlerDashboard): connect call performance metrics to handler profile via Aircall name lookup, not exact string match
- [x] Softphone page: add "Under Construction" banner — feature not yet live
- [x] Law office routing: fix to always go to Jayla UNLESS caller explicitly requests another handler by name OR transcript explicitly mentions PD/property damage
- [x] Intake reassign dropdown: fix handler list to show full names (first + last) so they match handlerName in DB
- [x] QA push handler dropdown: fix handler name matching — "MJ" / "Mary Joy" aliases must resolve to "Mary Joy Badua"
- [x] User management page: admin-only page to view all users, assign roles (admin/handler), invite/add new users
- [x] Promote Greg Bauder to admin: have Greg log in once, then go to User Management → find Greg Bauder → change role to Admin

---

## Login-to-Profile Linking & Metrics Fix (Apr 28 2026 — Batch 3)
- [x] Fix call performance metrics: empty for all handlers — diagnose Aircall agentName vs handler name mismatch (exact match works; fixed 7 'undefined undefined' records → NULL)
- [x] Fix getHandlerCallMetrics to use flexible name matching (first name, last name, partial match) not exact string
- [x] Add handlerProfileId column to users table — links a logged-in user to their handler profile
- [x] Auto-link on login: when user signs in, match their name/email to handlers table and set handlerProfileId
- [x] Admin UI in User Management: dropdown to manually link a user to a handler profile (for new hires like Daniel Giono)
- [x] Add Daniel Giono to handlers table as subro handlerr

---

## Pre-Auth, Sort, and Name Matching (Apr 28 2026 — Batch 4)
- [x] Pre-authorize users by email+role: admin can add email+role before user logs in; on first login the pre-auth is applied automatically (Bobby CEO + Greg Ops Director need admin on first login)
- [x] User Management: show pending pre-authorizations list with ability to remove them
- [x] Intake Records: add sortable handler column (click to sort A-Z / Z-A by handlerName)
- [x] Fix Jayla/Jayla Bernard name matching: normalize handler name lookup to match on first name or full name across intake records, handler queue, and metrics (resolveHandlerName helper added; wired into intake create)s

---

## Callback from Intake Record (Demo Priority — Apr 29 2026)
- [x] Add "Callback" button to open intake records (both list view and detail view)
- [x] Clicking Callback opens a callback panel/modal pre-populated with: caller name, phone, claim number, caller type, original message summary
- [x] Callback panel shows call script tailored to caller type (carrier, law office, etc.)
- [x] Handler can log the callback result: disposition (reached/no answer/left voicemail/wrong number), notes, and outcome
- [x] On save: mark intake record as closed (or escalated), set callbackAt timestamp, set callbackHandlerName, add notes
- [x] Show "Returned" badge on intake record after callback is logged
- [ ] Demo mode: simulate call in progress (since Aircall phone SDK not yet confirmed) — show active call UI with intake context visible
- [x] Admin-only guard added to /intake/new route (redirect non-admins to /intake)
- [x] Callback history: show previous callback attempts on the intake detail pagee

---
## Analytics Inflation Fix (Apr 29 2026)
- [x] Diagnose why Dashboard shows 700+ calls today — Aircall sync pulling ALL calls across all numbers/directions
- [x] Fix: filter Aircall sync to only store calls on the Whip Claims number (AIRCALL_NUMBER_ID env var or number name match)
- [x] Fix: analytics totals should exclude non-Claims-line calls from KPI counts
- [x] Clean up phantom/duplicate call records synced from non-Claims numbers today (deleted 1,655 records; 1,671 remain, all Whip Claims Line)

---
## UX, Access Control & Script Editor (Apr 29 2026)
- [x] Restrict User Management nav item to admin-only (hide from non-admin users in sidebar) — already implemented via ADMIN_NAV_ITEMS; added frontend route guard
- [x] Restrict User Management route to admin-only (redirect non-admins away from /user-management) — admin guard added to UserManagement.tsx
- [x] Add Softphone Script Editor to Settings page (admin-only): DB-backed editable scripts per caller type, replaces hardcoded CALL_SCRIPTS in IntakeDetail.tsx
- [x] UX: Add loading skeletons to Intake Records, Call Tracking, Analytics, and Handler Queue tables instead of blank flash
- [x] UX: Priority quick-filter chips on Intake Records (All / Urgent / High / Normal)
- [x] UX: Priority badge inline in caller name cell (URGENT / HIGH pill badges)
- [x] UX: Priority Breakdown card added to Dashboard sidebar
- [x] UX: Sticky table headers on Intake Records and Call Tracking so column headers stay visible while scrolling
- [ ] UX: Add "Back to top" button on long list pages
- [ ] UX: Improve mobile responsiveness of the sidebar navigation (collapse to icon-only on small screens)
- [ ] UX: Add keyboard shortcut hints to primary actions (e.g. N = new intake, C = callback)
- [ ] UX: Show callback due date countdown badge on open intake records (e.g. "Due in 2h", "Overdue")
- [ ] UX: Add bulk-select and bulk-assign handler on Intake Records list
- [ ] UX: Highlight overdue callbacks in red on the Intake Records list

---
## Dashboard Fixes (Apr 29 2026)
- [x] Make "New intakes today" card clickable — link to Intake Records filtered to today's date
- [x] Fix incorrect "15 Total resolved" count — investigate what records are being counted as resolved and correct the logic

---
## Handler Workspace & Dashboard Fixes (Apr 29 2026 — Batch 5)
- [x] Handler workspace: show inbound vs outbound call split on the Total Calls card (e.g. "72 inbound · 27 outbound")
- [x] Dashboard: wire dateFrom/dateTo query params in IntakeRecords so "New intakes today" card link actually filters the list

---
## Manual Intake Cleanup & Handler Workspace (Apr 29 2026 — Batch 6)
- [x] Remove "Log Manual Intake" button from Dashboard header
- [x] Hide "New Intake" nav link from non-admin users (keep /intake/new route accessible for admins only)
- [x] Add inbound vs outbound split to handler workspace Total Calls card
- [x] Wire dateFrom/dateTo query params in IntakeRecords so "New intakes today" dashboard link actually filters the list

---
## Next Record Navigation Fix (Apr 29 2026)
- [x] Fix "Next record" navigation in IntakeDetail: for non-admin handlers, only navigate through their own assigned records (not all records globally)

---
## Callback SLA System (Apr 29 2026 — Demo Prep)
- [ ] Add addBusinessHours(date, hours) utility — skips weekends, respects 8am–6pm business hours
- [ ] Update voicemail intake pipeline: set callbackDueBy = addBusinessHours(createdAt, 4) on new records
- [ ] Backfill callbackDueBy on existing open voicemail records that have null callbackDueBy
- [ ] Countdown badge on Intake Records rows: "Due in 2h", "Overdue 3h ago" (replaces flat "Due EOB")
- [ ] Overdue row highlight: red tinted row background when callback is overdue and not yet completed
- [ ] Add "Unassigned / Triage" as a valid handler option in the reassign dropdown
- [ ] SLA compliance metric on Handler Dashboard: "X of Y callbacks within SLA" with % bar
- [ ] SLA compliance card on Admin Dashboard: team-wide callback compliance rate
- [ ] getCallbackSLAMetrics(handlerName?) DB helper — returns total, onTime, overdue, pending counts
- [x] Remove Elizabeth Avilla from handler dropdown list and routing table
- [x] Fix Dashboard KPI cards: remove gray background, use clean white card with colored accent border/icon instead
- [x] Add dark mode (lean navy theme) accessible to all users via toggle in nav
- [x] Add high contrast mode accessible to all users via toggle in nav
- [x] Persist theme preference (dark/light/high-contrast) in localStorage
- [x] Fix dark mode font contrast: card labels, section headers, and muted text washing out on navy background — replaced all hardcoded text-[#171b31] with text-foreground, all light-only bg-*-50/100 with /15 opacity variants across all pages

---
## Team Access Pre-Authorization (Apr 29 2026)
- [x] Pre-authorize all 15 team members so they can sign in immediately

---
## Auth Migration: Clerk → Manus OAuth (Apr 29 2026)
- [x] Remove Clerk from frontend (ClerkProvider, SignIn, useUser, useClerk)
- [x] Wire Manus OAuth sign-in button in WhipLayout (already in server/_core/oauth.ts)
- [x] Update useAuth hook to use Manus OAuth session (trpc.auth.me.useQuery)
- [x] Update clerkAuth.ts server middleware to use Manus JWT session instead
- [x] Add active-handler deactivation check on sign-in (block inactive handlers)
- [x] Test sign-in flow end to end on dev and published site

---
## First-Sign-In Onboarding Modal (Apr 29 2026)
- [x] Add onboardingSeenAt column to users table (nullable timestamp)
- [x] Add auth.markOnboardingSeen tRPC mutation (sets onboardingSeenAt = now())
- [x] Build OnboardingModal component: 6-slide tour (Welcome, Dashboard, Intake Records, 4-hour SLA, How to close a record, Softphone)
- [x] Wire modal into WhipLayout: shows when user.onboardingSeenAt is null, dismissed permanently on "Get started" or "Skip tour"

---
## Completed Callback Tracking (May 5 2026)
- [x] Add getCallbackCompletionStats(handlerName?, period?) db helper — returns completed, reached, no_answer, left_voicemail, today, this_week, this_month per handler
- [x] Add handlerMetrics.callbackStats tRPC procedure
- [x] Add "Callbacks Completed" KPI card to HandlerDashboard (today / this week / this month)
- [x] Add per-handler completed callback table to HandlerQueue page (open vs completed side-by-side)
- [x] Add completed callback leaderboard to admin Dashboard page

---
## Bug Fixes & Callback Log (May 5 2026)
- [x] Fix missing React key prop warning in Dashboard leaderboard inner div
- [x] Add getCallbackLogAll() db helper — returns all callback_logs joined with intake_records, filterable by handler/date/disposition
- [x] Add callbacks.all tRPC procedure
- [x] Add Callback Log standalone page (/callback-log) — table of all logged callbacks with handler, caller, disposition, date, link to record; added to admin nav and Quick Actions

---
## Team Feedback — May 6 2026
- [ ] Add audio playback player to intake detail page (voicemail recording URL from Aircall)
- [ ] Fix inbound/outbound call direction: sync direction field from Aircall API correctly so call log mirrors Aircall
- [ ] Route extension-specific voicemails to the handler whose extension received the call (use Aircall user/line data)
- [ ] Routing rule: Madeline (subro) should NOT receive calls from attorneys/law offices — route those to general queue or correct handler
- [ ] Routing rule: calls with no claim number or vehicle info should default to MJ and Daryl (processors), unless explicitly addressed to a specific person

---
## Routing & Sync Fixes — May 6 2026
- [x] Add Tim Chan to HANDLER_ROUTING table (outbound subro team with Madeline and Daniel)
- [x] Fix law_office routing: Madeline NEVER gets law office calls — law offices always go to Jayla (PD→Carlito exception stays)
- [x] Fix subro routing: split into 1P outbound subro (Madeline/Daniel/Tim Chan round-robin) vs 3P inbound subro (Carlito/Catherine round-robin); require 1P vehicle keywords to route to outbound subro team
- [x] Fix call volume metrics: expand Aircall sync to all claims-team numbers (not just Claims Line 1125090) — filter by fetching Aircall numbers list and matching to known handler Aircall user IDs; keep helpdesk/billing/HR numbers excluded
- [x] Add extension-based voicemail routing: fetch Aircall /users at startup to build aircallUserId→handler map; when voicemail call.user matches a known handler, assign directly to that handler
- [x] Update routing.test.ts to cover new rules (Tim Chan, Madeline law-office block, 1P vs 3P subro split)

---
## Handler Dashboard & Routing Fixes — May 6 2026 (round 2)
- [x] Fix missing key prop in Dashboard.tsx (CardContent Quick Actions — converted to keyed array map)
- [x] Fix missing key prop in CallbackLog.tsx (rows.map — added outer keyed div wrapper)
- [x] Fix Callbacks Completed section not showing on handler dashboard (HandlerDashboard.tsx — removed conditional guard)
- [x] Add open/closed intake count per handler to Handler Queue admin view (handlerMetrics.intakeSummary procedure)
- [x] Add routingMethod column to intake_records schema (values: "extension" | "ivr" | "manual")
- [x] Populate routingMethod in processVoicemail (extension if aircallAgentId matched, else ivr)
- [ ] Show "Direct Extension" vs "IVR Routed" badge on intake record detail and list
- [x] Sync unread assigned voicemails from Aircall per handler: query /v1/calls/search?user_id={id}, match call.user to handler map, create intake records tagged routingMethod="extension" if not already in DB

---
## Callback Speed KPI & Log Enhancements — May 6 2026

- [ ] Fix CallbackLog key prop error (persistent — second map or conditional rendering issue)
- [ ] Enhance Callback Log columns: Caller (name + org), Handler who called back, Voicemail received date, Callback date/time, Time-to-callback (e.g. "2h 14m"), Disposition, Outcome
- [ ] Add getCallbackSpeedMetrics() db helper — returns avg time-to-callback (mins), % within 4h SLA, fastest/slowest, by handler breakdown
- [ ] Add handlerMetrics.callbackSpeed tRPC procedure
- [ ] Add Callback Speed KPI section to Analytics page: avg response time, % within SLA, per-handler leaderboard sorted by speed
- [ ] Add Callback Speed card to handler personal dashboard: their avg time-to-callback, % within 4h SLA, comparison to team average

---
## Audio & Doc Fixes — May 7 2026
- [x] Fix voicemail audio player in IntakeDetail — added /api/aircall-recording proxy route; audio now streams through server with Basic auth
- [ ] Fix Dashboard key prop error — full audit of all unkeyed children in Dashboard.tsx (in progress)
- [x] Refresh helpdesk spec doc with routing rule updates (Tim Chan, subro split, extension routing, multi-number sync, audio proxy)

---
## Error Reporting System (May 8 2026)
- [ ] Add error_reports table to DB schema
- [ ] Add tRPC procedures: errors.report (public) and errors.list / errors.resolve (admin-only)
- [ ] Build global error collector (window.onerror + unhandledrejection + ErrorBoundary)
- [ ] Build floating error bubble UI (admin-only) with count badge and error drawer
- [ ] Error drawer: message, stack, route, user, time; mark-as-resolved button
- [ ] Fix Dashboard.tsx React key prop warning

---

## Error Reporting System (May 8 2026)

- [x] error_reports DB table + tRPC endpoints (report/list/resolve/unresolvedCount)
- [x] Global window.onerror + unhandledrejection collector (useErrorReporter hook)
- [x] ErrorBoundary updated to call reportCaughtError on componentDidCatch
- [x] Floating ErrorBubble component (admin-only, count badge, slide-out drawer with stack traces)
- [x] Wired into App.tsx (AppInner wrapper for proper hook context)
- [x] Audio player fix: recording proxy now uses callId → Aircall API → fresh S3 URL (no auth header forwarding)

---
## Dashboard Fixes & Enhancements (May 13 2026)
- [ ] Fix NaN totalCalls / NaN key error — monthCallData?.totals reduce returning NaN when data is null
- [ ] Fix 7-day sparkline showing blank
- [ ] Add month-over-month comparison (vs previous month delta + arrow)
- [ ] Add after-hours / weekend call breakdown with clear labeling
- [ ] Add trend blurbs (call volume trending up/down, carrier/atty call trends)
- [ ] Add business hours vs all-hours answer rate distinction
- [ ] Extend getCallAnalyticsByMonth in db.ts to include afterHours, weekend, prevMonth comparison data

---

## Dashboard Fixes & Enhancements (May 13 2026)

- [x] Fix NaN totalCalls — Drizzle execute() returns [[rows],[fields]], fixed with [0] indexing + CAST(COUNT(*) AS SIGNED)
- [x] Fix NaN key error from null callerType in callerTypeBreakdown
- [x] Add month-over-month comparison (vs previous month delta + arrow)
- [x] Add after-hours / weekend call breakdown with clear labeling
- [x] Add trend blurbs (call volume trending up/down, carrier/atty call trends)
- [x] Add business hours vs all-hours answer rate distinction
- [x] Extend getCallAnalyticsByMonth in db.ts to include afterHours, weekend, prevMonth comparison data
- [x] Historical month browsing with left/right navigation arrows

## Dashboard Round 2 Fixes (May 14 2026)

- [ ] Fix remaining NaN key error (still firing — find remaining source)
- [ ] Fix blank 7-day intake trend chart
- [ ] Restructure answer rate: show overall answer rate AND business-hours answer rate as separate clear cards
- [ ] Fix confusing "549 missed" display — make clear these are all-hours missed calls

---

## Dashboard Round 2 Fixes (May 14 2026)

- [x] Fix NaN key error from null handlerName in Handler Workload section (key={h.handlerName ?? `handler-${hi}`})
- [x] Fix NaN key error from null callerType in Caller Type Breakdown (key={item.callerType ?? `caller-${cti}`})
- [x] Fix 7-day intake trend chart blank — get7DayIntakeTrend had same Drizzle [[rows],[fields]] bug, fixed with [0] indexing
- [x] Fix all remaining db.execute calls with Drizzle [[rows],[fields]] bug (callback compliance, completion stats, callback logs, speed metrics, overdue callbacks)
- [x] Clarify after-hours pill wording: "549 of 1,341 calls were after-hours (41%)" instead of "549 after-hours calls (41%)"
- [x] After-hours calls are NOT missed calls — they are calls that arrived outside business hours but were still answered/voicemail

## Voicemail Audio Fix (May 14 2026)

- [ ] Diagnose why voicemail audio is not playing on intake detail records
- [ ] Fix audio player — check voicemail URL format, proxy/CORS issues, and audio element rendering

## Sprint: Dashboard Cleanup + Auto-Classification + QA Scheduling (May 14)

- [ ] Dashboard: remove Overdue Callbacks section
- [ ] Dashboard: remove Recent Intakes section
- [ ] Auto-classify: trigger classification automatically on intake creation and on webhook receipt (not manual)
- [ ] Weekly QA: add "Regenerate QA" button on Weekly QA page
- [ ] Weekly QA: add per-handler stats block (calls by category, overdues, answer rate, callback rate)
- [ ] Weekly QA: schedule weekly QA email/notification dispatch (every Monday morning)
- [ ] Navigation: move IVR Setup into Settings page as a tab, remove from sidebar
- [ ] Navigation: remove Analytics page from sidebar (redundant with dashboard)

## Sprint: Emailed Disposition + Call Tracking MoM (May 14)
- [ ] Add 'emailed' to callback_logs disposition enum in schema + DB migration
- [ ] Add Emailed option to disposition select in IntakeDetail.tsx callback dialog
- [ ] Add Emailed option to disposition filter in CallbackLog.tsx
- [ ] Add Emailed to DISPOSITION_CONFIG in CallbackLog.tsx with Mail icon
- [ ] Fix misleading 100% answer rate on dashboard when only answered calls exist in DB
- [ ] Add month navigation + MoM change delta to Call Tracking page
- [ ] Update Call Tracking server procedure to accept month/year params and return prev month comparison

## Sprint: QA System Overhaul (May 14)
- [ ] Fix generateReport to DELETE existing qa_scores for the selected week before inserting new ones
- [ ] Fix generateReport to use actual call/intake data for the selected week (not hardcoded April data)
- [ ] Add bulk push button to push all handler QA scores at once to their profiles
- [ ] Include per-handler stats (calls by category, overdues, answer rate, callback rate) in weekly auto-send notification
- [ ] Fix weekly cron to regenerate QA and send full report with handler stats each Monday 8am
- [ ] Fix week selector to correctly scope QA data to the selected week

## QA + Emailed Disposition Fixes (May 14 2026 — Round 2)

- [x] WeeklyQA: replace agentSummary with scorecardsByWeek (real DB data per selected week)
- [x] WeeklyQA: add week selector dropdown (populated from qaWeeks — weeks that have actual data)
- [x] WeeklyQA: auto-default to most recent week with data when current week has no scorecards
- [x] WeeklyQA: remove all hardcoded April fallback data
- [x] WeeklyQA: generateReport now deletes existing scorecards for the week before regenerating
- [x] WeeklyQA: add "Bulk Push All" button — pushes all scorecards for the week to handler profiles at once
- [x] WeeklyQA: per-handler stats table (calls by caller type, answer rate, avg duration, overdues, callback rate)
- [x] WeeklyQA: team KPI summary cards use real data (avg score, answer rate, avg handle time, agents scored)
- [x] WeeklyQA: Push button on each row opens PushScorecardPanel pre-filled with that handler's scorecard
- [x] Add 'emailed' to callback_logs disposition enum in DB (ALTER TABLE migration applied)
- [x] Add 'emailed' to logCallback type in db.ts
- [x] Add 'emailed' to callbacks.log zod enum in routers.ts
- [x] Add 'emailed' disposition to IntakeDetail.tsx callback dialog
- [x] Add 'emailed' to DISPOSITION_CONFIG and filter in CallbackLog.tsx
- [ ] Add bulkPushWeek tRPC procedure (bulk push all scorecards for a week to handler profiles)
- [ ] Fix weekly cron to regenerate QA and send full report with handler stats each Monday 8am
