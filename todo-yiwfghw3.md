# Whip IVR — KB Migration Session TODO

## Phase 1: Document Generator Migration

- [x] Rename IVR title to "Whip IVR Dashboard & Knowledge Base" in sidebar/header/login/mobile
- [x] Add "Knowledge Base" section to sidebar nav with Document Generator link
- [x] Create /doc-generator route in App.tsx
- [x] Build DocGenerator page with all 17 subnavs (grouped by Contacts, Coverage, Denials, Settlements, Subrogation):
  - [x] Blank Letterhead (with AI Improve with AI)
  - [x] Claimant Contact Letter
  - [x] Failed Contact Letter
  - [x] Storage Mitigation Letter
  - [x] Certificate of Coverage
  - [x] Coverage Position — TNC Primary
  - [x] Denial & Acknowledgment (8 denial templates: TNC PIP, No PIP State, PIP Waiver, TNC Liability, LOR Acknowledge, LOR Deny BI, Empower Member, Empower Claimant)
  - [x] Damage Denial Letter
  - [x] Reservation of Rights
  - [x] PIP Exhaustion (FL/PA/VA) — state chips, benefit breakdown, PDF
  - [x] General Release — BI (with AI Settlement Email)
  - [x] General Release — PD (with AI Settlement Email)
  - [x] TL Settlement & Release
  - [x] Subro Demand Letter
  - [x] Carrier Rebuttal (with AI Generate + AI Polish Draft, line item table)
  - [x] Payment Receipt / Proof of Payment
  - [x] Towing Invoice (Urgently) — with line item charges table
- [x] Build docgen tRPC router with all 4 AI procedures:
  - [x] improveWithAI (Blank Letterhead)
  - [x] generateRebuttal (Carrier Rebuttal)
  - [x] polishRebuttal (Carrier Rebuttal)
  - [x] generateSettlementEmail (BI/PD Release)
- [x] Wire all PDF generation (client-side jsPDF with Whip letterhead/footer)
- [x] Update App.tsx with /doc-generator route
- [x] Update WhipLayout with Knowledge Base nav section
- [x] Write vitest tests for docgen router (4 tests passing)
- [x] Save checkpoint

## Phase 2 — Document Generator Enhancements

- [x] SOL notice on all 15 letter tabs (addSOLNotice called 22 times across all tabs)
- [x] State/market selector on all form fillers (WHIP_STATES selector on 8+ tabs)
- [x] General Release — BI tab: Minor toggle, Carrier/Subrogation Payee toggle, State selector, AI validation, SOL notice
- [x] General Release — PD tab: Minor toggle, Carrier-pay toggle, State selector, AI validation, SOL notice
- [x] GA Limited Liability callout on BI Release tab (amber alert when GA selected, links to Limited Liability Release — BI tab)
- [x] Rebuild TL Settlement tab (Felsenburg format, AI letter, doc upload): Felsenburg-format letter with settlement table, ACV + document uploads (estimates, tow bills), PDF settlement package output
- [x] LOU Calculator: vehicle class dropdown with Whip standard rates (Economy $30 → Luxury $85), custom rate input, days/total calc
- [x] Push-to-demand from LOU Calculator to Subro Demand Letter (sessionStorage bridge)
- [x] Carrier Rebuttal: document upload for carrier response documentation (carrierDocUrl passed to AI)
- [x] PIP Exhaustion: document upload + AI parse (parsePIPDocument procedure, extracts benefit breakdown)
- [x] Medical Bills Review tab: 200-page demand upload, vehicle photos, CPT code analysis, PIP/BI/UMBI exposure, AI response letter
- [x] Klutch COI tab: correct format, market-based note, prints correctly
- [x] Whip COI tab: correct format, market-based note, prints correctly
- [x] Towing Invoice: multi-provider dropdown (Urgently, Agero, AAA, Copart, Local, Other), per-provider PDF formatting

## Phase 2 — New UI Enhancements (from mockup, Aug 3)

- [x] DocGen UI: breadcrumb header "Document Generator > [Doc Title]" with star/favorite toggle
- [x] DocGen UI: favorite docs pinned to quick-access list in sidebar/header
- [x] DocGen UI: save draft (persist form state per tab to DB per user)
- [x] DocGen UI: real PDF preview (rendered iframe, not just text) with Full Screen modal
- [x] DocGen UI: recent documents list (Recent button in header, table with status/open/preview)
- [x] DocGen UI: My Documents / Templates section (saved/generated docs per user, sidebar bottom)
- [x] DocGen UI: share template to another handler's dashboard (Share Template modal)
- [x] COI/Dec pages: market-based (not accident location), note added, markets: MD (Glen Burnie, Rockville), VA, PA, FL, IL, GA, MA

## Medical Bills Review (expanded scope)
- [x] Rename "PIP Bill Review" to "Medical Bills Review" throughout
- [x] Multi-page demand upload (PDF, up to 200 pages) with AI parsing
- [x] AI extracts all medical bills, CPT codes, providers, dates, amounts from uploaded demand
- [x] Vehicle photo upload (both vehicles) for mechanism of loss assessment
- [x] Facts of loss input (narrative, impact type, speed, injuries reported)
- [x] State selector → auto-applies PIP limits, BI limits, UMBI requirements
- [x] AI matches each treatment/CPT code to mechanism of loss (applicable vs. not applicable)
- [x] AI flags codes inconsistent with injury mechanism
- [x] Expert summary output explaining applicable vs. not-applicable determinations
- [x] Calculates PIP exposure, BI exposure, UMBI exposure by state
- [x] Generates response/rebuttal letter with line-item analysis
- [x] Inline PDF preview after generating report/letter (iframe with Full Screen button)

