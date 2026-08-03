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
