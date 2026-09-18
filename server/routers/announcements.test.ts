import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import { appRouter } from '../routers.js';
import type { TrpcContext } from '../_core/context.js';

let conn: mysql.Connection;
let userId: number;
let announcementId: number;
let previewHandlerId: number;
let previewUserId: number;

function context(role: 'admin' | 'user', handlerProfileId: number | null = null): TrpcContext {
  return {
    req: { protocol: 'https', headers: {} } as TrpcContext['req'],
    res: {} as TrpcContext['res'],
    user: {
      id: userId,
      openId: 'announcement-test-open-id',
      name: 'Announcement Test User',
      email: 'announcement-test@example.com',
      loginMethod: 'manus',
      role,
      handlerProfileId,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
  };
}

beforeAll(async () => {
  conn = await mysql.createConnection(process.env.DATABASE_URL!);
  await conn.execute("DELETE FROM users WHERE openId='announcement-test-open-id'");
  const [result] = await conn.execute<any>(
    "INSERT INTO users (openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn) VALUES (?, ?, ?, 'manus', 'user', NOW(), NOW(), NOW())",
    ['announcement-test-open-id', 'Announcement Test User', 'announcement-test@example.com'],
  );
  userId = result.insertId;
  const [previewHandler] = await conn.execute<any>(
    "INSERT INTO handlers (name, email, role, active, createdAt) VALUES (?, ?, 'Claim Handler', 1, NOW())",
    ['Announcement Preview Handler', 'announcement-preview@example.com'],
  );
  previewHandlerId = previewHandler.insertId;
  const [previewUser] = await conn.execute<any>(
    "INSERT INTO users (openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn) VALUES (?, ?, ?, 'manus', 'user', NOW(), NOW(), NOW())",
    ['announcement-preview-open-id', 'Announcement Preview Handler', 'announcement-preview@example.com'],
  );
  previewUserId = previewUser.insertId;
  await conn.execute(
    'INSERT INTO user_birthday_preferences (user_id, birth_month, birth_day, is_opted_in, created_at, updated_at) VALUES (?, 9, 22, 1, NOW(), NOW())',
    [previewUserId],
  );
});

afterAll(async () => {
  if (announcementId) await conn.execute('DELETE FROM dashboard_announcements WHERE id=?', [announcementId]);
  if (userId) await conn.execute('DELETE FROM user_birthday_preferences WHERE user_id=?', [userId]);
  if (previewUserId) await conn.execute('DELETE FROM user_birthday_preferences WHERE user_id=?', [previewUserId]);
  await conn.execute("DELETE FROM users WHERE openId='announcement-test-open-id'");
  await conn.execute("DELETE FROM users WHERE openId='announcement-preview-open-id'");
  if (previewHandlerId) await conn.execute('DELETE FROM handlers WHERE id=?', [previewHandlerId]);
  await conn.end();
});

describe('dashboard announcements', () => {
  it('creates and returns an active admin-authored feature announcement', async () => {
    const admin = appRouter.createCaller(context('admin'));
    const saved = await admin.announcements.save({
      title: 'Test Claims Workspace',
      message: 'A verified announcement used only by automated tests.',
      kind: 'feature',
      actionLabel: 'Open workspace',
      actionHref: '/claims-workspace',
      isActive: true,
    });
    announcementId = saved.id;
    const user = appRouter.createCaller(context('user'));
    const dashboard = await user.announcements.getDashboardMessage();
    expect(dashboard.announcement).toMatchObject({ id: announcementId, kind: 'feature', actionHref: '/claims-workspace' });
    expect(new Date(dashboard.announcement!.endsAt!).getTime() - new Date(dashboard.announcement!.startsAt!).getTime()).toBe(48 * 60 * 60 * 1000);
    expect(dashboard.fallback.message).toBeTruthy();
  });

  it('stores only an opt-in month and day for birthday recognition', async () => {
    const user = appRouter.createCaller(context('user'));
    await user.announcements.setBirthdayPreference({ isOptedIn: true, birthMonth: 8, birthDay: 27 });
    expect((await user.announcements.getBirthdayPreference()).preference).toMatchObject({ isOptedIn: true, birthMonth: 8, birthDay: 27 });
    await user.announcements.setBirthdayPreference({ isOptedIn: false });
    expect((await user.announcements.getBirthdayPreference()).preference).toMatchObject({ isOptedIn: false, birthMonth: null, birthDay: null });
  });

  it('uses the impersonated handler for banner greeting and birthday-preview state without granting admin controls', async () => {
    const adminPreview = appRouter.createCaller(context('admin', previewHandlerId));
    const dashboard = await adminPreview.announcements.getDashboardMessage({ previewHandlerId });
    const preference = await adminPreview.announcements.getBirthdayPreference({ previewHandlerId });
    expect(dashboard.viewer).toEqual({ name: 'Announcement Preview Handler', isHandlerPreview: true });
    expect(preference.viewer).toEqual({ name: 'Announcement Preview Handler', isHandlerPreview: true });
    expect(preference.preference).toMatchObject({ isOptedIn: true, birthMonth: 9, birthDay: 22 });
  });
});
