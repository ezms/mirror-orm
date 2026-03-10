import { IQueryOperator } from './query-operator';

export const MoreThan = (value: number): IQueryOperator => ({
    buildClause: (col, i) => ({ sql: `${col} > $${i}`, params: [value] }),
});

export const MoreThanOrEqual = (value: number): IQueryOperator => ({
    buildClause: (col, i) => ({ sql: `${col} >= $${i}`, params: [value] }),
});

export const LessThan = (value: number): IQueryOperator => ({
    buildClause: (col, i) => ({ sql: `${col} < $${i}`, params: [value] }),
});

export const LessThanOrEqual = (value: number): IQueryOperator => ({
    buildClause: (col, i) => ({ sql: `${col} <= $${i}`, params: [value] }),
});

export const Not = (value: unknown): IQueryOperator => ({
    buildClause: (col, i) => ({ sql: `${col} != $${i}`, params: [value] }),
});

export const Between = (from: number, to: number): IQueryOperator => ({
    buildClause: (col, i) => ({ sql: `${col} BETWEEN $${i} AND $${i + 1}`, params: [from, to] }),
});
