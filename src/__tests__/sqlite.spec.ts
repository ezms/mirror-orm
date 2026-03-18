import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Connection } from '../connection/connection';
import { Column } from '../decorators/column';
import { Entity } from '../decorators/entity';
import { PrimaryColumn } from '../decorators/primary-column';
import { Repository } from '../repository/repository';

@Entity('sq_users')
class SqUser {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Column()
    name!: string;

    @Column({ nullable: true })
    email!: string;
}

@Entity('sq_products')
class SqProduct {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    title!: string;
}

void SqUser;
void SqProduct;

describe('SQLite adapter (in-memory)', () => {
    let conn: Connection;
    let userRepo: Repository<SqUser>;
    let productRepo: Repository<SqProduct>;

    beforeEach(async () => {
        conn = await Connection.sqlite({ database: ':memory:' });
        await conn.query(`CREATE TABLE sq_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT)`);
        await conn.query(`CREATE TABLE sq_products (id TEXT PRIMARY KEY, title TEXT NOT NULL)`);
        userRepo = conn.getRepository(SqUser);
        productRepo = conn.getRepository(SqProduct);
    });

    afterEach(async () => {
        await conn.disconnect();
    });

    // ─── save (identity) ────────────────────────────────────────────────────

    describe('save (identity PK)', () => {
        it('inserts and returns hydrated entity with auto-generated id', async () => {
            const user = new SqUser();
            user.name = 'Alice';
            user.email = 'alice@test.com';

            const saved = await userRepo.save(user);

            expect(saved).toBeInstanceOf(SqUser);
            expect(saved.id).toBe(1);
            expect(saved.name).toBe('Alice');
            expect(saved.email).toBe('alice@test.com');
        });

        it('updates existing entity', async () => {
            const user = new SqUser();
            user.name = 'Bob';
            const saved = await userRepo.save(user);

            saved.name = 'Bob Updated';
            const updated = await userRepo.save(saved);

            expect(updated.name).toBe('Bob Updated');
            expect(updated.id).toBe(saved.id);
        });
    });

    // ─── save (uuid PK) ─────────────────────────────────────────────────────

    describe('save (uuid PK)', () => {
        it('inserts and returns hydrated entity with generated uuid', async () => {
            const product = new SqProduct();
            product.title = 'Mirror Book';

            const saved = await productRepo.save(product);

            expect(saved).toBeInstanceOf(SqProduct);
            expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
            expect(saved.title).toBe('Mirror Book');
        });
    });

    // ─── findAll / findById ──────────────────────────────────────────────────

    describe('findAll / findById', () => {
        it('returns all inserted rows', async () => {
            await conn.query(`INSERT INTO sq_users (name, email) VALUES ('Alice', 'a@test.com'), ('Bob', NULL)`);

            const all = await userRepo.findAll();

            expect(all).toHaveLength(2);
            expect(all[0]).toBeInstanceOf(SqUser);
        });

        it('findById returns correct entity', async () => {
            await conn.query(`INSERT INTO sq_users (name, email) VALUES ('Carol', 'c@test.com')`);

            const found = await userRepo.findById(1);

            expect(found).toBeInstanceOf(SqUser);
            expect(found!.name).toBe('Carol');
        });

        it('findById returns null for unknown id', async () => {
            expect(await userRepo.findById(999)).toBeNull();
        });
    });

    // ─── find (where) ────────────────────────────────────────────────────────

    describe('find (where)', () => {
        it('filters by exact column value', async () => {
            await conn.query(`INSERT INTO sq_users (name, email) VALUES ('Alice', 'a@x.com'), ('Bob', 'b@x.com')`);

            const result = await userRepo.find({ where: { name: 'Alice' } });

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Alice');
        });
    });

    // ─── remove ─────────────────────────────────────────────────────────────

    describe('remove', () => {
        it('deletes an entity by PK', async () => {
            const user = new SqUser();
            user.name = 'Delete Me';
            const saved = await userRepo.save(user);

            await userRepo.remove(saved);

            expect(await userRepo.findById(saved.id)).toBeNull();
        });
    });

    // ─── saveMany / removeMany ───────────────────────────────────────────────

    describe('saveMany / removeMany', () => {
        it('inserts multiple entities', async () => {
            const a = Object.assign(new SqUser(), { name: 'A', email: 'a@x.com' });
            const b = Object.assign(new SqUser(), { name: 'B', email: 'b@x.com' });

            const saved = await userRepo.saveMany([a, b]);

            expect(saved).toHaveLength(2);
            expect(saved[0].id).toBeTypeOf('number');
            expect(saved[1].id).toBeTypeOf('number');
        });

        it('removes multiple entities by PK', async () => {
            const a = await userRepo.save(Object.assign(new SqUser(), { name: 'A' }));
            const b = await userRepo.save(Object.assign(new SqUser(), { name: 'B' }));

            await userRepo.removeMany([a, b]);

            expect(await userRepo.findAll()).toHaveLength(0);
        });
    });

    // ─── transaction ─────────────────────────────────────────────────────────

    describe('transaction', () => {
        it('commits changes inside a transaction', async () => {
            await conn.transaction(async trx => {
                const repo = trx.getRepository(SqUser);
                const u = Object.assign(new SqUser(), { name: 'Trx User' });
                await repo.save(u);
            });

            expect(await userRepo.findAll()).toHaveLength(1);
        });

        it('rolls back on error', async () => {
            await expect(
                conn.transaction(async trx => {
                    const repo = trx.getRepository(SqUser);
                    await repo.save(Object.assign(new SqUser(), { name: 'Rollback' }));
                    throw new Error('force rollback');
                }),
            ).rejects.toThrow('force rollback');

            expect(await userRepo.findAll()).toHaveLength(0);
        });
    });

    // ─── queryStream ─────────────────────────────────────────────────────────

    describe('queryStream', () => {
        it('streams all rows via findStream', async () => {
            await conn.query(`INSERT INTO sq_users (name, email) VALUES ('S1', NULL), ('S2', NULL), ('S3', NULL)`);

            const rows: SqUser[] = [];
            for await (const user of userRepo.findStream()) {
                rows.push(user);
            }

            expect(rows).toHaveLength(3);
            expect(rows[0]).toBeInstanceOf(SqUser);
        });
    });
});
