---
"@mirror-community/mirror-orm": patch
---

## New features

### `Connection.healthCheck()`

New method that runs `SELECT 1` against the primary connection and all configured replicas, returning `false` (never throwing) if any target is unreachable. Useful for liveness/readiness probes in containerised environments.

```ts
const healthy = await conn.healthCheck();
```

### `onPoolError` callback in connection options

Silent pool errors (connections that die with no active query) were previously swallowed. All four adapters now accept an `onPoolError` callback in `IConnectionOptions` that fires whenever the pool emits an uncaught error:

```ts
const conn = await Connection.postgres({
    // ...
    onPoolError: (err) => logger.error('pool error', err),
});
```

### `queryTimeoutMs` in `IPoolOptions`

New `pool.queryTimeoutMs` option that maps to each driver's native statement timeout:
- **PostgreSQL** → `statement_timeout`
- **MySQL** → `timeout`
- **SQL Server** → `requestTimeout`
- **SQLite** — not applicable (synchronous)

```ts
const conn = await Connection.postgres({
    // ...
    pool: { queryTimeoutMs: 5000 },
});
```

### `json` and `buffer` column types

Two new column types for cross-database use:

- **`json`** — applies `JSON.parse()` during hydration on MySQL, SQLite and SQL Server (PostgreSQL already parses automatically via `getTypeParser`). Prevents silent `[object Object]` corruption when storing structured data.
- **`buffer`** — maps binary columns (`BYTEA`, `BLOB`, `VARBINARY`) to `Buffer`. Previously these fell through to `string`, silently corrupting binary data.

```ts
@Column({ type: 'json' })
metadata!: Record<string, unknown>;

@Column({ type: 'buffer' })
avatar!: Buffer;
```

## Performance

### `exists()` now uses `EXISTS` subquery instead of `COUNT(*)`

`repo.exists()` previously counted all matching rows to check presence. It now emits a proper `EXISTS` subquery that short-circuits on the first match, which is significantly faster on large tables.

```sql
-- before
SELECT COUNT(*) AS count FROM "users" WHERE "name" = $1

-- after
SELECT EXISTS (SELECT 1 FROM "users" WHERE "name" = $1) AS "exists"
```

SQL Server receives an equivalent `CASE WHEN EXISTS (...) THEN 1 ELSE 0 END` since it does not return a native boolean.

## Bug fixes

- **mssql**: omit `undefined` pool options to avoid tarn pool validation errors on startup
- **mssql**: resolve `ConnectionPool` ESM/CJS interop failure when running under `tsx`
- **operators**: use `export type` for `IQueryOperator` re-export to fix isolatedModules builds
- **dialects**: use `export type` for `IDialect` re-export to fix isolatedModules builds
- **deps**: override `brace-expansion` to fix infinite loop DoS (CVE)
- **deps**: override `picomatch` to fix ReDoS and Prototype Pollution

## Package

The package has been moved to the `mirror-community` organisation and republished as `@mirror-community/mirror-orm`. The old `mirror-orm` package on npm is deprecated and points to this new name.
