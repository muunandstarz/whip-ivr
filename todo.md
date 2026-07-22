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
- [x] Fix misleading 100% answer rate on dashboard when only answered calls exist in DB
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

## Dashboard KPI Fixes (May 14 2026 — Round 3)

- [x] Fix Total Calls: now shows inbound + outbound (not answered + missed + voicemail sum)
- [x] Fix Answered: answer rate now uses inbound-only denominator (outbound calls excluded from rate)
- [x] Fix Missed: supplement from inbound - answered_inbound when call_history has no missed rows (May live data)
- [x] Fix Voicemail: supplement from intake_records count when call_history has no voicemail rows (May live data)
- [x] Fix after-hours pill wording: "arrived after-hours" not "were after-hours"
- [x] Fix biz-hrs answer rate pill: clarify it's inbound-only rate
- [x] Fix Answered sub-label: "% inbound · % biz hrs" instead of "% overall · % biz hrs"
- [x] Voicemail tooltip: clarify includes extension voicemails

## P0 Bug: After-Hours Count Wrong (May 14 2026)

- [x] Fix after-hours SQL: only count inbound calls (direction='inbound'), not all calls
- [x] Fix businessHoursTotal/businessHoursAnswered: only count inbound calls
- [x] Fix afterHoursPct denominator: use inboundCalls not totalCalls
- [x] Fix after-hours pill text: show "of X inbound calls" not "of X calls"
- [x] Verify missed count logic: inbound - inbound_answered (not all answered)

## Intake Labels Feature (May 14 2026)

- [x] Add `labels` JSON column to intake_records schema (array of strings: 'after_hours', 'direct_voicemail', etc.)
- [x] Run DB migration to add labels column
- [x] Backfill existing records: after_hours where HOUR(createdAt) < 8 OR >= 18 or DAYOFWEEK IN (1,7)
- [x] Backfill existing records: direct_voicemail where routingMethod = 'extension'
- [x] Auto-set labels on new intake creation in createIntakeRecord (db.ts)
- [x] Auto-set labels on Aircall sync intake creation (aircall.ts / aircallSync.ts)
- [x] Show label badges in IntakeRecords list view
- [x] Show label badges in IntakeDetail view
- [ ] Add after_hours and direct_voicemail filter options to IntakeRecords filter panel

## Missed KPI Fix (May 15 2026)
- [ ] Fix Missed count: should be inbound - answered_inbound (all unanswered inbound, during AND outside biz hrs)
- [ ] Remove the old logic that only counts status='missed' rows (May has none, giving wrong 0)

## Handler Linking: Tim Chan & Geovanni Cabrera (May 15 2026)
- [x] Find Tim Chan and Geovanni Cabrera in Aircall users API
- [x] Add them to handlers table in DB if not present
- [x] Add them to HANDLER_ROUTING map in aircall.ts
- [x] Add their Aircall user IDs to the agent→handler mapping in aircallSync.ts
- [x] Verify their call stats appear in dashboard and handler queue

## P0 Bugs (May 15 2026 - Round 2)
- [x] Fix Missed KPI: answered_inbound is counting outbound-answered calls, giving wrong missed count
- [x] Fix QA generation: diagnose and fix why regenerate QA is failing

## Answer Rate Stats Feature (May 15 2026)
- [x] Query real April and May answer rates: overall and biz-hours-only
- [x] Compute month-over-month change for both metrics
- [x] Feature overall answer rate and biz-hours answer rate prominently on dashboard KPI section
- [x] Show MoM delta for both answer rate metrics

## P0 Bug: Biz-Hours Answer Rate Wrong (May 15 2026)
- [ ] Query exact biz-hours inbound answered vs total from DB to find SQL bug
- [ ] Fix biz-hours SQL query so rate reflects actual answered/total during Mon-Fri 8am-6pm
- [ ] Verify corrected rate matches: ~341 biz-hrs inbound, ~63 missed = ~82% rate

