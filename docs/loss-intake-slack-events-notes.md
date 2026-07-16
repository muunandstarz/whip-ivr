# Slack Events API implementation notes

Sources reviewed July 16, 2026:

- Slack Events API: https://docs.slack.dev/apis/events-api/
- Verifying requests from Slack: https://docs.slack.dev/authentication/verifying-requests-from-slack/

Slack supports public HTTP event delivery and retries failed deliveries. An app must subscribe to the desired bot events and will receive events only for conversations the bot can see. `message.channels` covers public-channel messages; `message.groups` covers private-channel messages. Event callbacks arrive as JSON envelopes containing `type`, `team_id`, `api_app_id`, a globally unique `event_id`, `event_time`, and an inner `event`. URL configuration sends a `url_verification` payload whose `challenge` must be echoed.

Authenticity must be verified with the app signing secret, not the deprecated verification token. Verification uses the raw request body and headers `X-Slack-Request-Timestamp` and `X-Slack-Signature`. Reject timestamps more than five minutes from server time. Compute `v0=` plus the hex HMAC-SHA256 of `v0:{timestamp}:{rawBody}` using the signing secret, and compare with a timing-safe equality operation. Signature verification must occur before JSON body parsing. Event processing must be retry-safe by using Slack's globally unique `event_id` and should acknowledge quickly.

The Whip endpoint must additionally enforce workspace `TFFUXNU57`, app `A0BHDG7RX7D`, and approved channel IDs `CHWRXH4HK` and `C092UPKR79D`. It must ignore bot-generated or unsupported message subtypes and never accept client-provided role scope or handler assignments without applying server-side configuration.

## Slack app configuration state (July 16, 2026)

The authenticated app admin at https://api.slack.com/apps/A0BHDG7RX7D/general confirms app ID `A0BHDG7RX7D`, app name **Whip Loss Intake Monitor**, and workspace `TFFUXNU57` (DriveWhip). The Signing Secret was retrieved and stored in an owner-only (`0600`) sandbox secret file; its value is intentionally omitted from documentation and source control.

The authenticated Event Subscriptions page at https://api.slack.com/apps/A0BHDG7RX7D/event-subscriptions currently shows **Enable Events: Off**. No request URL or bot event subscriptions are active yet. Enabling and saving this page is a sensitive external configuration change and must occur only after the production Whip IVR endpoint, database migration, and server secrets are ready, followed by an explicit confirmation immediately before save.
