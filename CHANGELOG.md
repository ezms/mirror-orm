# mirror-orm

## 0.1.0-alpha.2

### Minor Changes

- Alpha 2 — OneToOne, ManyToMany, ALS transactions, dirty checking, and QoL improvements

    **New decorators**
    - `@OneToOne(target, foreignKey)` — owner side resolved via FK presence on the entity; owner uses LEFT JOIN (same path as ManyToOne), inverse side uses a batch query returning `T | null`
    - `@ManyToMany(target, joinTable, ownerFk, inverseFk)` — positional args; batch INNER JOIN through the join table with owner FK aliased internally for grouping; returns `T[]`

    **Implicit transactions via AsyncLocalStorage**
    - `connection.transaction(cb)` now wraps the callback in an ALS context; any repository created from `connection.getRepository()` inside that callback automatically uses the transaction runner without explicit wiring
    - `repository.withTransaction(runner)` pins a specific runner and opts out of ALS lookup — useful for manual control

    **Dirty checking on `save()`**
    - Entities hydrated from the DB (via `find`, `findOne`, `findById`, `findAll`, `saveMany`) now carry a snapshot of their columns at hydration time
    - On `save()`, only columns whose values differ from the snapshot are included in the `SET` clause; no-op if nothing changed

    **QueryError verbose mode**
    - `QueryError.verbose = true` appends the raw SQL and serialised params to the error message — useful for debugging without enabling full DB logging

    **Fixes**
    - UUIDv7 ordering test was flaky when both calls landed in the same millisecond; fixed by mocking `Date.now()` with distinct timestamps
    - `ConsoleLogger.query` is now `public` for consistency with `SqlAssembler`

    **Refactors**
    - `SqlAssembler.buildFind` relation classification replaced with a `Record<RelationType, fn>` dispatch map; duplicated `ManyToOneInfo` construction extracted to `buildMtoInfo`

## 0.1.0-alpha.1

### Minor Changes

- ## Alpha 1 — completion

    Full feature set, performance work, and architectural refactor closing the Alpha 1 milestone.

    ***

    ### Performance
    - **JIT-compiled hydrator** — `buildHydrator()` uses `new Function()` to generate a monomorphic function per entity at startup. V8 applies Inline Caches to every field access, yielding **37 ns/row** pure ORM overhead (~10× faster than Drizzle/TypeORM in the same benchmark).
    - **Explicit SELECT clause** — queries now emit `SELECT "col1", "col2"` instead of `SELECT *`, allowing PostgreSQL to skip unrequested columns and enabling the JIT hydrator to guarantee column presence without runtime checks.
    - **Named prepared statements** — `findAll` and `findById` use `INamedQuery` objects with stable names (`mirror_<table>_fa`, `mirror_<table>_fbi`), letting the `pg` driver skip parse/plan on repeated calls.
    - **`RepositoryState` pre-computation** — column map, select clause, qualified select clause, primary column reference, hydrator, and cached SQL statements are all built once at `Connection.getRepository()` time, never on the hot path.

    ***

    ### New repository methods

    | Method                    | Description                                                                                       |
    | :------------------------ | :------------------------------------------------------------------------------------------------ |
    | `findOne(options?)`       | Wrapper over `find` with `limit: 1`; returns `T \| null`                                          |
    | `findOneOrFail(options?)` | Same as `findOne` but throws `EntityNotFoundError` when no row matches                            |
    | `exists(where?)`          | Returns `boolean`; implemented as `count(where) > 0`                                              |
    | `saveMany(entities[])`    | Single `INSERT INTO … VALUES (…),(…) RETURNING *` — more efficient than N calls to `save()`       |
    | `removeMany(entities[])`  | Single `DELETE … WHERE pk = ANY($1)` — O(1) SQL regardless of array size                          |
    | `update(data, where)`     | `UPDATE … SET … WHERE … RETURNING 1` without loading the entity first; returns affected row count |
    | `delete(where)`           | `DELETE … WHERE … RETURNING 1` without loading the entity first; returns affected row count       |

    All new write methods support the same `where` operators (`Like`, `In`, `Between`, `Not`, etc.) as `find`.

    ***

    ### Relationships
    - **`@ManyToOne(target, fk)`** — generates a `LEFT JOIN` in `find({ relations })`. Related entity columns are aliased with a `mirror__<prop>__` prefix to prevent name collisions when joining multiple tables.
    - **`@OneToMany(target, fk)`** — after the main query, a single batch `SELECT … WHERE "<fk>" = ANY($1)` fetches all children for all parent IDs at once. No N+1 queries.
    - **`find({ relations: ['prop'] })`** — opt-in relation loading; unspecified relations are never fetched.
    - FK column must be declared separately with `@Column` — no implicit join column, giving full access to the raw FK value without loading the relation.
    - Related `RepositoryState` instances are built lazily and cached on first use.
    - JIT hydrators support prefixed columns, enabling correct type casting on related entity fields.

    ***

    ### Type casting

    `@Column({ type })` now coerces raw database values to the correct JavaScript type during hydration:

    | type       | Coercion                                    |
    | :--------- | :------------------------------------------ |
    | `number`   | `+value`                                    |
    | `bigint`   | `BigInt(value)`                             |
    | `boolean`  | `Boolean(value)`                            |
    | `datetime` | `new Date(value)`                           |
    | `date`     | `'YYYY-MM-DD'` string extracted from `Date` |
    | `iso`      | `.toISOString()` UTC string                 |

    Type casting is woven directly into the JIT-compiled hydrator — zero runtime branching per row.

    ***

    ### Architecture refactor — Repository split

    `repository.ts` (514 lines, mixed concerns) was split into three focused classes:
    - **`RepositoryState<T>`** (`repository-state.ts`) — compiled metadata: column map, select clauses, hydrators, prepared statement objects, related state cache.
    - **`SqlAssembler<T>`** (`sql-assembler.ts`) — builds SQL strings. Each method returns `{ sql, params }` rather than mutating a passed array. Covers `buildFind`, `buildCount`, `buildInsert`, `buildBulkInsert`, `buildUpdateById`, `buildUpdate`, `buildDelete`, `buildRemove`, `buildRemoveMany`.
    - **`Repository<T>`** (`repository.ts`) — thin public API: calls `SqlAssembler` for SQL, executes via `IQueryRunner`, hydrates via `RepositoryState`. No SQL strings inline except the OneToMany batch query (which requires `relatedState` context).

    `RepositoryState` is re-exported from `repository.ts` for backwards compatibility with `Connection` internals.

    ***

    ### Bug fixes
    - **`@Entity` default table name** — the fallback `tableName` was not lowercasing the class name consistently; now the class name is used as-is (matching PostgreSQL quoting behaviour via `quoteIdentifier`).
    - **OneToMany empty-result guard** — when the main query returns zero rows, the batch `ANY($1)` query was still executed with an empty ID array, causing `relRows is not iterable`. Fixed with an early return when `rows.length === 0`.

    ***

    ### Tests
    - **125 tests passing** across 5 spec files (was 106 at Alpha 0).
    - New **`relations.spec.ts`** (19 tests) covering: multiple rows with distinct ManyToOne targets, null/non-null FK mix, FK column hydrated alongside relation, unknown relation names silently ignored, two ManyToOne on same entity, independent null handling per relation, selective relation loading, 3-author/5-book OneToMany distribution, empty main query guard, `instanceof` checks on nested entities, and cross-group isolation.
    - New fixtures: `CategoryFixture`, `RichBookFixture` (2× ManyToOne + `datetime` type cast).

## 0.1.0-alpha.0

### Minor Changes

- Initial alpha release of Mirror ORM.

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
