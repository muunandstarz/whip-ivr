# Build Context — Jul 21 2026

## Team Assignments (from LossIntakeGuide)
- **Bennet Carlos**: Glen Burnie FNOLs + Atlanta FNOLs (in-store, #claims channel)
- **Carlito Legarde Jr**: Rockville FNOLs + Chicago FNOLs (in-store, #claims channel)
- **Ana Padilla**: All Remote Markets FNOLs (#claims-remotemarkets) + in-store overflow (#claims)

## DB Data Summary (as of Jul 21 2026)
All data is in #claims channel (no claims-remotemarkets entries yet in DB).
- Ana Padilla: 28 threads total, 1 completed (3.6%), 19 SLA breaches, avg first contact 691.7 min
- Bennet Carlos: 54 threads total, 34 completed (63%), 26 SLA breaches, avg first contact 465.3 min
- Carlito Legarde Jr: 17 threads total, 12 completed (71%), 6 SLA breaches, avg first contact 290 min

## New tRPC Endpoints Added
- `trpc.lossIntake.repComparison` — period: today|week|month|ytd → RepPeriodStats[]
- `trpc.lossIntake.handlerStats` — agentName: string → { week, month, ytd: RepPeriodStats }

## RepPeriodStats interface
```ts
{
  agentName: string;
  assignment: string;
  total: number;
  completed: number;
  completionPct: number;
  awaiting: number;
  inOutreach: number;
  slaBreaches: number;
  avgFirstContactMin: number | null;
  totalAttempts: number;
  instoreTotal: number;
  remoteTotal: number;
}
```

## LossIntake.tsx Tab Structure
- Tabs: today | overview | claims | qa | settings (admin only)
- Team comparison tab needs to be added between today and overview
- Tab trigger location: line 379-383
- Today tab content ends at line 533
- Overview tab content starts at line 535

## HandlerDashboard.tsx
- File: client/src/pages/HandlerDashboard.tsx
- Has a Loss Intake snapshot section (added Jul 20)
- Needs week/month/YTD toggle with real data from handlerStats endpoint
- Each rep only sees their own metrics

## Key Files
- server/lossIntakeDb.ts — DB helpers (getRepComparisonMetrics, getHandlerLossIntakeStats added)
- server/routers/lossIntake.ts — tRPC router (repComparison, handlerStats endpoints added)
- client/src/pages/LossIntake.tsx — main Loss Intake page
- client/src/pages/HandlerDashboard.tsx — individual handler dashboard
