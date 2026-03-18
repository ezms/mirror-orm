import { IQueryOperator, pgPlaceholder } from './query-operator';

export const MoreThan = (value: number): IQueryOperator => ({
    buildClause: (col, i, p = pgPlaceholder) => ({ sql: `${col} > ${(p ?? pgPlaceholder)(i)}`, params: [value] }),
});

export const MoreThanOrEqual = (value: number): IQueryOperator => ({
    buildClause: (col, i, p = pgPlaceholder) => ({ sql: `${col} >= ${(p ?? pgPlaceholder)(i)}`, params: [value] }),
});

export const LessThan = (value: number): IQueryOperator => ({
    buildClause: (col, i, p = pgPlaceholder) => ({ sql: `${col} < ${(p ?? pgPlaceholder)(i)}`, params: [value] }),
});

export const LessThanOrEqual = (value: number): IQueryOperator => ({
    buildClause: (col, i, p = pgPlaceholder) => ({ sql: `${col} <= ${(p ?? pgPlaceholder)(i)}`, params: [value] }),
});

export const Not = (value: unknown): IQueryOperator => ({
    buildClause: (col, i, p = pgPlaceholder) => ({ sql: `${col} != ${(p ?? pgPlaceholder)(i)}`, params: [value] }),
});

export const Between = (from: number, to: number): IQueryOperator => ({
    buildClause: (col, i, p = pgPlaceholder) => ({ sql: `${col} BETWEEN ${(p ?? pgPlaceholder)(i)} AND ${(p ?? pgPlaceholder)(i + 1)}`, params: [from, to] }),
});
