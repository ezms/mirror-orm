import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MissingPrimaryKeyError, NoPrimaryColumnError, QueryError } from '../errors';
import { IEntityMetadata } from '../interfaces/entity-metadata';
import { IQueryRunner } from '../interfaces/query-runner';
import { registry } from '../metadata/registry';
import { Like } from '../operators';
import { Repository } from '../repository/repository';
import { AccountFixture, PostFixture, UserFixture } from './fixtures/user.entity';

// force decorator registration
void UserFixture;
void PostFixture;
void AccountFixture;

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
        it('executes SELECT with explicit columns and hydrates results', async () => {
            mockQuery.mockResolvedValueOnce([{ id: 1, name: 'Emanuel', email: 'e@test.com' }]);

            const result = await repo.findAll();

            expect(mockQuery).toHaveBeenCalledWith({ name: 'mirror_users_fa', text: 'SELECT "id", "name", "email" FROM "users"' });
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

            expect(mockQuery).toHaveBeenCalledWith({ name: 'mirror_users_fbi', text: 'SELECT "id", "name", "email" FROM "users" WHERE "id" = $1', values: [1] });
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
        it('executes SELECT with explicit columns and no WHERE when called with empty options', async () => {
            mockQuery.mockResolvedValueOnce([]);
            await repo.find();
            expect(mockQuery).toHaveBeenCalledWith('SELECT "id", "name", "email" FROM "users"', []);
        });

        it('builds WHERE clause for simple equality', async () => {
            mockQuery.mockResolvedValueOnce([]);
            await repo.find({ where: { name: 'Emanuel' } });
            expect(mockQuery).toHaveBeenCalledWith(
                'SELECT "id", "name", "email" FROM "users" WHERE "name" = $1',
                ['Emanuel'],
            );
        });

        it('builds WHERE clause using a query operator', async () => {
            mockQuery.mockResolvedValueOnce([]);
            await repo.find({ where: { name: Like('%manu%') } });
            expect(mockQuery).toHaveBeenCalledWith(
                'SELECT "id", "name", "email" FROM "users" WHERE "name" LIKE $1',
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
                'SELECT "id", "name", "email" FROM "users" WHERE "name" = $1 OR "name" = $2',
                ['A', 'B'],
            );
        });

        it('wraps multi-condition groups in parentheses for OR', async () => {
            mockQuery.mockResolvedValueOnce([]);
            await repo.find({ where: [{ name: 'A', email: 'a@test.com' }, { name: 'B' }] });
            const [sql] = mockQuery.mock.calls[0];
            expect(sql).toContain('("name" = $1 AND "email" = $2) OR "name" = $3');
        });

        it('appends ORDER BY clause', async () => {
            mockQuery.mockResolvedValueOnce([]);
            await repo.find({ orderBy: { name: 'ASC' } });
            const [sql] = mockQuery.mock.calls[0];
            expect(sql).toContain('ORDER BY "name" ASC');
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

            expect(mockQuery).toHaveBeenCalledWith('SELECT COUNT(*) FROM "users"', []);
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
            expect(sql).toContain('WHERE "name" = $1');
        });

        it('supports OR via array where', async () => {
            mockQuery.mockResolvedValueOnce([{ count: '5' }]);
            await repo.count([{ name: 'A' }, { name: 'B' }]);
            const [sql] = mockQuery.mock.calls[0];
            expect(sql).toContain('WHERE "name" = $1 OR "name" = $2');
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
            expect(sql).toContain('INSERT INTO "users"');
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
            expect(sql).toContain('UPDATE "users"');
            expect(sql).toContain('WHERE "id" =');
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

            expect(mockQuery).toHaveBeenCalledWith('DELETE FROM "users" WHERE "id" = $1', [5]);
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
        expect(sql).toContain('INSERT INTO "posts"');
        expect(sql).toContain('id');
        expect(params[0]).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
    });
});

// ─── Type casting (AccountFixture) ──────────────────────────────────────────

