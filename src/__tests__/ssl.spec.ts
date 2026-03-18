import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostgresAdapter } from '../adapters/pg/pg-adapter';

const { MockPool } = vi.hoisted(() => {
    const mockPool = { query: vi.fn(), connect: vi.fn(), end: vi.fn() };
    const MockPool = vi.fn(function() { return mockPool; });
    return { MockPool };
});

vi.mock('pg', () => ({ Pool: MockPool }));

describe('SSL support in PostgresAdapter', () => {
    beforeEach(() => MockPool.mockClear());

    it('passes ssl: true to Pool when using host/port config', async () => {
        const adapter = new PostgresAdapter();
        await adapter.connect({ adapter, host: 'localhost', database: 'db', user: 'u', password: 'p', ssl: true });
        expect(MockPool).toHaveBeenCalledWith(expect.objectContaining({ ssl: true }));
    });

    it('passes ssl object to Pool when using host/port config', async () => {
        const adapter = new PostgresAdapter();
        const ssl = { rejectUnauthorized: false };
        await adapter.connect({ adapter, host: 'localhost', database: 'db', user: 'u', password: 'p', ssl });
        expect(MockPool).toHaveBeenCalledWith(expect.objectContaining({ ssl }));
    });

    it('passes ssl to Pool when using connection url', async () => {
        const adapter = new PostgresAdapter();
        const ssl = { rejectUnauthorized: false, ca: 'cert-content' };
        await adapter.connect({ adapter, url: 'postgres://localhost/db', ssl });
        expect(MockPool).toHaveBeenCalledWith(expect.objectContaining({ ssl }));
    });

    it('omits ssl from Pool config when not provided', async () => {
        const adapter = new PostgresAdapter();
        await adapter.connect({ adapter, host: 'localhost', database: 'db', user: 'u', password: 'p' });
        const calls = MockPool.mock.calls as Array<Array<Record<string, unknown>>>;
        expect(calls[0]?.[0]?.ssl).toBeUndefined();
    });
});
