---
"mirror-orm": minor
---

Alpha 2 — OneToOne, ManyToMany, ALS transactions, dirty checking, and QoL improvements

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
