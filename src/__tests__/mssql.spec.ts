import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Connection } from '../connection/connection';
import { Column } from '../decorators/column';
import { Entity } from '../decorators/entity';
import { PrimaryColumn } from '../decorators/primary-column';
import { Repository } from '../repository/repository';

@Entity('ms_users')
class MsUser {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Column()
    name!: string;

    @Column({ nullable: true })
    email!: string;
}

@Entity('ms_products')
class MsProduct {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    title!: string;
}

void MsUser;
void MsProduct;

const DB_CONFIG = {
    server: process.env.MIRROR_TEST_MSSQL_SERVER || 'localhost',
    port: parseInt(process.env.MIRROR_TEST_MSSQL_PORT || '1433'),
    database: process.env.MIRROR_TEST_MSSQL_DATABASE || 'mirror_test',
    user: process.env.MIRROR_TEST_MSSQL_USER || 'SA',
    password: process.env.MIRROR_TEST_MSSQL_PASSWORD || '',
    options: {
        encrypt: true,
        trustServerCertificate: true,
    },
};

describe('SQL Server adapter', () => {
    let conn: Connection;
    let userRepo: Repository<MsUser>;
    let productRepo: Repository<MsProduct>;

    beforeAll(async () => {
        conn = await Connection.sqlServer(DB_CONFIG);
        await conn.query(
            `IF OBJECT_ID('ms_users') IS NOT NULL DROP TABLE ms_users`,
        );
        await conn.query(
            `IF OBJECT_ID('ms_products') IS NOT NULL DROP TABLE ms_products`,
        );
        await conn.query(
            `CREATE TABLE ms_users (id INT IDENTITY(1,1) PRIMARY KEY, name NVARCHAR(255) NOT NULL, email NVARCHAR(255))`,
        );
        await conn.query(
            `CREATE TABLE ms_products (id NVARCHAR(36) PRIMARY KEY, title NVARCHAR(255) NOT NULL)`,
        );
        userRepo = conn.getRepository(MsUser);
        productRepo = conn.getRepository(MsProduct);
    });

    afterAll(async () => {
        if (!conn) return;
        await conn.query(
            `IF OBJECT_ID('ms_users') IS NOT NULL DROP TABLE ms_users`,
        );
        await conn.query(
            `IF OBJECT_ID('ms_products') IS NOT NULL DROP TABLE ms_products`,
        );
        await conn.disconnect();
    });

    // ─── save (identity) ────────────────────────────────────────────────────

    describe('save (identity PK)', () => {
        it('inserts and returns hydrated entity with auto-generated id', async () => {
            const user = Object.assign(new MsUser(), {
                name: 'Alice',
                email: 'alice@test.com',
            });
            const saved = await userRepo.save(user);

            expect(saved).toBeInstanceOf(MsUser);
            expect(saved.id).toBeTypeOf('number');
            expect(saved.name).toBe('Alice');
            expect(saved.email).toBe('alice@test.com');
        });

        it('updates existing entity', async () => {
            const user = await userRepo.save(
                Object.assign(new MsUser(), { name: 'Bob' }),
            );
            user.name = 'Bob Updated';
            const updated = await userRepo.save(user);

            expect(updated.name).toBe('Bob Updated');
            expect(updated.id).toBe(user.id);
        });
    });

    // ─── save (uuid PK) ─────────────────────────────────────────────────────

    describe('save (uuid PK)', () => {
        it('inserts and returns hydrated entity with generated uuid', async () => {
            const product = Object.assign(new MsProduct(), {
                title: 'Mirror Book',
            });
            const saved = await productRepo.save(product);

            expect(saved).toBeInstanceOf(MsProduct);
            expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
            expect(saved.title).toBe('Mirror Book');
        });
    });

    // ─── findAll / findById ──────────────────────────────────────────────────

    describe('findAll / findById', () => {
        it('returns all inserted rows', async () => {
            const all = await userRepo.findAll();
            expect(all.length).toBeGreaterThanOrEqual(2);
            expect(all[0]).toBeInstanceOf(MsUser);
        });

        it('findById returns correct entity', async () => {
            const inserted = await userRepo.save(
                Object.assign(new MsUser(), {
                    name: 'Carol',
                    email: 'c@test.com',
                }),
            );
            const found = await userRepo.findById(inserted.id);

            expect(found).toBeInstanceOf(MsUser);
            expect(found!.name).toBe('Carol');
        });

        it('findById returns null for unknown id', async () => {
            expect(await userRepo.findById(999999)).toBeNull();
        });
    });

    // ─── find (where) ────────────────────────────────────────────────────────

    describe('find (where)', () => {
        it('filters by exact column value', async () => {
            await userRepo.save(
                Object.assign(new MsUser(), {
                    name: 'FilterMe',
                    email: 'f@x.com',
                }),
            );
            const result = await userRepo.find({ where: { name: 'FilterMe' } });

            expect(result.length).toBeGreaterThanOrEqual(1);
            expect(result[0].name).toBe('FilterMe');
        });
    });

    // ─── remove ─────────────────────────────────────────────────────────────

    describe('remove', () => {
        it('deletes an entity by PK', async () => {
            const user = await userRepo.save(
                Object.assign(new MsUser(), { name: 'Delete Me' }),
            );
            await userRepo.remove(user);

            expect(await userRepo.findById(user.id)).toBeNull();
        });
    });

    // ─── saveMany / removeMany ───────────────────────────────────────────────

    describe('saveMany / removeMany', () => {
        it('inserts multiple entities', async () => {
            const a = Object.assign(new MsUser(), { name: 'Bulk A' });
            const b = Object.assign(new MsUser(), { name: 'Bulk B' });
            const saved = await userRepo.saveMany([a, b]);

            expect(saved).toHaveLength(2);
            expect(saved[0].id).toBeTypeOf('number');
            expect(saved[1].id).toBeTypeOf('number');
        });

        it('removes multiple entities by PK', async () => {
            const a = await userRepo.save(
                Object.assign(new MsUser(), { name: 'RM A' }),
            );
            const b = await userRepo.save(
                Object.assign(new MsUser(), { name: 'RM B' }),
            );
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

            await conn.transaction(async (trx) => {
                const repo = trx.getRepository(MsUser);
                await repo.save(
                    Object.assign(new MsUser(), { name: 'Trx User' }),
                );
            });

            const after = await userRepo.findAll();
            expect(after.length).toBe(before.length + 1);
        });

        it('rolls back on error', async () => {
            const before = await userRepo.findAll();

            await expect(
                conn.transaction(async (trx) => {
                    const repo = trx.getRepository(MsUser);
                    await repo.save(
                        Object.assign(new MsUser(), { name: 'Rollback' }),
                    );
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
            const rows: MsUser[] = [];
            for await (const user of userRepo.findStream()) {
                rows.push(user);
            }

            expect(rows.length).toBeGreaterThan(0);
            expect(rows[0]).toBeInstanceOf(MsUser);
        });
    });
});
