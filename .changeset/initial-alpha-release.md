---
"mirror-orm": minor
---

Initial alpha release of Mirror ORM.

### Features

- **`@Entity` decorator** — maps a class to a database table; `tableName` is optional and defaults to the class name
- **`@Column` decorator** — maps a class field to a database column; uses the exact field name as `databaseName` when no argument is provided
- **`@PrimaryColumn` decorator** — marks a field as the primary key column
- **Repository** — `QueryBuilder`-based repository with full `SELECT`, `INSERT`, `UPDATE`, and `DELETE` support
  - `find(options?)` — query rows with optional `where`, `order`, `limit`, and `offset`
  - `findOne(options?)` — returns the first matching row as a typed entity instance
  - `save(entity)` — inserts a new row, respecting database-level defaults for `undefined` fields
  - `update(where, data)` — updates rows matching a condition
  - `delete(where)` — deletes rows matching a condition
  - `count(options?)` — counts matching rows
- **Filter operators** — `Like`, `In`, `Between`, `IsNull`, `Not`, and more for expressive `WHERE` clauses
- **OR groups** — compose `WHERE` clauses with `OR` logic
- **Entity hydration** — query results are mapped back into typed class instances via `hydrate()`
- **Adapter pattern** — pluggable database adapters; ships with a `pg` (node-postgres) adapter using a connection pool
- **Transaction support** — execute queries within a `PoolClient` transaction
- **Custom exceptions** — typed error classes for ORM-level failures
- **Custom Logger** — built-in logger for query and lifecycle events
- **Stage 3 decorators** — uses the TC39 Stage 3 decorator proposal (no `experimentalDecorators` required)
- **Identifier quoting** — all SQL identifiers are double-quoted, ensuring correct behavior for camelCase column names in PostgreSQL
