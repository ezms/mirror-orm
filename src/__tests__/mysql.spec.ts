import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Connection } from '../connection/connection';
import { Column } from '../decorators/column';
import { Entity } from '../decorators/entity';
import { PrimaryColumn } from '../decorators/primary-column';
import { Repository } from '../repository/repository';

@Entity('my_users')
class MyUser {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Column()
    name!: string;

    @Column({ nullable: true })
    email!: string;
}

@Entity('my_products')
class MyProduct {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    title!: string;
}

void MyUser;
void MyProduct;

const DB_CONFIG = {
    host: '127.0.0.1',
    port: 3306,
    database: 'mirror_test',
    user: 'root',
    password: 'root',
};

describe('MySQL adapter', () => {
    let conn: Connection;
    let userRepo: Repository<MyUser>;
    let productRepo: Repository<MyProduct>;

    beforeAll(async () => {
        conn = await Connection.mysql(DB_CONFIG);
        await conn.query(`DROP TABLE IF EXISTS my_users`);
        await conn.query(`DROP TABLE IF EXISTS my_products`);
        await conn.query(`CREATE TABLE my_users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255))`);
        await conn.query(`CREATE TABLE my_products (id VARCHAR(36) PRIMARY KEY, title VARCHAR(255) NOT NULL)`);
        userRepo = conn.getRepository(MyUser);
        productRepo = conn.getRepository(MyProduct);
    });

    afterAll(async () => {
        await conn.query(`DROP TABLE IF EXISTS my_users`);
        await conn.query(`DROP TABLE IF EXISTS my_products`);
        await conn.disconnect();
    });

    // ─── save (identity) ────────────────────────────────────────────────────

    describe('save (identity PK)', () => {
        it('inserts and returns hydrated entity with auto-generated id', async () => {
            const user = Object.assign(new MyUser(), { name: 'Alice', email: 'alice@test.com' });
            const saved = await userRepo.save(user);

            expect(saved).toBeInstanceOf(MyUser);
            expect(saved.id).toBeTypeOf('number');
            expect(saved.name).toBe('Alice');
            expect(saved.email).toBe('alice@test.com');
        });

        it('updates existing entity', async () => {
            const user = await userRepo.save(Object.assign(new MyUser(), { name: 'Bob' }));
            user.name = 'Bob Updated';
            const updated = await userRepo.save(user);

            expect(updated.name).toBe('Bob Updated');
            expect(updated.id).toBe(user.id);
        });
    });

    // ─── save (uuid PK) ─────────────────────────────────────────────────────

    describe('save (uuid PK)', () => {
        it('inserts and returns hydrated entity with generated uuid', async () => {
            const product = Object.assign(new MyProduct(), { title: 'Mirror Book' });
            const saved = await productRepo.save(product);

            expect(saved).toBeInstanceOf(MyProduct);
            expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
            expect(saved.title).toBe('Mirror Book');
        });
    });

    // ─── findAll / findById ──────────────────────────────────────────────────

    describe('findAll / findById', () => {
        it('returns all inserted rows', async () => {
            const all = await userRepo.findAll();
            expect(all.length).toBeGreaterThanOrEqual(2);
            expect(all[0]).toBeInstanceOf(MyUser);
        });

        it('findById returns correct entity', async () => {
            const inserted = await userRepo.save(Object.assign(new MyUser(), { name: 'Carol', email: 'c@test.com' }));
            const found = await userRepo.findById(inserted.id);

            expect(found).toBeInstanceOf(MyUser);
            expect(found!.name).toBe('Carol');
        });

        it('findById returns null for unknown id', async () => {
            expect(await userRepo.findById(999999)).toBeNull();
        });
    });

    // ─── find (where) ────────────────────────────────────────────────────────

    describe('find (where)', () => {
        it('filters by exact column value', async () => {
            await userRepo.save(Object.assign(new MyUser(), { name: 'FilterMe', email: 'f@x.com' }));
            const result = await userRepo.find({ where: { name: 'FilterMe' } });

            expect(result.length).toBeGreaterThanOrEqual(1);
            expect(result[0].name).toBe('FilterMe');
        });
    });

    // ─── remove ─────────────────────────────────────────────────────────────

    describe('remove', () => {
        it('deletes an entity by PK', async () => {
            const user = await userRepo.save(Object.assign(new MyUser(), { name: 'Delete Me' }));
            await userRepo.remove(user);

            expect(await userRepo.findById(user.id)).toBeNull();
        });
    });

    // ─── saveMany / removeMany ───────────────────────────────────────────────

    describe('saveMany / removeMany', () => {
        it('inserts multiple entities', async () => {
            const a = Object.assign(new MyUser(), { name: 'Bulk A' });
            const b = Object.assign(new MyUser(), { name: 'Bulk B' });
            const saved = await userRepo.saveMany([a, b]);

            expect(saved).toHaveLength(2);
            expect(saved[0].id).toBeTypeOf('number');
            expect(saved[1].id).toBeTypeOf('number');
        });

        it('removes multiple entities by PK', async () => {
            const a = await userRepo.save(Object.assign(new MyUser(), { name: 'RM A' }));
            const b = await userRepo.save(Object.assign(new MyUser(), { name: 'RM B' }));
            const before = await userRepo.findAll();

            await userRepo.removeMany([a, b]);

            const after = await userRepo.findAll();
            expect(after.length).toBe(before.length - 2);
        });
    });

    // ─── transaction ─────────────────────────────────────────────────────────

    describe('transaction', () => {
        it('commits changes inside a transaction', async () => {
            const before = await userRepo.findAll();

            await conn.transaction(async trx => {
                const repo = trx.getRepository(MyUser);
                await repo.save(Object.assign(new MyUser(), { name: 'Trx User' }));
            });

            const after = await userRepo.findAll();
            expect(after.length).toBe(before.length + 1);
        });

        it('rolls back on error', async () => {
            const before = await userRepo.findAll();

            await expect(
                conn.transaction(async trx => {
                    const repo = trx.getRepository(MyUser);
                    await repo.save(Object.assign(new MyUser(), { name: 'Rollback' }));
                    throw new Error('force rollback');
                }),
            ).rejects.toThrow('force rollback');

            const after = await userRepo.findAll();
            expect(after.length).toBe(before.length);
        });
    });

    // ─── queryStream ─────────────────────────────────────────────────────────

    describe('queryStream', () => {
        it('streams all rows via findStream', async () => {
            const rows: MyUser[] = [];
            for await (const user of userRepo.findStream()) {
                rows.push(user);
            }

            expect(rows.length).toBeGreaterThan(0);
            expect(rows[0]).toBeInstanceOf(MyUser);
        });
    });
});
