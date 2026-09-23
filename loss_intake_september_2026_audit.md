# September 7–11, 2026 Loss Intake Acceptance Audit

**Audit date:** September 22, 2026
**Scope:** A read-only, non-publishing source reconciliation of `#claims`, `#claims-remotemarkets`, and `#escalations`, together with the read-only **All Reported IncidentsStatus** sheet. No Slack digest was posted, no workbook data was written, and the protected Intake publishing toggle remains off.

## Source Coverage and Replay Controls

All three configured Slack sources are readable by the Intake bot. The scheduled path remains cursor-based and capped at 75 thread targets. For historical verification, the source synchronizer now accepts an explicit bounded `oldest`/`latest` window, omits normal open-work backlog targets from that window, and accepts workflow-bot FNOL parent posts. This was verified against Chasten Baker’s `bot_message` parent: the isolated window found, parsed, and updated exactly one source thread with 14 events.

| Source | Materialized September 7–11 rows |
|---|---:|
| `#claims` | 35 |
| `#claims-remotemarkets` | 5 |
| `#escalations` | 10 |
| **Total** | **50** |

## Cohort Reconciliation

The refreshed cohort contains **50 physical rows** and **46 logical loss groups**, so **4 same-group rows were collapsed** for reporting. Six rows carry a stored duplicate marker; two of those link to source history outside the narrow date cohort, which is why the stored marker count is larger than the within-cohort collapse count.

| Measure | Result |
|---|---:|
| Unique logical losses | **46** |
| Duplicate rows collapsed in the cohort | **4** |
| First-contact SLA eligible losses | **35** |
| Within SLA | **33 / 35 (94.3%)** |
| Median business minutes to first contact | **6.35 minutes** |
| In-office SLA eligible | **0** |
| Remote SLA eligible | **35; 33 / 35 (94.3%)** |
| Completed statement/workflow records | **31 / 46** |
| Template-posted records | **30 / 46** |

The in-office denominator is zero because the corrected rule requires a Store Operations source poster, not merely an appointment, generic photos, or attachments in a thread. Accordingly, there is no in-office attainment percentage to report for this historical cohort.

## Required Named-Case Checks

| Check | Result |
|---|---|
| **Gravity Forms exclusion — Thu. Sep. 10** | `#claims` contained **22 parent posts**: **9 structured FNOL notices** were counted and **13 Gravity Forms notifications** were excluded. |
| **Eddie Jones — member 12850, VIN 672938** | **2 stored records**: primary notice at **2026-09-11 14:12:57 UTC / 10:12:57 AM ET** and a duplicate source at 16:48:40 UTC. The primary is complete, filed, and retains the duplicate source link. |
| **Chasten Baker — member 7527** | Reported **2026-09-07 07:36:03 UTC / 3:36:03 AM ET**. As a remote-market record, the clock began at **9:00 AM ET**. First contact was **3:29:27 PM ET**, or **389.46 business minutes**; this exceeded the 240-minute target and is correctly marked breached. |
| **John Montague — member 12144** | Stored report time is **2026-09-11 13:24:12 UTC / 9:24:12 AM ET**, which is within business hours. The clock therefore began at that report time, not at the next opening. This record does not exercise the after-close branch; a true after-close representative remains the appropriate future regression fixture. |
| **Michael Smith — member 10211, VIN 650094** | **The sole eligible unfiled loss.** The record remains unfiled because no same-loss All Reported IncidentsStatus record matched the available source evidence. |
| **Chicago handling** | The materialized Chicago case, Chasten Baker, is assigned to **Carlito Legarde Jr.** |
| **In-office detection** | The system recognizes an in-office arrival only when the Slack source poster is identified as Store Operations. A schedule or vehicle photos alone do not establish arrival. No September 7–11 record met this evidence threshold. |
| **Contina Smith — member 6140** | **Open** (`outreach_started`), not closed. The record has a timely first contact at **2.53 business minutes**, but no terminal completed-statement/workflow event; it remains visible until that evidence exists. |

## Filing Verification

The unfiled list contains exactly **one** eligible entry: **Michael Smith, member 10211, VIN 650094**. A blank Claim File link is never interpreted as absence of a filed claim.

Five independently sampled historical rows that have an All Reported IncidentsStatus match are listed below. Each remains `filed`, not `unfiled`, including records with multiple Tracker rows for the same VIN.

| Member | VIN fragment | Tracker rows for VIN | Result |
|---|---:|---:|---|
| Chiugo Nwofor | 897220 | 5 | Filed |
| Marissa Hayes (source row member field was `11468`) | 515799 | 1 | Filed |
| Jay Dolphin | 120508 | 2 | Filed |
| Olanrewaju Adeshakin-Bankole | 570748 | 1 | Filed |
| Robert Mack | 214582 | 3 | Filed |

## Processor and Quiet-Hours Checks

The later Intake-only refocus removed the Processor queue and its outbound processor digest from this application. The prior processor-post wording test is therefore no longer applicable; the app does not generate a processor instruction that could cause a duplicate member contact.

The Intake Slack publisher is intentionally **disabled**. Thus, no live quiet-hours post was sent during this audit. The deterministic no-change signature behavior remains in code and its regression coverage, while live delivery stays prohibited until the protected publishing control is explicitly enabled.

## Remaining Operational Notes

Eleven logical losses have an `unverified` filing state because the source lacked a usable VIN fragment; they are intentionally excluded from the unfiled list rather than converted into false failures. The bounded historical-replay fix is covered by targeted source-sync tests and does not alter the ordinary scheduled cursor behavior.
