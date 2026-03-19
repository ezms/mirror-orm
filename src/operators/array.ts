import { IQueryOperator, pgPlaceholder } from './query-operator';

export const In = (values: Array<unknown>): IQueryOperator => ({
    buildClause: (col, i, p = pgPlaceholder) => ({
        sql: `${col} IN (${values.map((_, j) => p(i + j)).join(', ')})`,
        params: values,
    }),
});
