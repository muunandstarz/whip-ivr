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
- [ ] Disposition analytics visualization on Dashboard
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
- [x] Callback history: show previous callback attempts on the intake detail pagee

---
## Analytics Inflation Fix (Apr 29 2026)
- [x] Diagnose why Dashboard shows 700+ calls today — Aircall sync pulling ALL calls across all numbers/directions
- [x] Fix: filter Aircall sync to only store calls on the Whip Claims number (AIRCALL_NUMBER_ID env var or number name match)
- [x] Fix: analytics totals should exclude non-Claims-line calls from KPI counts
- [x] Clean up phantom/duplicate call records synced from non-Claims numbers today (deleted 1,655 records; 1,671 remain, all Whip Claims Line)
