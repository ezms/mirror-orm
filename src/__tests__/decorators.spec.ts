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
