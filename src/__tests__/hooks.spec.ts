import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AfterLoad,
    BeforeInsert,
    BeforeUpdate,
    Column,
    Entity,
    PrimaryColumn,
} from '../index';
import { Repository } from '../repository/repository';
import { registry } from '../metadata/registry';
import { IQueryRunner } from '../interfaces/query-runner';

// ─── Trackers ─────────────────────────────────────────────────────────────────

const insertTracker = vi.fn();
const updateTracker = vi.fn();
const loadTracker = vi.fn();

// ─── Fixtures ─────────────────────────────────────────────────────────────────

@Entity('hk_users')
class HkUser {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    name!: string;

    @BeforeInsert()
    onBeforeInsert() {
        insertTracker();
    }

    @BeforeUpdate()
    onBeforeUpdate() {
        updateTracker();
    }

    @AfterLoad()
    onAfterLoad() {
        loadTracker();
    }
}

// ─── Mock runner ──────────────────────────────────────────────────────────────

function makeRunner() {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const queue: Array<unknown[]> = [];
    const defaultRow = [{ id: 'gen-id', name: 'x' }];
    const runner = {
        query: async (sql: string | { text: string }, params?: unknown[]) => {
            const text = typeof sql === 'string' ? sql : sql.text;
            calls.push({ sql: text, params: params ?? [] });
            return queue.length > 0 ? queue.shift()! : defaultRow;
        },
        calls,
        queueOnce: (...rows: unknown[][]) => {
            queue.push(...rows);
        },
    };
    return runner;
}

function makeRepo(runner: ReturnType<typeof makeRunner>) {
    const meta = registry.getEntity('HkUser')!;
    return new Repository(HkUser, runner as unknown as IQueryRunner, meta);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('@BeforeInsert', () => {
    beforeEach(() => {
        insertTracker.mockClear();
        updateTracker.mockClear();
    });

    it('is called before INSERT', async () => {
        const runner = makeRunner();
        const repo = makeRepo(runner);
        const user = Object.assign(new HkUser(), { name: 'Alice' });
        await repo.save(user);
        expect(insertTracker).toHaveBeenCalledOnce();
    });

    it('is not called on UPDATE', async () => {
        const runner = makeRunner();
        const repo = makeRepo(runner);
        const user = Object.assign(new HkUser(), {
            id: 'existing',
            name: 'Alice',
        });
        await repo.save(user);
        expect(insertTracker).not.toHaveBeenCalled();
    });
});

describe('@BeforeUpdate', () => {
    beforeEach(() => {
        insertTracker.mockClear();
        updateTracker.mockClear();
    });

    it('is called before UPDATE', async () => {
        const runner = makeRunner();
        const repo = makeRepo(runner);
        const user = Object.assign(new HkUser(), {
            id: 'existing',
            name: 'Alice',
        });
        await repo.save(user);
        expect(updateTracker).toHaveBeenCalledOnce();
    });

    it('is not called on INSERT', async () => {
        const runner = makeRunner();
        const repo = makeRepo(runner);
        const user = Object.assign(new HkUser(), { name: 'Alice' });
        await repo.save(user);
        expect(updateTracker).not.toHaveBeenCalled();
    });
});

describe('@AfterLoad', () => {
    beforeEach(() => {
        loadTracker.mockClear();
    });

    it('is called after findAll', async () => {
        const runner = makeRunner();
        runner.queueOnce([
            { id: 'u1', name: 'Alice' },
            { id: 'u2', name: 'Bob' },
        ]);
        const repo = makeRepo(runner);
        await repo.findAll();
        expect(loadTracker).toHaveBeenCalledTimes(2);
    });

    it('is called after findById', async () => {
        const runner = makeRunner();
        runner.queueOnce([{ id: 'u1', name: 'Alice' }]);
        const repo = makeRepo(runner);
        await repo.findById('u1');
        expect(loadTracker).toHaveBeenCalledOnce();
    });

    it('is called after find', async () => {
        const runner = makeRunner();
        runner.queueOnce([
            { id: 'u1', name: 'Alice' },
            { id: 'u2', name: 'Bob' },
        ]);
        const repo = makeRepo(runner);
        await repo.find({});
        expect(loadTracker).toHaveBeenCalledTimes(2);
    });

    it('is not called on save', async () => {
        const runner = makeRunner();
        const repo = makeRepo(runner);
        const user = Object.assign(new HkUser(), { name: 'Alice' });
        await repo.save(user);
        expect(loadTracker).not.toHaveBeenCalled();
    });
});

describe('async hooks', () => {
    it('awaits async @BeforeInsert before executing INSERT', async () => {
        const order: Array<string> = [];

        @Entity('hk_async')
        class HkAsync {
            @PrimaryColumn({ strategy: 'uuid_v4' })
            id!: string;

            @Column()
            name!: string;

            @BeforeInsert()
            async onBeforeInsert() {
                await Promise.resolve();
                order.push('hook');
            }
        }

        const runner = makeRunner();
        const meta = registry.getEntity('HkAsync')!;
        const repo = new Repository(
            HkAsync,
            runner as unknown as IQueryRunner,
            meta,
        );
        const original = runner.query.bind(runner);
        runner.query = async (
            sql: string | { text: string },
            params?: unknown[],
        ) => {
            const text = typeof sql === 'string' ? sql : sql.text;
            if (text.includes('INSERT')) order.push('query');
            return original(sql, params);
        };

        await repo.save(Object.assign(new HkAsync(), { name: 'Test' }));
        expect(order).toEqual(['hook', 'query']);
    });
});
