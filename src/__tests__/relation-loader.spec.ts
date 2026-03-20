import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { IQueryRunner } from '../interfaces/query-runner';
import { RepositoryState } from '../repository/repository-state';
import {
    buildRelationTree,
    loadRelationsForEntities,
} from '../repository/relation-loader';
import { registry } from '../metadata/registry';
import {
    AuthorFixture,
    BookFixture,
    ArticleFixture,
    TagFixture,
    PersonFixture,
    PersonProfileFixture,
} from './fixtures/user.entity';

void AuthorFixture;
void BookFixture;
void ArticleFixture;
void TagFixture;
void PersonFixture;
void PersonProfileFixture;

// ─── buildRelationTree ────────────────────────────────────────────────────────

describe('buildRelationTree', () => {
    it('flat relations produce empty child arrays', () => {
        const tree = buildRelationTree(['books', 'author']);
        expect(tree.get('books')).toEqual([]);
        expect(tree.get('author')).toEqual([]);
    });

    it('dot-notation adds child to parent entry', () => {
        const tree = buildRelationTree(['books', 'books.author']);
        expect(tree.get('books')).toEqual(['author']);
    });

    it('multiple dots produce correct parent and child chains', () => {
        const tree = buildRelationTree(['a', 'a.b', 'a.c']);
        expect(tree.get('a')).toEqual(['b', 'c']);
    });

    it('dot-only entry (no top-level) creates parent key with child', () => {
        const tree = buildRelationTree(['books.author']);
        expect(tree.has('books')).toBe(true);
        expect(tree.get('books')).toEqual(['author']);
    });

    it('duplicate top-level relations are not duplicated', () => {
        const tree = buildRelationTree(['books', 'books']);
        expect([...tree.keys()]).toHaveLength(1);
    });
});

// ─── loadRelationsForEntities — helpers ──────────────────────────────────────

const makeRunner = (
    responses: unknown[][] = [],
): { runner: IQueryRunner; mockQuery: Mock } => {
    const mockQuery = vi.fn();
    responses.forEach((r) => mockQuery.mockResolvedValueOnce(r));
    return { runner: { query: mockQuery }, mockQuery };
};

const stateFor = <T>(ctor: new () => T) =>
    new RepositoryState(ctor, registry.getEntity(ctor.name)!);

// ─── nestedOwnerSide ─────────────────────────────────────────────────────────

describe('loadRelationsForEntities — owner side (ManyToOne)', () => {
    it('sets relation to null and skips query when all FK values are null', async () => {
        const { runner, mockQuery } = makeRunner();
        const state = stateFor(BookFixture);
        const book = Object.assign(new BookFixture(), {
            id: 1,
            title: 'B',
            authorId: null,
        });

        await loadRelationsForEntities([book], state, ['author'], runner);

        expect(mockQuery).not.toHaveBeenCalled();
        expect((book as Record<string, unknown>)['author']).toBeNull();
    });

    it('loads and assigns related entities by FK', async () => {
        const authorRow = { id: 1, name: 'Martin' };
        const { runner, mockQuery } = makeRunner([[authorRow]]);
        const state = stateFor(BookFixture);
        const book = Object.assign(new BookFixture(), {
            id: 10,
            title: 'CC',
            authorId: 1,
        });

        await loadRelationsForEntities([book], state, ['author'], runner);

        expect(mockQuery).toHaveBeenCalledOnce();
        expect((book as Record<string, unknown>)['author']).toMatchObject({
            id: 1,
            name: 'Martin',
        });
    });

    it('deduplicates FK values when multiple entities share the same FK', async () => {
        const authorRow = { id: 1, name: 'Martin' };
        const { runner, mockQuery } = makeRunner([[authorRow]]);
        const state = stateFor(BookFixture);
        const books = [
            Object.assign(new BookFixture(), { id: 10, authorId: 1 }),
            Object.assign(new BookFixture(), { id: 11, authorId: 1 }),
        ];

        await loadRelationsForEntities(books, state, ['author'], runner);

        const sql: string = mockQuery.mock.calls[0][0];
        // Only one distinct FK value should be in the query
        expect(sql.match(/\$\d+/g)?.length).toBe(1);
    });
});

// ─── nestedInverse ───────────────────────────────────────────────────────────

