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

describe('findAndCount', () => {
    it('returns entities and total count', async () => {
        const runner = makeRunner();
        const repo = makeRepo(runner);
        const [users, count] = await repo.findAndCount({});
        expect(Array.isArray(users)).toBe(true);
        expect(typeof count).toBe('number');
    });

    it('issues a SELECT and a COUNT query', async () => {
        const runner = makeRunner();
        const repo = makeRepo(runner);
        await repo.findAndCount({});
        const sqls = runner.calls.map(c => c.sql);
        expect(sqls.some(s => s.includes('SELECT "id"'))).toBe(true);
        expect(sqls.some(s => s.includes('COUNT(*)'))).toBe(true);
    });

    it('passes where clause to both queries', async () => {
        const runner = makeRunner();
        const repo = makeRepo(runner);
        await repo.findAndCount({ where: { name: 'Alice' } });
        const withWhere = runner.calls.filter(c => c.sql.includes('WHERE'));
        expect(withWhere).toHaveLength(2);
    });

    it('count reflects total ignoring limit and offset', async () => {
        const runner = makeRunner();
        const repo = makeRepo(runner);
        await repo.findAndCount({ limit: 10, offset: 20, where: { name: 'Alice' } });
        const countCall = runner.calls.find(c => c.sql.includes('COUNT(*)'));
        expect(countCall!.sql).not.toContain('LIMIT');
        expect(countCall!.sql).not.toContain('OFFSET');
    });
});
