import { describe, expect, it } from 'vitest';
import { Column, Entity, PrimaryColumn } from '../index';
import { Repository } from '../repository/repository';
import { registry } from '../metadata/registry';
import { IQueryRunner } from '../interfaces/query-runner';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

@Entity('fs_users')
class FsUser {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Column()
    name!: string;

    @Column()
    email!: string;

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
            return [{ id: 1, name: 'Alice', email: 'alice@example.com' }];
        },
        calls,
    };
    return runner;
}

function makeRepo(runner: ReturnType<typeof makeRunner>) {
    const meta = registry.getEntity('FsUser')!;
    return new Repository(FsUser, runner as unknown as IQueryRunner, meta);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('find({ select })', () => {
    it('limits SELECT to specified columns', async () => {
        const runner = makeRunner();
        const repo = makeRepo(runner);
        await repo.find({ select: ['id', 'name'] });
        expect(runner.calls[0].sql).toContain('"id"');
        expect(runner.calls[0].sql).toContain('"name"');
        expect(runner.calls[0].sql).not.toContain('"email"');
    });

    it('falls back to default select clause when select is empty array', async () => {
        const runner = makeRunner();
        const repo = makeRepo(runner);
        await repo.find({ select: [] });
        expect(runner.calls[0].sql).toContain('"name"');
        expect(runner.calls[0].sql).toContain('"email"');
    });

    it('falls back to default select clause when select is omitted', async () => {
        const runner = makeRunner();
        const repo = makeRepo(runner);
        await repo.find({});
        expect(runner.calls[0].sql).toContain('"name"');
        expect(runner.calls[0].sql).toContain('"email"');
    });

    it('can explicitly select a select: false column', async () => {
        const runner = makeRunner();
        const repo = makeRepo(runner);
        await repo.find({ select: ['id', 'passwordHash'] });
        expect(runner.calls[0].sql).toContain('"passwordHash"');
        expect(runner.calls[0].sql).not.toContain('"name"');
    });

    it('ignores unknown keys in select', async () => {
        const runner = makeRunner();
        const repo = makeRepo(runner);
        await repo.find({ select: ['id', 'name', 'nonExistent' as keyof FsUser & string] });
        expect(runner.calls[0].sql).toContain('"id"');
        expect(runner.calls[0].sql).toContain('"name"');
        expect(runner.calls[0].sql).not.toContain('nonExistent');
    });
});
