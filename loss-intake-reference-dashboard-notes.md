# Referenced Intake QA Dashboard Structure

Source task: `ILyXFnwnUEWJjWZE2yKtyc` — *Can We Give Awards and Note Opportunities Here?* The user identified this completed Intake QA Dashboard as the structure that the Whip IVR Loss Intake replacement must follow, rather than the provisional Dispatch tab layout.

The reference dashboard uses two purposeful audiences. The **Leadership** workspace contains a Weekly Brief, Team Performance, Reports & Trends, and Methodology. The **Intake Team** workspace contains My Results, What I Need to Fix, and My Feedback. Each workspace explains the measure, shows evidence, and leads to an action instead of presenting only a generic queue.

## Leadership structure to reproduce with live Whip data

| View | Required structure |
|---|---|
| Weekly Brief | Executive readout, five concise metric cards, separate in-office and remote SLA treatment, leadership decisions, and a copyable management summary. |
| Team Performance | Context banner explaining the shared pull queue; handler comparison table for volume, SLA, recorded statements, and templates; action/review control; market-context and interpretation cards. |
| Reports & Trends | Headline/evidence/owner strip; completed-vs-gap view; a clearly labeled trend baseline; an appendix that keeps definitions beside the metrics. |
| Methodology | Business-hours clock, in-office/remote standards, after-hours treatment, duplicate collapse, and correct handler-comparison guidance. |

## Intake Team structure to reproduce with live Whip data

| View | Required structure |
|---|---|
| My Results | Personal scorecard with SLA, statement, and template metrics; a short *Keep doing / Fix next / Do this every time* coaching frame; appropriate closeout checklist. |
| What I Need to Fix | Priority-filtered, evidence-based exception cards with source-thread links, clear recommended action, and a review acknowledgement. |
| My Feedback | Manager-reviewed QA feedback only, acknowledgement state, and a transparent explanation of how feedback is produced. |

## Dispatch-specific additions

The Loss Intake Dispatch specification remains authoritative for operational work: separate unfiled-claims and shared intake-follow-up queues, four Slack sources, identity-based duplicate collapse, business-hour SLA, on-site priority, Slack thread links, and distinct processor/intake outputs. These should be embedded as operational modules within the Leadership and Intake Team structure—not replace the scorecard/QA information architecture.

The reference was sourced from the user-authorized task replay and its `Home.tsx` dashboard artifact. The associated standalone project is intentionally not edited; this file records its structure for migration into `/home/ubuntu/whip-ivr`.
