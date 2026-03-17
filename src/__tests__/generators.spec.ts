import { describe, expect, it, vi } from 'vitest';
import { generateCuid2, generateUlid, generateUuidV4, generateUuidV7 } from '../utils/generators';

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const CUID2_REGEX = /^[a-z][a-z0-9]{20,}$/;

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('generateUuidV4', () => {
    it('returns a string matching UUID v4 format', () => {
        expect(generateUuidV4()).toMatch(UUID_V4_REGEX);
    });

    it('returns unique values on successive calls', () => {
        expect(generateUuidV4()).not.toBe(generateUuidV4());
    });
});

describe('generateUuidV7', () => {
    it('returns a string matching UUID v7 format', () => {
        expect(generateUuidV7()).toMatch(UUID_V7_REGEX);
    });

    it('returns unique values on successive calls', () => {
        expect(generateUuidV7()).not.toBe(generateUuidV7());
    });

    it('generates lexicographically ascending values over time', () => {
        const mockNow = vi.spyOn(Date, 'now')
            .mockReturnValueOnce(1700000000000)
            .mockReturnValueOnce(1700000000001);
        const a = generateUuidV7();
        const b = generateUuidV7();
        mockNow.mockRestore();
        expect(a < b).toBe(true);
    });
});

describe('generateUlid', () => {
    it('returns a 26-character Crockford Base32 string', () => {
        expect(generateUlid()).toMatch(ULID_REGEX);
    });

    it('returns unique values on successive calls', () => {
        expect(generateUlid()).not.toBe(generateUlid());
    });

    it('generates lexicographically ascending values over time', () => {
        const mockNow = vi.spyOn(Date, 'now')
            .mockReturnValueOnce(1700000000000)
            .mockReturnValueOnce(1700000000001);
        const a = generateUlid();
        const b = generateUlid();
        mockNow.mockRestore();
        expect(a < b).toBe(true);
    });
});

describe('generateCuid2', () => {
    it('returns a string matching cuid2 format', () => {
        expect(generateCuid2()).toMatch(CUID2_REGEX);
    });

    it('returns unique values on successive calls', () => {
        expect(generateCuid2()).not.toBe(generateCuid2());
    });
});
