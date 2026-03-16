import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { IQueryRunner } from '../interfaces/query-runner';
import { registry } from '../metadata/registry';
import { Repository } from '../repository/repository';
import { ArticleFixture, TagFixture } from './fixtures/user.entity';

// force decorator registration
void ArticleFixture;
void TagFixture;

describe('@ManyToMany — article.tags', () => {
    let mockQuery: Mock;
    let repo: Repository<ArticleFixture>;

    beforeEach(() => {
        mockQuery = vi.fn();
        repo = new Repository(ArticleFixture, { query: mockQuery } as IQueryRunner, registry.getEntity('ArticleFixture')!);
    });

    it('gera batch query com INNER JOIN na join table', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 1, title: 'Clean Code' }])
            .mockResolvedValueOnce([]);

        await repo.find({ relations: ['tags'] });

        const [batchSql] = mockQuery.mock.calls[1];
        expect(batchSql).toContain('INNER JOIN');
        expect(batchSql).toContain('"article_tags"');
        expect(batchSql).toContain('"tags"');
        expect(batchSql).toContain('= ANY($1)');
    });

    it('não faz JOIN na query principal', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 1, title: 'Clean Code' }])
            .mockResolvedValueOnce([]);

        await repo.find({ relations: ['tags'] });

        const [mainSql] = mockQuery.mock.calls[0];
        expect(mainSql).not.toContain('JOIN');
        expect(mainSql).toContain('"articles"');
    });

    it('hidrata tags e distribui corretamente por artigo', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 1, title: 'Clean Code' },
                { id: 2, title: 'Refactoring' },
            ])
            .mockResolvedValueOnce([
                { id: 10, name: 'OOP',         _mirror_mtm_fk_: 1 },
                { id: 11, name: 'Best Practices', _mirror_mtm_fk_: 1 },
                { id: 12, name: 'Refactoring',  _mirror_mtm_fk_: 2 },
            ]);

        const articles = await repo.find({ relations: ['tags'] });

        expect(articles[0].tags).toHaveLength(2);
        expect(articles[0].tags.map(t => t.name).sort()).toEqual(['Best Practices', 'OOP']);
        expect(articles[1].tags).toHaveLength(1);
        expect(articles[1].tags[0].name).toBe('Refactoring');
    });

    it('artigo sem tags recebe array vazio', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 1, title: 'Com Tags' },
                { id: 2, title: 'Sem Tags' },
            ])
            .mockResolvedValueOnce([
                { id: 10, name: 'OOP', _mirror_mtm_fk_: 1 },
            ]);

        const articles = await repo.find({ relations: ['tags'] });

        expect(articles[0].tags).toHaveLength(1);
        expect(articles[1].tags).toHaveLength(0);
        expect(Array.isArray(articles[1].tags)).toBe(true);
    });

    it('não dispara segunda query quando resultado principal está vazio', async () => {
        mockQuery.mockResolvedValueOnce([]);

        await repo.find({ relations: ['tags'] });

        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('sem relations: não faz batch query e tags não é populado', async () => {
        mockQuery.mockResolvedValueOnce([{ id: 1, title: 'Clean Code' }]);

        const [article] = await repo.find({});

        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect((article as unknown as Record<string, unknown>).tags).toBeUndefined();
    });

    it('tag hidratada é instanceof TagFixture', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 1, title: 'Clean Code' }])
            .mockResolvedValueOnce([{ id: 10, name: 'OOP', _mirror_mtm_fk_: 1 }]);

        const [article] = await repo.find({ relations: ['tags'] });

        expect(article).toBeInstanceOf(ArticleFixture);
        expect(article.tags[0]).toBeInstanceOf(TagFixture);
    });

    it('tag compartilhada entre artigos aparece nos dois', async () => {
        mockQuery
            .mockResolvedValueOnce([
                { id: 1, title: 'Clean Code' },
                { id: 2, title: 'Refactoring' },
            ])
            .mockResolvedValueOnce([
                { id: 10, name: 'OOP', _mirror_mtm_fk_: 1 },
                { id: 10, name: 'OOP', _mirror_mtm_fk_: 2 },
            ]);

        const articles = await repo.find({ relations: ['tags'] });

        expect(articles[0].tags[0].name).toBe('OOP');
        expect(articles[1].tags[0].name).toBe('OOP');
    });
});

describe('@ManyToMany — tag.articles (lado inverso)', () => {
    let mockQuery: Mock;
    let repo: Repository<TagFixture>;

    beforeEach(() => {
        mockQuery = vi.fn();
        repo = new Repository(TagFixture, { query: mockQuery } as IQueryRunner, registry.getEntity('TagFixture')!);
    });

    it('ownerFk e inverseFk são trocados no lado inverso', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 10, name: 'OOP' }])
            .mockResolvedValueOnce([]);

        await repo.find({ relations: ['articles'] });

        const [batchSql, batchParams] = mockQuery.mock.calls[1];
        expect(batchSql).toContain('"article_tags"');
        // no lado Tag: ownerFk = 'tag_id', inverseFk = 'article_id'
        expect(batchSql).toContain('"article_id"');
        expect(batchSql).toContain('"tag_id"');
        expect(batchParams).toEqual([[10]]);
    });

    it('hidrata artigos a partir da tag', async () => {
        mockQuery
            .mockResolvedValueOnce([{ id: 10, name: 'OOP' }])
            .mockResolvedValueOnce([
                { id: 1, title: 'Clean Code',    _mirror_mtm_fk_: 10 },
                { id: 2, title: 'Refactoring',   _mirror_mtm_fk_: 10 },
            ]);

        const [tag] = await repo.find({ relations: ['articles'] });

        expect(tag.articles).toHaveLength(2);
        expect(tag.articles.every(a => a instanceof ArticleFixture)).toBe(true);
        expect(tag.articles.map(a => a.title).sort()).toEqual(['Clean Code', 'Refactoring']);
    });
});
