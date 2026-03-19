# Contributing to Mirror ORM

Thank you for your interest in contributing! This document covers everything you need to get started.

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 10
- **Docker** — required to run integration tests against real databases

## Setup

```bash
git clone https://github.com/ezms/mirror-orm
cd mirror-orm
pnpm install
```

DB drivers are `peerDependencies` (optional for users), so you need to add them manually for tests:

```bash
pnpm add pg better-sqlite3 mysql2 mssql
```

## Running tests

### Unit tests (no database required)

Most tests run against mocks or SQLite `:memory:` and need no external service:

```bash
pnpm test
```

### Integration tests (Postgres / MySQL / SQL Server)

Start the databases via Docker:

```bash
# Postgres
docker run -d --name mirror-pg \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=mirror_test \
  -p 5432:5432 postgres:16

# MySQL
docker run -d --name mirror-mysql \
  -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=mirror_test \
  -p 3306:3306 mysql:8.0

# SQL Server
docker run -d --name mirror-mssql \
  -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD='Mirror_Test_2026!' \
  -p 1433:1433 mcr.microsoft.com/mssql/server:2022-latest
```

The specs use fixed local credentials — no env vars needed for local development:

| Database   | Host        | Port | Database     | User       | Password            |
|------------|-------------|------|--------------|------------|---------------------|
| Postgres   | 127.0.0.1   | 5432 | mirror_test  | postgres   | postgres            |
| MySQL      | 127.0.0.1   | 3306 | mirror_test  | root       | root                |
| SQL Server | 127.0.0.1   | 1433 | mirror_test  | sa         | Mirror_Test_2026!   |

Then run all tests with coverage:

```bash
pnpm test:coverage
```

## Running the benchmark

Mirror has a pure-overhead benchmark (no database, no I/O) that measures the hydration pipeline:

```bash
pnpm benchmark:pure
```

Expected output: `mirror_ns_per_row=XX.XX` — historically around **50 ns/row**.

## Branch flow

```
feature/fix branch → PR → develop → (reviewed & merged) → main
```

- All PRs target **`develop`**.
- `main` only receives merges from `develop` (no direct commits).

## CI checks on every PR

The following jobs run automatically when you open a PR to `develop`:

| Job | What it does |
|-----|-------------|
| **Lint & Build** | `pnpm lint` + `pnpm build` — must pass |
| **Tests & Coverage** | Full suite with Postgres 16, MySQL 8.0 and SQL Server 2022 service containers; coverage thresholds enforced |
| **Benchmark (comparative)** | Runs `benchmark:pure` on your branch **and** on `develop`, sequentially on the same runner — PR fails if your code is **more than 15% slower** than develop |

## Performance policy

Mirror's core differentiator is low overhead — the pure hydration pipeline runs at around **50 ns/row** with no database involved. The 15% threshold in CI is intentionally permissive to absorb runner noise (~10–15% natural variance on shared GitHub runners), while still catching real regressions (~5% buffer).

If your PR fails the benchmark step:

1. Check whether the regression is caused by your change or by runner noise — re-run the job once.
2. If it's caused by your change, profile which part of the pipeline regressed.
3. If the regression is justified (e.g. a correctness fix), explain it in the PR description so it can be reviewed intentionally.

## Submitting a PR

1. Fork the repository and create a branch from `develop`.
2. Write tests for any new behavior — integration tests go in `src/__tests__/`.
3. Run `pnpm lint` and `pnpm test` locally before pushing.
4. Open a PR against `develop` with a clear description of what changed and why.
5. Mention any performance impact if your change touches the hot path (hydration, query assembly, adapters).
