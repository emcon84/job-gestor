CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"default_cost_ars" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Seed the default service used to backfill legacy tasks without an assignment.
INSERT INTO "services" ("name", "default_cost_ars")
VALUES ('servicio por defecto', 0);
--> statement-breakpoint
-- Add the service_id column as nullable first so existing rows can be backfilled.
ALTER TABLE "tasks" ADD COLUMN "service_id" uuid;
--> statement-breakpoint
-- Backfill existing (legacy) tasks: assign the default service and, where the
-- amount was previously unset (NULL), fill it from the default service cost (0).
UPDATE "tasks"
SET "service_id" = (SELECT "id" FROM "services" WHERE "name" = 'servicio por defecto' LIMIT 1),
    "amount_ars" = COALESCE("amount_ars", 0)
WHERE "service_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "amount_ars" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "service_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;
