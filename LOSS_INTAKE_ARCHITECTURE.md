# Loss Intake Integration Architecture

## Product Structure

Loss Intake is a native Whip IVR module. It shares the existing OAuth session, `users.role`, `users.handlerProfileId`, administrator impersonation model, sidebar, theme modes, tRPC API layer, Drizzle database, and managed deployment.

| Route | Administrator | Intake rep |
| --- | --- | --- |
| `/loss-intake` | Team-wide live operation, breach queue, workload, sync health | Personal live queue and SLA countdowns only |
| `/loss-intake/claims` | Every claim with team-wide filters | Claims assigned to the signed-in rep only |
| `/loss-intake/claims/:id` | Full claim timeline, evidence, quality rubric, QA actions | Accessible only for claims assigned to the signed-in rep |
| `/loss-intake/performance` | Ana/Bennett/Carlito comparison and team trends | Personal metrics and trends only |
| `/loss-intake/qa` | Draft/review/send queue plus delivery status | Private inbox of QAs sent to the signed-in rep |
| `/loss-intake/reports` | Weekly/monthly team reporting | Not available |
| `/loss-intake/settings` | Channels, SLA, assignments, scoring, QA deadlines, sync controls | Not available |

## Identity and Access

The existing `handlerProfileId` is the binding between a signed-in user and a tracked Loss Intake rep. Ana, Bennett, and Carlito are represented as handler records. All rep-facing queries derive the effective handler ID on the server from the authenticated session; clients cannot request another rep's private data. Administrators may request team-wide data and use the existing View As context for UI preview, while server mutations that alter claims, QA, settings, or synchronization require `role = admin`.

## Claim Lifecycle

| Stage | Trigger | Recorded metrics |
| --- | --- | --- |
| Posted | FNOL parent message in either approved Slack channel | Post time, source, market, member, vehicle type, photos |
| Awaiting outreach | No qualifying tracked-agent reply yet | Live time elapsed and SLA state |
| Outreach started | First tracked-agent reply expressing active outreach | First-contact time, assigned rep, SLA minutes, compliance |
| Contact attempts | Thread replies documenting no-answer/voicemail/retries | Attempt count, last attempt, follow-up status |
| Intake complete | Tracked-agent reply contains authoritative phrase `good to go` | Completion time, cycle time, extracted fields |
| QA ready | Completed claim receives deterministic rubric evaluation | Score, missing elements, evidence |
| QA sent | Administrator reviews and sends feedback | Sent/opened/acknowledged/resolved timestamps |

The first-contact SLA is 10 minutes from the Slack parent-message timestamp. `at risk` begins at 7 minutes by default. Completion is never inferred without the phrase `good to go`.

## Quality Rubric

| Criterion | Applicability | Default weight |
| --- | --- | ---: |
| Facts of loss present | All claims | 25 |
| Preliminary liability present | All claims | 20 |
| Rideshare status present, including explicit unknown/not applicable | All claims | 15 |
| Photos attached to the FNOL or documented | All claims | 15 |
| No-answer attempts documented correctly | Claims with unsuccessful contact | 15 |
| Tesla footage request documented | EV/Tesla only | 10 |

Inapplicable criteria are removed from the denominator. Every criterion stores pass/fail/not-applicable, evidence text, source Slack timestamp, and coaching note.

## Daily QA Workflow

The system drafts a QA from the deterministic rubric and claim evidence. An administrator reviews it, edits strengths, coaching opportunities, and manager comments, and explicitly selects **Send to Rep**. The rep receives it in a private inbox and can open, acknowledge, and optionally respond. The system records `draftedAt`, `reviewedAt`, `sentAt`, `openedAt`, `acknowledgedAt`, `resolvedAt`, and the administrator responsible for each transition.

## Synchronization

A project-level Heartbeat invokes `/api/scheduled/loss-intake-sync` every five minutes. The handler authenticates scheduled callers, reads both approved Slack channels, upserts parent messages and thread events idempotently, recalculates lifecycle and quality data, records run health, and returns within the platform timeout. No in-process timers are used.

Slack message extraction uses deterministic parsing for authoritative signals and a structured language-model fallback only for variable fields such as market, member identity, vehicle type, facts of loss, preliminary liability, and rideshare status. The `good to go` completion phrase, channel allowlist, tracked agents, and SLA boundaries remain deterministic.

## Core Data Models

The module uses separate tables for `loss_intake_claims`, `loss_intake_events`, `loss_intake_quality_items`, `loss_intake_qas`, `loss_intake_settings`, and `loss_intake_sync_runs`. Slack channel ID plus parent message timestamp is the immutable claim key; Slack channel ID plus event timestamp is the immutable thread-event key.
