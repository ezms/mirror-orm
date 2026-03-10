import { IQueryOperator } from './query-operator';

export const Like = (value: string): IQueryOperator => ({
    buildClause: (col, i) => ({ sql: `${col} LIKE $${i}`, params: [value] }),
});

export const ILike = (value: string): IQueryOperator => ({
    buildClause: (col, i) => ({ sql: `${col} ILIKE $${i}`, params: [value] }),
});
