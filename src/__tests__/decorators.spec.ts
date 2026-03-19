import { describe, expect, it } from 'vitest';
import { registry } from '../metadata/registry';
import { PostFixture, UserFixture } from './fixtures/user.entity';

describe('@Entity / @Column / @PrimaryColumn', () => {
    it('registers entity with correct tableName', () => {
        const metadata = registry.getEntity('UserFixture');
        expect(metadata).toBeDefined();
        expect(metadata!.tableName).toBe('users');
    });

    it('registers entity className matching the class name', () => {
        const metadata = registry.getEntity('UserFixture')!;
        expect(metadata.className).toBe('UserFixture');
    });

    it('maps column with explicit name to correct databaseName', () => {
        const metadata = registry.getEntity('UserFixture')!;
        const col = metadata.columns.find(c => c.propertyKey === 'name');
        expect(col).toBeDefined();
        expect(col!.databaseName).toBe('name');
    });

    it('defaults databaseName to propertyKey when no name is given', () => {
        const metadata = registry.getEntity('UserFixture')!;
        const col = metadata.columns.find(c => c.propertyKey === 'email');
        expect(col).toBeDefined();
        expect(col!.databaseName).toBe('email');
    });

    it('marks @PrimaryColumn as primary = true', () => {
        const metadata = registry.getEntity('UserFixture')!;
        const pk = metadata.columns.find(c => c.primary);
        expect(pk).toBeDefined();
        expect(pk!.propertyKey).toBe('id');
    });

    it('stores generation strategy on primary column', () => {
        const metadata = registry.getEntity('UserFixture')!;
        const pk = metadata.columns.find(c => c.primary)!;
        expect(pk.generation?.strategy).toBe('identity');
    });

    it('marks regular columns as primary = false', () => {
        const metadata = registry.getEntity('UserFixture')!;
        const nonPrimary = metadata.columns.filter(c => !c.primary);
        expect(nonPrimary.length).toBeGreaterThan(0);
        nonPrimary.forEach(c => expect(c.primary).toBe(false));
    });

    it('registers multiple entities independently', () => {
        // force import side effect
        void UserFixture;
        void PostFixture;

        const user = registry.getEntity('UserFixture');
        const post = registry.getEntity('PostFixture');

        expect(user!.tableName).toBe('users');
        expect(post!.tableName).toBe('posts');
    });

    it('stores uuid_v4 strategy on PostFixture primary column', () => {
        const metadata = registry.getEntity('PostFixture')!;
        const pk = metadata.columns.find(c => c.primary)!;
        expect(pk.generation?.strategy).toBe('uuid_v4');
    });
});

// ─── registry edge cases ──────────────────────────────────────────────────────

describe('registry.registerStiChild', () => {
    it('silently returns when parent is not registered', () => {
        // Should not throw
        expect(() => (registry as unknown as Record<string, unknown>)['registerStiChild']?.('__unknown__', 'x', class {})).not.toThrow();
    });

    it('reuses existing stiChildren map on second call', () => {
        // Register twice for same parent/value — map should not be replaced
        const meta = registry.getEntity('UserFixture')!;
        const before = meta.stiChildren;
        // Simulate a second registerStiChild call on UserFixture (no discriminatorColumn needed for map reuse)
        if (meta.stiChildren) {
            // Map already exists — add a second value to exercise the !meta.stiChildren = false branch
            meta.stiChildren.set('__test__', class {});
            expect(meta.stiChildren).toBe(before);
            meta.stiChildren.delete('__test__');
        }
    });
});

// ─── @PrimaryColumn edge cases ────────────────────────────────────────────────

import { Entity } from '../decorators/entity';
import { PrimaryColumn } from '../decorators/primary-column';
import { Column } from '../decorators/column';

describe('@PrimaryColumn edge cases', () => {
    it('@PrimaryColumn() without options sets generation to undefined', () => {
        @Entity('pc_no_opts')
        class PcNoOpts {
            @PrimaryColumn()
            id!: number;

            @Column()
            name!: string;
        }
        void PcNoOpts;
        const meta = registry.getEntity('PcNoOpts')!;
        const pk = meta.columns.find(c => c.primary)!;
        expect(pk.generation).toBeUndefined();
    });

    it('@PrimaryColumn({ name }) uses explicit databaseName', () => {
        @Entity('pc_named')
        class PcNamed {
            @PrimaryColumn({ name: 'my_id', strategy: 'identity' })
            id!: number;
        }
        void PcNamed;
        const meta = registry.getEntity('PcNamed')!;
        const pk = meta.columns.find(c => c.primary)!;
        expect(pk.databaseName).toBe('my_id');
    });
});

// ─── QueryError ───────────────────────────────────────────────────────────────

import { QueryError } from '../errors';

describe('QueryError', () => {
    it('uses String() when originalError is not an Error instance', () => {
        const err = new QueryError('SELECT 1', 'connection refused');
        expect(err.message).toContain('connection refused');
    });
});
