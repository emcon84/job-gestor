#!/usr/bin/env node
/**
 * Build-time migration runner.
 *
 * Runs BEFORE `next build` so that, on Vercel (where DATABASE_URL is set),
 * pending Drizzle migrations are applied and the app is ready as soon as the
 * deploy finishes — no manual post-deploy step.
 *
 * When DATABASE_URL is NOT set (local build without a DB, or a preview without
 * env vars), it skips silently so the build still succeeds.
 *
 * Drizzle migrations are idempotent: already-applied migrations are tracked in
 * the database journal, so running this on every build is safe.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.log("[migrate] DATABASE_URL not set — skipping migrations.");
  process.exit(0);
}

try {
  // postgres.js: prepare:false matches the Neon pooled recommendation; max:1
  // keeps the build-time connection cheap (single migration connection).
  const client = postgres(connectionString, { prepare: false, max: 1 });
  const db = drizzle(client);

  const migrationsFolder = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "drizzle",
  );

  await migrate(db, { migrationsFolder });
  console.log("[migrate] Migrations applied.");
  await client.end();
  process.exit(0);
} catch (err) {
  console.error("[migrate] Migration failed:", err);
  process.exit(1);
}