import { describe, expect, it, vi } from 'vitest';
import {
    Column,
    Entity,
    ManyToOne,
    OneToMany,
    OneToOne,
    PrimaryColumn,
} from '../index';
import { Repository } from '../repository/repository';
import { registry } from '../metadata/registry';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

@Entity('cascade_authors')
class CAuthor {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    name!: string;

    @OneToMany(() => CPost, 'author_id', { cascade: true })
    posts!: CPost[];
}

@Entity('cascade_posts')
class CPost {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    title!: string;

    @Column('author_id')
    authorId!: string;

    @ManyToOne(() => CAuthor, 'author_id', { cascade: ['insert', 'update'] })
    author!: CAuthor;
}

@Entity('cascade_profiles')
class CProfile {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    bio!: string;

    @Column('user_id')
    userId!: string;

    @OneToOne(() => CUser, 'user_id')
    user!: CUser;
}

@Entity('cascade_users')
class CUser {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    name!: string;

    @OneToOne(() => CProfile, 'user_id', { cascade: true })
    profile!: CProfile;
}

// ─── Mock runner ──────────────────────────────────────────────────────────────

function makeRunner() {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const queue: Array<unknown[]> = [];
    const defaultRow = [
        {
            id: 'gen-id',
            name: 'x',
            title: 'x',
            bio: 'x',
            author_id: null,
            user_id: null,
        },
    ];
    const runner = {
        query: vi.fn(async (sql: string, params?: unknown[]) => {
            const text = typeof sql === 'string' ? sql : (sql as any).text;
            calls.push({ sql: text, params: params ?? [] });
            return queue.length > 0 ? queue.shift()! : defaultRow;
        }),
        calls,
        queueOnce: (...rows: unknown[][]) => {
            queue.push(...rows);
        },
    };
    return runner;
}

function makeRepo<T>(cls: new () => T, runner: ReturnType<typeof makeRunner>) {
    const meta = registry.getEntity(cls.name)!;
    return new Repository(
        cls,
        runner as unknown as import('../interfaces/query-runner').IQueryRunner,
        meta,
    );
}

// ─── cascade: save — ManyToOne ────────────────────────────────────────────────

describe('cascade save — @ManyToOne', () => {
    it('saves related entity before main entity', async () => {
        const runner = makeRunner();
        const repo = makeRepo(CPost, runner);

        const author = Object.assign(new CAuthor(), { name: 'Martin' });
        const post = Object.assign(new CPost(), {
            title: 'Clean Code',
            author,
        });

        await repo.save(post);

        const sqls = runner.calls.map((c) => c.sql);
        const authorInsertIdx = sqls.findIndex((s) =>
            s.includes('cascade_authors'),
        );
        const postInsertIdx = sqls.findIndex((s) =>
            s.includes('cascade_posts'),
        );
        expect(authorInsertIdx).toBeGreaterThanOrEqual(0);
        expect(postInsertIdx).toBeGreaterThan(authorInsertIdx);
    });

    it('injects FK from saved related into main entity record', async () => {
        const runner = makeRunner();
        runner.queueOnce([
            {
                id: 'author-pk',
                name: 'Martin',
                author_id: null,
                user_id: null,
                title: 'x',
                bio: 'x',
            },
        ]);

        const repo = makeRepo(CPost, runner);
        const author = Object.assign(new CAuthor(), { name: 'Martin' });
        const post = Object.assign(new CPost(), {
            title: 'Clean Code',
            author,
        });

        await repo.save(post);

        const postInsert = runner.calls.find((c) =>
            c.sql.includes('cascade_posts'),
        );
        expect(postInsert).toBeDefined();
        expect(JSON.stringify(postInsert!.params)).toContain('author-pk');
    });

    it('skips cascade if relation property is not set', async () => {
        const runner = makeRunner();
        const repo = makeRepo(CPost, runner);

        const post = Object.assign(new CPost(), {
            title: 'No Author',
            authorId: 'existing-id',
        });
        await repo.save(post);

        const sqls = runner.calls.map((c) => c.sql);
        expect(sqls.every((s) => !s.includes('cascade_authors'))).toBe(true);
    });

    it('does not cascade if cascade option not set', async () => {
        @Entity('nocascade_posts')
        class NoCascadePost {
            @PrimaryColumn({ strategy: 'uuid_v4' }) id!: string;
            @Column() title!: string;
            @ManyToOne(() => CAuthor, 'author_id')
            author!: CAuthor;
        }
        const runner = makeRunner();
        const meta = registry.getEntity('NoCascadePost')!;
        const repo = new Repository(
            NoCascadePost,
            runner as unknown as import('../interfaces/query-runner').IQueryRunner,
            meta,
        );

        const post = Object.assign(new NoCascadePost(), {
            title: 'Test',
            author: Object.assign(new CAuthor(), { name: 'x' }),
        });
        await repo.save(post);

        const sqls = runner.calls.map((c) => c.sql);
        expect(sqls.every((s) => !s.includes('cascade_authors'))).toBe(true);
    });
});

// ─── cascade: save — OneToMany ────────────────────────────────────────────────

