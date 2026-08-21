CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"pack_threshold_cents" integer DEFAULT 1500000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "client_id" uuid;
--> statement-breakpoint
-- Seed the default client used to backfill all legacy rows (multi-client).
INSERT INTO "clients" ("id","name","slug","pack_threshold_cents","created_at")
VALUES ('00000000-0000-4000-8000-000000000001','Cliente 1','cliente-1',1500000,now());
--> statement-breakpoint
-- Backfill existing (legacy) tasks/services into the default client. The
-- NOT NULL + FK constraints that follow in 0009 must apply AFTER this backfill.
UPDATE "tasks" SET "client_id" = '00000000-0000-4000-8000-000000000001' WHERE "client_id" IS NULL;
--> statement-breakpoint
UPDATE "services" SET "client_id" = '00000000-0000-4000-8000-000000000001' WHERE "client_id" IS NULL;