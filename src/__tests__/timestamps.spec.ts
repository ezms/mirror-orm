import { describe, expect, it } from 'vitest';
import {
    Column,
    CreatedAt,
    DeletedAt,
    Entity,
    PrimaryColumn,
    UpdatedAt,
} from '../index';
import { Repository, RepositoryState } from '../repository/repository';
import { registry } from '../metadata/registry';
import { IQueryRunner } from '../interfaces/query-runner';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

@Entity('ts_posts')
class TsPost {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    title!: string;

    @CreatedAt()
    createdAt!: Date;

    @UpdatedAt()
    updatedAt!: Date;
}

@Entity('ts_articles')
class TsArticle {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    title!: string;

    @DeletedAt()
    deletedAt!: Date | null;
}

// Bare syntax (no parentheses)
@Entity('ts_posts_bare')
class TsPostBare {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    title!: string;

    @CreatedAt
    createdAt!: Date;

    @UpdatedAt
    updatedAt!: Date;
}

@Entity('ts_articles_bare')
class TsArticleBare {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    title!: string;

    @DeletedAt
    deletedAt!: Date | null;
}

// Custom db name
@Entity('ts_posts_custom')
class TsPostCustom {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    title!: string;

    @CreatedAt('criado_em')
    createdAt!: Date;

    @UpdatedAt('atualizado_em')
    updatedAt!: Date;
}

// ─── Mock runner ──────────────────────────────────────────────────────────────

