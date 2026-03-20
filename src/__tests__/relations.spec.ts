import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { IQueryRunner } from '../interfaces/query-runner';
import { registry } from '../metadata/registry';
import { Repository } from '../repository/repository';
import {
    AuthorFixture,
    BookFixture,
    CategoryFixture,
    PersonFixture,
    PersonProfileFixture,
    RichBookFixture,
} from './fixtures/user.entity';

// force decorator registration
void AuthorFixture;
void BookFixture;
void CategoryFixture;
void PersonFixture;
void PersonProfileFixture;
void RichBookFixture;

// ─── ManyToOne — cenários estendidos ─────────────────────────────────────────

describe('@ManyToOne — múltiplos rows', () => {
    let mockQuery: Mock;
    let repo: Repository<BookFixture>;

    beforeEach(() => {
        mockQuery = vi.fn();
        repo = new Repository(
            BookFixture,
            { query: mockQuery },
            registry.getEntity('BookFixture')!,
        );
    });

    it('hidrata cada livro com seu respectivo autor', async () => {
        mockQuery.mockResolvedValueOnce([
            {
                id: 1,
                title: 'Clean Code',
                author_id: 10,
                mirror__author__id: 10,
                mirror__author__name: 'Robert Martin',
            },
            {
                id: 2,
                title: 'Clean Architecture',
                author_id: 10,
                mirror__author__id: 10,
                mirror__author__name: 'Robert Martin',
            },
            {
                id: 3,
                title: 'Refactoring',
                author_id: 20,
                mirror__author__id: 20,
                mirror__author__name: 'Martin Fowler',
            },
        ]);

        const books = await repo.find({ relations: ['author'] });

        expect(books).toHaveLength(3);
        expect(books[0].author.id).toBe(10);
        expect(books[0].author.name).toBe('Robert Martin');
        expect(books[1].author.id).toBe(10);
        expect(books[2].author.id).toBe(20);
        expect(books[2].author.name).toBe('Martin Fowler');
    });

    it('mix null/não-null na mesma query — books com e sem autor', async () => {
        mockQuery.mockResolvedValueOnce([
            {
                id: 1,
                title: 'Com Autor',
                author_id: 10,
                mirror__author__id: 10,
                mirror__author__name: 'Alice',
            },
            {
                id: 2,
                title: 'Sem Autor',
                author_id: null,
                mirror__author__id: null,
                mirror__author__name: null,
            },
            {
                id: 3,
                title: 'Outro Autor',
                author_id: 20,
                mirror__author__id: 20,
                mirror__author__name: 'Bob',
            },
            {
                id: 4,
                title: 'Sem Autor 2',
                author_id: null,
                mirror__author__id: null,
                mirror__author__name: null,
            },
        ]);

        const books = await repo.find({ relations: ['author'] });

        expect(books[0].author).toBeInstanceOf(AuthorFixture);
        expect(books[0].author.name).toBe('Alice');
        expect(books[1].author).toBeNull();
        expect(books[2].author).toBeInstanceOf(AuthorFixture);
        expect(books[2].author.name).toBe('Bob');
        expect(books[3].author).toBeNull();
    });

    it('FK column (authorId) é hidratada corretamente junto com a relação', async () => {
        mockQuery.mockResolvedValueOnce([
            {
                id: 5,
                title: 'Test',
                author_id: 99,
                mirror__author__id: 99,
                mirror__author__name: 'Eve',
            },
        ]);

        const [book] = await repo.find({ relations: ['author'] });

        expect(book.authorId).toBe(99);
        expect(book.author.id).toBe(99);
    });

    it('relação inexistente no options.relations é ignorada silenciosamente', async () => {
        mockQuery.mockResolvedValueOnce([]);
        await repo.find({ relations: ['nonExistent' as never] });

        const [sql] = mockQuery.mock.calls[0];
        expect(sql).not.toContain('LEFT JOIN');
        expect(sql).not.toContain('JOIN');
    });

    it('sem options.relations não gera JOIN', async () => {
        mockQuery.mockResolvedValueOnce([]);
        await repo.find({ where: { title: 'X' } });

        const [sql] = mockQuery.mock.calls[0];
        expect(sql).not.toContain('JOIN');
    });

    it('orderBy com ManyToOne usa colunas qualificadas no SELECT mas ORDER BY sem qualificação', async () => {
        mockQuery.mockResolvedValueOnce([]);
        await repo.find({ relations: ['author'], orderBy: { title: 'DESC' } });

        const [sql] = mockQuery.mock.calls[0];
        expect(sql).toContain('LEFT JOIN');
        expect(sql).toContain('ORDER BY "title" DESC');
    });

    it('WHERE + orderBy + limit + relação geram SQL correto e completo', async () => {
        mockQuery.mockResolvedValueOnce([]);
        await repo.find({
            relations: ['author'],
            where: { authorId: 10 },
            orderBy: { id: 'ASC' },
            limit: 3,
            offset: 6,
        });

        const [sql] = mockQuery.mock.calls[0];
        expect(sql).toContain('LEFT JOIN');
        expect(sql).toContain('WHERE');
        expect(sql).toContain('ORDER BY "id" ASC');
        expect(sql).toContain('LIMIT 3');
        expect(sql).toContain('OFFSET 6');
    });
});

