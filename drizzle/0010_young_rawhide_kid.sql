-- Fix the pack threshold that was seeded/defaulted as $15.000 (1.500.000 cents)
-- instead of $150.000 (15.000.000 cents). Correct every client still holding
-- the wrong seeded value; the ALTER below sets the correct default for new rows.
UPDATE "clients" SET "pack_threshold_cents" = 15000000 WHERE "pack_threshold_cents" = 1500000;
--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "pack_threshold_cents" SET DEFAULT 15000000;