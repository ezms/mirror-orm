import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MssqlAdapter } from '../adapters/mssql/mssql-adapter';
import { MysqlAdapter } from '../adapters/mysql/mysql-adapter';
import { PostgresAdapter } from '../adapters/pg/pg-adapter';
import { SqliteAdapter } from '../adapters/sqlite/sqlite-adapter';

// --- Postgres ---

const { MockPgPool } = vi.hoisted(() => {
    const mockPool = { query: vi.fn(), connect: vi.fn(), end: vi.fn() };
    const MockPgPool = vi.fn(function () {
        return mockPool;
    });
    return { MockPgPool };
});

vi.mock('pg', () => ({
    Pool: MockPgPool,
    types: {
        builtins: {
            TIMESTAMPTZ: 1184,
            TIMESTAMP: 1114,
            DATE: 1082,
            INTERVAL: 1186,
        },
        getTypeParser: vi.fn(() => (val: string) => val),
    },
}));

describe('queryTimeoutMs — PostgresAdapter', () => {
    beforeEach(() => MockPgPool.mockClear());

    it('passes statement_timeout via options when queryTimeoutMs is set', async () => {
        const adapter = new PostgresAdapter();
        await adapter.connect({
            adapter,
            host: 'localhost',
            database: 'db',
            user: 'u',
            password: 'p',
            pool: { queryTimeoutMs: 3000 },
        });
        expect(MockPgPool).toHaveBeenCalledWith(
            expect.objectContaining({ options: '-c statement_timeout=3000' }),
        );
    });

    it('omits options from Pool config when queryTimeoutMs is not set', async () => {
        const adapter = new PostgresAdapter();
        await adapter.connect({
            adapter,
            host: 'localhost',
            database: 'db',
            user: 'u',
            password: 'p',
        });
        const calls = MockPgPool.mock.calls as Array<
            Array<Record<string, unknown>>
        >;
        expect(calls[0]?.[0]?.options).toBeUndefined();
    });

    it('passes statement_timeout when using connection url', async () => {
        const adapter = new PostgresAdapter();
        await adapter.connect({
            adapter,
            url: 'postgres://localhost/db',
            pool: { queryTimeoutMs: 5000 },
        });
        expect(MockPgPool).toHaveBeenCalledWith(
            expect.objectContaining({ options: '-c statement_timeout=5000' }),
        );
    });
});

// --- MySQL ---

const { MockMysqlCreatePool, mockMysqlPool } = vi.hoisted(() => {
    const mockExecute = vi.fn().mockResolvedValue([[], []]);
    const mockPool = {
        execute: mockExecute,
        query: vi.fn().mockResolvedValue([[], []]),
        getConnection: vi.fn(),
        end: vi.fn(),
    };
    const MockMysqlCreatePool = vi.fn(() => mockPool);
    return { MockMysqlCreatePool, mockMysqlPool: mockPool };
});

vi.mock('mysql2/promise', () => ({ createPool: MockMysqlCreatePool }));

describe('queryTimeoutMs — MysqlAdapter', () => {
    beforeEach(() => {
        MockMysqlCreatePool.mockClear();
        mockMysqlPool.execute.mockClear();
    });

    it('passes timeout in execute options when queryTimeoutMs is set', async () => {
        const adapter = new MysqlAdapter();
        await adapter.connect({
            adapter,
            host: 'localhost',
            database: 'db',
            user: 'u',
            password: 'p',
            pool: { queryTimeoutMs: 2000 },
        });
        await adapter.query('SELECT 1');
        expect(mockMysqlPool.execute).toHaveBeenCalledWith(
            expect.objectContaining({ timeout: 2000 }),
        );
    });

    it('omits timeout from execute options when queryTimeoutMs is not set', async () => {
        const adapter = new MysqlAdapter();
        await adapter.connect({
            adapter,
            host: 'localhost',
            database: 'db',
            user: 'u',
            password: 'p',
        });
        await adapter.query('SELECT 1');
        const call = mockMysqlPool.execute.mock.calls[0]?.[0] as Record<
            string,
            unknown
        >;
        expect(call?.timeout).toBeUndefined();
    });
});

// --- SQL Server ---

const { MockConnectionPool, mockMssqlConfig } = vi.hoisted(() => {
    let capturedConfig: unknown;
    const mockPool = { request: vi.fn(), close: vi.fn() };
    const MockConnectionPool = vi.fn(function (config: unknown) {
        capturedConfig = config;
        return { connect: vi.fn().mockResolvedValue(mockPool) };
    });
    return {
        MockConnectionPool,
        mockMssqlConfig: { get: () => capturedConfig },
    };
});

vi.mock('mssql', () => ({
    ConnectionPool: MockConnectionPool,
    Request: vi.fn(),
    Transaction: vi.fn(),
}));

describe('queryTimeoutMs — MssqlAdapter', () => {
    beforeEach(() => MockConnectionPool.mockClear());

    it('sets requestTimeout in pool config when queryTimeoutMs is set', async () => {
        const adapter = new MssqlAdapter();
        await adapter.connect({
            adapter,
            host: 'localhost',
            database: 'db',
            user: 'u',
            password: 'p',
            pool: { queryTimeoutMs: 4000 },
        });
        expect(mockMssqlConfig.get()).toEqual(
            expect.objectContaining({ requestTimeout: 4000 }),
        );
    });

    it('leaves requestTimeout undefined when queryTimeoutMs is not set', async () => {
        const adapter = new MssqlAdapter();
        await adapter.connect({
            adapter,
            host: 'localhost',
            database: 'db',
            user: 'u',
            password: 'p',
        });
        const config = mockMssqlConfig.get() as Record<string, unknown>;
        expect(config?.requestTimeout).toBeUndefined();
    });
});

// --- SQLite ---

vi.mock('better-sqlite3', () => ({
    default: vi.fn(function () {
        return {
            pragma: vi.fn(),
            prepare: vi.fn(() => ({ reader: false, run: vi.fn() })),
            close: vi.fn(),
        };
    }),
}));

describe('queryTimeoutMs — SqliteAdapter', () => {
    it('connects successfully and ignores queryTimeoutMs', async () => {
        const adapter = new SqliteAdapter();
        await expect(
            adapter.connect({
                adapter,
                database: ':memory:',
                pool: { queryTimeoutMs: 1000 },
            }),
        ).resolves.not.toThrow();
    });
});
