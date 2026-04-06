import { describe, expect, it, vi } from 'vitest';
import { Connection } from '../connection/connection';

function makeAdapter(queryImpl: () => Promise<unknown>) {
    return {
        connect: vi.fn(),
        query: vi.fn(queryImpl),
        acquireTransactionRunner: vi.fn(),
        disconnect: vi.fn(),
    };
}

describe('Connection.healthCheck()', () => {
    it('returns true when primary responds', async () => {
        const adapter = makeAdapter(() => Promise.resolve([]));
        const connection = await Connection.create({ adapter });
        expect(await connection.healthCheck()).toBe(true);
    });

    it('returns false when primary throws', async () => {
        const adapter = makeAdapter(() =>
            Promise.reject(new Error('connection refused')),
        );
        const connection = await Connection.create({ adapter });
        expect(await connection.healthCheck()).toBe(false);
    });

    it('returns true when primary and replica both respond', async () => {
        const adapter = makeAdapter(() => Promise.resolve([]));
        const replicaAdapter = makeAdapter(() => Promise.resolve([]));
        const connection = await Connection.create({ adapter, replicaAdapter });
        expect(await connection.healthCheck()).toBe(true);
        expect(replicaAdapter.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('returns false when replica throws', async () => {
        const adapter = makeAdapter(() => Promise.resolve([]));
        const replicaAdapter = makeAdapter(() =>
            Promise.reject(new Error('replica down')),
        );
        const connection = await Connection.create({ adapter, replicaAdapter });
        expect(await connection.healthCheck()).toBe(false);
    });
});
