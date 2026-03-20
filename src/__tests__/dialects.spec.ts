import { describe, it, expect } from 'vitest';
import { MySQLDialect } from '../dialects/mysql.dialect';
import { SQLiteDialect } from '../dialects/sqlite.dialect';

const mysql = new MySQLDialect();
const sqlite = new SQLiteDialect();

// ─── MySQLDialect ─────────────────────────────────────────────────────────────

describe('MySQLDialect', () => {
    it('quoteIdentifier wraps in backticks', () => {
        expect(mysql.quoteIdentifier('name')).toBe('`name`');
    });

    it('quoteIdentifier escapes embedded backticks', () => {
        expect(mysql.quoteIdentifier('a`b')).toBe('`a``b`');
    });

    it('placeholder always returns ?', () => {
        expect(mysql.placeholder(1)).toBe('?');
        expect(mysql.placeholder(5)).toBe('?');
    });

    it('buildArrayInClause expands IN with ? placeholders', () => {
        const params: unknown[] = [];
        const sql = mysql.buildArrayInClause('"id"', [1, 2, 3], params);
        expect(sql).toBe('"id" IN (?, ?, ?)');
        expect(params).toEqual([1, 2, 3]);
    });

    it('buildLimitOffset with both limit and offset', () => {
        expect(mysql.buildLimitOffset(false, 10, 20)).toBe(
            ' LIMIT 10 OFFSET 20',
        );
    });

    it('buildLimitOffset with limit only', () => {
        expect(mysql.buildLimitOffset(false, 5, undefined)).toBe(' LIMIT 5');
    });

    it('buildLimitOffset with offset only', () => {
        expect(mysql.buildLimitOffset(false, undefined, 10)).toBe(' OFFSET 10');
    });

    it('buildLimitOffset with neither returns empty string', () => {
        expect(mysql.buildLimitOffset(false, undefined, undefined)).toBe('');
    });
});

// ─── SQLiteDialect ────────────────────────────────────────────────────────────

describe('SQLiteDialect', () => {
    it('quoteIdentifier wraps in double quotes', () => {
        expect(sqlite.quoteIdentifier('name')).toBe('"name"');
    });

    it('quoteIdentifier escapes embedded double quotes', () => {
        expect(sqlite.quoteIdentifier('a"b')).toBe('"a""b"');
    });

    it('placeholder always returns ?', () => {
        expect(sqlite.placeholder(3)).toBe('?');
    });

    it('buildLimitOffset with limit only', () => {
        expect(sqlite.buildLimitOffset(false, 5, undefined)).toBe(' LIMIT 5');
    });

    it('buildLimitOffset with offset only', () => {
        expect(sqlite.buildLimitOffset(false, undefined, 3)).toBe(' OFFSET 3');
    });

    it('buildLimitOffset with neither returns empty string', () => {
        expect(sqlite.buildLimitOffset(false, undefined, undefined)).toBe('');
    });
});
