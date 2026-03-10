import { IQueryOperator } from './query-operator';

export const In = (values: unknown[]): IQueryOperator => ({
    buildClause: (col, i) => ({
        sql: `${col} IN (${values.map((_, j) => `$${i + j}`).join(', ')})`,
        params: values,
    }),
});
