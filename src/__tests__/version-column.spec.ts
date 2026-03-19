import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Entity } from '../decorators/entity';
import { Column } from '../decorators/column';
import { PrimaryColumn } from '../decorators/primary-column';
import { VersionColumn } from '../decorators/version-column';
import { IQueryRunner } from '../interfaces/query-runner';
import { registry } from '../metadata/registry';
import { Repository } from '../repository/repository';
import { OptimisticLockError } from '../errors';

// ─── Fixtures ────────────────────────────────────────────────────────────────

@Entity('versioned_items')
class VersionedItem {
    @PrimaryColumn({ strategy: 'identity' }) id!: number;
    @Column() name!: string;
    @VersionColumn() version!: number;
}

void VersionedItem;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('@VersionColumn', () => {
    let mockQuery: Mock;
    let runner: IQueryRunner;
    let repo: Repository<VersionedItem>;

    beforeEach(() => {
        mockQuery = vi.fn().mockResolvedValue([]);
        runner = { query: mockQuery };
        repo = new Repository(VersionedItem, runner, registry.getEntity('VersionedItem')!);
    });

    it('UPDATE includes version increment in SET and version check in WHERE', async () => {
        // Simulate a loaded entity with version = 2
        mockQuery.mockResolvedValueOnce([{ id: 1, name: 'Old', version: 3 }]);

        const entity = Object.assign(new VersionedItem(), { id: 1, name: 'Updated', version: 2 });
        await repo.save(entity);

        const [sql, params] = mockQuery.mock.calls[0];
        expect(sql).toContain('"version" =');
        expect(sql).toMatch(/WHERE .+ AND "version" = /);
        // SET value = 3 (2+1), WHERE version = 2
        expect(params).toContain(3);
        expect(params).toContain(2);
    });

    it('SET value is currentVersion + 1', async () => {
        mockQuery.mockResolvedValueOnce([{ id: 5, name: 'X', version: 4 }]);

        const entity = Object.assign(new VersionedItem(), { id: 5, name: 'X', version: 3 });
        await repo.save(entity);

        const [, params] = mockQuery.mock.calls[0];
        // params order: [SET cols..., SET version (4), pkValue (5), WHERE version (3)]
        expect(params).toContain(4);  // incremented version in SET
        expect(params).toContain(3);  // current version in WHERE
    });

    it('throws OptimisticLockError when version mismatch (RETURNING returns 0 rows)', async () => {
        mockQuery.mockResolvedValueOnce([]);  // 0 rows = version mismatch

        const entity = Object.assign(new VersionedItem(), { id: 1, name: 'X', version: 1 });
        await expect(repo.save(entity)).rejects.toThrow(OptimisticLockError);
    });

    it('throws OptimisticLockError when version is not a number', async () => {
        const entity = Object.assign(new VersionedItem(), { id: 1, name: 'X', version: undefined });
        await expect(repo.save(entity)).rejects.toThrow(OptimisticLockError);
    });

    it('INSERT does not include version in WHERE clause', async () => {
        mockQuery.mockResolvedValueOnce([{ id: 1, name: 'New', version: 0 }]);

        const entity = Object.assign(new VersionedItem(), { name: 'New', version: 0 });
        await repo.save(entity);

        const [sql] = mockQuery.mock.calls[0];
        expect(sql).toMatch(/^INSERT/);
        expect(sql).not.toContain('WHERE');
    });

    it('version column has default db name "version"', () => {
        const meta = registry.getEntity('VersionedItem')!;
        const versionCol = meta.columns.find(c => c.version);
        expect(versionCol?.databaseName).toBe('version');
        expect(versionCol?.propertyKey).toBe('version');
    });

    it('custom db name is respected', () => {
        @Entity('custom_ver')
        class CustomVer {
            @PrimaryColumn({ strategy: 'identity' }) id!: number;
            @VersionColumn('rev') revision!: number;
        }
        void CustomVer;

        const meta = registry.getEntity('CustomVer')!;
        const versionCol = meta.columns.find(c => c.version);
        expect(versionCol?.databaseName).toBe('rev');
        expect(versionCol?.propertyKey).toBe('revision');
    });
});
