# Loss Intake Dispatch — Claims Tracker Integration Notes

**Authoritative workbook:** `Liabilty Claims Tracker` (the source filename intentionally uses this spelling), Google Sheets ID `1kh3QUnUBYolTmffRCnO1rGYEIEkSvm8ltLrn_Y0ua8A`.

## Authoritative Matching Rules

The Loss Intake Dispatch specification requires a **last-six VIN** match as the primary cross-system join. Member name is only a fallback when no VIN is available and must produce a human-review warning. Slack thread evidence remains authoritative and fresh: a structured recorded-statement template containing a Snapsheet URL or a formatted Claim ID means **filed**. A missing Claim ID or the literal `Claim ID: ---` means the statement exists but filing is unresolved.

Claims Tracker is corroboration, not proof of a current non-filing. When Slack and the workbook disagree, the Dispatch board must preserve both findings, keep the claim visible for processor review, and clearly state the disagreement. In particular, absence from a monthly `Liab Dash` snapshot cannot be treated as evidence that a recently filed claim is unfiled.

## Relevant Tabs and Current Header Shapes

| Tab | Key columns | Use in Dispatch |
|---|---|---|
| `Raw Data from SS'` | `Claim Number`, `LAST 6` | Positive row-level corroboration that a VIN has a claim in Snapsheet export data. |
| Latest `Liab Dash <MMDD>` | `Claim`, `Member`, `Claim Status`, `PU Location`, `Date of Loss` | Supporting historical snapshot only; absence is non-dispositive. |
| `Liability Review` | Column B `SNAPSHEET CLAIM #`, column C `Claim # (Last 6 of VIN)`, column D `Member Name`, column T `Status` | Positive filed/unfiled corroboration; `Not on Snapsheet` is a lagging human-maintained signal. Column A contains a stray value, so it must not be treated as a header. |
| `Pending Intakes` | `NAME`, `VIN`, `Added to Snapsheet` | Explicit filed-state corroboration. |

## Dispatch Outputs

The integration is read-only. It must not alter any Google Sheet. Dispatch uses corroboration to enrich the `filingEvidence` field and to flag disagreements for processors. It must not activate Slack publishing or scheduler jobs by itself.

## Source

- `/home/ubuntu/upload/Loss_Intake_Dispatch_Spec.md`, sections 2, 3, and 5.
- Read-only Google Sheets inspection on 2026-09-14 of the workbook and the `Pending Intakes` and `Liability Review` headers.