## Timezone Fix: Eastern Time 9am-6pm M-F (May 15 2026)
- [x] Fix getCallAnalyticsByMonth: all HOUR/DAYOFWEEK checks use CONVERT_TZ(startedAt, '+00:00', '-04:00') and HOUR >= 9, HOUR < 18
- [x] Fix after-hours count query to use EDT offset
- [x] Fix biz-hours answered/total queries to use EDT offset
- [x] Fix intake_records labels backfill: after_hours label should use EDT 9am-6pm M-F
- [x] Re-backfill intake_records labels with corrected timezone
- [x] Verify corrected numbers: 94 after-hours, 519 biz-hours inbound for May (EDT)

## Softphone Feature (Aircall Everywhere SDK) - May 16 2026
- [ ] Install aircall-everywhere npm package
- [ ] Create Softphone page component (client/src/pages/Softphone.tsx)
- [ ] Embed AircallWorkspace iframe in a collapsible side panel
- [ ] Handle onLogin/onLogout callbacks to show agent status
- [ ] Listen to incoming_call event: show caller number, lookup matching intake record
- [ ] Listen to outgoing_call event: show dialing state
- [ ] Listen to call_ended event: show duration, prompt to link to intake/claim
- [ ] Listen to comment_saved event: save comment to linked intake record
- [ ] Add dial_number send command: click-to-call from intake records and claim records
- [ ] Show active call context panel: caller info, linked intake, open claim if matched
- [ ] After call_ended: fetch recording URL via Aircall API and append to linked intake record
- [ ] Add Softphone nav item to DashboardLayout sidebar
- [ ] Register /softphone route in App.tsx
- [ ] Add call-claim link table to DB schema (call_claim_links: aircall_call_id, intake_id, claim_id)
- [ ] Add tRPC procedures: linkCallToIntake, getCallContext, saveCallNote

## Softphone — Aircall Everywhere SDK (May 15 2026)

- [x] Install aircall-everywhere SDK (pnpm add aircall-everywhere)
- [x] Embed real Aircall iframe in Softphone.tsx using AircallPhone class
- [x] Wire incoming_call event: auto-lookup caller by phone number against intake records
- [x] Wire call_answered / outgoing_answered events: start call timer
- [x] Wire call_ended event: show wrap-up disposition panel
- [x] Wire outgoing_call event: set ringing state
- [x] Add click-to-call from linked intake record (send dial_number command to SDK)
- [x] Show caller history panel when incoming call matches known phone number
- [x] Remove "Under Construction" banner from Softphone page
- [x] Add SDK connection status badge (Connected / Log in to Aircall phone)
- [x] Fix handlerStats field access to use handlerStats.stats.* (total, answered, avgDurationMin, answerRate)

## Intake Call Button → Softphone (May 15 2026)

- [ ] Wire call button in IntakeRecords list: navigate to /softphone?intakeId=X&phone=Y&name=Z
- [ ] Wire call button in IntakeDetail page: navigate to /softphone?intakeId=X&phone=Y&name=Z
- [ ] Wire call button in HandlerDashboard callback queue: navigate to /softphone with intake context
- [ ] Softphone: read URL params on mount, pre-load intake context panel, auto-dial the number via SDK

## Sprint: IVR/Softphone Usability & Portability (May 21, 2026)

- [x] Fix voicemail audio playback — investigate recording URL path, proxy/signed URL, and audio player in IVR dashboard
- [x] Convert softphone to persistent global floating widget that survives page navigation
- [x] Global softphone widget: dock to bottom-right corner, collapsible, shows active call status
- [x] Global softphone widget: maintain Aircall SDK instance in React context so it is never destroyed on navigate
- [x] Global softphone widget: show caller name, call timer, mute/hold/end controls in collapsed state
- [x] Global softphone widget: expand to full softphone UI on click
- [x] Global softphone widget: linked intake record panel accessible from floating widget
- [x] Improve outbound call audio quality: request mic with echoCancellation, noiseSuppression, autoGainControl
- [ ] Improve outbound call audio quality: add user-facing mic test / permission check before call
- [x] Export package: clean ZIP of full source (no node_modules/build artifacts)
- [x] Export package: comprehensive integration guide (schema, API, env vars, embed, webhook)
- [x] Export package: portability checklist for dev team merging into Claims Hub
- [x] Fix scroll-drift: Aircall container now re-snaps to page slot on scroll/resize (window + main scroll container + ResizeObserver)
- [x] Fix initAircall double-init guard: aircallRef.current check prevents re-initialization on navigation back to /softphone
- [x] Fix dispo panel covering Aircall iframe: disposition panel now renders as separate fixed overlay (z-10001) above the iframe, not inside the widget shell
- [x] Fix minimize hanging up call: Aircall iframe stays visible (widgetVisible=true) during active/ringing/incoming calls regardless of widgetExpanded state — callIsLive guard prevents iframe from being hidden while WebRTC session is live

