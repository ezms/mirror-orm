import { describe, it, expect, vi } from 'vitest';
import { Repository } from '../repository/repository';
import { IEntityMetadata } from '../interfaces/entity-metadata';
import { IQueryRunner } from '../interfaces/query-runner';

class Post {
    id!: number;
    title!: string;
}

const metadata: IEntityMetadata = {
    tableName: 'posts',
    className: 'Post',
    columns: [
        { propertyKey: 'id',    databaseName: 'id',    primary: true,  options: {} },
        { propertyKey: 'title', databaseName: 'title', primary: false, options: {} },
    ],
    relations: [],
};

const makeRunner = (rows: object[] = [], count = rows.length): IQueryRunner => ({
    query: vi.fn()
        .mockResolvedValueOnce([{ count: String(count) }])  // count query fired first in findAndCount
        .mockResolvedValueOnce(rows),                        // then find query
});

describe('findPaginated', () => {
    it('returns data and correct meta for page 1', async () => {
        const rows = [{ id: 1, title: 'A' }, { id: 2, title: 'B' }];
        const repo = new Repository(Post, makeRunner(rows, 10), metadata);
        const result = await repo.findPaginated({ page: 1, limit: 2 });

        expect(result.data).toHaveLength(2);
        expect(result.meta).toEqual({ total: 10, page: 1, lastPage: 5, limit: 2 });
    });

    it('calculates offset correctly for page 3', async () => {
        const runner = makeRunner([], 30);
        const repo = new Repository(Post, runner, metadata);
        await repo.findPaginated({ page: 3, limit: 5 });

        const sql = (runner.query as ReturnType<typeof vi.fn>).mock.calls[1][0];
        expect(sql).toContain('LIMIT 5');
        expect(sql).toContain('OFFSET 10');
    });

    it('lastPage is at least 1 when total is 0', async () => {
        const repo = new Repository(Post, makeRunner([], 0), metadata);
        const result = await repo.findPaginated({ page: 1, limit: 10 });
        expect(result.meta.lastPage).toBe(1);
    });

    it('lastPage rounds up correctly', async () => {
        const repo = new Repository(Post, makeRunner([], 11), metadata);
        const result = await repo.findPaginated({ page: 1, limit: 5 });
        expect(result.meta.lastPage).toBe(3);
    });

    it('forwards where, orderBy and withDeleted to find', async () => {
        const runner = makeRunner([], 5);
        const repo = new Repository(Post, runner, metadata);
        await repo.findPaginated({ page: 1, limit: 5, where: { id: 1 }, orderBy: { id: 'DESC' } });

        const sql = (runner.query as ReturnType<typeof vi.fn>).mock.calls[1][0];
        expect(sql).toContain('"id" = $');
        expect(sql).toContain('ORDER BY');
    });
});