describe('Repository<AccountFixture> — type casting', () => {
    let mockQuery: Mock;
    let repo: Repository<AccountFixture>;

    beforeEach(() => {
        const metadata = registry.getEntity('AccountFixture')!;
        mockQuery = vi.fn();
        repo = new Repository(AccountFixture, { query: mockQuery }, metadata);
    });

    it('coerces numeric string to number for type: number', async () => {
        mockQuery.mockResolvedValueOnce([
            { id: 1, balance: '1234.56', is_active: true, created_at: '2026-01-01', label: 'main' },
        ]);

        const result = await repo.findAll();

        expect(result[0].balance).toBe(1234.56);
        expect(typeof result[0].balance).toBe('number');
    });

    it('returns null for null numeric column', async () => {
        mockQuery.mockResolvedValueOnce([
            { id: 1, balance: null, is_active: true, created_at: '2026-01-01', label: 'main' },
        ]);

        const result = await repo.findAll();

        expect(result[0].balance).toBeNull();
    });

    it('coerces value to boolean for type: boolean', async () => {
        mockQuery.mockResolvedValueOnce([
            { id: 1, balance: '0', is_active: true, created_at: '2026-01-01', label: 'main' },
        ]);

        const result = await repo.findAll();

        expect(result[0].isActive).toBe(true);
        expect(typeof result[0].isActive).toBe('boolean');
    });

    it('returns null for null boolean column', async () => {
        mockQuery.mockResolvedValueOnce([
            { id: 1, balance: '0', is_active: null, created_at: '2026-01-01', label: 'main' },
        ]);

        const result = await repo.findAll();

        expect(result[0].isActive).toBeNull();
    });

    it('coerces string to Date for type: datetime', async () => {
        mockQuery.mockResolvedValueOnce([
            { id: 1, balance: '0', is_active: true, created_at: '2026-01-01T00:00:00.000Z', label: 'main' },
        ]);

        const result = await repo.findAll();

        expect(result[0].createdAt).toBeInstanceOf(Date);
    });

    it('returns null for null datetime column', async () => {
        mockQuery.mockResolvedValueOnce([
            { id: 1, balance: '0', is_active: true, created_at: null, label: 'main' },
        ]);

        const result = await repo.findAll();

        expect(result[0].createdAt).toBeNull();
    });

    it('leaves string column unchanged without type cast', async () => {
        mockQuery.mockResolvedValueOnce([
            { id: 1, balance: '0', is_active: true, created_at: '2026-01-01', label: 'savings' },
        ]);

        const result = await repo.findAll();

        expect(result[0].label).toBe('savings');
        expect(typeof result[0].label).toBe('string');
    });
});

// ─── type: 'bigint' ──────────────────────────────────────────────────────────

describe("type: 'bigint' — pg INT8/BIGINT coercion", () => {
    const bigintMeta: IEntityMetadata = {
        tableName: 'sequences',
        className: 'Sequence',
        columns: [
            { propertyKey: 'id',  databaseName: 'id',  options: {},                 primary: true  },
            { propertyKey: 'seq', databaseName: 'seq', options: { type: 'bigint' }, primary: false },
        ],
    };

    class Sequence { id!: number; seq!: bigint; }

    let mockQuery: Mock;
    let repo: Repository<Sequence>;

    beforeEach(() => {
        mockQuery = vi.fn();
        repo = new Repository(Sequence, { query: mockQuery }, bigintMeta);
    });

    it('coerces INT8 string to BigInt', async () => {
        mockQuery.mockResolvedValueOnce([{ id: 1, seq: '9223372036854775807' }]);

        const result = await repo.findAll();

        expect(result[0].seq).toBe(9223372036854775807n);
        expect(typeof result[0].seq).toBe('bigint');
    });

    it('preserves full precision beyond Number.MAX_SAFE_INTEGER', async () => {
        mockQuery.mockResolvedValueOnce([{ id: 1, seq: '9007199254740993' }]);

        const result = await repo.findAll();

        // +("9007199254740993") perde precisão: 9007199254740992
        // BigInt preserva exatamente
        expect(result[0].seq).toBe(9007199254740993n);
    });

    it('returns null for null bigint column', async () => {
        const nullMeta: IEntityMetadata = {
            ...bigintMeta,
            columns: [
                ...bigintMeta.columns,
                { propertyKey: 'seqNull', databaseName: 'seq_null', options: { type: 'bigint' }, primary: false },
            ],
        };
        class SeqWithNull { id!: number; seq!: bigint; seqNull!: bigint | null; }
        const r = new Repository(SeqWithNull, { query: mockQuery }, nullMeta);

        mockQuery.mockResolvedValueOnce([{ id: 1, seq: '1', seq_null: null }]);

        const result = await r.findAll();

        expect(result[0].seqNull).toBeNull();
    });
});

