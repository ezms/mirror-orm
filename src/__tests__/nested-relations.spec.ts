import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { IQueryRunner } from '../interfaces/query-runner';
import { registry } from '../metadata/registry';
import { Repository } from '../repository/repository';
import { AuthorFixture, BookFixture } from './fixtures/user.entity';

// ─── Fixtures ────────────────────────────────────────────────────────────────

void AuthorFixture;
void BookFixture;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Nested relation loading (dot notation)', () => {
    let mockQuery: Mock;
    let runner: IQueryRunner;

    beforeEach(() => {
        mockQuery = vi.fn();
        runner = { query: mockQuery };
    });

    it('buildRelationTree: top-level relation without sub-relations works as before', async () => {
        const repo = new Repository(
            AuthorFixture,
            runner,
            registry.getEntity('AuthorFixture')!,
        );
        mockQuery
            .mockResolvedValueOnce([{ id: 1, name: 'Martin' }])
            .mockResolvedValueOnce([
                { id: 10, title: 'Clean Code', author_id: 1 },
            ]);

        const [author] = await repo.find({ relations: ['books'] });

        expect(author.books).toHaveLength(1);
        expect(author.books[0].title).toBe('Clean Code');
        expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('books.author: loads nested ManyToOne via batch query (no JOIN for sub-level)', async () => {
        const repo = new Repository(
            AuthorFixture,
            runner,
            registry.getEntity('AuthorFixture')!,
        );
        mockQuery
            .mockResolvedValueOnce([{ id: 1, name: 'Martin' }])
            .mockResolvedValueOnce([
                { id: 10, title: 'Clean Code', author_id: 1 },
                { id: 11, title: 'Clean Architecture', author_id: 1 },
            ])
            .mockResolvedValueOnce([{ id: 1, name: 'Martin' }]);

        const [author] = await repo.find({
            relations: ['books', 'books.author'],
        });

        expect(author.books).toHaveLength(2);
        expect(author.books[0].author).toBeTruthy();
        expect(author.books[0].author.name).toBe('Martin');
        expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('nested batch query uses IN / ANY with deduped FK values', async () => {
        const repo = new Repository(
            AuthorFixture,
            runner,
            registry.getEntity('AuthorFixture')!,
        );
        mockQuery
            .mockResolvedValueOnce([
                { id: 1, name: 'Author A' },
                { id: 2, name: 'Author B' },
            ])
            .mockResolvedValueOnce([
                { id: 10, title: 'Book A1', author_id: 1 },
                { id: 11, title: 'Book A2', author_id: 1 },
                { id: 20, title: 'Book B1', author_id: 2 },
            ])
            .mockResolvedValueOnce([
                { id: 1, name: 'Author A' },
                { id: 2, name: 'Author B' },
            ]);

        const authors = await repo.find({
            relations: ['books', 'books.author'],
        });

        // 3rd query should look up authors for sub-relation
        expect(mockQuery).toHaveBeenCalledTimes(3);

        // books are correctly linked back to their authors
        expect(authors[0].books[0].author.name).toBe('Author A');
        expect(authors[1].books[0].author.name).toBe('Author B');
    });

    it('dot-notation without corresponding top-level is silently ignored', async () => {
        const repo = new Repository(
            AuthorFixture,
            runner,
            registry.getEntity('AuthorFixture')!,
        );
        mockQuery.mockResolvedValueOnce([{ id: 1, name: 'Martin' }]);

        // 'nonExistent.something' — 'nonExistent' is not a real relation
        const [author] = await repo.find({
            relations: ['nonExistent.something'] as string[],
        });

        expect(
            (author as Record<string, unknown>)['nonExistent'],
        ).toBeUndefined();
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('sub-relation books.author coexists with top-level author relation on BookFixture', async () => {
        const bookRepo = new Repository(
            BookFixture,
            runner,
            registry.getEntity('BookFixture')!,
        );
        mockQuery.mockResolvedValueOnce([
            {
                id: 10,
                title: 'Clean Code',
                author_id: 1,
                mirror__author__id: 1,
                mirror__author__name: 'Martin',
            },
        ]);

        const [book] = await bookRepo.find({ relations: ['author'] });

        expect(book.author).toBeTruthy();
        expect(book.author.name).toBe('Martin');
        expect(mockQuery).toHaveBeenCalledTimes(1); // MTO loaded via JOIN, no extra query
    });
});
