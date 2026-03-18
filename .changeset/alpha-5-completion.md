---
"mirror-orm": minor
---

## Alpha 5 — Multi-Database, Read Replicas e JSON Operators

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

| Operador | SQL gerado |
|:---|:---|
| `JsonContains({ role: 'admin' })` | `col @> $N::jsonb` |
| `JsonHasKey('active')` | `col ? $N` |
| `JsonHasAllKeys(['a', 'b'])` | `col ?& $N` |
| `JsonHasAnyKey(['a', 'b'])` | `col \|? $N` |

`IQueryOperator.requiresJsonSupport` marcado como `true` nos operadores JSON. `SqlAssembler.buildWhereGroup` lança erro explícito se o dialect não tiver `supportsJsonOperators = true` — sem SQL malformado chegando no driver.

### Benchmark pure — pós-Alpha 5 completa

| | Mirror ORM | Drizzle ORM | TypeORM |
|---|---|---|---|
| Pure overhead | **~50ns/row** | ~410ns/row | ~390ns/row |

Sem regressão no overhead puro do core após todas as adições multi-dialect.
