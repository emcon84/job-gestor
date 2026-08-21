/**
 * Drizzle schema for job-gestor.
 *
 * Production persistence is PostgreSQL via Neon. Only current editable state is
 * stored — there is deliberately NO audit/history table, and currency is fixed
 * to ARS (no currency column). Amount is stored as integer cents.
 */
import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  packThresholdCents: integer("pack_threshold_cents").notNull().default(1500000),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  defaultCostArs: integer("default_cost_ars").notNull(), // cents
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  area: text("area").notNull(),
  priority: text("priority", {
    enum: ["low", "medium", "high", "urgent"],
  })
    .notNull()
    .default("medium"),
  status: text("status", {
    enum: ["pending", "in_progress", "revision", "done"],
  })
    .notNull()
    .default("pending"),
  clientMoveCount: integer("client_move_count").notNull().default(0),
  amountArs: integer("amount_ars").notNull(), // cents, auto-filled from service
  paymentState: text("payment_state", { enum: ["paid", "pending"] }),
  paymentDueDate: timestamp("payment_due_date", { withTimezone: true }),
  serviceId: uuid("service_id").references(() => services.id),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  author: text("author", { enum: ["client", "owner"] }).notNull(),
  // Client-provided display name. Nullable so pre-existing rows stay valid;
  // the UI falls back to "Cliente"/"Propietario" when absent.
  authorName: text("author_name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Browser Web Push subscriptions (endpoint + encryption keys). One row per
 * device/browser that opted in on the shared portal. Upserted by endpoint so
 * re-subscribing with the same push service never duplicates a row.
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type AttachmentRow = typeof attachments.$inferSelect;
export type NewAttachmentRow = typeof attachments.$inferInsert;
export type CommentRow = typeof comments.$inferSelect;
export type NewCommentRow = typeof comments.$inferInsert;
export type ServiceRow = typeof services.$inferSelect;
export type NewServiceRow = typeof services.$inferInsert;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;
export type ClientRow = typeof clients.$inferSelect;
export type NewClientRow = typeof clients.$inferInsert;
