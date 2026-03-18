import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Column } from '../decorators/column';
import { Entity } from '../decorators/entity';
import { PrimaryColumn } from '../decorators/primary-column';
import { IQueryRunner } from '../interfaces/query-runner';
import { Repository, RepositoryState } from '../repository/repository';
import { registry } from '../metadata/registry';
import { PostgresDialect } from '../dialects';

@Entity('rr_items')
class RrItem {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Column()
    name!: string;
}

void RrItem;

function makeRunner(rows: Array<Record<string, unknown>> = []): IQueryRunner & { calls: string[] } {
    const calls: string[] = [];
    return {
        calls,
        query: vi.fn(async () => { calls.push('query'); return rows; }),
    };
}

function makeRepo(primaryRows: Record<string, unknown>[], replicaRows: Record<string, unknown>[]) {
    const meta = registry.getEntity('RrItem')!;
    const state = new RepositoryState(RrItem, meta, new PostgresDialect());
    const primary = makeRunner(primaryRows);
    const replica = makeRunner(replicaRows);
    const repo = new Repository(state, primary, true, replica);
    return { repo, primary, replica };
}

describe('read replica routing', () => {
    it('findAll routes to replica', async () => {
        const { repo, primary, replica } = makeRepo([], [{ id: 1, name: 'A' }]);
        await repo.findAll();
        expect(replica.calls.length).toBeGreaterThan(0);
        expect(primary.calls.length).toBe(0);
    });

    it('find routes to replica', async () => {
        const { repo, primary, replica } = makeRepo([], [{ id: 1, name: 'A' }]);
        await repo.find();
        expect(replica.calls.length).toBeGreaterThan(0);
        expect(primary.calls.length).toBe(0);
    });

    it('findById routes to replica', async () => {
        const { repo, primary, replica } = makeRepo([], [{ id: 1, name: 'A' }]);
        await repo.findById(1);
        expect(replica.calls.length).toBeGreaterThan(0);
        expect(primary.calls.length).toBe(0);
    });

    it('count routes to replica', async () => {
        const { repo, primary, replica } = makeRepo([], [{ count: '3' }]);
        await repo.count();
        expect(replica.calls.length).toBeGreaterThan(0);
        expect(primary.calls.length).toBe(0);
    });

    it('save routes to primary', async () => {
        const { repo, primary, replica } = makeRepo(
            [{ id: 1, name: 'A' }], // primary returns the INSERT result
            [{ id: 1, name: 'A' }], // replica for the findById after insert
        );
        const item = Object.assign(new RrItem(), { name: 'A' });
        await repo.save(item);
        expect(primary.calls.length).toBeGreaterThan(0);
    });

    it('without replica, all operations use primary', async () => {
        const meta = registry.getEntity('RrItem')!;
        const state = new RepositoryState(RrItem, meta, new PostgresDialect());
        const primary = makeRunner([{ id: 1, name: 'A' }]);
        const repo = new Repository(state, primary);
        await repo.findAll();
        expect(primary.calls.length).toBeGreaterThan(0);
    });
});
