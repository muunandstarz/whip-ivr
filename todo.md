# Whip Claims AI Voice IVR — TODO

- [x] Database schema: intake_records, call_sessions tables
- [x] Drizzle migration and SQL applied
- [x] Twilio webhook endpoint for inbound calls (/api/ivr/voice)
- [x] Twilio webhook endpoint for call status updates (/api/ivr/status)
- [x] LLM-powered conversation engine with caller type detection and branching
- [x] Structured intake collection for carriers/law offices/medical providers
- [x] Read-back confirmation step in AI conversation
- [x] Wrong-department auto-routing with correct phone number provided
- [x] Member/claimant/police routing to live agent queue
- [x] Voicemail transcription and storage (/api/ivr/voicemail)
- [x] Owner notification on new intake record
- [x] Claims team dashboard with WhipLayout sidebar
- [x] Intake records table with search, filter by status/caller type
- [x] Status update (open/closed) and handler assignment from dashboard
- [x] Record detail view with full conversation transcript
- [x] Manual intake form for logging calls manually
- [x] Analytics view: call volume by day, caller type breakdown, repeat callers
- [x] IVR setup guide page with Aircall Option C configuration
- [x] Branding: Whip colors (#171b31 blue, #ff6221 orange)
- [x] Vitest tests for core procedures (18 tests passing)
- [x] Checkpoint saved

## Option C — Aircall Webhook + AI Voicemail Processing (Active Build)
- [x] Add call_history table for full Aircall call sync
- [x] Add qa_scores table for weekly AI QA per call/agent
- [x] Add handlers table with real team members
- [x] Run all new migrations
- [x] Rewrite IVR backend to use Aircall webhooks (call.created, call.ended, call.voicemail_left)
- [x] AI voicemail transcription pipeline (Whisper via built-in helper)
- [x] LLM structured intake extraction from voicemail transcript
- [x] Repeat caller detection logic (flag callers with prior contacts about same claim)
- [x] Handler auto-assignment logic (by claim# lookup and caller type routing rules)
- [x] Email notification to assigned handler on new intake record
- [x] Aircall API daily sync for full call history (answered, missed, duration, agent)
- [x] Weekly AI QA scoring job (score answered calls on 5 dimensions — April 22 data loaded, live scoring via qa_scores table ready for future automation)
- [x] Seed database with real April voicemail data (14 voicemails processed through AI intake)
- [x] Seed call_history from April Aircall pull (1,866 calls)
- [x] Flag repeat callers in seeded data
- [x] Admin dashboard with summary stats, open records, repeat callers, missed calls
- [x] Handler queue view — each handler sees only their assigned open records
- [x] Admin call tracking — every answered call (by who, duration) and every missed call
- [x] Analytics page — call volume chart, caller type breakdown, answer rate trend
- [x] Weekly QA page — agent scores, trend lines, AI improvement notes per call
- [x] Update IVR Setup page to reflect Aircall Option C configuration
- [x] Vitest tests updated for new webhook and intake pipeline (18 tests passing)
- [x] Fix intake_records query failures — column mismatch between schema and actual DB table
- [x] Pull Whip logo from drivewhip.com and replace text logo in nav
- [x] Seed database with real April voicemail data so dashboard shows actual records

## Claim Number Matching & Snapsheet Integration
- [x] Fuzzy claim number matching: extract last-6 of VIN and middle-6 of claim number as searchable fragments
- [x] Match partial claim numbers (5+ digits) against both VIN fragment and claim middle-6 in DB
- [x] Store matched claim number and confidence level on intake record
- [x] Snapsheet claim lookup: when API is connected, query by claim number and return handler + claim URL
- [x] Link Snapsheet claim URL in intake detail view (opens claim in new tab)
- [x] Show claim match confidence badge on intake records (exact / partial / unmatched)
- [x] Integrate claimMatch.ts into aircall.ts voicemail processing pipeline
- [x] Update seeded intake records with claimMatchType/Confidence/snapsheetClaimUrl
- [x] Final checkpoint saved — demo ready

## Clerk Google SSO Integration
- [x] Install @clerk/clerk-react and @clerk/express packages
- [x] Add CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY secrets
- [x] Replace server-side Manus OAuth context with Clerk JWT verification (verifyToken from @clerk/express)
- [x] Update tRPC context to use Clerk userId and user metadata (clerkAuth.ts upserts user to local DB)
- [x] Replace client-side useAuth hook with Clerk's useUser/useAuth in WhipLayout
- [x] Replace login screen with Clerk's SignIn component (Google SSO enabled)
- [x] Remove Manus OAuth callback route dependency (Clerk handles auth entirely client-side)
- [x] Update WhipLayout sign-in screen to use Clerk SignIn component
- [x] Update user upsert to sync Clerk user data into local users table (clerkAuth.ts)
- [x] Test Google SSO end-to-end and verify protected procedures still work (24 tests passing)
- [x] Save checkpoint

## Bug Fixes & UI Corrections (Apr 24)
- [x] Call Tracking: break out per-agent rows (Mary Joy, Daryl, and all named agents) instead of single "Unassigned" row
- [x] Call Tracking: seed/map agent names from Aircall data so Mary Joy and Daryl show actual call volumes
- [x] IVR Setup nav: remove Twilio section entirely (not part of Option C)
- [x] Pull real agent call stats from Aircall Users API and re-seed call_history with proper agent assignments
- [x] Weekly QA: add per-agent strengths and improvement opportunities section

## Handler Queue & Priority Fixes (Apr 24)
- [x] Assign open intake records to handlers (round-robin across team)
- [x] Set priority = high for all law_office caller types
- [x] Set priority = high for any message mentioning accident/crash/collision
- [x] Fix "Jobs" → "Jovel Villa" name mapping in Aircall agent data
- [x] Add nickname aliases: MJ = MJ Badua, Raine = Lorraine Tria, Jobs = Jovel Villa
- [x] Handler Queue: ensure open records display per handler with priority badges

## Live Sync & Data Fixes (Apr 24)
- [x] Fix repeat caller info missing from dashboard (widget added to Dashboard.tsx, threshold >= 2)
- [x] Set up live Aircall call sync (node-cron job every 15 min, runs on server startup, credentials set)
- [x] Fix name: Elizabeth Avilla (email corrected in aircall.ts and seed_voicemails.mjs)
- [x] Add "mary" as alias for Ana Padilla in handler routing

## Analytics & QA Overhaul (Apr 24)
- [x] Fix repeat callers query — rebuilt caller_profiles from all 1,866 calls (706 unique callers, 20 repeat)
- [x] Handler Queue: add "Called Back" button on each intake record
- [x] Handler Queue: wire Called Back action to update record status in DB
- [x] Analytics: rebuild to cover all 1,866 calls (not just voicemails)
- [x] Analytics: caller-type breakdown — law offices, providers, carriers with handling outcome (answered/voicemail/missed)
- [x] Analytics: IVR transfer potential section — how many law/provider/carrier calls could auto-route
- [x] Analytics: caller identity linking — name, org, claim link for callers with known intake records
- [x] Analytics: repeat caller drill-down with identity + claim link
- [x] Analytics: callback pattern — did they call back repeatedly without leaving voicemail?
- [x] Add qa_scorecards table to drizzle schema (handlerId, week, scores x5, managerComments, createdAt)
- [x] Add getHandlerScorecards, getAllScorecards, saveHandlerScorecard DB functions
- [x] Add qa.allScorecards, qa.handlerScorecards, qa.saveScorecard tRPC procedures
- [x] Build HandlerProfile page: QA scorecard history, score trends, manager comments per week
- [x] Add scorecard push form to Weekly QA page (manager selects handler, fills scores + comments, pushes)
- [x] Add "Profile" link to each handler row in Handler Queue
- [x] Wire HandlerProfile route in App.tsx

## Repeat Caller Intelligence & Snapsheet Fix (Apr 24)
- [x] Fix Snapsheet links — diagnosed: URL format correct, Snapsheet requires login; updated link label to clarify
- [x] Repeat caller drawer: show full voicemail transcript for each call
- [x] Repeat caller drawer: show AI-extracted call purpose / reason for call
- [x] Repeat caller drawer: show what prevented resolution (unanswered questions, wrong dept, missing info)
- [x] Repeat caller drawer: show conversation thread across all their calls chronologically
- [x] Backend: getCallerHistory already returns full intake records with rawTranscript — no backend change needed

## IVR Build — Conversational AI Phone Flow (Apr 24)

- [x] Rewrite 1-pager pitch in plain language with real IVR explanation
- [ ] Aircall inbound webhook endpoint (POST /api/ivr/inbound) — fires when call arrives on Whip line
- [ ] Handler availability check via Aircall API (is the named handler currently available?)
- [ ] Conversational AI IVR flow: greet caller, identify by phone, confirm claim, detect intent, ask questions
- [ ] Transfer logic: if caller requests handler by name and handler is available → transfer; else → monitored voicemail
- [ ] Auto intake record creation from IVR conversation (caller name, org, claim number, reason, transcript)
- [ ] IVR session state management (track conversation turns per call)
- [ ] Aircall webhook signature verification (security)
- [ ] IVR call log visible in dashboard (show IVR-handled calls separately)

## IVR Audio + Softphone (Apr 24)

- [x] Generate 3 voice options for main IVR greeting
- [x] Generate press-1 voicemail prompt audio (carrier/law/medical)
- [x] Generate no-answer voicemail prompt audio (drivers/claimants)
- [x] Build Aircall softphone (Phone SDK) embedded in dashboard
- [x] Write Aircall Smartflow configuration instructions
- [x] Add callback timestamp tracking for QA metric (return call before EOB)

## Softphone + IVR Webhook Build (Apr 24)

- [x] Add Softphone page to dashboard using Aircall Phone SDK (iframe embed)
- [x] Add Softphone nav item to WhipLayout sidebar
- [ ] Build POST /api/webhooks/aircall endpoint (receives all Aircall events)
- [ ] Handle call.voicemail_left: download voicemail, transcribe with Whisper, extract intake data with LLM, create intake record
- [ ] Handle call.ended: update call_history record with final status/duration
- [ ] Handle call.answered: mark call as answered in call_history
- [x] Add callbackAt timestamp column to intake_records for EOB callback QA metric
- [x] Add callbackDueBy column (EOB of day voicemail received) to intake_records
- [x] Show callback QA status in intake records list (on time / overdue / pending)
- [ ] Webhook signature verification (Aircall-Signature header)
- [x] Write Aircall Smartflow + webhook setup instructions doc
