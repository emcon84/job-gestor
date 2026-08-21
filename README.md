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

## Web Push notifications

The app can send browser push notifications when tasks are created, statuses
change, or comments are added. It uses the **VAPID** protocol with the
`web-push` library.

Generate a VAPID keypair once and store it:

```bash
npx web-push generate-vapid-keys
```

It prints a `publicKey` and `privateKey`. Set these environment variables:

| Variable                   | Notes                                                            |
| -------------------------- | ---------------------------------------------------------------- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key. Safe to expose (it ships to the browser).  |
| `VAPID_PRIVATE_KEY`        | VAPID private key. **Server-only — never commit or expose.**     |
| `VAPID_SUBJECT`            | Contact for the push service, e.g. `mailto:you@example.com`.     |

The subscribe button (bell icon, bottom-left) only appears when
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` is set. Notifications are stored per
endpoint in the `push_subscriptions` table (upserted by endpoint).

## Deploying to Vercel

1. Push the repo to GitHub and import it into Vercel (or `vercel deploy`).
2. Create a **Neon** Postgres database and a **Cloudflare R2** bucket.
3. Set these environment variables in Vercel → Project → Settings → Environment:

| Variable               | Required | Notes                                                          |
| ---------------------- | -------- | -------------------------------------------------------------- |
| `DATABASE_URL`         | Yes      | Neon **pooled** connection string (`?sslmode=require`)         |
| `OWNER_PASSPHRASE`     | Yes      | Secret passphrase to unlock the owner panel (httpOnly cookie)  |
| `R2_ACCOUNT_ID`        | Yes      | Cloudflare R2 account ID (R2 → Overview)                       |
| `R2_ACCESS_KEY_ID`     | Yes      | R2 API token access key (R2 → Manage R2 API Tokens)            |
| `R2_SECRET_ACCESS_KEY` | Yes      | R2 API token secret key                                        |
| `R2_BUCKET`            | Yes      | R2 bucket name that stores attachments                         |
| `R2_PUBLIC_BASE_URL`   | Optional | Public r2.dev URL (bucket → Settings → Public access)          |
| `APP_URL`              | Optional | Public origin of the app                                       |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | No (opt-in) | VAPID public key to enable push notifications         |
| `VAPID_PRIVATE_KEY`    | No (opt-in) | VAPID private key (server-only)                            |
| `VAPID_SUBJECT`        | No (opt-in) | Push service contact (`mailto:...`)                       |

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
    blob.ts                 # (removed — now src/lib/r2.ts) image whitelist / upload
    r2.ts                   # Cloudflare R2 image whitelist / presigned upload
    repository.ts           # TaskRepository interface
    store.ts                # selects Postgres (prod) or Memory (dev) repository
    schema.ts               # Drizzle schema (tasks, attachments)
    db.ts                   # postgres.js pooled connection + drizzle (server-only)
drizzle/                    # generated SQL migrations
```
