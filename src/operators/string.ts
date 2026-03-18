import { IQueryOperator, pgPlaceholder } from './query-operator';

export const Like = (value: string): IQueryOperator => ({
    buildClause: (col, i, p = pgPlaceholder) => ({ sql: `${col} LIKE ${(p ?? pgPlaceholder)(i)}`, params: [value] }),
});

export const ILike = (value: string): IQueryOperator => ({
    buildClause: (col, i, p = pgPlaceholder) => ({ sql: `${col} ILIKE ${(p ?? pgPlaceholder)(i)}`, params: [value] }),
});
