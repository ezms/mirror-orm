import { describe, expect, it } from 'vitest';
import { Column, CreatedAt, Entity, PrimaryColumn, UpdatedAt } from '../index';
import { Repository } from '../repository/repository';
import { registry } from '../metadata/registry';
import { IQueryRunner } from '../interfaces/query-runner';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

@Entity('up_users')
class UpUser {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    name!: string;

    @Column()
    email!: string;

    @CreatedAt()
    createdAt!: Date;

    @UpdatedAt()
    updatedAt!: Date;
}

@Entity('up_seats')
class UpSeat {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Column()
    section!: string;

    @Column()
    row!: string;

    @Column()
    status!: string;
}

// ─── Mock runner ──────────────────────────────────────────────────────────────

function makeRunner() {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const runner = {
        query: async (sql: string | { text: string }, params?: unknown[]) => {
            const text = typeof sql === 'string' ? sql : sql.text;
            calls.push({ sql: text, params: params ?? [] });
            return [
                {
                    id: 'gen-id',
                    name: 'Alice',
                    email: 'a@x.com',
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            ];
        },
        calls,
    };
    return runner;
}

function makeRepo<T>(cls: new () => T, runner: ReturnType<typeof makeRunner>) {
    const meta = registry.getEntity(cls.name)!;
    return new Repository(cls, runner as unknown as IQueryRunner, meta);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('upsert', () => {
    it('emits INSERT ... ON CONFLICT ... DO UPDATE SET', async () => {
        const runner = makeRunner();
        const repo = makeRepo(UpUser, runner);
        const user = Object.assign(new UpUser(), {
            name: 'Alice',
            email: 'a@x.com',
        });
        await repo.upsert(user, ['email']);
        expect(runner.calls[0].sql).toContain('ON CONFLICT');
        expect(runner.calls[0].sql).toContain('DO UPDATE SET');
        expect(runner.calls[0].sql).toContain('RETURNING *');
    });

    it('uses the correct conflict column', async () => {
        const runner = makeRunner();
        const repo = makeRepo(UpUser, runner);
        const user = Object.assign(new UpUser(), {
            name: 'Alice',
            email: 'a@x.com',
        });
        await repo.upsert(user, ['email']);
        expect(runner.calls[0].sql).toContain('ON CONFLICT ("email")');
    });

    it('excludes createdAt from the DO UPDATE SET clause', async () => {
        const runner = makeRunner();
        const repo = makeRepo(UpUser, runner);
        const user = Object.assign(new UpUser(), {
            name: 'Alice',
            email: 'a@x.com',
        });
        await repo.upsert(user, ['email']);
        const afterConflict = runner.calls[0].sql.split('DO UPDATE SET')[1];
        expect(afterConflict).not.toContain('created_at');
    });

    it('includes updatedAt in the DO UPDATE SET clause', async () => {
        const runner = makeRunner();
        const repo = makeRepo(UpUser, runner);
        const user = Object.assign(new UpUser(), {
            name: 'Alice',
            email: 'a@x.com',
        });
        await repo.upsert(user, ['email']);
        const afterConflict = runner.calls[0].sql.split('DO UPDATE SET')[1];
        expect(afterConflict).toContain('updated_at');
    });

    it('excludes conflictKeys from the DO UPDATE SET clause', async () => {
        const runner = makeRunner();
        const repo = makeRepo(UpUser, runner);
        const user = Object.assign(new UpUser(), {
            name: 'Alice',
            email: 'a@x.com',
        });
        await repo.upsert(user, ['email']);
        const afterConflict = runner.calls[0].sql.split('DO UPDATE SET')[1];
        expect(afterConflict).not.toContain('"email" = EXCLUDED');
    });

    it('respects explicit update option', async () => {
        const runner = makeRunner();
        const repo = makeRepo(UpUser, runner);
        const user = Object.assign(new UpUser(), {
            name: 'Alice',
            email: 'a@x.com',
        });
        await repo.upsert(user, ['email'], { update: ['name'] });
        const afterConflict = runner.calls[0].sql.split('DO UPDATE SET')[1];
        expect(afterConflict).toContain('"name"');
        expect(afterConflict).not.toContain('updated_at');
    });

    it('supports composite conflict keys', async () => {
        const runner = makeRunner();
        runner.query = async (sql, params) => {
            const text = typeof sql === 'string' ? sql : (sql as any).text;
            runner.calls.push({ sql: text, params: params ?? [] });
            return [{ id: 1, section: 'A', row: '1', status: 'taken' }];
        };
        const repo = makeRepo(UpSeat, runner);
        const seat = Object.assign(new UpSeat(), {
            section: 'A',
            row: '1',
            status: 'taken',
        });
        await repo.upsert(seat, ['section', 'row']);
        expect(runner.calls[0].sql).toContain('ON CONFLICT ("section", "row")');
    });

    it('sets createdAt only when not already set', async () => {
        const runner = makeRunner();
        const repo = makeRepo(UpUser, runner);
        const existingDate = new Date('2026-01-01');
        const user = Object.assign(new UpUser(), {
            name: 'Alice',
            email: 'a@x.com',
            createdAt: existingDate,
        });
        await repo.upsert(user, ['email']);
        const paramsStr = JSON.stringify(runner.calls[0].params);
        expect(paramsStr).toContain('2026-01-01');
    });
});
