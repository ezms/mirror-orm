import { describe, expect, it } from 'vitest';
import { Column, Entity, PrimaryColumn } from '../index';
import { Repository, RepositoryState } from '../repository/repository';
import { registry } from '../metadata/registry';
import { IQueryRunner } from '../interfaces/query-runner';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

@Entity('sf_users')
class SfUser {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Column()
    name!: string;

    @Column({ select: false })
    passwordHash!: string;
}

// ─── Mock runner ──────────────────────────────────────────────────────────────

function makeRunner() {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const runner = {
        query: async (sql: string | { text: string }, params?: unknown[]) => {
            const text = typeof sql === 'string' ? sql : sql.text;
            calls.push({ sql: text, params: params ?? [] });
            return [{ id: 1, name: 'Alice' }];
        },
        calls,
    };
    return runner;
}

function makeRepo(runner: ReturnType<typeof makeRunner>) {
    const meta = registry.getEntity('SfUser')!;
    return new Repository(SfUser, runner as unknown as IQueryRunner, meta);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('select: false', () => {
    it('excludes column from SELECT in findAll', () => {
        const meta = registry.getEntity('SfUser')!;
        const state = new RepositoryState(SfUser, meta);
        expect(state.findAllStatement.text).not.toContain('password_hash');
        expect(state.findAllStatement.text).toContain('"name"');
    });

    it('excludes column from SELECT in findById', () => {
        const meta = registry.getEntity('SfUser')!;
        const state = new RepositoryState(SfUser, meta);
        expect(state.findByIdStatement!.text).not.toContain('password_hash');
    });

    it('excludes column from SELECT in find()', async () => {
        const runner = makeRunner();
        const repo = makeRepo(runner);
        await repo.find({});
        expect(runner.calls[0].sql).not.toContain('password_hash');
    });

    it('still includes column in INSERT', async () => {
        const runner = makeRunner();
        const repo = makeRepo(runner);
        const user = Object.assign(new SfUser(), { name: 'Alice', passwordHash: 'hashed' });
        await repo.save(user);
        const insert = runner.calls.find(c => c.sql.includes('INSERT'));
        expect(insert!.sql).toContain('"passwordHash"');
    });
});
