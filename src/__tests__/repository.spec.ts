import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MissingPrimaryKeyError, NoPrimaryColumnError, QueryError } from '../errors';
import { IEntityMetadata } from '../interfaces/entity-metadata';
import { IQueryRunner } from '../interfaces/query-runner';
import { registry } from '../metadata/registry';
import { Like } from '../operators';
import { Repository } from '../repository/repository';
import { PostFixture, UserFixture } from './fixtures/user.entity';

// force decorator registration
void UserFixture;
void PostFixture;

describe('Repository<UserFixture> (identity PK)', () => {
    let mockQuery: Mock;
    let runner: IQueryRunner;
    let repo: Repository<UserFixture>;
    let metadata: IEntityMetadata;

    beforeEach(() => {
        metadata = registry.getEntity('UserFixture')!;
        mockQuery = vi.fn();
        runner = { query: mockQuery };
        repo = new Repository(UserFixture, runner, metadata);
    });

    // ─── findAll ────────────────────────────────────────────────────────────

    describe('findAll', () => {
        it('executes SELECT * and hydrates results', async () => {
            mockQuery.mockResolvedValueOnce([{ id: 1, name: 'Emanuel', email: 'e@test.com' }]);

            const result = await repo.findAll();

            expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users');
            expect(result).toHaveLength(1);
            expect(result[0]).toBeInstanceOf(UserFixture);
            expect(result[0].id).toBe(1);
            expect(result[0].name).toBe('Emanuel');
        });

        it('returns empty array when table is empty', async () => {
            mockQuery.mockResolvedValueOnce([]);
            expect(await repo.findAll()).toEqual([]);
        });

        it('wraps database errors in QueryError', async () => {
            mockQuery.mockRejectedValueOnce(new Error('connection refused'));
            await expect(repo.findAll()).rejects.toThrow(QueryError);
        });
    });

    // ─── findById ───────────────────────────────────────────────────────────

    describe('findById', () => {
        it('queries by primary key and hydrates the result', async () => {
            mockQuery.mockResolvedValueOnce([{ id: 1, name: 'Emanuel', email: null }]);

            const result = await repo.findById(1);

            expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
            expect(result).toBeInstanceOf(UserFixture);
            expect(result!.id).toBe(1);
        });

        it('returns null when no row is found', async () => {
            mockQuery.mockResolvedValueOnce([]);
            expect(await repo.findById(999)).toBeNull();
        });

        it('wraps database errors in QueryError', async () => {
            mockQuery.mockRejectedValueOnce(new Error('timeout'));
            await expect(repo.findById(1)).rejects.toThrow(QueryError);
        });
    });

    // ─── find ────────────────────────────────────────────────────────────────

    describe('find', () => {
        it('executes SELECT * with no WHERE when called with empty options', async () => {
            mockQuery.mockResolvedValueOnce([]);
            await repo.find();
            expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users', []);
        });

        it('builds WHERE clause for simple equality', async () => {
            mockQuery.mockResolvedValueOnce([]);
            await repo.find({ where: { name: 'Emanuel' } });
            expect(mockQuery).toHaveBeenCalledWith(
                'SELECT * FROM users WHERE name = $1',
                ['Emanuel'],
            );
        });

        it('builds WHERE clause using a query operator', async () => {
            mockQuery.mockResolvedValueOnce([]);
            await repo.find({ where: { name: Like('%manu%') } });
            expect(mockQuery).toHaveBeenCalledWith(
                'SELECT * FROM users WHERE name LIKE $1',
                ['%manu%'],
            );
        });

        it('joins multiple where conditions with AND', async () => {
            mockQuery.mockResolvedValueOnce([]);
            await repo.find({ where: { name: 'Emanuel', email: 'e@test.com' } });
            const [sql, params] = mockQuery.mock.calls[0];
            expect(sql).toContain('AND');
            expect(params).toContain('Emanuel');
            expect(params).toContain('e@test.com');
        });

        it('joins array where groups with OR', async () => {
            mockQuery.mockResolvedValueOnce([]);
            await repo.find({ where: [{ name: 'A' }, { name: 'B' }] });
            expect(mockQuery).toHaveBeenCalledWith(
                'SELECT * FROM users WHERE name = $1 OR name = $2',
                ['A', 'B'],
            );
        });

        it('wraps multi-condition groups in parentheses for OR', async () => {
            mockQuery.mockResolvedValueOnce([]);
            await repo.find({ where: [{ name: 'A', email: 'a@test.com' }, { name: 'B' }] });
            const [sql] = mockQuery.mock.calls[0];
            expect(sql).toContain('(name = $1 AND email = $2) OR name = $3');
        });

        it('appends ORDER BY clause', async () => {
            mockQuery.mockResolvedValueOnce([]);
            await repo.find({ orderBy: { name: 'ASC' } });
            const [sql] = mockQuery.mock.calls[0];
            expect(sql).toContain('ORDER BY name ASC');
        });

        it('appends LIMIT and OFFSET', async () => {
            mockQuery.mockResolvedValueOnce([]);
            await repo.find({ limit: 10, offset: 20 });
            const [sql] = mockQuery.mock.calls[0];
            expect(sql).toContain('LIMIT 10');
            expect(sql).toContain('OFFSET 20');
        });

        it('accepts offset: 0 without ignoring it', async () => {
            mockQuery.mockResolvedValueOnce([]);
            await repo.find({ offset: 0 });
            const [sql] = mockQuery.mock.calls[0];
            expect(sql).toContain('OFFSET 0');
        });

        it('wraps database errors in QueryError', async () => {
            mockQuery.mockRejectedValueOnce(new Error('syntax error'));
            await expect(repo.find({ where: { name: 'x' } })).rejects.toThrow(QueryError);
        });
    });

    // ─── count ───────────────────────────────────────────────────────────────

    describe('count', () => {
        it('executes SELECT COUNT(*) without where', async () => {
            mockQuery.mockResolvedValueOnce([{ count: '42' }]);

            const result = await repo.count();

            expect(mockQuery).toHaveBeenCalledWith('SELECT COUNT(*) FROM users', []);
            expect(result).toBe(42);
        });

        it('returns a number, not a string', async () => {
            mockQuery.mockResolvedValueOnce([{ count: '7' }]);
            expect(typeof await repo.count()).toBe('number');
        });

        it('builds WHERE clause when where is provided', async () => {
            mockQuery.mockResolvedValueOnce([{ count: '3' }]);
            await repo.count({ name: 'Emanuel' });
            const [sql] = mockQuery.mock.calls[0];
            expect(sql).toContain('WHERE name = $1');
        });

        it('supports OR via array where', async () => {
            mockQuery.mockResolvedValueOnce([{ count: '5' }]);
            await repo.count([{ name: 'A' }, { name: 'B' }]);
            const [sql] = mockQuery.mock.calls[0];
            expect(sql).toContain('WHERE name = $1 OR name = $2');
        });
    });

    // ─── save (insert) ───────────────────────────────────────────────────────

    describe('save → insert (identity PK)', () => {
        it('inserts without id column when strategy is identity', async () => {
            mockQuery.mockResolvedValueOnce([{ id: 1, name: 'Emanuel', email: 'e@test.com' }]);

            const user = new UserFixture();
            user.name = 'Emanuel';
            user.email = 'e@test.com';

            const result = await repo.save(user);

            const [sql, params] = mockQuery.mock.calls[0];
            expect(sql).toContain('INSERT INTO users');
            expect(sql).not.toMatch(/\bid\b.*VALUES/);
            expect(sql).toContain('RETURNING *');
            expect(params).toContain('Emanuel');
            expect(result).toBeInstanceOf(UserFixture);
            expect(result.id).toBe(1);
        });

        it('wraps database errors in QueryError on insert', async () => {
            mockQuery.mockRejectedValueOnce(new Error('unique violation'));
            const user = new UserFixture();
            user.name = 'x';
            await expect(repo.save(user)).rejects.toThrow(QueryError);
        });
    });

    // ─── save (update) ───────────────────────────────────────────────────────

    describe('save → update', () => {
        it('updates when entity has a pk value', async () => {
            mockQuery.mockResolvedValueOnce([{ id: 1, name: 'Updated', email: null }]);

            const user = new UserFixture();
            user.id = 1;
            user.name = 'Updated';

            await repo.save(user);

            const [sql, params] = mockQuery.mock.calls[0];
            expect(sql).toContain('UPDATE users');
            expect(sql).toContain('WHERE id =');
            expect(sql).toContain('RETURNING *');
            expect(params).toContain(1);
        });
    });

    // ─── remove ──────────────────────────────────────────────────────────────

    describe('remove', () => {
        it('deletes by primary key', async () => {
            mockQuery.mockResolvedValueOnce([]);

            const user = new UserFixture();
            user.id = 5;

            await repo.remove(user);

            expect(mockQuery).toHaveBeenCalledWith('DELETE FROM users WHERE id = $1', [5]);
        });

        it('throws MissingPrimaryKeyError when pk value is absent', async () => {
            const user = new UserFixture();
            await expect(repo.remove(user)).rejects.toThrow(MissingPrimaryKeyError);
        });

        it('wraps database errors in QueryError', async () => {
            mockQuery.mockRejectedValueOnce(new Error('fk violation'));
            const user = new UserFixture();
            user.id = 1;
            await expect(repo.remove(user)).rejects.toThrow(QueryError);
        });
    });

    // ─── NoPrimaryColumnError ────────────────────────────────────────────────

    describe('entity without primary column', () => {
        const badMeta: IEntityMetadata = {
            tableName: 'orphans',
            className: 'Orphan',
            columns: [{ propertyKey: 'name', databaseName: 'name', options: {}, primary: false }],
        };

        it('throws NoPrimaryColumnError on findById', async () => {
            const badRepo = new Repository(class Orphan { name!: string; }, runner, badMeta);
            await expect(badRepo.findById(1)).rejects.toThrow(NoPrimaryColumnError);
        });

        it('findAll works without primary column', async () => {
            const badRepo = new Repository(class Orphan { name!: string; }, runner, badMeta);
            mockQuery.mockResolvedValueOnce([]);
            await expect(badRepo.findAll()).resolves.toEqual([]);
        });
    });
});

// ─── Repository<PostFixture> (uuid_v4 PK) ───────────────────────────────────

describe('Repository<PostFixture> (uuid_v4 PK)', () => {
    let mockQuery: Mock;
    let repo: Repository<PostFixture>;

    beforeEach(() => {
        const metadata = registry.getEntity('PostFixture')!;
        mockQuery = vi.fn();
        repo = new Repository(PostFixture, { query: mockQuery }, metadata);
    });

    it('generates a uuid_v4 and includes id in INSERT', async () => {
        mockQuery.mockResolvedValueOnce([{ id: 'some-uuid', title: 'Hello' }]);

        const post = new PostFixture();
        post.title = 'Hello';

        await repo.save(post);

        const [sql, params] = mockQuery.mock.calls[0];
        expect(sql).toContain('INSERT INTO posts');
        expect(sql).toContain('id');
        expect(params[0]).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
    });
});
