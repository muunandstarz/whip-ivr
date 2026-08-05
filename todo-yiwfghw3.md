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
- [ ] LOU Calculator: persist state to sessionStorage so navigating away and back restores all fields
- [x] LOU Calculator: persist state to sessionStorage so navigating away and back restores all fields
- [x] LOU Calculator: replace VEHICLE_CLASSES/MARKETS/STANDARD_RATES with tRPC market-specific pricing (lou.getMarketPricing)
- [x] LOU Calculator: use real utilization data from tRPC lou.getUtilRows
- [x] LOU Calculator: add VIN decoder button to auto-fill Year/Make/Model/Trim
- [x] Subro Demand: add VIN decoder button (NHTSA API) to auto-fill Year/Make/Model/Trim
- [x] Subro Demand: change attachments from free text to multi-select checkboxes
- [x] Subro Demand: add handler dropdown (Tim Chan + Daniel Giono first) to letter
- [ ] Subro Demand: fix PDF generation to use structured sections not wrapText(preview)
- [x] Carrier Rebuttal: add separate upload slots for our estimate, image report, and carrier rebuttal
- [x] Tow Bill: add Dark Angel Towing (Chicago) and Bar Recovery LLC (Atlanta) from KB TOW_PARTNERS
- [x] Handler dropdown: add to all letter tabs that currently have a free-text handler/adjuster name field
- [x] Payment Receipt: add total_recon purpose (Total Recon — Repair Payment)
- [ ] COI: make KlutchCOI state selectable (MD, GA, VA, PA, MA, IL, FL, TX)
- [ ] DocGen: remove cert-of-coverage tab (redundant)
- [ ] DocGen: sync Empower denial templates from original KB
- [ ] DocGen: remove carrier/subrogee from BI release, fix preview
- [ ] TL Settlement: rename from Felsenburg, match reference letter format exactly
