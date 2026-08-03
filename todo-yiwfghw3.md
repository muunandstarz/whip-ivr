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

- [ ] Add statute of limitations language (smaller, italicized) above footer on all contact and denial letters
- [ ] Add state/market selector to all form fillers (contact, denial, coverage, settlement tabs)
- [ ] Rebuild General Release — BI tab: exact format from docx, Minor toggle, Limited Liability (GA) toggle, AI language validation
- [ ] Rebuild General Release — PD tab: exact format from docx, carrier-pay toggle (paying carrier vs person), Limited Liability (GA) toggle, AI language validation
- [ ] Add Limited Liability Release — BI as a toggle option on BI release tab (GA claims)
- [x] Rebuild TL Settlement tab (Felsenburg format, AI letter, doc upload): Felsenburg-format letter with settlement table, ACV + document uploads (estimates, tow bills), PDF settlement package output
- [ ] Add LOU Calculator subnav: vehicle type dropdown (Whip standard rates), out-of-service days, daily/weekly/total calc, push-to-demand button
- [ ] Add push-to-demand from LOU calc to Subro Demand Letter builder (pre-fills rental reimbursement field)
- [ ] Carrier Rebuttal: add document upload capability for carrier response documentation
- [ ] PIP Exhaustion: add document upload + AI parse capability (reads uploaded PIP bills/EOR and extracts benefit breakdown)
- [ ] Add PIP Bill Review / CPT Code Reader tab: upload bills, state selector (PA/MD/FL/MA), CPT code review, AI expert summary for applicable vs not-applicable treatment, EOR generation
- [ ] Add Klutch COI tab: correct format, prints correctly
- [ ] Add Whip COI tab: correct format, prints correctly
- [ ] Rebuild Towing Invoice tab: multi-provider dropdown (not just Urgently), per-provider PDF formatting, all providers built in

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
