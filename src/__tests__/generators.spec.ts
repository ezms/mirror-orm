import { describe, expect, it } from 'vitest';
import { generateUuidV4, generateUuidV7 } from '../utils/generators';

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
        const a = generateUuidV7();
        const b = generateUuidV7();
        expect(a <= b).toBe(true);
    });
});
