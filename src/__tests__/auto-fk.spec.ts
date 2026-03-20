import { describe, expect, it } from 'vitest';
import { Column, Entity, ManyToOne, OneToOne, PrimaryColumn } from '../index';
import { Repository } from '../repository/repository';
import { registry } from '../metadata/registry';
import { IQueryRunner } from '../interfaces/query-runner';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

@Entity('fk_authors')
class FkAuthor {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    name!: string;
}

@Entity('fk_posts')
class FkPost {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    title!: string;

    @Column('author_id')
    authorId!: string;

    @ManyToOne(() => FkAuthor, 'author_id')
    author!: FkAuthor;
}

@Entity('fk_profiles')
class FkProfile {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    bio!: string;
}

@Entity('fk_users')
class FkUser {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    name!: string;

    @Column('profile_id')
    profileId!: string;

    @OneToOne(() => FkProfile, 'profile_id')
    profile!: FkProfile;
}

// ─── Mock runner ──────────────────────────────────────────────────────────────

function makeRunner() {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
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
        query: async (sql: string, params?: unknown[]) => {
            const text = typeof sql === 'string' ? sql : (sql as any).text;
            calls.push({ sql: text, params: params ?? [] });
            return defaultRow;
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

describe('Auto-FK Mapping — @ManyToOne', () => {
    it('injects FK from loaded related entity when authorId is not set', async () => {
        const runner = makeRunner();
        const repo = makeRepo(FkPost, runner);

        const author = Object.assign(new FkAuthor(), {
            id: 'author-123',
            name: 'Martin',
        });
        const post = Object.assign(new FkPost(), {
            title: 'Clean Code',
            author,
        });

        await repo.save(post);

        const insert = runner.calls.find((c) => c.sql.includes('fk_posts'));
        expect(JSON.stringify(insert!.params)).toContain('author-123');
    });

    it('relation object PK takes priority over manually set FK', async () => {
        const runner = makeRunner();
        const repo = makeRepo(FkPost, runner);

        const author = Object.assign(new FkAuthor(), {
            id: 'author-123',
            name: 'Martin',
        });
        const post = Object.assign(new FkPost(), {
            title: 'Clean Code',
            author,
            authorId: 'manual-id',
        });

        await repo.save(post);

        const insert = runner.calls.find((c) => c.sql.includes('fk_posts'));
        expect(JSON.stringify(insert!.params)).toContain('author-123');
        expect(JSON.stringify(insert!.params)).not.toContain('manual-id');
    });

    it('skips FK injection when related entity has no PK', async () => {
        const runner = makeRunner();
        const repo = makeRepo(FkPost, runner);

        const author = Object.assign(new FkAuthor(), { name: 'Martin' });
        const post = Object.assign(new FkPost(), {
            title: 'Clean Code',
            author,
        });

        await repo.save(post);

        const insert = runner.calls.find((c) => c.sql.includes('fk_posts'));
        expect(insert).toBeDefined();
        expect(JSON.stringify(insert!.params)).not.toContain('author-123');
    });

    it('syncs FK when relation object is reassigned on a loaded entity', async () => {
        const runner = makeRunner();
        const repo = makeRepo(FkPost, runner);

        const post = Object.assign(new FkPost(), {
            id: 'post-1',
            title: 'Old',
            authorId: 'old-author',
        });
        const newAuthor = Object.assign(new FkAuthor(), {
            id: 'new-author',
            name: 'New',
        });
        post.author = newAuthor;

        await repo.save(post);

        const update = runner.calls.find(
            (c) => c.sql.includes('fk_posts') && c.sql.includes('UPDATE'),
        );
        expect(update).toBeDefined();
        expect(JSON.stringify(update!.params)).toContain('new-author');
    });

    it('skips FK injection when relation property is not set', async () => {
        const runner = makeRunner();
        const repo = makeRepo(FkPost, runner);

        const post = Object.assign(new FkPost(), {
            title: 'Clean Code',
            authorId: 'existing-id',
        });

        await repo.save(post);

        const insert = runner.calls.find((c) => c.sql.includes('fk_posts'));
        expect(JSON.stringify(insert!.params)).toContain('existing-id');
    });
});

describe('Auto-FK Mapping — @OneToOne owner', () => {
    it('injects FK from loaded profile when profileId is not set', async () => {
        const runner = makeRunner();
        const repo = makeRepo(FkUser, runner);

        const profile = Object.assign(new FkProfile(), {
            id: 'profile-456',
            bio: 'Dev',
        });
        const user = Object.assign(new FkUser(), { name: 'Emanuel', profile });

        await repo.save(user);

        const insert = runner.calls.find((c) => c.sql.includes('fk_users'));
        expect(JSON.stringify(insert!.params)).toContain('profile-456');
    });
});
