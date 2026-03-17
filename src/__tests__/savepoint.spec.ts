import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SavepointRunner } from '../connection/savepoint-runner';

const makeInner = () => ({
    query: vi.fn().mockResolvedValue([]),
});

describe('SavepointRunner', () => {
    let inner: ReturnType<typeof makeInner>;
    let sp: SavepointRunner;

    beforeEach(() => {
        inner = makeInner();
        sp = new SavepointRunner(inner, 'mirror_sp_1');
    });

    it('delegates query() to the inner runner', async () => {
        await sp.query('SELECT 1', []);
        expect(inner.query).toHaveBeenCalledWith('SELECT 1', []);
    });

    it('commit() emits RELEASE SAVEPOINT', async () => {
        await sp.commit();
        expect(inner.query).toHaveBeenCalledWith('RELEASE SAVEPOINT "mirror_sp_1"');
    });

    it('rollback() emits ROLLBACK TO SAVEPOINT', async () => {
        await sp.rollback();
        expect(inner.query).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT "mirror_sp_1"');
    });

    it('release() is a no-op', () => {
        expect(() => sp.release()).not.toThrow();
        expect(inner.query).not.toHaveBeenCalled();
    });

    it('uses the savepoint name provided at construction', async () => {
        const sp2 = new SavepointRunner(inner, 'mirror_sp_42');
        await sp2.commit();
        expect(inner.query).toHaveBeenCalledWith('RELEASE SAVEPOINT "mirror_sp_42"');
    });
});
