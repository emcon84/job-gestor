/**
 * Database connection (production).
 *
 * Uses postgres.js with the Neon POOLED connection string and Drizzle ORM.
 * This module must only ever be imported from server code (it is marked
 * server-only), because it reads the DB connection string and creates a pool.
 */
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL ?? "";

// postgres.js: disable prepared statements on pooled connections (Neon
// recommends this for serverless pooled connections).
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
