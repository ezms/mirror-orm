---
'mirror-orm': patch
---

Add SSL forwarding, MySQL timezone fix, and pool configuration for all adapters

**SSL**

- `MysqlAdapter` and `MssqlAdapter` now forward the `ssl` option from `IConnectionOptions` to the underlying driver. Previously only `PostgresAdapter` wired this option.
- `MssqlAdapter` no longer hardcodes `trustServerCertificate: true`. The value is now derived from `ssl`: `undefined` preserves the previous behavior (backward-compatible), `false` disables encryption, `true` enforces encryption with certificate verification, and an `ISslOptions` object allows passing custom `ca`, `cert`, and `key`.

**MySQL timezone**

- `MysqlAdapter` now sets `timezone: '+00:00'` on the connection pool. Without this, `mysql2` uses the Node.js process timezone, which can silently produce wrong offsets when reading or writing `DATETIME`/`TIMESTAMP` columns in production environments.

**Pool configuration**

- New `IPoolOptions` interface added to `IConnectionOptions` and `IReplicaConfig` with four options:
  - `max` — maximum number of connections in the pool
  - `idleTimeoutMs` — how long an idle connection stays open before being released
  - `acquireTimeoutMs` — how long to wait for an available connection before throwing
  - `connectTimeoutMs` — TCP handshake timeout
- All three adapters wire these options to their driver-specific fields. Unset options fall back to each driver's defaults, so existing configurations are unaffected.
