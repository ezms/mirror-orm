# Mirror ORM

Lightweight TypeScript ORM for PostgreSQL, SQLite, MySQL and SQL Server, built on [Stage 3 decorators](https://github.com/tc39/proposal-decorators).

[![npm](https://img.shields.io/npm/v/mirror-orm)](https://www.npmjs.com/package/mirror-orm)
[![license](https://img.shields.io/npm/l/mirror-orm)](LICENSE)
[![overhead](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fezms%2Fmirror-orm%2Fmain%2Fbenchmark%2Flatest.json&query=%24.ns_per_row&suffix=%20ns%2Frow&label=overhead&color=brightgreen&cacheSeconds=3600)](https://github.com/ezms/mirror-orm/actions/workflows/benchmark.yml)

## Features

- **Stage 3 decorators** — no `experimentalDecorators` required
- **Multi-database** — PostgreSQL, SQLite, MySQL, SQL Server
- **Relations** — `@ManyToOne`, `@OneToMany`, `@OneToOne`, `@ManyToMany` with batch loading (no N+1)
- **Fluent QueryBuilder** — joins, groupBy, having, explain
- **Transactions** — automatic propagation via `AsyncLocalStorage`; nested savepoints
- **Streaming** — `findStream()` async generator for all adapters
- **Read replicas** — automatic read/write routing
- **Optimistic locking** — `@VersionColumn`
- **Pessimistic locking** — `FOR UPDATE` / `FOR SHARE`
- **Soft delete** — `@DeletedAt` with automatic filtering
- **Lifecycle hooks** — `@BeforeInsert`, `@BeforeUpdate`, `@AfterLoad`
- **Embedded value objects** — `@Embedded`
- **Single Table Inheritance** — `@ChildEntity`
- **JSON operators** — `JsonContains`, `JsonHasKey` and more (PostgreSQL)
- **Sub-100 ns/row** pure hydration overhead

## Installation

```bash
npm install mirror-orm
```

Install the driver for your database:

```bash
# PostgreSQL
npm install pg

# SQLite
npm install better-sqlite3

# MySQL
npm install mysql2

# SQL Server
npm install mssql
```

## TypeScript setup

Mirror uses Stage 3 decorators. Set the following in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": false
  }
}
```

## Connecting

```ts
import { Connection } from 'mirror-orm';

// PostgreSQL
const conn = await Connection.postgres({
    host: 'localhost',
    port: 5432,
    database: 'mydb',
    user: 'postgres',
    password: 'secret',
});

// SQLite
const conn = await Connection.sqlite({ database: './app.db' });

// MySQL
const conn = await Connection.mysql({
    host: 'localhost',
    port: 3306,
    database: 'mydb',
    user: 'root',
    password: 'secret',
});

// SQL Server
const conn = await Connection.sqlServer({
    host: 'localhost',
    port: 1433,
    database: 'mydb',
    user: 'sa',
    password: 'secret',
});
```

## Defining entities

```ts
import { Entity, Column, PrimaryColumn, CreatedAt, UpdatedAt } from 'mirror-orm';

@Entity('users')
class User {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Column()
    name!: string;

    @Column({ nullable: true })
    email!: string | null;

    @CreatedAt()
    createdAt!: Date;

    @UpdatedAt()
    updatedAt!: Date;
}
```

### Primary key strategies

| Strategy   | Description                        |
|------------|------------------------------------|
| `identity` | Auto-increment (database-managed)  |
| `uuid_v4`  | Random UUID                        |
| `uuid_v7`  | Time-ordered UUID                  |
| `cuid2`    | CUID2                              |
| `ulid`     | ULID                               |

## Repository

```ts
const repo = conn.getRepository(User);

// Insert
const user = await repo.save(Object.assign(new User(), { name: 'Alice', email: 'alice@example.com' }));

// Find
const users = await repo.findAll();
const user  = await repo.findById(1);
const alice = await repo.findOne({ where: { name: 'Alice' } });

// Update
user.name = 'Alice Smith';
await repo.save(user);

// Delete
await repo.remove(user);

// Bulk
const saved = await repo.saveMany([user1, user2]);
await repo.removeMany([user1, user2]);

// Count / exists
const total  = await repo.count({ where: { email: IsNull() } });
const exists = await repo.exists({ email: 'alice@example.com' });

// Pagination
const page = await repo.findPaginated({ page: 1, limit: 20 });
// { data: User[], meta: { total, page, lastPage, limit } }
```

### Filter operators

```ts
import { Like, ILike, In, Between, Not, IsNull, IsNotNull, Raw } from 'mirror-orm';

await repo.find({ where: { name: Like('%alice%') } });
await repo.find({ where: { name: ILike('%alice%') } });   // case-insensitive
await repo.find({ where: { id: In([1, 2, 3]) } });
await repo.find({ where: { age: Between(18, 65) } });
await repo.find({ where: { email: Not(IsNull()) } });
await repo.find({ where: { score: Raw(col => `${col} > (SELECT avg(score) FROM users)`) } });

// OR groups
await repo.find({ where: [{ name: 'Alice' }, { name: 'Bob' }] });
```

### Find options

```ts
await repo.find({
    where:      { active: true },
    orderBy:    { createdAt: 'DESC' },
    limit:      10,
    offset:     20,
    relations:  ['posts'],
    select:     ['id', 'name'],
    lock:       'pessimistic_write',
    withDeleted: false,
});
```

## Relations

```ts
import { ManyToOne, OneToMany, ManyToMany, OneToOne } from 'mirror-orm';

@Entity('posts')
class Post {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Column()
    title!: string;

    @Column()
    authorId!: number;

    @ManyToOne(() => User, 'authorId')
    author?: User;
}

@Entity('users')
class User {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @OneToMany(() => Post, 'authorId')
    posts?: Post[];
}

// Load with relations
const posts = await postRepo.find({ relations: ['author'] });
// Nested relations
const posts = await postRepo.find({ relations: ['author.address'] });
```

## QueryBuilder

```ts
const results = await conn
    .createQueryBuilder(Post)
    .select(['p.id', 'p.title', 'u.name'])
    .leftJoin(User, 'u', 'u.id = p.authorId')
    .where('p.published = :pub', { pub: true })
    .andWhere('u.active = :active', { active: true })
    .orderBy('p.createdAt', 'DESC')
    .limit(10)
    .getMany();
```

## Transactions

Transactions propagate automatically via `AsyncLocalStorage` — any repository obtained from `conn.getRepository()` inside the callback uses the transaction runner without explicit wiring.

```ts
await conn.transaction(async trx => {
    const userRepo = trx.getRepository(User);
    const postRepo = trx.getRepository(Post);

    const user = await userRepo.save(Object.assign(new User(), { name: 'Alice' }));
    await postRepo.save(Object.assign(new Post(), { title: 'Hello', authorId: user.id }));
});
```

Nested `transaction()` calls automatically use savepoints:

```ts
await conn.transaction(async () => {
    // ...
    await conn.transaction(async () => {
        // SAVEPOINT — rolls back only this block on error
    });
});
```

## Streaming

```ts
for await (const user of repo.findStream({ where: { active: true } })) {
    process(user);
}
```

## Read replicas

```ts
const conn = await Connection.postgres({
    host: 'primary.db',
    database: 'mydb',
    user: 'app',
    password: 'secret',
    replica: {
        host: 'replica.db',
        user: 'app',
        password: 'secret',
    },
});

// Reads go to replica, writes go to primary — automatically
const users = await repo.findAll();     // replica
await repo.save(user);                  // primary
```

## Optimistic locking

```ts
@Entity('documents')
class Document {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Column()
    content!: string;

    @VersionColumn()
    version!: number;
}

// Throws OptimisticLockError if version has changed since load
await repo.save(document);
```

## Soft delete

```ts
import { DeletedAt } from 'mirror-orm';

@Entity('users')
class User {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @DeletedAt()
    deletedAt!: Date | null;
}

await repo.remove(user);                            // sets deletedAt
await repo.findAll();                               // excludes soft-deleted rows
await repo.findAll({ withDeleted: true });          // includes them
```

## Embedded value objects

```ts
class Address {
    @Column()
    street!: string;

    @Column()
    city!: string;
}

@Entity('users')
class User {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Embedded(() => Address, 'address_')
    address!: Address;
}
// Maps to columns: address_street, address_city
```

## Single Table Inheritance

```ts
@Entity({ tableName: 'animals', discriminatorColumn: 'type' })
class Animal {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Column()
    name!: string;
}

@ChildEntity('cat')
class Cat extends Animal {
    @Column({ nullable: true })
    indoor!: boolean;
}
```

## Lifecycle hooks

```ts
import { BeforeInsert, BeforeUpdate, AfterLoad } from 'mirror-orm';

@Entity('users')
class User {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Column()
    password!: string;

    @BeforeInsert()
    hashPassword() {
        this.password = hash(this.password);
    }

    @AfterLoad()
    sanitize() {
        this.password = '[hidden]';
    }
}
```

## JSON operators (PostgreSQL)

```ts
import { JsonContains, JsonHasKey, JsonHasAllKeys, JsonHasAnyKey } from 'mirror-orm';

await repo.find({ where: { metadata: JsonContains({ role: 'admin' }) } });
await repo.find({ where: { metadata: JsonHasKey('active') } });
await repo.find({ where: { metadata: JsonHasAllKeys(['a', 'b']) } });
await repo.find({ where: { metadata: JsonHasAnyKey(['a', 'b']) } });
```

## Global query filters

```ts
@Entity({ tableName: 'users', filters: { active: { active: true } } })
class User { ... }

// Filter applied automatically
await repo.find({ filters: ['active'] });

// Skip filter
await repo.find({ filters: [] });
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache 2.0](LICENSE)
