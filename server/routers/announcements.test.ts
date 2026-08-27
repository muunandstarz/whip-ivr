import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import { appRouter } from '../routers.js';
import type { TrpcContext } from '../_core/context.js';

let conn: mysql.Connection;
let userId: number;
let announcementId: number;

function context(role: 'admin' | 'user'): TrpcContext {
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
      handlerProfileId: null,
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
});

afterAll(async () => {
  if (announcementId) await conn.execute('DELETE FROM dashboard_announcements WHERE id=?', [announcementId]);
  if (userId) await conn.execute('DELETE FROM user_birthday_preferences WHERE user_id=?', [userId]);
  await conn.execute("DELETE FROM users WHERE openId='announcement-test-open-id'");
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
    expect(dashboard.fallback.message).toBeTruthy();
  });

  it('stores only an opt-in month and day for birthday recognition', async () => {
    const user = appRouter.createCaller(context('user'));
    await user.announcements.setBirthdayPreference({ isOptedIn: true, birthMonth: 8, birthDay: 27 });
    expect(await user.announcements.getBirthdayPreference()).toMatchObject({ isOptedIn: true, birthMonth: 8, birthDay: 27 });
    await user.announcements.setBirthdayPreference({ isOptedIn: false });
    expect(await user.announcements.getBirthdayPreference()).toMatchObject({ isOptedIn: false, birthMonth: null, birthDay: null });
  });
});
