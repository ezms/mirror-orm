---
"mirror-orm": major
---

## 1.0.0 — Stable Release

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