## Phase 3 — Letterhead Standardization & PDF Fixes (Aug 3)
- [x] Standardize addWhipLetterhead: logo left, bold company name right, address, rule, footer rule — match PDDenial(2).pdf exactly
- [x] Remove letterhead from release tabs (General Release BI, PD, Limited Liability BI, TL Settlement & Release)
- [x] Fix all name fields to first-last order (not last-first) across all tabs
- [x] Update DocGen preview panel to render PDF-accurate letterhead layout (not plain text)
- [x] Fix signature block: "Sincerely, / Whip Claims Management / Respectfully, / [Handler Name bold]"
- [x] LOU Calculator: rebuild to match full carrier-defensible format (fleet utilization log, market rates, legal basis section)

## Session 3 — Continuation Fixes (Aug 3, 2026)
- [x] Fix missing addSOLNotice function declaration (corrupted from previous session)
- [x] Restore missing addWhipLetterhead and addLetterFooter helper functions
- [x] Implement MetrocarsDecPageTab component (Klutch Insurance branding, policy declarations, coverage table)
- [x] Implement KlutchDecPageTab component (Klutch COI format, state-based coverage rules)
- [x] Fix CertOfCoverageTab to match KlutchCOI.pdf format (landscape, Klutch branding, full coverage table with checkboxes, disclaimer box, producer/insurer grid, certificate holder/cancellation boxes)
- [x] Add dec-page-whip and dec-page-klutch to DocGenTab type
- [x] Wire MetrocarsDecPageTab and KlutchDecPageTab in renderTab switch
- [x] TypeScript check: zero errors confirmed
- [x] Add tRPC claimLookup procedure (docgen.claimLookup) backed by intakeRecords + lossIntakeClaims
- [x] Add lookupClaimForDocgen() helper to db.ts
- [x] Add Load from Claim UI (search bar + Load button) to CertOfCoverageTab
- [x] Add Load from Claim UI to MetrocarsDecPageTab
- [x] Add Load from Claim UI to KlutchDecPageTab
- [x] Embed real Klutch logo (KLUTCH_LOGO_B64) in CertOfCoverageTab PDF header
- [x] Embed real Klutch logo in KlutchDecPageTab PDF header
- [x] Separate Preview and Download buttons in PreviewPanel (onPreview prop)
- [x] Wire onPreview for CertOfCoverageTab, MetrocarsDecPageTab, KlutchDecPageTab
- [x] Remove DC/NJ/NY/NC/DE/OH from COI/Dec Page state dropdowns (already correct — only MD/VA/PA/FL/IL/GA/MA)
- [x] Fix FL state minimums: BI = MD limits ($30k/$60k), UM/UIM = N/A (not required in FL)
- [x] Fix policy number naming convention to [state]000S0137 across all three coverage tabs
- [x] Fix statute citations in STATE_RULES (IL, VA, MA, FL)
- [x] Update polNum fallback in PDF generation to use [state]000S0137
- [x] Update polNum fallback in PDF generation to use [state]000S0137

## Session 4 — COI/Dec Page Portrait Rebuild & Release Fixes (Aug 3, 2026)
- [x] Remove any remaining DC, NJ, NY, NC, DE, OH state options from Whip COI and Dec Page flows
- [x] Rebuild Whip COI PDF in portrait format to match KlutchCOI.pdf exactly
- [x] Rebuild Metrocars and Klutch Dec Page PDFs in portrait format to match Barkley_Dec_Page.pdf exactly
- [x] Add TX support to COI and both Dec Page flows (TX minimums: $30k/$60k BI, $25k PD, no PIP, UM/UIM optional)
- [x] Add FL PIP waiver/modification note field on COI and Dec Page flows
- [x] Allow UM rejection in GA on COI and Dec Page flows
- [x] Replace BI/PD/Limited release generation with fixed reference-template formatting (no AI validation)
- [x] Fix subro demand letter: remove dark header line, left-align date, remove 'for settlement purposes'
- [x] Verify all affected documents render and download correctly before delivery
- [x] Remove DC/NJ/NY/NC/DE/OH markets from COI/Dec Page (confirmed already clean - only MD/VA/PA/FL/IL/GA/MA/TX)
- [x] Add TX to all three coverage tabs (COI, Metrocars Dec Page, Klutch Dec Page)
- [x] Add FL PIP waiver checkbox on COI
- [x] Add GA UM rejection option
- [x] Fix policy number naming convention to [state]000S0137
- [x] Fix FL state minimums (apply MD BI limits, UM/UIM not required)
- [x] Rebuild BI/PD/Limited releases to use exact reference document formats
- [x] Remove AI Validate Release Language button from all three release tabs
- [x] Fix subro demand letter: remove For Settlement Purposes Only, left-align date, match reference format
- [x] Update subro demand to match Whip_SubroDemand reference (itemization table, demand for payment, payment instructions sections)

