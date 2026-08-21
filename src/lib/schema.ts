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

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  defaultCostArs: integer("default_cost_ars").notNull(), // cents
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
  amountArs: integer("amount_ars").notNull(), // cents, auto-filled from service
  paymentState: text("payment_state", { enum: ["paid", "pending"] }),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => services.id),
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