// ─── ManyToOne — 2 relações na mesma entidade (RichBookFixture) ───────────────

describe('@ManyToOne — 2 relações na mesma entidade', () => {
    let mockQuery: Mock;
    let repo: Repository<RichBookFixture>;

    beforeEach(() => {
        mockQuery = vi.fn();
        repo = new Repository(
            RichBookFixture,
            { query: mockQuery },
            registry.getEntity('RichBookFixture')!,
        );
    });

    it('gera dois LEFT JOINs no SQL', async () => {
        mockQuery.mockResolvedValueOnce([]);
        await repo.find({ relations: ['author', 'category'] });

        const [sql] = mockQuery.mock.calls[0];
        expect(sql).toContain('LEFT JOIN "authors"');
        expect(sql).toContain('LEFT JOIN "categories"');
    });

    it('seleciona colunas prefixadas de ambas as relações', async () => {
        mockQuery.mockResolvedValueOnce([]);
        await repo.find({ relations: ['author', 'category'] });

        const [sql] = mockQuery.mock.calls[0];
        expect(sql).toContain('"mirror__author__id"');
        expect(sql).toContain('"mirror__author__name"');
        expect(sql).toContain('"mirror__category__id"');
        expect(sql).toContain('"mirror__category__name"');
    });

    it('hidrata ambas as relações corretamente', async () => {
        const publishedAt = new Date('2024-03-01T10:00:00Z');
        mockQuery.mockResolvedValueOnce([
            {
                id: 1,
                title: 'DDD',
                author_id: 5,
                category_id: 3,
                published_at: publishedAt,
                mirror__author__id: 5,
                mirror__author__name: 'Eric Evans',
                mirror__category__id: 3,
                mirror__category__name: 'Architecture',
            },
        ]);

        const [book] = await repo.find({ relations: ['author', 'category'] });

        expect(book).toBeInstanceOf(RichBookFixture);
        expect(book.author).toBeInstanceOf(AuthorFixture);
        expect(book.author.name).toBe('Eric Evans');
        expect(book.category).toBeInstanceOf(CategoryFixture);
        expect(book.category.name).toBe('Architecture');
        expect(book.publishedAt).toBeInstanceOf(Date);
    });

    it('uma relação nula e outra presente — hidratação independente', async () => {
        mockQuery.mockResolvedValueOnce([
            {
                id: 2,
                title: 'Unknown Author',
                author_id: null,
                category_id: 7,
                published_at: null,
                mirror__author__id: null,
                mirror__author__name: null,
                mirror__category__id: 7,
                mirror__category__name: 'Fiction',
            },
        ]);

        const [book] = await repo.find({ relations: ['author', 'category'] });

        expect(book.author).toBeNull();
        expect(book.category).toBeInstanceOf(CategoryFixture);
        expect(book.category.name).toBe('Fiction');
    });

    it('carrega apenas uma das relações quando somente ela é solicitada', async () => {
        mockQuery.mockResolvedValueOnce([]);
        await repo.find({ relations: ['category'] });

        const [sql] = mockQuery.mock.calls[0];
        expect(sql).toContain('LEFT JOIN "categories"');
        expect(sql).not.toContain('LEFT JOIN "authors"');
    });
});

// ─── OneToMany — cenários estendidos ─────────────────────────────────────────