## Phase 5 — Mail Bot, Pro-Rata Calc, KB Migrations (Aug 3, 2026)
- [x] Mail Bot DB schema: mail_bot_config, mail_bot_agents, mail_bot_pto, mail_bot_assignments, mail_bot_runs tables
- [x] Mail Bot engine: server/mailBot.ts — classification, assignment, Slack posting, Google Sheet logging
- [x] Mail Bot tRPC router: server/routers/mailBot.ts — full CRUD + runNow + getStats
- [x] Mail Bot wired into appRouter in server/routers.ts
- [x] Mail Bot Dashboard UI: client/src/pages/MailBot.tsx — 5 sub-nav tabs (Bot Control, Assignment Log, Agent Rules, PTO Manager, Schedule Controller)
- [x] Mail Bot config seeded: Slack token, Apps Script URL, Google Sheet ID
- [x] Pro-Rata Calculator: client/src/pages/ProRataCalc.tsx — correct pro-rata logic
- [x] KB: Liability Guide — client/src/pages/kb/LiabilityGuide.tsx
- [x] KB: Fault Decision Tool — client/src/pages/kb/FaultDecisionTool.tsx
- [x] KB: Denied Claim Escalation — client/src/pages/kb/DeniedClaimEscalation.tsx
- [x] KB: Markets & Policy — client/src/pages/kb/MarketsAndPolicy.tsx
- [x] KB: Knowledge Base — client/src/pages/kb/KnowledgeBase.tsx
- [x] App.tsx routes added for all new pages (MailBot, ProRataCalc, 5 KB pages)
- [x] WhipLayout nav updated: Mail Bot in ADMIN_NAV_ITEMS; all KB pages in KB_NAV_ITEMS and HANDLER_KB_NAV_ITEMS