function makeRunner() {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const queue: Array<unknown[]> = [];
    const defaultRow = [
        {
            id: 'gen-id',
            title: 'x',
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
        },
    ];
    const runner = {
        query: async (sql: string, params?: unknown[]) => {
            const text = typeof sql === 'string' ? sql : (sql as any).text;
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

function makeRepo<T>(cls: new () => T, runner: ReturnType<typeof makeRunner>) {
    const meta = registry.getEntity(cls.name)!;
    return new Repository(cls, runner as unknown as IQueryRunner, meta);
}

// ─── bare syntax ──────────────────────────────────────────────────────────────

describe('@CreatedAt / @UpdatedAt / @DeletedAt — bare syntax', () => {
    it('bare @CreatedAt and @UpdatedAt use default column names on INSERT', async () => {
        const runner = makeRunner();
        const repo = makeRepo(TsPostBare, runner);

        const post = Object.assign(new TsPostBare(), { title: 'Bare' });
        await repo.save(post);

        const insert = runner.calls.find(
            (c) => c.sql.includes('ts_posts_bare') && c.sql.includes('INSERT'),
        );
        expect(insert).toBeDefined();
        expect(insert!.sql).toContain('created_at');
        expect(insert!.sql).toContain('updated_at');
    });

    it('bare @DeletedAt uses default column name on soft delete', async () => {
        const runner = makeRunner();
        const repo = makeRepo(TsArticleBare, runner);

        const article = Object.assign(new TsArticleBare(), {
            id: 'article-bare',
            title: 'Gone',
        });
        await repo.remove(article);

        const update = runner.calls.find(
            (c) =>
                c.sql.includes('ts_articles_bare') &&
                c.sql.includes('UPDATE'),
        );
        expect(update).toBeDefined();
        expect(update!.sql).toContain('deleted_at');
    });

    it('custom db names are used when provided', async () => {
        const runner = makeRunner();
        const repo = makeRepo(TsPostCustom, runner);

        const post = Object.assign(new TsPostCustom(), { title: 'Custom' });
        await repo.save(post);

        const insert = runner.calls.find(
            (c) =>
                c.sql.includes('ts_posts_custom') && c.sql.includes('INSERT'),
        );
        expect(insert).toBeDefined();
        expect(insert!.sql).toContain('criado_em');
        expect(insert!.sql).toContain('atualizado_em');
    });
});

// ─── @CreatedAt / @UpdatedAt ──────────────────────────────────────────────────

describe('@CreatedAt and @UpdatedAt', () => {
    it('sets createdAt and updatedAt on INSERT', async () => {
        const runner = makeRunner();
        const repo = makeRepo(TsPost, runner);

        const post = Object.assign(new TsPost(), { title: 'Hello' });
        await repo.save(post);

        const insert = runner.calls.find(
            (c) => c.sql.includes('ts_posts') && c.sql.includes('INSERT'),
        );
        expect(insert).toBeDefined();
        const paramsStr = JSON.stringify(insert!.params);
        expect(paramsStr).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('does not set createdAt on UPDATE', async () => {
        const runner = makeRunner();
        const repo = makeRepo(TsPost, runner);

        const post = Object.assign(new TsPost(), {
            id: 'existing-id',
            title: 'Hello',
        });
        await repo.save(post);

        const update = runner.calls.find(
            (c) => c.sql.includes('ts_posts') && c.sql.includes('UPDATE'),
        );
        expect(update).toBeDefined();
        expect(update!.sql).not.toContain('created_at');
    });

    it('always sets updatedAt on UPDATE', async () => {
        const runner = makeRunner();
        const repo = makeRepo(TsPost, runner);

        const post = Object.assign(new TsPost(), {
            id: 'existing-id',
            title: 'Hello',
        });
        await repo.save(post);

        const update = runner.calls.find(
            (c) => c.sql.includes('ts_posts') && c.sql.includes('UPDATE'),
        );
        expect(update!.sql).toContain('updated_at');
    });
});

// ─── @DeletedAt — soft delete ─────────────────────────────────────────────────

describe('@DeletedAt — soft delete', () => {
    it('emits UPDATE with deleted_at instead of DELETE', async () => {
        const runner = makeRunner();
        const repo = makeRepo(TsArticle, runner);

        const article = Object.assign(new TsArticle(), {
            id: 'article-1',
            title: 'Gone',
        });
        await repo.remove(article);

        const sqls = runner.calls.map((c) => c.sql);
        expect(sqls.every((s) => !s.includes('DELETE'))).toBe(true);
        const softDelete = runner.calls.find(
            (c) => c.sql.includes('ts_articles') && c.sql.includes('UPDATE'),
        );
        expect(softDelete).toBeDefined();
        expect(softDelete!.sql).toContain('deleted_at');
    });

    it('injects WHERE deleted_at IS NULL in findAll', () => {
        const meta = registry.getEntity('TsArticle')!;
        const state = new RepositoryState(TsArticle, meta);
        expect(state.findAllStatement.text).toContain('IS NULL');
    });

    it('injects WHERE deleted_at IS NULL in findById', () => {
        const meta = registry.getEntity('TsArticle')!;
        const state = new RepositoryState(TsArticle, meta);
        expect(state.findByIdStatement!.text).toContain('IS NULL');
    });

    it('softRestore sets deleted_at to null', async () => {
        const runner = makeRunner();
        const repo = makeRepo(TsArticle, runner);

        const article = Object.assign(new TsArticle(), {
            id: 'article-1',
            title: 'Back',
            deletedAt: new Date(),
        });
        await repo.softRestore(article);

        const update = runner.calls.find(
            (c) => c.sql.includes('ts_articles') && c.sql.includes('UPDATE'),
        );
        expect(update).toBeDefined();
        expect(update!.params).toContain(null);
    });

    it('find includes deleted records when withDeleted: true', async () => {
        const runner = makeRunner();
        const repo = makeRepo(TsArticle, runner);

        await repo.find({ withDeleted: true });

        const query = runner.calls[0];
        expect(query.sql).not.toContain('IS NULL');
    });

    it('find excludes deleted records by default', async () => {
        const runner = makeRunner();
        const repo = makeRepo(TsArticle, runner);

        await repo.find({});

        const query = runner.calls[0];
        expect(query.sql).toContain('deleted_at');
        expect(query.sql).toContain('IS NULL');
    });
});