describe('@OneToMany — agrupamento com múltiplos autores e livros', () => {
    let mockQuery: Mock;
    let repo: Repository<AuthorFixture>;

    beforeEach(() => {
        mockQuery = vi.fn();
        repo = new Repository(
            AuthorFixture,
            { query: mockQuery },
            registry.getEntity('AuthorFixture')!,
        );
    });

    it('3 autores com 5 livros no total — distribuição correta', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 1, name: 'Robert Martin' },
                { id: 2, name: 'Martin Fowler' },
                { id: 3, name: 'Eric Evans' },
            ])
            .mockResolvedValueOnce([
                { id: 10, title: 'Clean Code', author_id: 1 },
                { id: 11, title: 'Clean Architecture', author_id: 1 },
                { id: 12, title: 'Clean Agile', author_id: 1 },
                { id: 20, title: 'Refactoring', author_id: 2 },
                { id: 30, title: 'DDD', author_id: 3 },
            ]);

        const authors = await repo.find({ relations: ['books'] });

        expect(authors[0].books).toHaveLength(3);
        expect(authors[0].books.map((b) => b.title)).toEqual([
            'Clean Code',
            'Clean Architecture',
            'Clean Agile',
        ]);
        expect(authors[1].books).toHaveLength(1);
        expect(authors[1].books[0].title).toBe('Refactoring');
        expect(authors[2].books).toHaveLength(1);
        expect(authors[2].books[0].title).toBe('DDD');
    });

    it('query principal vazia — segunda query nunca é executada', async () => {
        mockQuery.mockResolvedValueOnce([]);

        await repo.find({ relations: ['books'] });

        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('todos os autores sem livros — todos recebem array vazio', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 1, name: 'Author A' },
                { id: 2, name: 'Author B' },
                { id: 3, name: 'Author C' },
            ])
            .mockResolvedValueOnce([]);

        const authors = await repo.find({ relations: ['books'] });

        expect(authors).toHaveLength(3);
        for (const author of authors) {
            expect(author.books).toEqual([]);
        }
    });

    it('passa todos os IDs dos parents no ANY($1) da segunda query', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 7, name: 'A' },
                { id: 8, name: 'B' },
                { id: 9, name: 'C' },
            ])
            .mockResolvedValueOnce([]);

        await repo.find({ relations: ['books'] });

        const [, secondParams] = mockQuery.mock.calls[1];
        expect(secondParams).toEqual([[7, 8, 9]]);
    });

    it('instâncias dentro do array books são BookFixture', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 1, name: 'Author' }])
            .mockResolvedValueOnce([
                { id: 10, title: 'Book A', author_id: 1 },
                { id: 11, title: 'Book B', author_id: 1 },
            ]);

        const [author] = await repo.find({ relations: ['books'] });

        for (const book of author.books) {
            expect(book).toBeInstanceOf(BookFixture);
        }
    });

    it('livros de diferentes autores não vazam entre grupos', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 1, name: 'A' },
                { id: 2, name: 'B' },
            ])
            .mockResolvedValueOnce([
                { id: 10, title: 'Book de A', author_id: 1 },
                { id: 20, title: 'Book de B', author_id: 2 },
            ]);

        const authors = await repo.find({ relations: ['books'] });

        expect(authors[0].books).toHaveLength(1);
        expect(authors[0].books[0].title).toBe('Book de A');
        expect(authors[1].books).toHaveLength(1);
        expect(authors[1].books[0].title).toBe('Book de B');
    });

    it('WHERE + orderBy na query principal são passados corretamente', async () => {
        mockQuery.mockResolvedValueOnce([]);

        await repo.find({
            relations: ['books'],
            where: { name: 'Martin' },
            orderBy: { id: 'DESC' },
        });

        const [sql] = mockQuery.mock.calls[0];
        expect(sql).toContain('WHERE');
        expect(sql).toContain('ORDER BY "id" DESC');
        expect(mockQuery).toHaveBeenCalledTimes(1); // sem resultados, não dispara 2ª query
    });
});

// ─── OneToOne ─────────────────────────────────────────────────────────────────

