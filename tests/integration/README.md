## Integration tests (Vitest + Prisma + Postgres)

These tests run against a **real Postgres database** using Prisma migrations, inside an **isolated database per test run**.

### Prerequisites

- **Postgres 13+** reachable from your machine (required for `DROP DATABASE ... WITH (FORCE)` cleanup)
- Node dependencies installed (`npm install`)

### Option A: Local Postgres via Docker Compose (recommended)

From `Laku-Dashboard/`:

```bash
docker compose --profile local-db up -d postgres
```

If port `5432` is already in use on your machine, you can start Postgres on another port:

```bash
POSTGRES_PORT=5433 docker compose --profile local-db up -d postgres
```

Then set a direct Postgres URL.

```powershell
$env:TEST_DATABASE_URL="postgresql://laku:laku_secret@localhost:5432/laku"
npm test
```

Git Bash:

```bash
TEST_DATABASE_URL="postgresql://laku:laku_secret@127.0.0.1:5432/laku" npm test
```

If you used `POSTGRES_PORT=5433`, update the port in the URL accordingly.

PowerShell alternative:

```powershell
$env:TEST_DATABASE_URL="postgresql://laku:laku_secret@127.0.0.1:5433/laku"
npm test
```

### Option B: Use your existing `.env` (Supabase / remote)

By default, these integration tests **do not** fall back to `DIRECT_URL` / `DATABASE_URL` to avoid accidentally running migrations against your real database.

If you intentionally want to allow fallback to `DIRECT_URL` / `DATABASE_URL`, set:

```powershell
$env:VITEST_ALLOW_EXISTING_DB_URL="1"
npm test
```

For best reliability with DDL/migrations, prefer `TEST_DATABASE_URL` (non-pgbouncer).

### What runs

- `mobile-orders.atomic-stock.test.ts`: concurrent checkouts must not oversell (atomic stock decrement).
- `marketplace-cart.auth.test.ts`: cart mutations must enforce auth/ownership.
- `marketplace-cart.crud.test.ts`: add/merge/update cart lines; hide unpublished products in cart fetch.
- `product-variant-sync.test.ts`: `updateProduct` definition/option sync + marketplace active-variant filtering.
- `marketplace-search-engine.test.ts`: search `engine` / `degraded` metadata, query logs, engine-status API.
- `variant-option-usage.test.ts`: order-linked variant usage reporting.
- `update-order.*.test.ts`: order edits and stock integrity.

