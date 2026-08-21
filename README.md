# job-gestor

Single-client task/job manager for freelance IT work. A client submits maintenance
tasks (title, description, area, priority, image attachments) via a shared link
and follows their status; the owner manages status, ARS amount, and payment state
on a passphrase-protected kanban board.

## Stack

- **Next.js 15** (App Router) + **TypeScript**
- **Tailwind CSS v4** (CSS-first dark theme)
- **Neon Postgres** + **Drizzle ORM** (`postgres.js` driver, pooled connection)
- **Vercel Blob** for image attachments (images only, 10MB cap)
- **Server Actions** + native forms
- **Vitest** + **React Testing Library** for tests

## Local development

```bash
npm install
cp .env.example .env   # then fill in real values (or leave DATABASE_URL unset)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Dev fallback (no database needed)

If `DATABASE_URL` is **not** set, the app uses an in-memory repository so the UI,
server actions, and tests run entirely locally with no Postgres or Blob. Data is
lost on restart. This is the default for local dev and `npm test`.

Set `DATABASE_URL` (pooled Neon URL) to use the real Postgres path via Drizzle.

## Running tests

```bash
npm test            # run once (Vitest)
npm run test:watch  # watch mode
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
```

Tests cover: ARS formatting (es-AR `AR$ 1.234,56`), pesos→cents parsing,
passphrase comparison + rate limiting, kanban grouping, and task state
transitions (create / move status / amount+payment edit / delete). All tests run
against the in-memory repository — no live network or database required.

## Database migrations

The schema lives in `src/lib/schema.ts`. Generate and apply migrations:

```bash
npm run db:generate   # produce a new migration in ./drizzle
npm run db:migrate    # apply pending migrations (requires DATABASE_URL)
```

Migrations are committed so the Neon DB can be recreated from scratch.

## Deploying to Vercel

1. Push the repo to GitHub and import it into Vercel (or `vercel deploy`).
2. Create a **Neon** Postgres database and a **Vercel Blob** store.
3. Set these environment variables in Vercel → Project → Settings → Environment:

| Variable               | Required | Notes                                                          |
| ---------------------- | -------- | -------------------------------------------------------------- |
| `DATABASE_URL`         | Yes      | Neon **pooled** connection string (`?sslmode=require`)         |
| `OWNER_PASSPHRASE`     | Yes      | Secret passphrase to unlock the owner panel (httpOnly cookie)  |
| `BLOB_READ_WRITE_TOKEN`| Yes      | Vercel Blob read/write token (client upload tokens)            |
| `APP_URL`              | Optional | Public origin of the app                                       |

4. Run `npm run db:migrate` against the fresh Neon DB before first use
   (e.g. via a one-off script/terminal, or on first deploy).

## Security notes

- The owner unlock is a single passphrase compared in **constant time**
  (`src/lib/auth.ts`), with in-memory failure rate limiting (5 fails / 10 min).
- The owner cookie is **httpOnly** and `Secure` in production.
- `deleteTask` and `updateTask` are **owner-only**: they verify the cookie
  server-side before acting.
- Attachments are images only (`image/jpeg`, `image/png`, `image/webp`,
  `image/gif`), capped at 10MB, enforced on both client and server.

## Project layout

```
src/
  app/
    actions.ts              # server actions (createTask, unlockOwner, updateTask, deleteTask, ...)
    layout.tsx              # root layout (Montserrat font, dark theme)
    page.tsx                # client portal: submit + read-only list
    owner/page.tsx          # owner portal: unlock form / kanban board
    globals.css             # Tailwind v4 dark-theme tokens
  components/
    SubmitForm.tsx          # mobile-first submit form + image attachment picker
    TaskList.tsx            # read-only client list
    KanbanBoard.tsx         # owner kanban (pending / in progress / done)
    OwnerUnlockForm.tsx     # passphrase unlock form (useActionState)
  lib/
    domain.ts               # types + pure logic (grouping, status transitions)
    format.ts               # ARS formatting + pesos↔cents parsing
    auth.ts                 # constant-time passphrase + rate limiting
    blob.ts                 # Vercel Blob image whitelist / token
    repository.ts           # TaskRepository interface
    store.ts                # selects Postgres (prod) or Memory (dev) repository
    schema.ts               # Drizzle schema (tasks, attachments)
    db.ts                   # postgres.js pooled connection + drizzle (server-only)
drizzle/                    # generated SQL migrations
```
