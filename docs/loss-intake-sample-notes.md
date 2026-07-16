# Loss Intake Slack Sample Findings

The confirmed `#claims` channel contains two relevant FNOL parent-message forms: app-authored Gas/Tesla First Notice of Loss posts and equivalent manually authored posts. Gravity Forms accident-report alerts are unrelated and must not be ingested.

Relevant FNOL parents consistently contain labeled sections for Market, Vehicle Type, Last 6 of VIN, Member Name/Customer ID, date/time and location of loss, and Rideshare Status. Tesla posts also include USB and footage questions. Member/customer formatting varies substantially, including `Name 1234`, `#1234, Name`, `Name #1234`, `1234, Name`, and name-only values. Vehicle classification must trust the labeled Vehicle Type value rather than the posting app name because a Gas app post can still identify the vehicle as Tesla.

Photo evidence is represented by parent-message file attachments. Image and video files both count as attached evidence, and attachment count must be stored. Thread replies, not parent reactions, carry acknowledgment, attempt, completion, and quality evidence.

The parser should classify a parent as FNOL only when the labeled Market, Vehicle Type, and Member Name/Customer ID sections are present. It should ignore generic accident-report messages and other channel conversation.

A representative Tesla thread shows that the qualifying rep acknowledgment can be a short phrase such as `calling the member now`. A later structured reply contains Facts of Loss, TNC Status, Preliminary Liability, and Claim ID labels. Tesla footage-request evidence may be phrased as `check if we have footage of the accident`; subsequent non-rep replies such as `Checking footage` or `no footage` are supporting evidence but do not replace the requirement that the intake rep requested footage. Completion must still be keyed to the explicit `good to go` phrase rather than inferred from a structured facts reply alone.

The first-contact detector must limit candidates to the configured intake agents and should recognize intent phrases such as `calling`, `contacting`, `reaching out`, and `spoke with`, while excluding unrelated replies by other operations users. Structured extraction should scan all replies up to and including the authoritative completion event because facts may be posted before the final completion signal.
