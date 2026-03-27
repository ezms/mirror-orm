# Changeset Guidelines

Run `pnpm changeset` to create a new changeset before opening a PR.

## Writing a good changeset message

A changeset message is the first thing users see in the CHANGELOG. Write it for them, not for yourself.

**Structure:** one sentence summary, then detail if needed.

---

### Examples

**Too vague — avoid:**
```
fix bug in MySQL adapter
```

**Good — specific and user-facing:**
```
fix count() and exists() returning wrong results on MySQL and SQL Server
```

---

**Too vague:**
```
add new column type
```

**Good:**
```
add json and buffer column types for cross-database binary and JSON hydration
```

---

**Too vague:**
```
improve performance
```

**Good:**
```
skip extended query protocol for parameterless queries, reducing Postgres round-trips
```

---

## Rules

- **What changed** — describe the behavior, not the code (`fix count()`, not `fix if statement in count method`)
- **Why it matters** — mention the impact when it's not obvious (`was silently corrupting binary data`)
- **Which adapters** — if the change is adapter-specific, say so (`MySQL and SQL Server`, `Postgres only`)
- **Breaking changes** — if it's a major bump, explain what breaks and how to migrate

## Bump type guide

| Type | When |
| --- | --- |
| `patch` | Bug fixes, internal changes with no API impact |
| `minor` | New features, new options, new column types — backward compatible |
| `major` | Breaking changes to public API, removed options, changed behavior |