## Phase 6 — Fixes & Enhancements (Aug 3, 2026)
- [x] Mail Bot: admin-only access gate in MailBot.tsx UI (redirect non-admins)
- [x] Mail Bot: listAssignments — allow assigned handler to see their own items (remove adminOnly gate, filter by user's name/slackId for non-admins)
- [x] Doc Gen: My Documents — show list of saved docs (not a generator)
- [x] Doc Gen: Shared With Me — show list of docs shared with user (not a generator)
- [x] LOU Calculator: rebuild as exact match of LOU Calculator reference app (estimate upload Step 1, fleet utilization table, PDF output)
- [x] Pro-Rata Calc: replace with full PD/BI calculator from attached HTML spec (state selection, multi-claimant, negligence doctrine, letter gen, Snapsheet copy)
- [x] KB: fix all 5 pages to use exact CKB content (not generated content)
- [x] Markets & Policy: add Drivewhip Terms of Service and Glossary section
- [x] Mail Bot: add Total Loss Documents category (Daniel Giono primary, OB Subro secondary, General RR third)
- [x] Mail Bot: add Subrogation Documents category (outbound subro-related docs primary, General RR secondary)
- [x] Mail Bot: add Subrogation Documents category (outbound subro-related docs primary, General RR secondary)

## Phase 7 — LOU Calculator DocGen Integration & Mail Bot Roster (Aug 4, 2026)
- [x] LOU Calculator: add parseDocument procedure to lou.ts router (base64 → AI field extraction)
- [x] LOU Calculator: fix getMarketPricing to accept optional marketCode filter
- [x] LOU Calculator: replace LOUCalculatorTab in DocGenerator with exact reference Home.tsx implementation
- [x] LOU Calculator: PDF print output matches sample exactly (print window approach)
- [x] LOU Calculator: Push to Demand Letter writes sessionStorage + navigates to subro-demand tab
- [x] Remove standalone /lou-calculator route from App.tsx (redirect added)
- [x] Remove LOU Calculator from KB_NAV_ITEMS and HANDLER_KB_NAV_ITEMS in WhipLayout.tsx
- [x] Add LOU Calculator back to DocGen NAV_GROUPS Subrogation section
- [x] Mail Bot: seed Daniel Giono (slackId=D0B1BTBBJP9, role=total_loss) and Tim Chan (slackId=D0B22AZ6QB0, role=subro_docs)
- [x] Remove standalone LOU Calculator from WhipLayout sidebar nav
- [x] Add Diminished Value Calc entry in DocGen Subrogation section (opens dvcalc-unkzbfqd.manus.space/agent-login in new tab)

## Phase 8 — Remaining CKB Page Syncs (Aug 4, 2026)
- [x] KB: Reference Hub page (/kb/reference-hub) — 50-state coverage matrix, unauthorized driver rules, total loss fees, mail protocols
- [x] KB: Glossary page (/kb/glossary) — 57 terms with category filter and search
- [x] KB: Resources & Links page (/kb/resources) — claims systems, Slack channels, docs/sheets, external tools (no team contacts, no claim handling checklist)
- [x] KB: Vehicle Anatomy page (/kb/vehicle-anatomy) — matching mockup with vehicle selector, pin legend, component details, documentation guide tabs
- [x] Markets & Policy: Update Terms of Service tab with full 19-policy DriveWhip ToS (verbatim policy language + enforcement statements)
- [x] Hover-to-lookup on claim notes — text selection tooltip that pre-fills Policy & Terms Lookup scenario field
- [x] WhipLayout: Add Reference Hub, Glossary, Resources & Links, Vehicle Anatomy to KB_NAV_ITEMS and HANDLER_KB_NAV_ITEMS
- [x] App.tsx: Register 4 new routes

## Session 2026-08-04 Tasks

- [x] Build Reference Hub page with 50-state coverage matrix, UA rules, TL fees, mail protocols
- [x] Build Glossary page with 57 terms, category filters, and search
- [x] Build Resources & Links page (excluding Team Contacts and Claim Handling Checklist)
- [x] Build Vehicle Anatomy page matching mockup (SVG diagram, pin legend, component details, doc guide)
- [x] Sync DriveWhip ToS (42 sections, effective Aug 2025) into Markets & Policy Terms of Service tab
- [x] Add search/filter to ToS tab
- [x] Add hover-to-lookup tooltip on claim notes (PolicyLookupZone + PolicyLookupTooltip)
- [x] Add URL param pre-filling to KnowledgeBase (?tab=policy&scenario=...)
- [x] Register all new KB routes in App.tsx
- [x] Add Reference Hub, Glossary, Resources & Links, Vehicle Anatomy to nav sidebar
- [x] Merge Fault Decision Tool into Liability Guide as unified AI fault determination with FOL scenario box
- [x] Reformat AI fault output to structured cards (Accident Type, Fault Analysis, State Law Impact, Fault %, Recovery Likelihood, Key Evidence, Recommended Action)
- [x] Rename "Markets & Policy" nav label and page title to "Market and Policy Directory"
- [x] Rebuild Vehicle Anatomy with real sedan image (Toyota Camry), 15 interactive numbered pins, no vehicle picker, no Need Help section
- [x] Upload sedan anatomy image to webdev static storage
- [x] Remove Fault Decision Tool nav entry (merged into Liability Guide)
- [x] Recalibrate Vehicle Anatomy pin positions on sedan image
- [x] Add Copy Result button to Liability Guide fault determination output
- [x] Restrict COI and dec page state options to Whip operating markets only (MD, VA, FL, GA, IL, MA, PA, TX), pre-filled from member's originating market state
- [x] Remove Fault Decision Tool nav entry and route (merged into Liability Guide)
- [x] Recalibrate Vehicle Anatomy pin positions on Toyota Camry sedan image
- [x] Add Copy Result button to Liability Guide fault determination output
- [x] Restrict COI and dec page state selectors to Whip operating markets only (MD, VA, PA, FL, IL, GA, MA, TX)
- [x] Pre-fill COI/dec page state from member's originating market via URL param
- [x] Update stateOfCoverage derivation in db.ts to add TX, NJ, NC market mappings
- [x] Restrict COI and dec page state options to Whip operating markets only (MD, VA, FL, GA, IL, MA, PA, TX), pre-filled from member's originating market state
- [x] Add Preview button (onPreview prop) to all tabs missing it: BlankLetterhead, ClaimantContact, FailedContact, StorageMitigation, CoverageTNC, Denial, DamageDenial, ROR, ReleaseBI, ReleasePD, TLSettlement, SubroDemand, CarrierRebuttal, PaymentReceipt, UrgentlyInvoice, PIPExhaustion, LimitedLiabilityBI, LOUCalculator, MedicalBillsReview, KlutchCOI
- [x] Add Preview button (onPreview prop) to all tabs missing it: BlankLetterhead, ClaimantContact, FailedContact, StorageMitigation, CoverageTNC, Denial, DamageDenial, ROR, ReleaseBI, ReleasePD, TLSettlement, SubroDemand, CarrierRebuttal, PaymentReceipt, UrgentlyInvoice, PIPExhaustion, LimitedLiabilityBI, LOUCalculator, MedicalBillsReview, KlutchCOI
- [ ] Add reassign dropdown to handler dashboard callback queue items
- [ ] Add expandable call reason + quick reassign to intake records page (without going into view page)
- [ ] Add processors to reassign/round-robin dropdown for file-a-claim calls
- [ ] Route file-a-claim calls to processors automatically
- [ ] Reassign existing file-a-claim intakes to processors via round-robin

## Session 2026-08-05 Tasks
- [x] Add reassign dropdown to handler dashboard callback queue items
- [x] Add expandable call reason + quick reassign to intake records page (without going into view page)
- [x] Add processors (MJ/Daryl) to reassign/round-robin dropdown for file-a-claim calls
- [x] Route file-a-claim calls to processors automatically
- [x] Reassign existing open file-a-claim intakes to processors via round-robin
- [x] LOU Calculator: sessionStorage persistence already implemented
- [x] LOU Calculator: persist state to sessionStorage so navigating away and back restores all fields
- [x] LOU Calculator: replace VEHICLE_CLASSES/MARKETS/STANDARD_RATES with tRPC market-specific pricing (lou.getMarketPricing)
- [x] LOU Calculator: use real utilization data from tRPC lou.getUtilRows
- [x] LOU Calculator: add VIN decoder button to auto-fill Year/Make/Model/Trim
- [x] Subro Demand: add VIN decoder button (NHTSA API) to auto-fill Year/Make/Model/Trim
- [x] Subro Demand: change attachments from free text to multi-select checkboxes
- [x] Subro Demand: add handler dropdown (Tim Chan + Daniel Giono first) to letter
- [x] Subro Demand: fix PDF generation to use structured sections not wrapText(preview)
- [x] Subro Demand: add editable opening paragraph textarea (free-text override of default language)
- [x] Subro Demand: add Storage field to damage itemization
- [x] Carrier Rebuttal: add separate upload slots for our estimate, image report, and carrier rebuttal
- [x] Tow Bill: add Dark Angel Towing (Chicago) and Bar Recovery LLC (Atlanta) from KB TOW_PARTNERS
- [x] Handler dropdown: add to all letter tabs that currently have a free-text handler/adjuster name field
- [x] Payment Receipt: add total_recon purpose (Total Recon — Repair Payment)
- [x] COI: make KlutchCOI state selectable (MD, GA, VA, PA, MA, IL, FL, TX)
- [x] DocGen: remove cert-of-coverage tab (redundant — not in nav, already excluded)
- [x] DocGen: sync Empower denial templates from original KB (empower_member + empower_claimant in DENIAL_TEMPLATES)
- [x] DocGen: Denial tab — rebuild template selector as 3-column card grid matching screenshot
- [x] DocGen: Denial tab — add PIP Exhaustion FL/PA/VA and Med Benefits PA as quick-access navigation cards
- [x] Coverage Position TNC: add Klutch/Metrocars carrier selector with logo buttons
- [x] Coverage Position TNC: PDF letterhead uses carrier logo (Klutch or MetroCars) based on selection
- [x] Process MetroCars logo (invert colors, transparent background) for use on white paper
- [x] Process Klutch logo (transparent background) for use in PDF
- [x] DocGen: remove carrier/subrogee from BI release (fields were orphaned, not in release text or UI)
- [x] TL Settlement: already uses Metro Cars Leasing Corp. — no Felsenburg reference found

## Session 2026-08-05 (Part 2)
- [x] Rename PIP Exhaustion tab to "PIP Bill Review"
- [x] Add Massachusetts (c.90 §34M) to PIP Bill Review states
- [x] Implement full PIP Bill Review: multi-file upload, AI HCFA-1500 extraction, fee schedule review (PA/FL/MD/MA), line-by-line results, EOR PDF generation
- [x] Add extractPIPBills tRPC procedure for AI HCFA-1500 extraction
- [x] Fix orange overuse in all PDF letterheads (title now navy, only logo remains orange)
- [x] Reduce Whip logo size by 20% (36x24 → 29x19) on all letterhead
- [x] Fix LOU Calculator section headers to navy
- [x] Fix Payment Receipt amount color to navy
- [x] Fix COI additional insured/waiver checkmarks to navy

## Session 2026-08-05 (Part 3 - COI Rebuild)
- [x] Rebuild unified COI form builder with insurer selector (Klutch vs Metrocars)
- [x] Klutch COI PDF matches approved form exactly (logo, disclaimer, coverage table with dashes, cert holder = Metrocars, Klutch footer)
- [x] Metrocars COI PDF matches approved form exactly (org header, self-insured disclaimer, dollar limits per state, cert holder = Whip Claims Management, Metrocars footer)
- [x] Insurer toggle with date guidance (Klutch = April 2026+, Metrocars = pre-April 2026)
- [x] State selector with 11 states (MD/VA/FL/GA/IL/MA/PA/TX/NJ/NY/DC)
- [x] Coverage options: Additional Insured, Waiver of Subrogation, UM Rejected, PIP Waived
  - [x] Consolidated nav: single "Certificate of Coverage" entry instead of two separate tabs

## Session 2026-08-06 Tasks
- [x] Slice 6 redesign: MyMailroom.tsx rebuilt per mockup — 5 stat cards (Overdue/Urgent/Legal/Demands/AllPending), dense table with signal column, right-side Sheet drawer on row click (no page navigation), full-width layout, sidebar label "myMailroom"
- [x] myMailroomStats tRPC procedure added to mail router (5 handler-scoped counts)
  - [x] WhipLayout: sidebar label updated from "My Mailroom" to "myMailroom" (camelCase)
  - [x] COI/Dec Page: coverage-through date logic (computeCoverageThrough), still-in-rental toggle, Expiration Date field, duplicate date fields removed
- [x] COI: removed ADDL INSD and SUBR WVD columns from PDF coverage table; removed Additional Insured and Waiver of Subrogation checkboxes from form
  - [x] Dec Page: Toyota make auto-presets Collision and Comprehensive deductibles to $500
- [x] Dec Page: removed "PIP waived per Maryland Transportation Article" sublabel from PIP row
- [x] Dec Page: BI row now always shows state limits (removed "Not elected" for FL biNotMandated)
- [x] Dec Page: "Page 1 of 2" label added to header; maxWidth on limits column to prevent overlap
- [x] COI PDF: ADDL INSD column restored (only SUBR WVD removed per spec); ADDL INSD form checkbox still removed
- [x] Klutch COI: darken the "Insurance Company" wordmark in the logo to match the rest of the logo
- [x] Klutch COI: prevent the word "coverage" from running into the right border of the top disclaimer box
- [x] Klutch COI: remove the strike-through artifact under Vehicle in the insured box
- [x] COI PDFs: widen the INSR LTR column without breaking the rest of the coverage table layout
- [x] COI PDFs: add half-line spacing after items 1 and 2 in Description of Operations / Coverages sections
- [x] Metrocars COI: enlarge the logo by 20%
- [x] Metrocars COI: remove the line through Vehicle under insured
- [x] Metrocars COI: add half-line spacing between the coverages paragraph and the coverage table
- [x] Metrocars COI: fix PIP limits overlap in the coverage table (widened LIMITS column)
  - [x] Dec Page: mainW increased to 67%, column positions adjusted, sidebar contact info fixed, row spacing improved
- [x] Denial letter: top-level field renamed "Letter Date" and auto-populated with today's date; dol template field remains for actual date of loss
  - [x] All Whip letters: addWhipLetterhead reformatted to clean letterhead only (logo + company info + rule); title/subtitle blocks removed; body font 9→10pt across all letters
- [ ] Klutch COI logo: darken the PNG programmatically (multiply/darken filter) instead of text overlay
- [ ] Slice 7: enable mailIngestGmail cron — Gmail OAuth read, parse raw email, store to mail_items
- [ ] Slice 7: enable mailProcess cron — LLM classify, auto-assign handler, urgency scoring
- [ ] Slice 7: enable reminder cron — due-date overdue/urgent notifications
- [ ] Slice 7: live acceptance test — send test email to claims@, post to #claims-mail Slack, verify ingest + classify + assign + UI resolve
- [x] Slice 7 correction: switch Gmail ingest from service account to standard OAuth (personal inbox)
- [x] Slice 7 correction: remove is:unread filter — query all mail to:claims@ instead
- [x] Slice 7 correction: use label-based filter — to:claims@drivewhip.com -label:mailroom-done
- [x] Slice 7 correction: add mailroom-done label after processing (never mark read)
- [x] Slice 7 correction: preserve Reply-To/CC sender extraction (never assume From = sender)
- [x] Slice 7: store Gmail OAuth refresh_token in DB (mail_settings table)
- [x] Slice 7: add Gmail OAuth connect flow in admin UI (authorize → callback → store token)
- [x] Slice 7: admin panel — Setup Crons button + Trigger Now button
- [x] Slice 8: schema migration — extend mail_items.source enum to include fax and manual
- [x] Slice 8 Feature A: /api/mail/:id/files upload route (multer + storagePut + mail_item_files insert)
- [x] Slice 8 Feature A: addFile tRPC procedure (auth: assigned handler or admin)
- [x] Slice 8 Feature A: Upload control in MyMailroom drawer Attachments section
- [x] Slice 8 Feature A: Upload control in MailroomItem Attachments section
- [x] Slice 8 Feature B: New Intake form (manual create) with all required fields
- [x] Slice 8 Feature B: createManualItem adminProcedure with synthetic externalId
- [x] Slice 8 Feature B: Auto-classify button (runs classify() on uploaded file, pre-fills fields)
- [x] Slice 8 Feature B: New Intake button wired in admin Mailroom header
- [x] Slice 8: remove any compose/reply controls from mailroom
- [x] Admin Mailroom redesign: adminStats tRPC procedure (6 org-wide counts)
- [x] Admin Mailroom redesign: full-width layout, 6 stat cards with View links
- [x] Admin Mailroom redesign: filter tabs (All/Overdue/Urgent/Legal/Demands/Resolved/Mail Log)
- [x] Admin Mailroom redesign: admin filter row (status, category, handler, date range, search)
- [x] Admin Mailroom redesign: table with Status/Type/Subject/Category/Claim#/Handler/Due/Received/Actions
- [x] Admin Mailroom redesign: right-side Sheet drawer with routing block and Edit Routing
- [x] Admin Mailroom redesign: New Intake + Compose/Upload buttons in header
- [x] Dec Page fix: data merge — named operator, vehicle, VIN, dates, all 6 premiums + total
- [x] Dec Page fix: PIP conditional (waived/enhanced/statutory) not hardcoded
- [x] Dec Page fix: page number clear of logo, section headings navy, column headers fixed
- [x] Dec Page fix: right-align Limits/Deductible/Premium columns, navy premium amounts
- [x] Dec Page fix: sidebar blue left-border accents, online claim address as blue link
- [x] Dec Page fix: page 2 conditions as bold lead-in + paragraph bullets
- [x] Purge demo mail data (mail_items, files, notes, history) — keep config tables
- [x] Update mail tests to self-fixture (no reliance on seeded rows)
- [x] Upload mailbox PNG as static asset
- [x] Add mailbox widget to handler home dashboard (myPendingCount, links to /my-mailroom)
- [x] Add mailbox widget to admin home dashboard (adminStats allPending, links to /mailroom)
- [x] Fix New Intake Select empty-string crash (remove value="" items, use sentinel/undefined)
- [x] Move mailbox to small header icon on handler dashboard (not a section card)
- [x] Move mailbox to small header icon on admin dashboard (not a section card)
- [x] Fix Mailroom Legal tab — label/filter should be Legal only (not demands)
- [x] Fix Gmail OAuth 403 — redirect URI mismatch
- [x] Fix manual intake file upload route (/api/upload/document)
- [x] Add AI extract-and-fill endpoint: reads uploaded doc, returns subject/sender/claimNumber/category/urgency/dateOfLoss/responseDue/bodyText
- [x] Rebuild New Intake UX: upload-first flow, AI auto-fill button reads doc and populates all fields, one-click create+assign
- [x] Assignment cadence: 3 per handler per run, Tue-Fri only gate in triggerNow/mailProcess
- [x] Admin Mailroom: auto-refresh every 30s so new items appear live without manual reload
- [x] Admin queue: show "assigned" tick as items get assigned (live count update)
- [ ] Status shows "assigned" but handler shows "Unassigned" — fix: status should be "new" until handler is actually set
- [ ] Add sort control to admin Mailroom table (default: newest-first by received_at)
- [ ] Slack ingest: download actual PDF files to S3 (mail_item_files), not just stub rows
- [ ] Gmail ingest: debug why 40+ emails return 0 inserted; fix query/filter
- [ ] Label protocol: add mailroom-done Gmail label on assignment (not on ingest); mark Slack reviewed emoji on assignment
- [ ] Bulk archive: checkbox column, select-all, archive button in admin Mailroom
- [ ] Summary column in All Mail table showing brief note of what the mail is

## Session 2026-08-10 Tasks
- [x] Gmail ingest: fix query to is:unread to:claims@drivewhip.com (was querying all mail without is:unread)
- [x] Gmail ingest: add Pass 2 — also query is:read to:claims@drivewhip.com and insert those with status=resolved (auto-resolve already-read emails)
- [x] Gmail ingest: add resolvedInserted to IngestGmailResult interface and result tracking
- [x] Gmail ingest: add listReadMessages to GmailFetchFn interface and real implementation
- [x] Dec Page: verified handleDownload matches approved format; states MD/VA/FL/GA/IL/MA/PA/TX only confirmed
- [ ] Slack backfill: re-fetch 139 Slack files into production S3 bucket (running in background)
- [ ] Verify file proxy works after backfill (open 3-4 items in admin Mailroom drawer, click Open)
- [ ] Trigger Now on deployed site after publishing to ingest Gmail + Slack + classify items

## Session 2026-08-11 Mailroom Repairs
- [x] Fix Trigger Now parsing when an upstream endpoint returns HTML instead of JSON
- [x] Correct Slack assignment posts: resolve readable agent mentions, remove/correct the six incorrect posts, and preserve valid links
- [x] Add admin reassignment for individual Mailroom items and post the updated assignment to Slack
- [x] Restrict Slack ingest to unreviewed claims-mail files; record reviewed/checkmarked items as resolved only
- [x] Restore attachment records and proxy access for ingested Slack files
- [x] Persist and render Gmail email bodies in the Mailroom record drawer
- [ ] Verify the deployed Trigger Now run recovers the remaining four legacy Slack items with no attachment records

## Session 2026-08-11 Mailroom Legacy Completion
- [ ] Quantify active records missing attachments, extracted content, actionable titles, or AI summaries
- [ ] Recover source attachments and extract content for all recoverable active legacy records
- [ ] Populate actionable title and summary text for all recoverable active legacy records
- [ ] Re-audit Gmail read state and Claims Mail reviewed markers after the legacy completion pass

## Session 2026-08-11 Default Queue and Priority Routing
- [x] Keep resolved records out of the default Admin Mailroom view; display them only via the Resolved filter
- [x] Immediately assign LORs, attorney correspondence, and demands to Jayla on receipt
- [x] Preserve the Tuesday–Friday cadence for all non-priority Mailroom work

## Session 2026-08-12 Mailroom Urgent Alarm Rules
- [x] Treat escalated records, all demands, time-limit demands, Holt matters, and court documents as urgent
- [x] Surface urgent-alarm records in the Urgent queue and send repeated handler reminders until resolved
- [x] Reconcile existing active priority legal mail into the urgent alarm path (47 records)

## Session 2026-08-12 Mailroom Reroute Usability
- [x] Replace numeric handler-ID entry with a named handler dropdown in all Mailroom reroute controls

## Session 2026-08-12 Handler-Addressee Routing
- [x] Route non-legal, non-injury, non-demand mail addressed to an active handler directly to that handler
- [x] Preserve priority legal, injury, demand, court, Holt, and time-limit routing over addressee routing
- [x] Correct the Alfred Ofili claim mail from Jovel to Natashia when the source confirms her as the addressee

## Session 2026-08-12 Storage Mitigation Letter
- [x] Replace the Storage Mitigation Letter body with the approved notice language

## Session 2026-08-12 Revised Storage Letter and Spacing
- [x] Replace the Storage Mitigation Letter body with the latest approved notice language
- [x] Apply 1.5 line spacing to applicable Document Generator letter bodies

## Session 2026-08-12 Mailroom Forward to Claim
- [x] Verify claim-email data and Gmail sending authorization for controlled Mailroom forwarding
- [x] Implement forwarding of original Mailroom content and recoverable attachments to a selected claim email with an audit record
- [x] Add a recipient-confirmed Forward to Claim action in the Mailroom record drawer
- [ ] Reconnect Gmail from Mailroom Setup to grant the newly requested Gmail send permission before sending live email
- [ ] Verify one recipient-confirmed live forwarding action after Gmail reauthorization

## Session 2026-08-13 Fresh Fax Attachments
- [x] Retry fresh Slack file metadata and bounded storage uploads when newly ingested fax attachment persistence fails
- [ ] Verify a newly received Claims Mail fax displays and forwards its original attachment after deployment

## Session 2026-08-17 Medical Bills Queue
- [x] Detect medical bill, provider invoice, and medical demand mail from Claims Mail and eFax
- [x] Route medical bills and all demands exclusively to Jayla
- [x] Add Bills queue visibility in Admin Mailroom and Jayla’s myMailroom
- [ ] Classify and place recoverable existing medical bill records into the Bills queue

## Session 2026-08-17 Bills Backfill and Record Selection
- [ ] Retroactively classify recoverable existing medical bills and route confirmed bills to Jayla
- [x] Move four confirmed legacy medical-provider bills into the Bills queue and assign them to Jayla
- [x] Move 17 additional active records with explicit medical-billing evidence into the Bills queue and assign them to Jayla
- [x] Repair Mailroom selection checkboxes so clicks toggle selection without opening the record drawer

## Session 2026-08-18 Mailroom Forwarding Integrity
- [x] Display original email body where present and meaningful fax/document context where source content consists only of page markers
- [x] Restore original attachment open/download access through immutable file-ID proxy URLs
- [x] Implement direct Slack source recovery for forwarded attachments and clean forwarded fax body construction
- [ ] Verify a live recipient-confirmed forwarding action delivers the original attachment and expected body after Gmail send authorization

## Session 2026-08-18 Litigation and Queue Boundaries
- [x] Add a Litigated Claim action that escalates the item to the administrator and records the action
- [x] Allow handlers to select their Mailroom records with checkboxes
- [x] Limit Demands to demands, Bills to medical bills, and Legal to court/legal-service documents only

## Session 2026-08-12 Coverage Position and PDF Preview
- [x] Replace the Coverage Position Letter body with the approved TNC-primary notice language
- [x] Make applicable Document Generator Preview actions render the generated PDF in the preview pane

## Session 2026-08-12 Klutch Policy Declarations
- [x] Serve the approved Klutch Policy Declarations HTML verbatim at its own application route
- [x] Add a Document Generator entry that opens the verbatim policy declarations page
- [x] Verify state application and native browser Print / Save PDF behavior without altering the source layout

## Session 2026-08-12 Denial and Acknowledgment Claim Heading
- [x] Replace the served Policy Declarations source with the corrected approved HTML verbatim
- [x] Add date, claim, loss, vehicle, VIN, driver, and professional reference fields to every Denial and Acknowledgment letter

## Session 2026-08-11 Published Mailroom Verification
- [ ] Verify the published Trigger Now response is valid JSON and its live run completes
- [x] Store and sort by the source received timestamp: Gmail received date or Slack Claims Mail upload date
- [x] Recover missing attachment rows through Slack and Gmail recovery paths
- [x] Re-run AI classification for unresolved items missing summaries or descriptive titles
- [ ] Verify the record drawer displays the stored email body and generated summary
- [x] Extend the Mailroom search bar to find text in subject, summary, email body, and extracted document content
- [ ] Verify live attachment open/download, generated summary, email body, and David Mason search after publishing this checkpoint

## Session 2026-08-11 Assignment Quality and Demand Queue
- [x] Require an unresolved, unreviewed source and successful content capture before Mailroom assignment
- [x] Keep items with unreadable or missing source content in the unassigned review lane rather than auto-assigning them
- [x] Fix the Admin Mailroom Demands card so it opens the populated demand-filtered queue
- [x] Measure the legacy Mailroom content backlog and estimate its completion timeline under the safe refresh throughput (797 items; approximately 159.4 minutes at 25 items per five-minute pass)

## Session 2026-08-11 Mailroom Pagination
- [x] Make the displayed result range update when the rows-per-page selection changes

## Session 2026-08-11 Mailroom Audit and Summary Quality
- [x] Audit all active email, mail, and fax records; resolve any source item already read, reviewed, or checked
- [x] Ensure active Mailroom records represent only unread/unreviewed source mail with complete captured content
- [x] Make the row summary action-oriented, including category, document type, and applicable action such as an attached demand
- [x] Use on-demand parsing updates at the user’s request instead of adding a recurring chat schedule

## Session 2026-08-11 Mailroom Assignment Source Marking
- [x] Mark Gmail claims messages read after a successful Mailroom assignment
- [x] Add the configured checked marker to the originating #claims-mail post after a successful Mailroom assignment

## Session 2026-08-11 Mailroom SLA and Demand Deadlines
- [x] Fix Admin Mailroom Assigned filtering so only records with a real assignee appear
- [x] Define overdue as a missed Mailroom review deadline, not merely an assigned status
- [x] Calculate four business review hours in Tuesday–Friday, 1:00–6:00 PM Eastern for ordinary assigned mail
- [x] Set LOR review deadlines to one business day after assignment
- [x] Store a distinct demand deadline calculated from the demand's stated timing and received date
- [x] Continue demand reminders until the assigned handler records a settled or denied resolution

## Session 2026-08-11 Mailroom Assignment Boundary
- [x] Prevent Mailroom ingest, classification, routing, and reassignments from creating Slack assignment posts
- [x] Preserve Mailroom internal assignment records and existing Slack reviewed-marker behavior
- [x] Verify a live Mailroom processing run creates no Slack assignment messages

## Session 2026-08-11 Mailroom Repairs
- [x] Fix Trigger Now parsing when an upstream endpoint returns HTML instead of JSON
- [x] Correct Slack assignment posts: resolve readable agent mentions, remove/correct the six incorrect posts, and preserve valid links
- [x] Add admin reassignment for individual Mailroom items and post the updated assignment to Slack
- [x] Restrict Slack ingest to unreviewed claims-mail files; record reviewed/checkmarked items as resolved only
- [x] Restore attachment records and proxy access for ingested Slack files
- [x] Persist and render Gmail email bodies in the Mailroom record drawer
- [ ] Verify the deployed Trigger Now run recovers the remaining four legacy Slack items with no attachment records

## Document Generator Letter Corrections
- [x] Remove statute-of-limitations language from every Document Generator letter output
- [x] Correct Coverage Position Letter field mapping so the driver field cannot use the handler/adjuster name
- [x] Render and verify the corrected Coverage Position Letter with distinct driver and handler values
