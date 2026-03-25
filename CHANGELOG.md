# mirror-orm

## 1.0.4

### Patch Changes

- 4195eba: Fix count() and exists() for MySQL/SQL Server, and ManyToOne JOIN quoting

## 1.0.3

### Patch Changes

- 25d2045: Add SSL forwarding, MySQL timezone fix, and pool configuration for all adapters

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

## 1.0.2

### Patch Changes

- 73266e8: ### Security
    - Force `flatted@^3.4.2` via pnpm overrides to patch CVE-2026-33228 (Prototype Pollution in `flatted` ≤ 3.4.1)

    ### Bug Fixes
    - Resolve `better-sqlite3` native bindings compilation failure in GitHub Actions CI

    ### Features
    - `@CreatedAt`, `@UpdatedAt` and `@DeletedAt` now support bare decorator syntax (no parentheses needed), matching `@Column` behavior:

    ```ts
    // all three forms are now equivalent
    @CreatedAt
    @CreatedAt()
    @CreatedAt('criado_em')
    ```

## 1.0.1

### Patch Changes

- 6b0e987: "fix: lazy-load database drivers to avoid requiring optional dependencies"
- "fix: lazy-load database drivers to avoid requiring optional dependencies"

## 1.0.0

### Major Changes

- 3618364: ## 1.0.0 — Stable Release

    First stable release of Mirror ORM.

    Full multi-database support (PostgreSQL, SQLite, MySQL, SQL Server), Stage 3 decorators, and sub-100ns/row pure hydration overhead.

    ### What's included
    - `@Entity`, `@Column`, `@PrimaryColumn` — core mapping decorators
    - `@ManyToOne`, `@OneToMany`, `@OneToOne`, `@ManyToMany` — relation decorators with batch loading (no N+1)
    - `@Embedded` — value object mapping
    - `@VersionColumn` — optimistic locking
    - `@ChildEntity` — Single Table Inheritance
    - Global query filters via `@Entity({ where })`
    - `Repository` — `find`, `findOne`, `findAll`, `findById`, `findStream`, `save`, `saveMany`, `remove`, `removeMany`, `update`, `delete`, `count`, `exists`, `findAndCount`, `findPaginated`
    - `QueryBuilder` — fluent API for complex queries with joins, groupBy, having, explain
    - Transactions with `AsyncLocalStorage` — automatic propagation, no explicit wiring
    - Savepoints — nested transactions with automatic `SAVEPOINT` / `ROLLBACK TO SAVEPOINT`
    - Pessimistic locking — `FOR UPDATE` / `FOR SHARE`
    - Read replicas — automatic routing of reads to secondary pool
    - `findStream` / `queryStream` — async generator streaming for all adapters
    - JSON operators — `JsonContains`, `JsonHasKey`, `JsonHasAllKeys`, `JsonHasAnyKey` (Postgres)
    - Lifecycle hooks — `@BeforeInsert`, `@AfterInsert`, `@BeforeUpdate`, `@AfterUpdate`, `@BeforeRemove`, `@AfterRemove`
    - Soft delete — `@DeleteDateColumn` with automatic filtering
    - Timestamps — `@CreateDateColumn`, `@UpdateDateColumn`
    - Primary key strategies — `identity`, `uuid_v4`, `uuid_v7`, `cuid2`, `ulid`
    - Filter operators — `Like`, `ILike`, `In`, `Between`, `Not`, `IsNull`, `IsNotNull`, `Raw`
    - SSL support
    - Custom logger
    - Multi-dialect: PostgreSQL, SQLite (`better-sqlite3`), MySQL (`mysql2`), SQL Server (`mssql`)

## 0.1.0-alpha.5

### Minor Changes

