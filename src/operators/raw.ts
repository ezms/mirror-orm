import { IQueryOperator } from './query-operator';

export const Raw = (build: (col: string) => string): IQueryOperator => ({
    buildClause: (col) => ({ sql: build(col), params: [] }),
});
