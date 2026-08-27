# PropCompare — Compare. Decide. Confidently.

PropCompare is a private-client platform for comparing ultra-luxury residences
side by side. Buyers can compare configurations, room dimensions, pricing,
RERA status, construction details, amenities, and developer information in one
place.

The application uses TanStack Start (React 19), self-hosted PostgreSQL, Better
Auth, and Google Cloud Storage.

## Highlights

- Side-by-side comparison for two or three residences.
- Catalogue, developer submissions, owner review, and audited publication.
- Phone OTP customer sign-in plus staff/developer email-password sign-in with
  optional enforced MFA.
- Property brochure OCR, publication assets, enquiries, reviews, and developer
  intelligence behind server-controlled flags.

## Technology

| Area | Choice |
| --- | --- |
| Application | TanStack Start, React 19, Vite, Nitro |
| Database | Self-hosted PostgreSQL with Drizzle ORM |
| Staff auth | Better Auth |
| Media | Google Cloud Storage |
| Styling | Tailwind CSS, Radix UI, shadcn-style components |
| State/forms | Zustand, React Hook Form, Zod |

## Local setup

Prerequisites: Bun, PostgreSQL (or the local Docker setup), and any third-party
keys needed for the features you choose to enable.

```bash
bun install
Copy-Item .env.example .env
bun run dev
```

The development server listens on `http://localhost:5173`.

Important server environment values include:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Signs Better Auth session and MFA data |
| `SESSION_SECRET` | Signs customer phone-OTP verification tokens |
| `TWO_FACTOR_API_KEY` | Sends phone OTP messages |
| `GCS_PUBLIC_IMAGES_BUCKET` | Public property-image bucket |
| `GCS_PRIVATE_SOURCE_BUCKET` | Private brochure/source bucket |

`.env` is gitignored. Never expose server secrets through `VITE_` variables.

## Common commands

```bash
bun run dev
bun run lint
bun run test
bun run check
bun run schema:check
bun run db:drift
bun run build
```

## Database

The migration files live in [`supabase/migrations/`](supabase/migrations); the
directory name is historical. `ops/db/bootstrap.sql` and `ops/db/migrate.sh`
replay them against ordinary self-hosted PostgreSQL, recording applied versions
in `supabase_migrations.schema_migrations`.

For production, the shared-VM deployment applies unapplied migrations before
restarting the updated application containers. Do not use an external database
CLI or manually change production schema without a reviewed migration.

## Project structure

```text
src/
  api/             Server functions
  components/      UI components
  db/              Drizzle schema and connection
  lib/auth/        Better Auth setup and middleware
  repositories/    Database access
  routes/          File-based routes
supabase/          Historical-name migration directory
scripts/           Maintained administrative scripts
ops/               Production deployment and database operations
```

## Deployment

Pushing to `main` runs the shared-VM deployment workflow. It builds images in
GitHub Actions, pushes them to Artifact Registry, applies migrations on the VM,
and starts `web-blue` plus the OCR services. See [ops/RUNBOOK.md](ops/RUNBOOK.md)
for the current operating procedure.