// ─── type: 'iso' e 'date-only' ───────────────────────────────────────────────

describe("type: 'iso' — TIMESTAMP → UTC ISO string", () => {
    const meta: IEntityMetadata = {
        tableName: 'events',
        className: 'Event',
        columns: [
            { propertyKey: 'id',         databaseName: 'id',          options: {},                primary: true  },
            { propertyKey: 'occurredAt', databaseName: 'occurred_at', options: { type: 'iso' },   primary: false },
        ],
    };
    class Event { id!: number; occurredAt!: string; }

    let mockQuery: Mock;
    let repo: Repository<Event>;

    beforeEach(() => {
        mockQuery = vi.fn();
        repo = new Repository(Event, { query: mockQuery }, meta);
    });

    it('returns an ISO 8601 string from a Date value', async () => {
        const date = new Date('2026-03-13T15:00:00.000Z');
        mockQuery.mockResolvedValueOnce([{ id: 1, occurred_at: date }]);

        const result = await repo.findAll();

        expect(result[0].occurredAt).toBe('2026-03-13T15:00:00.000Z');
        expect(typeof result[0].occurredAt).toBe('string');
    });

    it('accepts a raw date string and normalises to ISO', async () => {
        mockQuery.mockResolvedValueOnce([{ id: 1, occurred_at: '2026-03-13T15:00:00.000Z' }]);

        const result = await repo.findAll();

        expect(result[0].occurredAt).toBe('2026-03-13T15:00:00.000Z');
    });

    it('returns null for null column', async () => {
        mockQuery.mockResolvedValueOnce([{ id: 1, occurred_at: null }]);

        const result = await repo.findAll();

        expect(result[0].occurredAt).toBeNull();
    });
});

describe("type: 'date' — DATE → YYYY-MM-DD string (no time, no timezone shift)", () => {
    const meta: IEntityMetadata = {
        tableName: 'profiles',
        className: 'Profile',
        columns: [
            { propertyKey: 'id',        databaseName: 'id',         options: {},               primary: true  },
            { propertyKey: 'birthDate', databaseName: 'birth_date', options: { type: 'date' }, primary: false },
        ],
    };
    class Profile { id!: number; birthDate!: string; }

    let mockQuery: Mock;
    let repo: Repository<Profile>;

    beforeEach(() => {
        mockQuery = vi.fn();
        repo = new Repository(Profile, { query: mockQuery }, meta);
    });

    it('returns YYYY-MM-DD string from a Date value', async () => {
        // pg returns DATE as local midnight Date — simula um Date de 2026-03-13
        const localMidnight = new Date(2026, 2, 13); // mês 0-based
        mockQuery.mockResolvedValueOnce([{ id: 1, birth_date: localMidnight }]);

        const result = await repo.findAll();

        expect(result[0].birthDate).toBe('2026-03-13');
        expect(typeof result[0].birthDate).toBe('string');
    });

    it('returns null for null column', async () => {
        mockQuery.mockResolvedValueOnce([{ id: 1, birth_date: null }]);

        const result = await repo.findAll();

        expect(result[0].birthDate).toBeNull();
    });
});
