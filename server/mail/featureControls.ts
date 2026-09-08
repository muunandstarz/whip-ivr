import type mysql from "mysql2/promise";

export const MAILROOM_FEATURE_SETTING = "mailroom_feature_enabled";
export const MAILBOT_FEATURE_SETTING = "mailbot_feature_enabled";

export type MailFeatureControls = {
  mailroomEnabled: boolean;
  mailBotEnabled: boolean;
};

/**
 * A missing value intentionally preserves historical behavior until an admin
 * explicitly changes the feature setting. Only clear false/off values disable
 * a feature.
 */
export function isFeatureSettingEnabled(value: string | null | undefined): boolean {
  return !["false", "0", "off", "disabled"].includes(String(value ?? "true").trim().toLowerCase());
}

export function mapMailFeatureControls(rows: Array<{ key: string; value: string }>): MailFeatureControls {
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return {
    mailroomEnabled: isFeatureSettingEnabled(values.get(MAILROOM_FEATURE_SETTING)),
    mailBotEnabled: isFeatureSettingEnabled(values.get(MAILBOT_FEATURE_SETTING)),
  };
}

export async function isMailroomFeatureEnabled(conn: Pick<mysql.Connection, "execute">): Promise<boolean> {
  const [rows] = await conn.execute<any[]>(
    "SELECT value FROM mail_settings WHERE `key` = ? LIMIT 1",
    [MAILROOM_FEATURE_SETTING],
  );
  return isFeatureSettingEnabled(rows[0]?.value);
}
