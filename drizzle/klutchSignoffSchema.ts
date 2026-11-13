import { int, mysqlTable, timestamp, varchar, index, uniqueIndex } from "drizzle-orm/mysql-core";

/** One shared setting, addressed exclusively by id=1. No seed is needed: a
 * read without a row returns Morgan defaults at revision zero without writes. */
export const klutchSignoffSettings = mysqlTable("klutch_signoff_settings", {
  id: int("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  revision: int("revision").notNull(),
  updatedByUserId: int("updated_by_user_id").notNull(),
  updatedByOpenId: varchar("updated_by_open_id", { length: 64 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
/** Application append-only audit; no update/delete operation is exposed. */
export const klutchSignoffEvents = mysqlTable("klutch_signoff_events", {
  id: int("id").primaryKey().autoincrement(),
  fromRevision: int("from_revision").notNull(),
  toRevision: int("to_revision").notNull(),
  previousName: varchar("previous_name", { length: 255 }).notNull(),
  previousTitle: varchar("previous_title", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  actorUserId: int("actor_user_id").notNull(),
  actorOpenId: varchar("actor_open_id", { length: 64 }).notNull(),
  actorName: varchar("actor_name", { length: 255 }).notNull(),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, table => [uniqueIndex("klutch_signoff_events_revision_uq").on(table.toRevision), index("klutch_signoff_events_actor_idx").on(table.actorUserId, table.occurredAt)]);