describe('loadRelationsForEntities — inverse side (OneToMany)', () => {
    it('groups children and assigns arrays to parents', async () => {
        const bookRows = [
            { id: 10, title: 'Book A', author_id: 1 },
            { id: 11, title: 'Book B', author_id: 1 },
        ];
        const { runner } = makeRunner([bookRows]);
        const state = stateFor(AuthorFixture);
        const author = Object.assign(new AuthorFixture(), {
            id: 1,
            name: 'Martin',
        });

        await loadRelationsForEntities([author], state, ['books'], runner);

        expect(author.books).toHaveLength(2);
        expect(author.books[0].title).toBe('Book A');
    });

    it('assigns empty array when no matching children', async () => {
        const { runner } = makeRunner([[]]);
        const state = stateFor(AuthorFixture);
        const author = Object.assign(new AuthorFixture(), {
            id: 99,
            name: 'Nobody',
        });

        await loadRelationsForEntities([author], state, ['books'], runner);

        expect(author.books).toEqual([]);
    });
});

// ─── nestedInverse — OneToOne ─────────────────────────────────────────────────

describe('loadRelationsForEntities — inverse side (OneToOne)', () => {
    it('assigns single child to parent (not an array)', async () => {
        const profileRow = { id: 5, bio: 'Hello', person_id: 1 };
        const { runner } = makeRunner([[profileRow]]);
        const state = stateFor(PersonFixture);
        const person = Object.assign(new PersonFixture(), {
            id: 1,
            name: 'Alice',
        });

        await loadRelationsForEntities([person], state, ['profile'], runner);

        expect(Array.isArray(person.profile)).toBe(false);
        expect(person.profile).toMatchObject({ bio: 'Hello' });
    });

    it('assigns null when no matching one-to-one child', async () => {
        const { runner } = makeRunner([[]]);
        const state = stateFor(PersonFixture);
        const person = Object.assign(new PersonFixture(), {
            id: 99,
            name: 'Nobody',
        });

        await loadRelationsForEntities([person], state, ['profile'], runner);

        expect(person.profile).toBeNull();
    });
});

// ─── nestedMtm ───────────────────────────────────────────────────────────────

describe('loadRelationsForEntities — many-to-many', () => {
    it('groups tags and assigns arrays to articles', async () => {
        const tagRows = [
            { id: 1, name: 'TypeScript', _mirror_mtm_fk_: 10 },
            { id: 2, name: 'Node.js', _mirror_mtm_fk_: 10 },
        ];
        const { runner } = makeRunner([tagRows]);
        const state = stateFor(ArticleFixture);
        const article = Object.assign(new ArticleFixture(), {
            id: 10,
            title: 'TS Guide',
        });

        await loadRelationsForEntities([article], state, ['tags'], runner);

        expect(article.tags).toHaveLength(2);
    });

    it('assigns empty array when join returns no rows', async () => {
        const { runner } = makeRunner([[]]);
        const state = stateFor(ArticleFixture);
        const article = Object.assign(new ArticleFixture(), {
            id: 99,
            title: 'Orphan',
        });

        await loadRelationsForEntities([article], state, ['tags'], runner);

        expect(article.tags).toEqual([]);
    });
});

// ─── edge cases ──────────────────────────────────────────────────────────────

describe('loadRelationsForEntities — edge cases', () => {
    it('skips unknown relation keys silently', async () => {
        const { runner, mockQuery } = makeRunner();
        const state = stateFor(AuthorFixture);
        const author = Object.assign(new AuthorFixture(), {
            id: 1,
            name: 'Martin',
        });

        await loadRelationsForEntities(
            [author],
            state,
            ['nonExistent'],
            runner,
        );

        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('recursively loads sub-relations when childRelations is non-empty', async () => {
        const bookRow = { id: 10, title: 'CC', author_id: 1 };
        const authorRow = { id: 1, name: 'Martin' };
        const { runner, mockQuery } = makeRunner([[bookRow], [authorRow]]);
        const state = stateFor(AuthorFixture);
        const author = Object.assign(new AuthorFixture(), {
            id: 1,
            name: 'Martin',
        });

        await loadRelationsForEntities(
            [author],
            state,
            ['books', 'books.author'],
            runner,
        );

        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(author.books[0].author).toMatchObject({ name: 'Martin' });
    });
});
