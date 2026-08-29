ALTER TABLE "clients" ADD COLUMN "portal_message" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "show_pack_progress" boolean DEFAULT true NOT NULL;