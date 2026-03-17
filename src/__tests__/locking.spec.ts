import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Repository } from '../repository/repository';
import { IEntityMetadata } from '../interfaces/entity-metadata';
import { IQueryRunner } from '../interfaces/query-runner';

class Product {
    id: number;
    name: string;
    stock: number;
}

const metadata: IEntityMetadata = {
    tableName: 'products',
    className: 'Product',
    columns: [
        { propertyKey: 'id',    databaseName: 'id',    primary: true,  options: { generation: { strategy: 'identity' } } },
        { propertyKey: 'name',  databaseName: 'name',  primary: false, options: {} },
        { propertyKey: 'stock', databaseName: 'stock', primary: false, options: {} },
    ],
    relations: [],
};

const makeRunner = (rows: object[] = []): IQueryRunner => ({
    query: vi.fn().mockResolvedValue(rows),
});

describe('pessimistic locking', () => {
    let runner: IQueryRunner;
    let repo: Repository<Product>;

    beforeEach(() => {
        runner = makeRunner();
        repo = new Repository(Product, runner, metadata);
    });

    it('pessimistic_write appends FOR UPDATE', async () => {
        await repo.find({ where: { id: 1 }, lock: 'pessimistic_write' });
        const sql = (runner.query as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(sql).toContain('FOR UPDATE');
        expect(sql).not.toContain('FOR SHARE');
    });

    it('pessimistic_read appends FOR SHARE', async () => {
        await repo.find({ where: { id: 1 }, lock: 'pessimistic_read' });
        const sql = (runner.query as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(sql).toContain('FOR SHARE');
        expect(sql).not.toContain('FOR UPDATE');
    });

    it('no lock option produces plain SELECT', async () => {
        await repo.find({ where: { id: 1 } });
        const sql = (runner.query as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(sql).not.toContain('FOR UPDATE');
        expect(sql).not.toContain('FOR SHARE');
    });

    it('lock is appended after LIMIT and OFFSET', async () => {
        await repo.find({ limit: 10, offset: 5, lock: 'pessimistic_write' });
        const sql = (runner.query as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(sql).toMatch(/LIMIT 10 OFFSET 5 FOR UPDATE/);
    });

    it('lock works without WHERE clause', async () => {
        await repo.find({ lock: 'pessimistic_write' });
        const sql = (runner.query as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(sql).toMatch(/SELECT .+ FROM "products" FOR UPDATE/);
    });
});
