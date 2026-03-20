import { describe, it, expect, vi } from 'vitest';
import { QueryBuilder } from '../query-builder/query-builder';
import { RepositoryState } from '../repository/repository-state';
import { IEntityMetadata } from '../interfaces/entity-metadata';
import { IQueryRunner } from '../interfaces/query-runner';
import { MoreThan } from '../operators';
import { registry } from '../metadata/registry';
import { AuthorFixture, BookFixture } from './fixtures/user.entity';

void AuthorFixture;
void BookFixture;

class Post {
    id!: number;
    title!: string;
    viewCount!: number;
    authorId!: number;
}

const metadata: IEntityMetadata = {
    tableName: 'posts',
    className: 'Post',
    columns: [
        { propertyKey: 'id', databaseName: 'id', primary: true, options: {} },
        {
            propertyKey: 'title',
            databaseName: 'title',
            primary: false,
            options: {},
        },
        {
            propertyKey: 'viewCount',
            databaseName: 'view_count',
            primary: false,
            options: {},
        },
        {
            propertyKey: 'authorId',
            databaseName: 'author_id',
            primary: false,
            options: {},
        },
    ],
    relations: [],
};

// Entity with soft-delete column
class SoftPost {
    id!: number;
    title!: string;
    deletedAt!: Date | null;
}
const softMetadata: IEntityMetadata = {
    tableName: 'soft_posts',
    className: 'SoftPost',
    columns: [
        { propertyKey: 'id', databaseName: 'id', primary: true, options: {} },
        {
            propertyKey: 'title',
            databaseName: 'title',
            primary: false,
            options: {},
        },
        {
            propertyKey: 'deletedAt',
            databaseName: 'deleted_at',
            primary: false,
            options: {},
            deletedAt: true,
        },
    ],
    relations: [],
};

const makeRunner = (rows: object[] = []): IQueryRunner => ({
    query: vi.fn().mockResolvedValue(rows),
});

const makeQB = (runner: IQueryRunner) =>
    new QueryBuilder(new RepositoryState(Post, metadata), runner);

const makeSoftQB = (runner: IQueryRunner) =>
    new QueryBuilder(new RepositoryState(SoftPost, softMetadata), runner);

describe('QueryBuilder', () => {
    it('builds basic SELECT from entity', () => {
        const qb = makeQB(makeRunner());
        const { sql } = qb.build();
        expect(sql).toBe(
            'SELECT "id", "title", "view_count", "author_id" FROM "posts"',
        );
    });

    it('select() maps property keys to db column names', () => {
        const { sql } = makeQB(makeRunner())
            .select(['id', 'viewCount'])
            .build();
        expect(sql).toContain('"id"');
        expect(sql).toContain('"view_count"');
        expect(sql).not.toContain('"title"');
    });

    it('where() with typed condition generates WHERE clause', () => {
        const { sql, params } = makeQB(makeRunner())
            .where({ title: 'Hello' })
            .build();
        expect(sql).toContain('WHERE "title" = $1');
        expect(params).toEqual(['Hello']);
    });

    it('where() with operator', () => {
        const { sql, params } = makeQB(makeRunner())
            .where({ viewCount: MoreThan(100) })
            .build();
        expect(sql).toContain('"view_count" > $1');
        expect(params).toEqual([100]);
    });

    it('andWhere() appends raw SQL with correct param offset', () => {
        const { sql, params } = makeQB(makeRunner())
            .where({ title: 'A' })
            .andWhere('"view_count" > $1', [50])
            .build();
        expect(sql).toContain('"title" = $1');
        expect(sql).toContain('"view_count" > $2');
        expect(params).toEqual(['A', 50]);
    });

    it('where() with alias-prefixed key', () => {
        const { sql, params } = makeQB(makeRunner())
            .where({ 'a.age': 18 })
            .build();
        expect(sql).toContain('"a"."age" = $1');
        expect(params).toEqual([18]);
    });

    it('groupBy() and having() generate correct clauses', () => {
        const { sql } = makeQB(makeRunner())
            .groupBy('author_id')
            .having('COUNT(*) > 5')
            .build();
        expect(sql).toContain('GROUP BY author_id');
        expect(sql).toContain('HAVING COUNT(*) > 5');
    });

    it('orderBy() maps property key to db column name', () => {
        const { sql } = makeQB(makeRunner())
            .orderBy({ viewCount: 'DESC' })
            .build();
        expect(sql).toContain('ORDER BY "view_count" DESC');
    });

    it('limit() and offset() append correctly', () => {
        const { sql } = makeQB(makeRunner()).limit(10).offset(20).build();
        expect(sql).toContain('LIMIT 10');
        expect(sql).toContain('OFFSET 20');
    });

    it('getMany() executes and hydrates rows', async () => {
        const runner = makeRunner([
            { id: 1, title: 'T', view_count: 5, author_id: 2 },
        ]);
        const rows = await makeQB(runner).getMany();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toBeInstanceOf(Post);
        expect(rows[0].title).toBe('T');
        expect(rows[0].viewCount).toBe(5);
    });

    it('getRaw() returns plain rows without hydration', async () => {
        const raw = [{ author_id: 1, total: '3' }];
        const runner = makeRunner(raw);
        const rows = await makeQB(runner).getRaw();
        expect(rows[0]).not.toBeInstanceOf(Post);
        expect(rows[0].total).toBe('3');
    });

    it('getCount() builds COUNT query', async () => {
        const runner = makeRunner([{ count: '42' }]);
        const count = await makeQB(runner).where({ title: 'X' }).getCount();
        const sql = (runner.query as ReturnType<typeof vi.fn>).mock
            .calls[0][0] as string;
        expect(sql).toContain('SELECT COUNT(*)');
        expect(sql).toContain('"title" = $1');
        expect(count).toBe(42);
    });

    it('explain() prepends EXPLAIN ANALYZE', async () => {
        const runner = makeRunner([{ 'QUERY PLAN': 'Seq Scan on posts' }]);
        const plan = await makeQB(runner).explain();
        const sql = (runner.query as ReturnType<typeof vi.fn>).mock
            .calls[0][0] as string;
        expect(sql).toMatch(/^EXPLAIN ANALYZE /);
        expect(plan).toBe('Seq Scan on posts');
    });

    it('full chain builds correct SQL', () => {
        const { sql } = makeQB(makeRunner())
            .select(['id', 'viewCount'])
            .where({ title: 'Mirror' })
            .groupBy('"author_id"')
            .having('COUNT(*) > 1')
            .orderBy({ viewCount: 'DESC' })
            .limit(5)
            .offset(10)
            .build();

        expect(sql).toContain('SELECT "id", "view_count"');
        expect(sql).toContain('FROM "posts"');
        expect(sql).toContain('WHERE "title" = $1');
        expect(sql).toContain('GROUP BY "author_id"');
        expect(sql).toContain('HAVING COUNT(*) > 1');
        expect(sql).toContain('ORDER BY "view_count" DESC');
        expect(sql).toContain('LIMIT 5');
        expect(sql).toContain('OFFSET 10');
    });

    it('where() as array produces OR-combined groups', () => {
        const { sql, params } = makeQB(makeRunner())
            .where([{ title: 'A' }, { title: 'B' }])
            .build();
        expect(sql).toContain('WHERE "title" = $1 OR "title" = $2');
        expect(params).toEqual(['A', 'B']);
    });

    it('where() silently skips keys not in column map', () => {
        const { sql, params } = makeQB(makeRunner())
            .where({ unknownProp: 'x', title: 'Y' })
            .build();
        expect(sql).toContain('"title" = $1');
        expect(sql).not.toContain('unknownProp');
        expect(params).toEqual(['Y']);
    });

    it('select() passes through raw keys not in column map', () => {
        const { sql } = makeQB(makeRunner())
            .select(['id', 'COUNT(*) AS total'])
            .build();
        expect(sql).toContain('"id"');
        expect(sql).toContain('COUNT(*) AS total');
    });

    it('orderBy() passes through raw keys not in column map', () => {
        const { sql } = makeQB(makeRunner())
            .orderBy({ 'COUNT(*)': 'DESC' })
            .build();
        expect(sql).toContain('ORDER BY COUNT(*) DESC');
    });
});

