import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MssqlAdapter } from '../adapters/mssql/mssql-adapter';
import { MysqlAdapter } from '../adapters/mysql/mysql-adapter';
import { PostgresAdapter } from '../adapters/pg/pg-adapter';

// --- Postgres ---

const { MockPgPool, mockPgPoolInstance } = vi.hoisted(() => {
    const instance = { query: vi.fn(), connect: vi.fn(), end: vi.fn(), on: vi.fn() };
    const MockPgPool = vi.fn(function () { return instance; });
    return { MockPgPool, mockPgPoolInstance: instance };
});

vi.mock('pg', () => ({
    Pool: MockPgPool,
    types: {
        builtins: { TIMESTAMPTZ: 1184, TIMESTAMP: 1114, DATE: 1082, INTERVAL: 1186 },
        getTypeParser: vi.fn(() => (val: string) => val),
    },
}));

describe('onPoolError — PostgresAdapter', () => {
    beforeEach(() => { MockPgPool.mockClear(); mockPgPoolInstance.on.mockClear(); });

    it('registers error listener on pool when onPoolError is provided', async () => {
        const onPoolError = vi.fn();
        const adapter = new PostgresAdapter();
        await adapter.connect({ adapter, host: 'localhost', database: 'db', user: 'u', password: 'p', onPoolError });
        expect(mockPgPoolInstance.on).toHaveBeenCalledWith('error', onPoolError);
    });

    it('does not call pool.on when onPoolError is not provided', async () => {
        const adapter = new PostgresAdapter();
        await adapter.connect({ adapter, host: 'localhost', database: 'db', user: 'u', password: 'p' });
        expect(mockPgPoolInstance.on).not.toHaveBeenCalled();
    });
});

// --- MySQL ---

const { MockMysqlCreatePool, mockMysqlPoolInstance } = vi.hoisted(() => {
    const instance = { execute: vi.fn().mockResolvedValue([[], []]), query: vi.fn().mockResolvedValue([[], []]), end: vi.fn(), on: vi.fn() };
    const MockMysqlCreatePool = vi.fn(() => instance);
    return { MockMysqlCreatePool, mockMysqlPoolInstance: instance };
});

vi.mock('mysql2/promise', () => ({ createPool: MockMysqlCreatePool }));

describe('onPoolError — MysqlAdapter', () => {
    beforeEach(() => { MockMysqlCreatePool.mockClear(); mockMysqlPoolInstance.on.mockClear(); });

    it('registers error listener on pool when onPoolError is provided', async () => {
        const onPoolError = vi.fn();
        const adapter = new MysqlAdapter();
        await adapter.connect({ adapter, host: 'localhost', database: 'db', user: 'u', password: 'p', onPoolError });
        expect(mockMysqlPoolInstance.on).toHaveBeenCalledWith('error', onPoolError);
    });

    it('does not call pool.on when onPoolError is not provided', async () => {
        const adapter = new MysqlAdapter();
        await adapter.connect({ adapter, host: 'localhost', database: 'db', user: 'u', password: 'p' });
        expect(mockMysqlPoolInstance.on).not.toHaveBeenCalled();
    });
});

// --- SQL Server ---

const { MockConnectionPool, mockMssqlPoolInstance } = vi.hoisted(() => {
    const instance = { request: vi.fn(), close: vi.fn(), on: vi.fn() };
    const MockConnectionPool = vi.fn(function () {
        return { connect: vi.fn().mockResolvedValue(instance) };
    });
    return { MockConnectionPool, mockMssqlPoolInstance: instance };
});

vi.mock('mssql', () => ({
    ConnectionPool: MockConnectionPool,
    Request: vi.fn(),
    Transaction: vi.fn(),
}));

describe('onPoolError — MssqlAdapter', () => {
    beforeEach(() => { MockConnectionPool.mockClear(); mockMssqlPoolInstance.on.mockClear(); });

    it('registers error listener on pool when onPoolError is provided', async () => {
        const onPoolError = vi.fn();
        const adapter = new MssqlAdapter();
        await adapter.connect({ adapter, host: 'localhost', database: 'db', user: 'u', password: 'p', onPoolError });
        expect(mockMssqlPoolInstance.on).toHaveBeenCalledWith('error', onPoolError);
    });

    it('does not call pool.on when onPoolError is not provided', async () => {
        const adapter = new MssqlAdapter();
        await adapter.connect({ adapter, host: 'localhost', database: 'db', user: 'u', password: 'p' });
        expect(mockMssqlPoolInstance.on).not.toHaveBeenCalled();
    });
});
