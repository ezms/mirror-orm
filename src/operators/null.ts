import { IQueryOperator } from './query-operator';

export const IsNull = (): IQueryOperator => ({
    buildClause: (col, _i) => ({ sql: `${col} IS NULL`, params: [] }),
});

export const IsNotNull = (): IQueryOperator => ({
    buildClause: (col, _i) => ({ sql: `${col} IS NOT NULL`, params: [] }),
});
