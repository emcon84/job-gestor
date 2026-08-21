/**
 * Repository factory.
 *
 * Selects the task repository implementation based on environment:
 *  - `DATABASE_URL` present  -> PostgresRepository (production, Neon + Drizzle)
 *  - otherwise                -> MemoryRepository (local dev / tests, no DB)
 *
 * Server actions and pages call `await getRepository()`. The Postgres
 * implementation (and its DB connection) is only loaded via dynamic import
 * when a real database is configured, keeping local dev and tests DB-free.
 */
import type { Repository } from "./repository";
import { MemoryRepository } from "./repositories/memory-repository";

let memoryRepo: MemoryRepository | null = null;

export async function getRepository(): Promise<Repository> {
  if (process.env.DATABASE_URL) {
    const { PostgresRepository } = await import(
      "./repositories/postgres-repository"
    );
    return new PostgresRepository();
  }
  if (!memoryRepo) {
    memoryRepo = new MemoryRepository();
  }
  return memoryRepo;
}