describe('@OneToOne — owner (tem FK)', () => {
    let mockQuery: Mock;
    let repo: Repository<PersonProfileFixture>;

    beforeEach(() => {
        mockQuery = vi.fn();
        repo = new Repository(
            PersonProfileFixture,
            { query: mockQuery },
            registry.getEntity('PersonProfileFixture')!,
        );
    });

    it('gera LEFT JOIN e hidrata a entidade relacionada', async () => {
        mockQuery.mockResolvedValueOnce([
            {
                id: 1,
                bio: 'Dev',
                person_id: 10,
                mirror__person__id: 10,
                mirror__person__name: 'Alice',
            },
        ]);

        const [profile] = await repo.find({ relations: ['person'] });

        const [sql] = mockQuery.mock.calls[0];
        expect(sql).toContain('LEFT JOIN');
        expect(sql).toContain('"persons"');
        expect(profile.person).toBeTruthy();
        expect(profile.person.id).toBe(10);
        expect(profile.person.name).toBe('Alice');
    });

    it('atribui null quando FK é null', async () => {
        mockQuery.mockResolvedValueOnce([
            {
                id: 1,
                bio: 'Sem pessoa',
                person_id: null,
                mirror__person__id: null,
                mirror__person__name: null,
            },
        ]);

        const [profile] = await repo.find({ relations: ['person'] });

        expect(profile.person).toBeNull();
    });

    it('não usa JOIN quando relations não é solicitado', async () => {
        mockQuery.mockResolvedValueOnce([{ id: 1, bio: 'Dev', person_id: 10 }]);

        const [profile] = await repo.find({});

        const [sql] = mockQuery.mock.calls[0];
        expect(sql).not.toContain('JOIN');
        expect(
            (profile as unknown as Record<string, unknown>).person,
        ).toBeUndefined();
    });

    it('múltiplos perfis com pessoas distintas', async () => {
        mockQuery.mockResolvedValueOnce([
            {
                id: 1,
                bio: 'Dev',
                person_id: 10,
                mirror__person__id: 10,
                mirror__person__name: 'Alice',
            },
            {
                id: 2,
                bio: 'Designer',
                person_id: 20,
                mirror__person__id: 20,
                mirror__person__name: 'Bob',
            },
        ]);

        const profiles = await repo.find({ relations: ['person'] });

        expect(profiles[0].person.name).toBe('Alice');
        expect(profiles[1].person.name).toBe('Bob');
    });

    it('instanceof correto na entidade relacionada', async () => {
        mockQuery.mockResolvedValueOnce([
            {
                id: 1,
                bio: 'Dev',
                person_id: 10,
                mirror__person__id: 10,
                mirror__person__name: 'Alice',
            },
        ]);

        const [profile] = await repo.find({ relations: ['person'] });

        expect(profile).toBeInstanceOf(PersonProfileFixture);
        expect(profile.person).toBeInstanceOf(PersonFixture);
    });
});

describe('@OneToOne — inverse (não tem FK)', () => {
    let mockQuery: Mock;
    let repo: Repository<PersonFixture>;

    beforeEach(() => {
        mockQuery = vi.fn();
        repo = new Repository(
            PersonFixture,
            { query: mockQuery },
            registry.getEntity('PersonFixture')!,
        );
    });

    it('faz batch query separada e atribui o perfil à pessoa', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 10, name: 'Alice' }])
            .mockResolvedValueOnce([{ id: 1, bio: 'Dev', person_id: 10 }]);

        const [person] = await repo.find({ relations: ['profile'] });

        expect(mockQuery).toHaveBeenCalledTimes(2);
        const [batchSql, batchParams] = mockQuery.mock.calls[1];
        expect(batchSql).toContain('"person_profiles"');
        expect(batchSql).toContain('= ANY($1)');
        expect(batchParams).toEqual([[10]]);

        expect(person.profile).toBeTruthy();
        expect(person.profile.bio).toBe('Dev');
    });

    it('atribui null quando perfil não existe para a pessoa', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 10, name: 'Alice' }])
            .mockResolvedValueOnce([]);

        const [person] = await repo.find({ relations: ['profile'] });

        expect(person.profile).toBeNull();
    });

    it('distribui corretamente perfis para múltiplas pessoas', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 10, name: 'Alice' },
                { id: 20, name: 'Bob' },
            ])
            .mockResolvedValueOnce([
                { id: 1, bio: 'Dev', person_id: 10 },
                { id: 2, bio: 'Designer', person_id: 20 },
            ]);

        const persons = await repo.find({ relations: ['profile'] });

        expect(persons[0].profile.bio).toBe('Dev');
        expect(persons[1].profile.bio).toBe('Designer');
    });

    it('não atribui perfil de outra pessoa (isolamento de grupos)', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 10, name: 'Alice' },
                { id: 20, name: 'Bob' },
            ])
            .mockResolvedValueOnce([
                { id: 1, bio: 'Dev', person_id: 10 },
                // Bob não tem perfil
            ]);

        const persons = await repo.find({ relations: ['profile'] });

        expect(persons[0].profile.bio).toBe('Dev');
        expect(persons[1].profile).toBeNull();
    });

    it('não dispara segunda query quando resultado principal está vazio', async () => {
        mockQuery.mockResolvedValueOnce([]);

        await repo.find({ relations: ['profile'] });

        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('instanceof correto na entidade relacionada', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 10, name: 'Alice' }])
            .mockResolvedValueOnce([{ id: 1, bio: 'Dev', person_id: 10 }]);

        const [person] = await repo.find({ relations: ['profile'] });

        expect(person).toBeInstanceOf(PersonFixture);
        expect(person.profile).toBeInstanceOf(PersonProfileFixture);
    });
});