describe('cascade save — @OneToMany', () => {
    it('saves new children after parent using saveMany (batch)', async () => {
        const runner = makeRunner();
        const repo = makeRepo(CAuthor, runner);

        const p1 = Object.assign(new CPost(), { title: 'Post 1' });
        const p2 = Object.assign(new CPost(), { title: 'Post 2' });
        const author = Object.assign(new CAuthor(), {
            name: 'Martin',
            posts: [p1, p2],
        });

        await repo.save(author);

        const sqls = runner.calls.map((c) => c.sql);
        const authorIdx = sqls.findIndex((s) => s.includes('cascade_authors'));
        const postsIdx = sqls.findIndex((s) => s.includes('cascade_posts'));
        expect(authorIdx).toBeGreaterThanOrEqual(0);
        expect(postsIdx).toBeGreaterThan(authorIdx);
        expect(sqls[postsIdx]).toContain('VALUES');
    });

    it('injects parent FK into each new child before saving', async () => {
        const runner = makeRunner();
        runner.queueOnce([
            {
                id: 'author-pk',
                name: 'Martin',
                author_id: null,
                user_id: null,
                title: 'x',
                bio: 'x',
            },
        ]);

        const repo = makeRepo(CAuthor, runner);
        const p1 = Object.assign(new CPost(), { title: 'Post 1' });
        const author = Object.assign(new CAuthor(), {
            name: 'Martin',
            posts: [p1],
        });

        await repo.save(author);

        const postInsert = runner.calls.find((c) =>
            c.sql.includes('cascade_posts'),
        );
        expect(JSON.stringify(postInsert!.params)).toContain('author-pk');
    });

    it('saves existing children individually (not batch)', async () => {
        const runner = makeRunner();
        const repo = makeRepo(CAuthor, runner);

        const existing = Object.assign(new CPost(), {
            id: 'existing-id',
            title: 'Old Post',
            authorId: 'some-author',
        });
        const author = Object.assign(new CAuthor(), {
            name: 'Martin',
            posts: [existing],
        });

        await repo.save(author);

        const sqls = runner.calls.map((c) => c.sql);
        const postUpdate = sqls.find(
            (s) => s.includes('cascade_posts') && s.includes('UPDATE'),
        );
        expect(postUpdate).toBeDefined();
    });

    it('skips children cascade if property is undefined', async () => {
        const runner = makeRunner();
        const repo = makeRepo(CAuthor, runner);

        const author = Object.assign(new CAuthor(), { name: 'Martin' });
        await repo.save(author);

        const sqls = runner.calls.map((c) => c.sql);
        expect(sqls.every((s) => !s.includes('cascade_posts'))).toBe(true);
    });
});

// ─── cascade: save — OneToOne ─────────────────────────────────────────────────

describe('cascade save — @OneToOne inverse', () => {
    it('saves inverse relation after main entity and injects FK', async () => {
        const runner = makeRunner();
        runner.queueOnce([
            {
                id: 'user-pk',
                name: 'Emanuel',
                profile: null,
                user_id: null,
                author_id: null,
                title: 'x',
                bio: 'x',
            },
        ]);

        const repo = makeRepo(CUser, runner);
        const profile = Object.assign(new CProfile(), { bio: 'Dev' });
        const user = Object.assign(new CUser(), { name: 'Emanuel', profile });

        await repo.save(user);

        const sqls = runner.calls.map((c) => c.sql);
        const userIdx = sqls.findIndex((s) => s.includes('cascade_users'));
        const profileIdx = sqls.findIndex((s) =>
            s.includes('cascade_profiles'),
        );
        expect(userIdx).toBeGreaterThanOrEqual(0);
        expect(profileIdx).toBeGreaterThan(userIdx);
    });
});

// ─── cascade: remove ──────────────────────────────────────────────────────────

describe('cascade remove — @OneToMany', () => {
    it('deletes children before parent', async () => {
        const runner = makeRunner();
        const repo = makeRepo(CAuthor, runner);

        const author = Object.assign(new CAuthor(), {
            id: 'author-pk',
            name: 'Martin',
        });
        await repo.remove(author);

        const sqls = runner.calls.map((c) => c.sql);
        const childDeleteIdx = sqls.findIndex(
            (s) => s.includes('cascade_posts') && s.includes('DELETE'),
        );
        const parentDeleteIdx = sqls.findIndex(
            (s) => s.includes('cascade_authors') && s.includes('DELETE'),
        );
        expect(childDeleteIdx).toBeGreaterThanOrEqual(0);
        expect(parentDeleteIdx).toBeGreaterThan(childDeleteIdx);
    });

    it('passes parent PK as parameter to child delete', async () => {
        const runner = makeRunner();
        const repo = makeRepo(CAuthor, runner);

        const author = Object.assign(new CAuthor(), {
            id: 'author-pk',
            name: 'Martin',
        });
        await repo.remove(author);

        const childDelete = runner.calls.find(
            (c) => c.sql.includes('cascade_posts') && c.sql.includes('DELETE'),
        );
        expect(childDelete!.params).toContain('author-pk');
    });
});

// ─── cycle detection ──────────────────────────────────────────────────────────

describe('cycle detection', () => {
    it('does not loop infinitely when same entity appears in cascade chain', async () => {
        const runner = makeRunner();
        const repo = makeRepo(CPost, runner);

        const author = Object.assign(new CAuthor(), { name: 'Martin' });
        const post = Object.assign(new CPost(), { title: 'Post', author });
        author.posts = [post];

        await expect(repo.save(post)).resolves.toBeDefined();
    });
});
