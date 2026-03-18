---
"mirror-orm": minor
---

## Alpha 4 — Expressividade, Transações Robustas e DX

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

| | Mirror ORM | Drizzle ORM | raw pg |
|---|---|---|---|
| Query 1k rows | **0.87ms** | 1.19ms | 1.72ms |
| Relations 1k rows | **1.52ms** | 4.27ms | — |
| Pure overhead | **73 ns/row** | 397 ns/row | — |