// ─── QueryBuilder — leftJoin ──────────────────────────────────────────────────

describe('QueryBuilder — leftJoin', () => {
    const makeBookQB = (runner: IQueryRunner) =>
        new QueryBuilder(
            new RepositoryState(
                BookFixture,
                registry.getEntity('BookFixture')!,
            ),
            runner,
        );

    it('leftJoin builds correct LEFT JOIN clause', () => {
        const { sql } = makeBookQB(makeRunner())
            .leftJoin('author', 'a')
            .build();
        expect(sql).toContain('LEFT JOIN "authors" "a" ON');
        expect(sql).toContain('"author_id"');
    });

    it('leftJoin throws for unknown relation key', () => {
        expect(() =>
            makeBookQB(makeRunner()).leftJoin('nonExistent', 'x'),
        ).toThrow(/"nonExistent"/);
    });
});

// ─── QueryBuilder — soft-delete ───────────────────────────────────────────────

describe('QueryBuilder — soft-delete', () => {
    it('build() auto-appends IS NULL for deletedAt column with no WHERE', () => {
        const { sql } = makeSoftQB(makeRunner()).build();
        expect(sql).toContain('WHERE "deleted_at" IS NULL');
    });

    it('build() appends AND IS NULL when WHERE already exists', () => {
        const { sql } = makeSoftQB(makeRunner()).where({ title: 'X' }).build();
        expect(sql).toContain('"title" = $1');
        expect(sql).toContain('AND "deleted_at" IS NULL');
    });

    it('getCount() appends IS NULL to count query', async () => {
        const runner = makeRunner([{ count: '3' }]);
        await makeSoftQB(runner).getCount();
        const sql = (runner.query as ReturnType<typeof vi.fn>).mock
            .calls[0][0] as string;
        expect(sql).toContain('"deleted_at" IS NULL');
    });

    it('where() single group with multiple conditions wraps in parens', () => {
        const { sql } = makeQB(makeRunner())
            .where({ title: 'A', viewCount: MoreThan(0) })
            .build();
        expect(sql).toContain('("title" = $1 AND "view_count" > $2)');
    });

    it('getCount() with WHERE appends AND IS NULL (not WHERE IS NULL)', async () => {
        const runner = makeRunner([{ count: '1' }]);
        await makeSoftQB(runner).where({ title: 'X' }).getCount();
        const sql = (runner.query as ReturnType<typeof vi.fn>).mock
            .calls[0][0] as string;
        expect(sql).toContain('"title" = $1');
        expect(sql).toContain('AND "deleted_at" IS NULL');
    });
});
