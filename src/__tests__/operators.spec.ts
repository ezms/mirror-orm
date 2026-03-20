import { describe, expect, it } from 'vitest';
import {
    Between,
    ILike,
    In,
    IsNotNull,
    IsNull,
    LessThan,
    LessThanOrEqual,
    Like,
    MoreThan,
    MoreThanOrEqual,
    Not,
    Raw,
} from '../operators';

describe('Operators', () => {
    describe('Like', () => {
        it('builds LIKE clause with correct param', () => {
            const { sql, params } = Like('%manu%').buildClause('name', 1);
            expect(sql).toBe('name LIKE $1');
            expect(params).toEqual(['%manu%']);
        });
    });

    describe('ILike', () => {
        it('builds case-insensitive ILIKE clause', () => {
            const { sql, params } = ILike('%MANU%').buildClause('name', 1);
            expect(sql).toBe('name ILIKE $1');
            expect(params).toEqual(['%MANU%']);
        });
    });

    describe('In', () => {
        it('builds IN clause expanding all values', () => {
            const { sql, params } = In([1, 2, 3]).buildClause('id', 1);
            expect(sql).toBe('id IN ($1, $2, $3)');
            expect(params).toEqual([1, 2, 3]);
        });

        it('respects the startIndex for correct $N numbering', () => {
            const { sql, params } = In([10, 20]).buildClause('role_id', 3);
            expect(sql).toBe('role_id IN ($3, $4)');
            expect(params).toEqual([10, 20]);
        });
    });

    describe('MoreThan', () => {
        it('builds > clause', () => {
            const { sql, params } = MoreThan(18).buildClause('age', 1);
            expect(sql).toBe('age > $1');
            expect(params).toEqual([18]);
        });
    });

    describe('MoreThanOrEqual', () => {
        it('builds >= clause', () => {
            const { sql, params } = MoreThanOrEqual(18).buildClause('age', 2);
            expect(sql).toBe('age >= $2');
            expect(params).toEqual([18]);
        });
    });

    describe('LessThan', () => {
        it('builds < clause', () => {
            const { sql, params } = LessThan(65).buildClause('age', 1);
            expect(sql).toBe('age < $1');
            expect(params).toEqual([65]);
        });
    });

    describe('LessThanOrEqual', () => {
        it('builds <= clause', () => {
            const { sql, params } = LessThanOrEqual(65).buildClause('age', 1);
            expect(sql).toBe('age <= $1');
            expect(params).toEqual([65]);
        });
    });

    describe('Between', () => {
        it('builds BETWEEN clause with two params', () => {
            const { sql, params } = Between(18, 30).buildClause('age', 1);
            expect(sql).toBe('age BETWEEN $1 AND $2');
            expect(params).toEqual([18, 30]);
        });

        it('respects startIndex for correct $N numbering', () => {
            const { sql } = Between(18, 30).buildClause('age', 4);
            expect(sql).toBe('age BETWEEN $4 AND $5');
        });
    });

    describe('Not', () => {
        it('builds != clause', () => {
            const { sql, params } = Not('banned').buildClause('status', 1);
            expect(sql).toBe('status != $1');
            expect(params).toEqual(['banned']);
        });
    });

    describe('IsNull', () => {
        it('builds IS NULL clause with no params', () => {
            const { sql, params } = IsNull().buildClause('deleted_at', 1);
            expect(sql).toBe('deleted_at IS NULL');
            expect(params).toEqual([]);
        });
    });

    describe('IsNotNull', () => {
        it('builds IS NOT NULL clause with no params', () => {
            const { sql, params } = IsNotNull().buildClause('email', 1);
            expect(sql).toBe('email IS NOT NULL');
            expect(params).toEqual([]);
        });
    });

    describe('Raw', () => {
        it('passes column name to builder function', () => {
            const { sql, params } = Raw(
                (col) => `${col} > (SELECT AVG("score") FROM "results")`,
            ).buildClause('"score"', 1);
            expect(sql).toBe('"score" > (SELECT AVG("score") FROM "results")');
            expect(params).toEqual([]);
        });

        it('returns empty params', () => {
            const { params } = Raw(
                (col) => `${col} IS DISTINCT FROM NULL`,
            ).buildClause('"value"', 1);
            expect(params).toEqual([]);
        });

        it('can express arbitrary SQL', () => {
            const { sql } = Raw(
                (col) => `EXTRACT(YEAR FROM ${col}) = 2026`,
            ).buildClause('"created_at"', 1);
            expect(sql).toBe('EXTRACT(YEAR FROM "created_at") = 2026');
        });
    });
});
