---
'mirror-orm': patch
---

### Security

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