- ## Alpha 5 — Multi-Database, Read Replicas e JSON Operators

    ### Fundação multi-dialect

    `IDialect` estendido com suporte completo a múltiplos bancos:
    - `placeholder(index)` — normaliza `$N` (Postgres), `?` (SQLite/MySQL), `@pN` (SQL Server)
    - `supportsReturning` — `true` só no Postgres
    - `supportsOutputInserted` — `true` no SQL Server; `OUTPUT INSERTED.*` inline no INSERT/UPDATE evita race condition de pool que `SCOPE_IDENTITY()` teria
    - `lastInsertIdQuery?` — `SELECT last_insert_rowid()` (SQLite), `SELECT LAST_INSERT_ID()` (MySQL)
    - `buildArrayInClause()` — Postgres usa `ANY($N)` com array único; SQLite/MySQL/SQL Server expandem `IN (?, ?, ?)`
    - `quoteIdentifier()` — aspas duplas (Postgres/SQLite), backtick (MySQL), colchetes (SQL Server)
    - `supportsJsonOperators` — `true` só no Postgres

    `SqlAssembler` e `Repository` atualizados para todos os paths condicionais por dialect.

    ### Novos adapters
    - **`SqliteAdapter`** — `better-sqlite3` wrappado em async. API síncrona; sem pool real; `queryArray` via `stmt.raw().all()`; transações via `db.transaction()`.
    - **`MysqlAdapter`** — `mysql2/promise` pool com `rowsAsArray: true` para `queryArray`; `execute()` para queries normais.
    - **`MssqlAdapter`** — `mssql`/tedious; named inputs `request.input('p1', val)`; `queryArray` ordena colunas por `column.index`; stream event-based com queue → async generator.
    - **Rename**: `PgAdapter` → `PostgresAdapter` (convenção de nome alinhada entre todos os adapters).

    ### queryStream / findStream

    `IDriverAdapter.queryStream?` adicionado como `AsyncIterable<unknown[]>` opcional. `Repository.findStream()` retorna `AsyncGenerator<T>`. Implementações:
    - **PostgresAdapter**: `DECLARE CURSOR` + `FETCH` em batches
    - **SqliteAdapter**: `stmt.raw().iterate()` nativo
    - **MysqlAdapter**: `conn.connection.query().stream()` com `rowsAsArray: true`
    - **MssqlAdapter**: `request.stream = true` + fila de eventos → async generator

    ### Read Replicas

    `IConnectionConfig.replica?` — campo opcional com dados de conexão do secondary pool. `Connection.postgres`, `.mysql` e `.sqlServer` instanciam um segundo adapter quando presente.

    `Repository.readRunner` getter transaction-aware: dentro de transação usa o transaction runner (garante leitura de dados não-commitados); fora roteia para a réplica. Operações de leitura (`find`, `findAll`, `findById`, `findOne`, `count`, `exists`, `findStream`, relation loading) usam `readRunner`. Sem réplica configurada, cai no primário — zero impacto para quem não usa.

    ### JSON Operators (Postgres-first, fail-fast)

    Quatro operadores JSONB em `src/operators/json.ts`:

    | Operador                          | SQL gerado         |
    | :-------------------------------- | :----------------- |
    | `JsonContains({ role: 'admin' })` | `col @> $N::jsonb` |
    | `JsonHasKey('active')`            | `col ? $N`         |
    | `JsonHasAllKeys(['a', 'b'])`      | `col ?& $N`        |
    | `JsonHasAnyKey(['a', 'b'])`       | `col \|? $N`       |

    `IQueryOperator.requiresJsonSupport` marcado como `true` nos operadores JSON. `SqlAssembler.buildWhereGroup` lança erro explícito se o dialect não tiver `supportsJsonOperators = true` — sem SQL malformado chegando no driver.

    ### Benchmark pure — pós-Alpha 5 completa

    Pure overhead: **~50 ns/row** — sem regressão no overhead puro do core após todas as adições multi-dialect.

## 0.1.0-alpha.4

### Minor Changes

- ## Alpha 4 — Expressividade, Transações Robustas e DX

    ### Novas features
    - **QueryBuilder** — API fluente para queries complexas: `.select()`, `.leftJoin()`, `.where()`, `.andWhere()`, `.groupBy()`, `.having()`, `.orderBy()`, `.limit()`, `.offset()`, `.getMany()`, `.getRaw()`, `.getCount()`, `.explain()`. Disponível via `connection.createQueryBuilder(Entity)` e `repo.createQueryBuilder()`.
    - **Savepoints** — `connection.transaction()` chamado dentro de outro `transaction()` detecta o runner ativo via ALS e emite `SAVEPOINT` automaticamente. Rollback parcial sem abortar a transação externa. Profundidade arbitrária de aninhamento.
    - **Pessimistic locking** — `find({ lock: 'pessimistic_write' })` emite `FOR UPDATE`; `find({ lock: 'pessimistic_read' })` emite `FOR SHARE`.
    - **`findPaginated`** — wraps `findAndCount` retornando `{ data: T[], meta: { total, page, lastPage, limit } }`. Suporta todos os filtros de `find`.
    - **Operador `Raw`** — válvula de escape para WHERE arbitrário: `Raw(col => \`${col} > (SELECT avg FROM stats)\`)`. Completa o conjunto de operadores junto com `ILike`, `Not`, `IsNull`, `IsNotNull`.
    - **`trx.query<T>(sql, params?)`** — `TransactionContext` expõe raw query para stored procedures, DDL e SQL que o ORM não gera.

    ### Performance — PgAdapter
    - **`rowMode: 'array'`** — driver `pg` retorna linhas como `unknown[]` em vez de `Record<string, unknown>`. Adicionado `queryArray()` em `IDriverAdapter`; `find()`, `findAll()` e `findById()` usam esse caminho quando não há relações.
    - **Custom `getTypeParser`** — bypass do parsing de timestamps pelo `pg` (`TIMESTAMP`, `TIMESTAMPTZ`, `DATE`, `INTERVAL`). Cast delegado ao hydrator do Mirror quando `type: 'datetime'` está anotado.
    - **Skip extended protocol** — `pool.query({ text, values: [] })` forçava extended protocol desnecessariamente. Removido `values` quando params está vazio.
    - **WeakMap → Symbol** — armazenamento do snapshot de load-state migrado de `WeakMap` para propriedade `Symbol` diretamente na instância, reduzindo overhead de alocação.

    ### Benchmark (fair interleaved, mesmo processo — 17/03/2026)
    - Query 1k rows: **0.87ms**
    - Relations 1k rows: **1.52ms**
    - Pure overhead: **73 ns/row**

## 0.1.0-alpha.3

### Minor Changes

- Alpha 3: lifecycle hooks, timestamps, soft delete, upsert, findAndCount, find({ select }), select: false, ULID, CUID2, SSL support, autoFkMap precomputation, find() decomposition with parallel relation loading.

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
    - **JIT-compiled hydrator** — `buildHydrator()` uses `new Function()` to generate a monomorphic function per entity at startup. V8 applies Inline Caches to every field access, yielding **37 ns/row** pure ORM overhead.
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
