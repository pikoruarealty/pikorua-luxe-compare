# PropCompare — Compare. Decide. Confidently.

A private-client platform for comparing ultra-luxury residences side by side. Buyers
pick two or three projects and see every material detail — configurations, room
dimensions, pricing, RERA status, construction spec, and developer track record —
lined up in a single, honest view instead of a dozen browser tabs.

Built with TanStack Start (React 19) and Supabase.

---

## Highlights

- **Side-by-side comparison** — a quick on-page board plus a full-page report for 2–3 residences.
- **Deep field set** — configurations, per-room dimensions, project structure, RERA registration, construction & amenities, and developer track record.
- **Area unit toggle** — read every area figure in sq ft, sq yd (Var), or gaj; room dimensions stay in ft/in.
- **Live possession countdown** — "1 Year" quietly becomes "10 Months" as time passes, once an anchor date is set.
- **Distance estimate** — a visitor types their address and gets an approximate straight-line distance to each residence, geocoded server-side (no map or coordinates are ever exposed to the client).
- **Preference quiz & filtering** — city, property type, BHK, and budget narrow the catalogue.
- **Phone OTP sign-in** — lightweight identity via a one-time SMS code, with saved profiles.
- **Personal tools** — favorites, saved comparisons, recently viewed, and shareable comparison links.
- **Owner admin portal** — property CRUD, developer submissions, customer records, and activity.

---

## Tech stack

| Area           | Choice                                                                   |
| -------------- | ------------------------------------------------------------------------ |
| Framework      | [TanStack Start](https://tanstack.com/start) (React 19, SSR)             |
| Routing / data | TanStack Router · TanStack Query · TanStack Table                        |
| Backend        | [Supabase](https://supabase.com) (Postgres, Auth, Storage)               |
| Styling        | Tailwind CSS v4 · Radix UI primitives · shadcn-style components          |
| State          | Zustand (compare, favorites, saved comparisons, area unit, variant view) |
| Forms          | React Hook Form · Zod                                                    |
| Animation      | Framer Motion                                                            |
| Build / deploy | Vite 8 · Nitro (Cloudflare Workers / Vercel)                             |
| OTP delivery   | [2Factor.in](https://2factor.in)                                         |
| Geocoding      | OpenStreetMap Nominatim                                                  |

---

## Getting started

### Prerequisites

- [Bun](https://bun.sh) (the repo ships a `bun.lock`; npm works too)
- A Supabase project
- A 2Factor.in API key (only needed for live phone OTP)

### 1. Install

```bash
bun install
```

### 2. Configure environment

Copy the example file and fill in real values:

```bash
cp .env.example .env
```

| Variable                        | Scope  | Purpose                                           |
| ------------------------------- | ------ | ------------------------------------------------- |
| `SUPABASE_URL`                  | server | Supabase project URL                              |
| `SUPABASE_PUBLISHABLE_KEY`      | server | Publishable / anon key                            |
| `SUPABASE_SERVICE_ROLE_KEY`     | server | Service-role key (admin writes)                   |
| `VITE_SUPABASE_URL`             | client | Same URL, exposed to the browser                  |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | client | Same publishable key, exposed to the browser      |
| `SESSION_SECRET`                | server | Signs session cookies and OTP verification tokens |
| `TWO_FACTOR_API_KEY`            | server | 2Factor.in key for sending OTP SMS                |

`.env` is gitignored. Only `VITE_`-prefixed variables reach the browser.

### 3. Run

```bash
bun run dev
```

The app serves on **http://localhost:5173**.

---

## Scripts

| Command           | Description                                   |
| ----------------- | --------------------------------------------- |
| `bun run dev`     | Start the dev server (http://localhost:5173)  |
| `bun run build`   | Production build (Nitro output in `.output/`) |
| `bun run preview` | Preview the production build locally          |
| `bun run lint`    | ESLint + Prettier check                       |
| `bun run format`  | Format the codebase with Prettier             |

---

## Database

Schema lives in [`supabase/migrations/`](supabase/migrations) — apply it with the
Supabase CLI or the SQL editor. Two one-time setup scripts (run outside Vite):

```bash
# Create the owner admin account (Supabase Auth user + admin profile)
bun scripts/seed-owner.ts <email> <password>

# Seed public.properties from the bundled catalogue and upload images to Storage
bun scripts/migrate-properties.ts
```

Both are idempotent. At runtime the app reads properties from Supabase (loaded once
in the root route and served to the whole app via `PropertiesProvider`).

---

## Project structure

```
src/
  routes/          File-based routes (/, /compare, /residence/$id, /favorites,
                   /account, /admin/*). See src/routes/README.md for conventions.
  components/      UI — compare/, onboarding/, admin/, residence/, property/, ui/
  lib/            Server functions & pure helpers (server fns are *.functions.ts /
                  *.server.ts; derivations, area units, possession, distance, …)
  stores/         Zustand stores
  context/        Providers (properties, onboarding, theme)
  integrations/   Supabase clients, auth middleware
  types/          Shared domain types (Property, ConfigDetail, …)
supabase/         Database migrations
scripts/          One-time seed / migration scripts
```

---

## Deployment

The build targets Nitro and is dual-deployable:

- **Cloudflare Workers** — default preset; configured in [`wrangler.jsonc`](wrangler.jsonc).

  ```bash
  bun run build
  wrangler deploy
  ```

- **Vercel** — set automatically when `VERCEL` is present in the build environment
  (the config switches Nitro to the `vercel` preset).

Set the same environment variables from `.env.example` in your host's dashboard.