## Custom Reports Tab (Jul 6 2026)
- [x] Add /reports route and nav item (admin-only)
- [x] Build report builder UI: metric selector, date range picker, group-by selector, caller type filter, handler filter
- [x] tRPC reports.run procedure: accepts report config, returns data rows + summary stats
- [x] Supported report types: Call Volume, Caller Type Breakdown, Handler Performance, Intake Status, Callback Outcomes, Member Billing/Deductible calls
- [x] Results display: table + bar/line chart depending on report type
- [x] Export to CSV button on results
- [x] Save report config as named preset (DB-backed)
- [x] Load saved report presets from dropdown

---

## Loss Intake Monitoring Integration (Jul 2026)

- [x] Add a native Loss Intake section to Whip IVR rather than shipping a separate dashboard.
- [x] Reuse Whip IVR authentication, roles, navigation, visual design, data access patterns, and deployment model.
- [ ] Poll Slack channel `CHWRXH4HK` (#claims) every 5 minutes for Gas and EV/Tesla FNOL workflow posts.
- [ ] Poll Slack channel `C092UPKR79D` (#claims-remotemarkets) every 5 minutes for remote-market FNOL posts.
- [ ] Persist each claim with Slack source, parent timestamp, permalink, post time, market, vehicle type, member name, customer ID, VIN/last six, and attachment metadata.
- [ ] Record whether photos are attached to each parent FNOL post.
- [ ] Detect the first qualifying outreach acknowledgment from Ana, Bennett, or Carlito.
- [ ] Calculate time-to-first-contact against the 10-minute SLA and preserve the exact event evidence.
- [ ] Detect `good to go` as the authoritative completion signal.
- [ ] Extract facts of loss, preliminary liability, and rideshare status from completion replies.
- [ ] Calculate total intake cycle time from FNOL post to completion.
- [ ] Detect no-answer attempt documentation, including first, second, third, and final no-contact handling.
- [ ] Require Tesla/EV footage-request evidence in quality scoring while excluding Gas claims from that criterion.
- [ ] Calculate a transparent quality score with criterion-level results and missing elements.
- [ ] Apply market assignments: Bennett for Glen Burnie and Atlanta, Carlito for Rockville and Chicago, and Ana for all remote markets.
- [ ] Implement idempotent Slack synchronization with pagination, backfill, failure logging, and sync-health visibility.
- [x] Keep Slack credentials and sensitive claim data server-side.
- [ ] Add a role-aware Loss Intake navigation group for Operations, Claims, My Performance or Team Performance, QA, Reports, and Settings as permitted.
- [x] Create a private workspace for Ana, Bennett, and Carlito showing only the signed-in rep's queue, claims, SLA results, cycle times, quality scores, trends, and recurring gaps.
- [x] Prevent intake reps from viewing other reps' claim-level data, private performance details, or QA feedback.
- [ ] Add live rep queue status with SLA countdowns and within-SLA, at-risk, and breached states.
- [x] Add an administrator-only Loss Intake dashboard with all open claims, team comparisons, SLA breaches, quality trends, reports, assignments, sync health, and settings.
- [x] Add an administrator View As control that previews a rep's complete experience without exposing admin navigation to reps.
- [x] Create searchable and filterable claim views and claim-detail timelines with Slack evidence links.
- [ ] Create per-agent scorecards for Ana, Bennett, and Carlito with average contact time, SLA compliance, average completion time, quality, volume, and trends.
- [ ] Create weekly and monthly administrator reports with agent breakdowns, breach counts, quality trends, and team metrics.
- [ ] Create an administrator daily-QA queue with AI-drafted findings, manual edits, manager comments, and an explicit Send to Rep action.
- [ ] Deliver sent QA items to the correct rep's private QA inbox with claim context, score breakdown, strengths, coaching opportunities, and evidence.
- [ ] Track QA draft, reviewed, sent, opened, acknowledged, and resolved timestamps.
- [ ] Allow reps to acknowledge each QA and optionally respond.
- [ ] Show administrators unread, unacknowledged, overdue, and resolved QA items by rep and date.
- [ ] Add settings for Slack channels, 10-minute SLA, at-risk threshold, tracked agents, assignments, quality weights, QA deadlines, and reporting behavior.
- [ ] Add tests for FNOL recognition, acknowledgment detection, `good to go`, SLA boundaries, assignments, quality scoring, role isolation, QA delivery, and idempotent ingestion.
- [ ] Validate extraction and scoring against representative real threads from both Slack channels.
- [ ] Verify responsive design, keyboard accessibility, contrast, dark/high-contrast modes, loading states, empty states, and error states.
- [ ] Review this checklist and mark every completed Loss Intake item before saving the release checkpoint.
- [x] Define six Loss Intake Drizzle tables for claims, Slack events, quality criteria, daily QA delivery, settings, and sync-run health.
- [x] Generate and populate the idempotent `drizzle/0002_add_loss_intake_monitoring.sql` migration.
- [x] Apply the Loss Intake migration and default settings seed to the Whip IVR managed database.
- [x] Implement deterministic FNOL recognition, labeled-field extraction, configured-rep milestone detection, SLA timing, authoritative completion, cycle time, and criterion-level quality scoring.
- [x] Add passing unit coverage for unrelated-post rejection, member/customer ID variants, configured-rep timing, SLA boundaries, authoritative completion, and conditional Tesla scoring.
- [x] Add idempotent Loss Intake claim/event/quality persistence, overview metrics, searchable claim queries, claim timelines, QA workflow helpers, settings, and sync-run health helpers.
- [x] Add a compiled role-scoped Loss Intake tRPC API that restricts representatives to their linked handler profile and reserves team views, QA management, settings, and sync health for administrators.
- [x] Implement direct Slack Web API polling for the two approved claims channels using a server-only bot token.
- [x] Verify whether the connected Slack authorization exposes a deployable bot credential; otherwise request `SLACK_BOT_TOKEN` securely through project secrets.
- [ ] Register an authenticated, idempotent five-minute scheduled callback and persist its task UID after deployment.
- [x] Use the user’s authenticated Slack administration session to locate or create an internal Loss Intake polling app.
- [x] Configure the minimum required bot scopes, install or update the app only with user confirmation at Slack’s authorization step, and invite it to the two approved claims channels.
- [ ] Transfer the resulting bot token directly into Whip IVR’s server-only `SLACK_BOT_TOKEN` secret without exposing it in chat or source control.
- [ ] Recover authenticated access to the current Manus workspace after the obsolete `/app` handoff returned 404.
- [ ] Locate the live Whip IVR deployment and store the installed Slack app credential as server-only `SLACK_BOT_TOKEN` in that project.
- [x] Add the least-privilege `channels:join` bot scope to Whip Loss Intake Monitor and reinstall the internal app with explicit workspace authorization.
- [x] Join bot `whip_loss_intake_moni` to public channels `CHWRXH4HK` (`#claims`) and `C092UPKR79D` (`#claims-remotemarkets`), then verify read-only history access.
- [x] Diagnose the local preview OAuth callback failure after successful Google sign-in and confirm that production authentication remains unchanged.
- [x] Complete authenticated desktop and mobile visual verification of the Loss Intake workspace once preview access is restored.
- [x] Add a tightly scoped local-development-only session route for visual testing because the browser takeover handoff returns 404; ensure it cannot run in production.
- [x] Remove the temporary development-only session route immediately after desktop and mobile visual verification, then re-run TypeScript and unit tests.
- [ ] Resolve Slack’s verified HTTP 451 regional/legal block for direct `slack.com/api` access from the current runtime before enabling the five-minute schedule.
- [ ] Decide between validating direct polling from a different deployment egress region or using a connector-backed five-minute relay into Whip IVR’s authenticated ingestion endpoint.
- [ ] Add a signed, replay-resistant Loss Intake relay ingestion endpoint that accepts only normalized batches for the two approved Slack channels.
- [ ] Build the connector-backed relay payload contract and deterministic transformation from Slack parent/thread data into existing parser and scoring inputs.
- [ ] Create a managed five-minute scheduled workflow using the authorized Slack connector and persist its task identifier for sync health controls.
- [ ] Keep direct Slack polling disabled by default while preserving it as a documented fallback for a compatible future egress region.
- [ ] Test invalid signatures, stale timestamps, wrong-channel rejection, duplicate delivery idempotency, successful ingestion, and sync-health reporting.
- [ ] Replace unsupported five-minute connector task polling with signed real-time Slack Events delivery for new parent and thread messages.
- [ ] Add connector-assisted reconciliation as an administrator-triggered or low-frequency backfill path rather than a minute-level scheduled task.
- [ ] Configure Slack Event Subscriptions for only the two approved claims channels after explicit user confirmation, using request-signature verification and retry-safe event IDs.

- [x] Implement `POST /api/slack/loss-intake-events` before the global JSON parser with endpoint-specific raw-body parsing.
- [x] Verify Slack `v0` HMAC-SHA256 signatures with a server-only signing secret, constant-time comparison, and a five-minute replay window.
- [x] Enforce workspace `TFFUXNU57`, app `A0BHDG7RX7D`, approved channels `CHWRXH4HK` and `C092UPKR79D`, human message authors, and supported message subtypes.
- [x] Carry Slack `event_id` into Loss Intake event keys so retries remain idempotent without relying on timestamp-only keys.
- [x] Rehydrate stored parent threads for real-time replies and reuse the approved FNOL, assignment, SLA, completion, and quality analysis pipeline without outbound Slack API calls.
- [x] Add passing Slack receiver tests for valid signatures, invalid signatures, stale timestamps, missing signing-secret fail-closed behavior, and signed URL verification.
- [x] Apply `drizzle/0002_add_loss_intake_monitoring.sql` to the native Whip IVR managed database.
- [x] Store `SLACK_SIGNING_SECRET` and the installed read-only `SLACK_BOT_TOKEN` in the native Whip IVR project secrets; never commit either credential.
- [ ] Save a native Whip IVR checkpoint and publish it before configuring Slack’s production Request URL.
- [ ] Verify the published unsigned receiver returns JSON `401` or `503` rather than the SPA fallback before enabling Slack Event Subscriptions.
- [x] Enable Slack Event Subscriptions at `https://whipclaimsivr.com/api/slack/loss-intake-events`, subscribe to `message.channels` and `message.groups`.
- [ ] Send signed canary events for one approved parent post and one reply, then confirm idempotent persistence, SLA/quality recomputation, and sync-health visibility.
- [x] Serialize processing per Slack thread so a reply arriving while its parent is still being persisted cannot be buffered and then accidentally discarded.

---

## QA Fix + Handler Performance Digest (Jul 14 2026)
- [x] Audit QA page and qa_scorecards/qa_scores tables to find root cause of broken QA
- [x] Fix QA scoring pipeline: retroactively score all weeks since launch (Apr 2026)
- [x] QA: ensure every week with calls has at least a sample scored
- [x] Build handler performance digest: daily + weekly per-handler stats card
- [x] Digest content: calls received today/week/month, callbacks completed, answer rate, avg handle time
- [x] Digest content: AI coaching paragraph comparing to team average and suggesting improvements
- [x] In-app: show digest on each handler's My Dashboard page
- [x] Admin: show all-handler digest summary on admin dashboard (via qa.allHandlerDigests)
- [x] Scheduled: /api/scheduled/dailyDigest endpoint ready — deploy then create cron via manus-heartbeat
- [x] QA: manual push button per scorecard (push to handler profile with ability to add notes before pushing)

## QA June Generation (Jul 14 2026 — Urgent)
- [ ] Generate real AI QA scores for all 5 June 2026 weeks (Jun 2, 9, 16, 23, 30)
- [ ] Persist scores to qa_scorecards table for all active handlers
- [ ] Fix WeeklyQA UI Generate button so it works going forward
- [ ] Verify scores appear on each handler's My Dashboard page

## QA Generation Fix + Friday Auto-Post (Jul 16 2026)
- [x] Rewrite generateWeeklyQAReport to use intake_records as primary source (agentName is NULL in call_history for historical data)
- [x] QA generation should work for any week that has intake records with a handlerName
- [x] Friday auto-post: scheduled job generates QA for the week and pushes scores to each handler's dashboard automatically
- [x] Scheduled endpoint: /api/scheduled/weeklyQAPost — runs every Friday at 4pm ET
- [x] Register Friday cron via manus-heartbeat after deploy (pending deploy)

## Fixes — Jul 16 2026 (Batch)

### Loss Intake
- [ ] Fix acknowledgment detection: agent assignments are set but firstContactAt still null — diagnose whether assignedAgent is being matched against Slack user IDs correctly in the domain parser
- [ ] Join bot to #claims-remotemarkets (C092UPKR79D) via Slack API conversations.join — add server-side tRPC mutation or admin action since UI join-channels option doesn't exist
- [ ] After joining remote markets channel, verify sync picks up claims from that channel

### IVR Handler Tracking
- [ ] Remove Madeline Green from active handler tracking (mark inactive in handlers table)
- [ ] Remove Catherine from active handler tracking (mark inactive in handlers table)
- [ ] Verify they no longer appear in routing, handler queue, call tracking, and analytics

### QA / Weekly Reports
- [ ] Fix QA authorship: remove impression that manager note was written by the owner — add "AI-generated coaching note" label or similar attribution, make clear it is system-generated
- [ ] Change daily handler digest to weekly (run once per week, not daily Mon-Fri)
- [ ] Consolidate QA emails: instead of one email per handler, send one weekly summary report to owner only
- [ ] Update daily-handler-digest cron to weekly schedule

### Handler Dashboard
- [ ] Add collapse/expand toggle to daily digest section on handler dashboard
- [ ] Fix inaccurate callback notes: "0 callbacks done" is likely a data/matching issue — diagnose why callbacks show 0 when team is actively making callbacks
- [ ] Fix callback count query: ensure callbackAt timestamp is being set correctly when handlers log callbacks

## Loss Intake Claims Table Enhancements — Jul 16 2026 (Batch 2)

- [x] Add `dateOfLoss` column to `loss_intake_claims` (extracted from Slack thread text)
- [x] Add `vinLast6` column to `loss_intake_claims` (extracted from Slack thread text)
- [x] Add `reportedAt` column to `loss_intake_claims` (= parent Slack message timestamp, i.e. when workflow was posted)
- [x] Add `templatePostedAt` column (timestamp of handler FOL/rideshare/prelim liability template post in thread)
- [x] Add `templatePostMinutesFromContact` column (minutes from firstContactAt to templatePostedAt)
- [x] Add `templatePostMinutesFromReport` column (minutes from reportedAt to templatePostedAt)
- [x] Add `contactAttempts` column (count of contact attempt messages in thread)
- [x] Update domain parser to extract dateOfLoss from thread text (regex: "date of loss", "DOL", "loss date")
- [x] Update domain parser to extract vinLast6 from thread text (regex: VIN patterns, last 6 chars)
- [x] Update domain parser: set reportedAt = parent message ts (already available as threadTs)
- [x] Update domain parser to detect handler template post (FOL/rideshare/prelim liability/facts of loss keywords)
- [x] Update domain parser to count contact attempts (messages containing "calling", "attempted", "no answer", "left voicemail", "tried")
- [x] Apply DB migration for new columns
- [x] Update Loss Intake claims table UI: show dateOfLoss, vinLast6, reportedAt columns
- [x] Update Loss Intake claims table UI: show templatePostedAt, templatePostMinutesFromContact, templatePostMinutesFromReport, contactAttempts
- [x] Fix "complete" status logic on overview: if templatePostedAt is set → stage = complete

## Quality Rubric Update — Jul 16 2026

- [x] Update quality rubric: FOL documented → 10 pts (was 20)
- [x] Add new criterion: FOL quality (AI-assessed) → 10 pts
- [x] Add new criterion: store team tagged (@atlteam, @chiteam, etc.) → 10 pts
- [x] Update domain parser to detect store team tag in thread messages
- [x] Add storeTeamTagged boolean to ThreadAnalysis and loss_intake_claims schema
- [x] Rescore all 104 existing claims with new rubric
- [x] Show rubric breakdown on overview and claims detail pages

## Tiered SLA Logic — Jul 17 2026

- [x] With-photos workflows: SLA is always 10 minutes (driver in office)
- [x] After-hours workflows (posted outside 9 AM–6 PM ET, no photos): SLA is 4 business hours from next business open
- [x] Standard in-hours, no photos: SLA remains 10 minutes
- [x] Add slaType (immediate | after_hours) and slaDeadlineAt columns to loss_intake_claims
- [x] Update slaState computation to use slaDeadlineAt instead of fixed 10-min window
- [x] Show SLA type and deadline in claims table and detail sheet

## Handler Dashboard Fixes — Jul 20 2026

- [x] Fix handler "My Performance" call metrics (calls, answer rate) showing 0 — diagnose query
- [x] Add Loss Intake snapshot section to handler dashboard (admin, Bennet, Ana, Carlito only)
- [x] Loss Intake snapshot: show assigned claims count, complete %, SLA breaches, avg first contact
- [x] Loss Intake snapshot: "View more" link navigates to Loss Intake page
- [x] Restrict Loss Intake nav item to admin + loss intake team members

## Today's Activity View (Jul 20 2026)

- [x] Add "Today" tab as default landing tab in Loss Intake Monitor
- [x] Add getTodayRepActivity() DB helper — queries all claims posted today, groups by assigned handler, includes per-claim events
- [x] Add todayActivity tRPC endpoint (protectedProcedure, refreshes every 5 min)
- [x] Build Today's Activity UI: summary KPI row (total threads, completed, in outreach), per-rep collapsible cards, per-claim rows with stage, SLA, timing, FOL snippet, and event timeline
- [x] Fix template detection: isHandlerTemplate() now also recognizes short format (Member/DOL/Fact of loss/Preliminary) used by some reps
- [x] Both #claims and #claims-remotemarkets channels included in today's view

## Callback Disposition — Add "Sent SMS" (Jul 21 2026)

- [x] Add "sent_sms" to the disposition enum in drizzle/schema.ts (callbackLogs table)
- [x] Run migration SQL to update the MySQL enum
- [x] Add "Sent SMS" to all disposition dropdowns: IntakeDetail.tsx, CallbackLog.tsx, FloatingSoftphone.tsx, Softphone.tsx
- [x] Add "Sent SMS" to DISPOSITION_CONFIG display maps in CallbackLog.tsx and Dashboard.tsx
- [x] Add "Sent SMS" to server/db.ts logCallback type and routers.ts zod enum

## Loss Intake Team Comparison + Handler Dashboard Metrics (Jul 21 2026)

### Team Assignments (from guide)
- Bennet: Glen Burnie FNOLs + Atlanta FNOLs (in-store, #claims)
- Carlito: Rockville FNOLs + Chicago FNOLs (in-store, #claims)
- Ana: All Remote Markets FNOLs (#claims-remotemarkets) + in-store overflow

### Loss Intake Comparison View
- [x] Add market/assignment metadata to loss_intake_claims (market column from thread content)
- [x] Build getRepComparisonMetrics() DB helper — per-rep: assigned threads, completed, in outreach, SLA breaches, avg first contact min, contact attempts, completion rate
- [x] Add lossIntake.repComparison tRPC endpoint with period filter (today/week/month/ytd)
- [x] Build "Team" tab in Loss Intake page showing all 3 reps side-by-side comparison table
- [x] Show assignment context: Bennet=GB+ATL, Carlito=RKV+CHI, Ana=Remote+overflow
- [x] All metrics sourced from actual DB events (not estimated)

### Handler Individual Dashboard Metrics Fix
- [x] Build getHandlerLossIntakeStats(handlerName, period) DB helper — queries loss_intake_claims + events
- [x] Add lossIntake.handlerStats tRPC endpoint (period: week | month | ytd)
- [x] Fix HandlerDashboard loss intake section: show real metrics with week/month/YTD toggle
- [x] Each rep only sees their own metrics (scoped by handlerName)
- [x] Metrics: threads assigned, completed, completion %, avg first contact, SLA breaches, contact attempts

## Team Comparison Fixes + Snapsheet + Call QA (Jul 21 2026)

### Metrics Fixes
- [x] Fix "completed" logic: count as complete if (a) template posted OR (b) rep posted 2+ contact attempt messages in thread
- [x] Fix SLA breach: measure from FNOL post time (reportedAt), not date of loss
- [x] Fix avg first contact: display to 1 decimal place (e.g. 4.3m not 4m)

### Awaiting Outreach Drill-Down
- [x] Make "Awaiting Outreach" count clickable on each rep card in Team Comparison
- [x] Drill-down shows list of claims: member name, market, VIN, FNOL posted time, Slack thread link
- [x] Multi-select checkboxes on drill-down list
- [x] Bulk reassign button: assign selected claims to any of the 3 reps
- [x] Reassign updates assignedAgent in loss_intake_claims and logs a reassignment event

### Snapsheet Integration (BLOCKED — API auth unresolved, deferred)
- [ ] Add snapsheetClaimId column to loss_intake_claims table
- [ ] Build server/snapsheet.ts: authenticate with SNAPSHEET_API_KEY + SNAPSHEET_API_SECRET
- [ ] Build searchSnapsheetByVin, verifySnapsheetClaim, getSnapsheetNotes helpers
- [ ] Show Snapsheet link status and notes panel on claim detail sheet

### Aircall Call-to-Claim Matching
- [x] Add lossIntakeClaimId and matchConfidence columns to call_history table
- [x] Create loss_intake_call_qas table (callHistoryId, claimId, scores, transcript, strengths, improvements)
- [x] Build matchCallToClaim() service: match by callerPhone/callerName within ±7 days of FNOL post
- [x] Build matchAllUnmatchedCalls() batch matcher
- [x] Add tRPC endpoints: claimCalls, claimCallQas, runCallMatching, scoreCall
- [x] Build transcribeAndScoreCall(): Whisper transcription + AI QA scoring (greeting, FOL, rideshare, liability, close, empathy)
- [x] Add Calls & AI QA section to ClaimDetailSheet in LossIntake.tsx
- [x] Show matched calls with direction, duration, match confidence
- [x] Show AI QA scores per dimension + strengths/coaching
- [x] "Match calls" button to run batch matching
- [x] "Transcribe & AI Score" button per call

### AI QA Scoring
- [x] AI scores call against rubric: greeting, FOL documented, rideshare asked, liability noted, professional close, empathy → 0-100 + per-criterion breakdown
- [x] Strengths and coaching points surfaced per call
- [ ] Snapsheet notes QA scoring (deferred — blocked on Snapsheet API auth)

## Aircall Agent Extension Sync (Jul 21 2026)

- [ ] Discover all agent personal Aircall numbers/extensions via Aircall API (/v1/numbers)
- [ ] Update aircallSync.ts to include all agent personal extensions in the sync scope (not just ring group 1125090)
- [ ] Backfill historical calls from agent extensions into call_history
- [ ] Verify agent extension calls appear in intake records

## Aircall Webhook + Extension Call Filter (Jul 21 2026)

- [ ] Build POST /api/webhooks/aircall endpoint to receive real-time Aircall call events
- [ ] Handle call.created, call.answered, call.ended, call.transferred, call.missed events
- [ ] Upsert call_history on each event so transfer legs (extension calls) are captured
- [ ] Add callSource column to call_history: 'ring_group' | 'extension' | 'outbound'
- [ ] Backfill: pull all calls without number_id filter, match claims agents by name, store missing extension calls
- [ ] Add filter to Intake Records page: "Voicemail Intakes" vs "Missed Extension Calls"
- [ ] Register webhook URL in Aircall dashboard: https://whipclaimsivr.com/api/webhooks/aircall

## New Features (Jul 22, 2026)

- [x] Extension Calls tab in Intake Records — dedicated tab for all extension calls with Answered/Pending Callback toggle
- [x] Handler sidebar reorder — non-admin view: My Dashboard → Intake Records → Loss Intake → Softphone
- [x] Mini dialer widget embedded in the sidebar (compact, collapsible)
