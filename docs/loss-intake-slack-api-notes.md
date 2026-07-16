# Loss Intake Slack API implementation notes

Authoritative sources:

- https://docs.slack.dev/reference/methods/conversations.history
- https://docs.slack.dev/reference/methods/conversations.replies
- https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps
- https://docs.slack.dev/apis/web-api/rate-limits

`conversations.history` and `conversations.replies` are HTTP GET methods authenticated with a Bearer token. The required history scope is based on channel type: `channels:history` for public channels and `groups:history` for private channels. Bot tokens can access conversations where the bot is a member.

Both methods support cursor pagination through `response_metadata.next_cursor`. History also supports incremental polling using the `oldest` Slack timestamp. Thread replies require both `channel` and the parent message `ts`; replies are returned earliest-first while history returns recent messages first.

Slack returns HTTP 429 with a `Retry-After` header when a method is rate-limited. The client must honor that value rather than retrying immediately.

Internal customer-built Slack apps retain Tier 3 limits for these methods, currently documented as 50+ requests per minute and up to 1,000 objects. Newly installed commercially distributed non-Marketplace apps are limited to one request per minute and 15 objects per request. Whip IVR should therefore be installed as an internal customer-built app, use cursor pagination, keep requests sequential, and retain conservative request pacing.

The deployed app cannot reuse the Manus Slack connector authorization directly: the connector exposes Slack operations but no raw deployable token or environment variable. The Whip IVR server integration must receive its own `SLACK_BOT_TOKEN` secret. The repository integration also cannot read GitHub Actions secrets with the current authorization, so no existing token could be recovered there.

## Authenticated Slack app administration findings (2026-07-15)

Source: https://api.slack.com/apps and https://api.slack.com/apps/A0ANRTEUV52

The DriveWhip workspace currently exposes four internal, non-distributed Slack apps: Whip Claims Mail Bot, Whip Member App, SheetNotifier, and Whip Claims Hub. The existing **Whip Claims Hub** app (`A0ANRTEUV52`) was created March 24, 2026 and is described as moving member agreements to claim files. It has zero authed users on its basic-information page. Because its stated purpose differs from Loss Intake monitoring, its current OAuth scopes and installation state must be inspected before deciding whether reuse is safe; no secret value was copied or recorded.

## Verified workspace installation and channel visibility (2026-07-16)

The dedicated internal app **Whip Loss Intake Monitor** was created and installed in the DriveWhip workspace with bot scopes `channels:history`, `groups:history`, and `users:read`. Its bot token authenticated successfully with `auth.test`. Direct `conversations.history` calls to both approved source IDs returned `not_in_channel`, confirming that installation succeeded but channel membership remains required.

The authorized Slack directory identified both approved sources as public channels: `CHWRXH4HK` is `#claims`, and `C092UPKR79D` is `#claims-remotemarkets`. Because both are public, the least-privilege completion path is to add the `channels:join` bot scope, reinstall the internal app with confirmation, and call `conversations.join` for each approved channel. No private-channel invitation workflow is required.

## Slack app reinstallation completed

On 2026-07-16, the internal **Whip Loss Intake Monitor** app (`A0BHDG7RX7D`) was reinstalled successfully in the DriveWhip workspace with exactly four bot scopes: `channels:history`, `channels:join`, `groups:history`, and `users:read`. Slack confirmed installation success and issued a workspace bot token. The credential remains outside source control in a restricted temporary secret file pending transfer to the live Whip IVR deployment secret store.

The two user-approved public channel memberships to complete are `CHWRXH4HK` (`#claims`) and `C092UPKR79D` (`#claims-remotemarkets`). No message-posting scopes are present.
