import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Entity } from '../decorators/entity';
import { Column } from '../decorators/column';
import { PrimaryColumn } from '../decorators/primary-column';
import { IQueryRunner } from '../interfaces/query-runner';
import { registry } from '../metadata/registry';
import { Repository } from '../repository/repository';
import { Like } from '../operators';

// ─── Fixtures ────────────────────────────────────────────────────────────────

@Entity({
    tableName: 'products',
    filters: {
        active:     { status: 'active' },
        inStock:    { stock: 1 },
        expensive:  { price: 100 },
    },
})
class ProductFixture {
    @PrimaryColumn({ strategy: 'identity' }) id!: number;
    @Column() name!: string;
    @Column() status!: string;
    @Column() stock!: number;
    @Column() price!: number;
}

void ProductFixture;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Global query filters', () => {
    let mockQuery: Mock;
    let runner: IQueryRunner;
    let repo: Repository<ProductFixture>;

    beforeEach(() => {
        mockQuery = vi.fn().mockResolvedValue([]);
        runner = { query: mockQuery };
        repo = new Repository(ProductFixture, runner, registry.getEntity('ProductFixture')!);
    });

    it('find without filters emits no extra WHERE clause', async () => {
        await repo.find({});
        const [sql] = mockQuery.mock.calls[0];
        expect(sql).toBe('SELECT "id", "name", "status", "stock", "price" FROM "products"');
    });

    it('single filter appends AND clause', async () => {
        await repo.find({ filters: ['active'] });
        const [sql, params] = mockQuery.mock.calls[0];
        expect(sql).toBe('SELECT "id", "name", "status", "stock", "price" FROM "products" WHERE "status" = $1');
        expect(params).toEqual(['active']);
    });

    it('two filters are both ANDed', async () => {
        await repo.find({ filters: ['active', 'inStock'] });
        const [sql] = mockQuery.mock.calls[0];
        expect(sql).toContain('"status" = $1');
        expect(sql).toContain('"stock" = $2');
        expect(sql).toMatch(/WHERE .+ AND .+/);
    });

    it('filter combined with explicit where ANDs both', async () => {
        await repo.find({ where: { name: 'Widget' }, filters: ['active'] });
        const [sql] = mockQuery.mock.calls[0];
        expect(sql).toContain('"name" = $1');
        expect(sql).toContain('"status" = $2');
        expect(sql).toMatch(/WHERE .+ AND .+/);
    });

    it('unknown filter name is silently ignored', async () => {
        await repo.find({ filters: ['nonExistent'] });
        const [sql] = mockQuery.mock.calls[0];
        expect(sql).toBe('SELECT "id", "name", "status", "stock", "price" FROM "products"');
    });

    it('empty filters array is treated as no filters', async () => {
        await repo.find({ filters: [] });
        const [sql] = mockQuery.mock.calls[0];
        expect(sql).toBe('SELECT "id", "name", "status", "stock", "price" FROM "products"');
    });

    it('filter params are appended after explicit where params', async () => {
        await repo.find({ where: { name: 'Widget' }, filters: ['expensive'] });
        const [, params] = mockQuery.mock.calls[0];
        expect(params[0]).toBe('Widget');
        expect(params[1]).toBe(100);
    });

    it('filter works with operator values', async () => {
        @Entity({
            tableName: 'items',
            filters: { search: { name: Like('%gadget%') } },
        })
        class ItemFixture {
            @PrimaryColumn({ strategy: 'identity' }) id!: number;
            @Column() name!: string;
        }
        void ItemFixture;

        const itemRepo = new Repository(ItemFixture, runner, registry.getEntity('ItemFixture')!);
        await itemRepo.find({ filters: ['search'] });
        const [sql] = mockQuery.mock.calls[0];
        expect(sql).toContain('"name" LIKE $1');
    });
});
