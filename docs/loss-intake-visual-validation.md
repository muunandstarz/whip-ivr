# Loss Intake visual validation

## 2026-07-16 authenticated desktop check

The key-protected development-only administrator session loaded successfully after aligning the isolated preview database. The native Whip sidebar renders the new **Loss Intake** entry for the administrator role and the page shows the expected team-view header, date filters, four tabs, six KPI cards, team performance panel, stage distribution, and recent FNOL activity empty state.

The empty state is appropriate before the first authorized Slack synchronization: metrics use zero or em-dash values rather than fabricated claims. The page remains within the native Whip shell and preserves the global **View As** control.

A pre-existing Whip onboarding tour opened automatically and visually dimmed the page; it must be dismissed before checking tab interactions, settings controls, and responsive behavior. The global Aircall widget is also present and unrelated to Loss Intake.
## Desktop interaction checks

After dismissing the pre-existing onboarding tour, the overview is unobstructed and uses the available page width cleanly. KPI cards and the lower two-column layout align consistently, and the native sidebar highlights **Loss Intake**.

The **Claims** tab renders a responsive filter row with member/customer/market search plus stage, SLA, and vehicle filters. With no synchronized claims, it shows a clear zero count and a centered non-fabricated empty state. No client error appeared during the tab transition.
## QA and administrator settings checks

The **QA inbox** opens cleanly and presents a supervisor-specific heading with an explicit empty state explaining that QA drafts will be created from scored FNOL claims after synchronization.

The administrator-only **Sync & settings** tab exposes the expected operational controls: manual synchronization, five-minute schedule enable/pause actions, current health status, configurable first-contact SLA, at-risk threshold, QA due window, and Slack-member-to-handler identity mappings. The page explains that only mapped representatives can start the SLA clock or satisfy workflow milestones. Defaults render as 10-minute SLA, 7-minute at-risk threshold, and 24-hour QA due window. No secret values are shown in the client.
## Responsive validation method

The managed interactive browser ignored `window.resizeTo`, retaining its desktop viewport. Mobile verification will therefore use a fresh headless Chromium profile at a fixed 390×844 viewport, entering through the same ephemeral development-only session route. This keeps the test authenticated without modifying production authentication or installing another dependency.
## Mobile viewport check (390×844)

A fresh authenticated 390×844 Chromium session confirms the Loss Intake page adapts to the native mobile shell: the sidebar collapses to the existing hamburger header, title and team-view badge remain readable, the date range becomes a two-column control row, and all four tabs wrap into a compact two-row tab bar without horizontal overflow. KPI cards become a single readable column with preserved icon, label, value, and helper-text hierarchy.

The fixed preview notice and existing softphone control occupy the bottom edge but do not obscure the active KPI card content. The pre-existing Whip logo image did not load in the fresh headless profile, while its text label remained visible; this appears global to the existing shell rather than Loss Intake-specific.
