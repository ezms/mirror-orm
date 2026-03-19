import { IQueryOperator, pgPlaceholder } from './query-operator';

/** col @> $N::jsonb — column contains all key/value pairs of the given object */
export const JsonContains = (value: object): IQueryOperator => ({
    requiresJsonSupport: true,
    buildClause: (col, i, p = pgPlaceholder) => ({
        sql: `${col} @> ${p(i)}::jsonb`,
        params: [JSON.stringify(value)],
    }),
});

/** col ? $N — column (jsonb) has the given top-level key */
export const JsonHasKey = (key: string): IQueryOperator => ({
    requiresJsonSupport: true,
    buildClause: (col, i, p = pgPlaceholder) => ({
        sql: `${col} ? ${p(i)}`,
        params: [key],
    }),
});

/** col ?& $N — column has ALL of the given top-level keys */
export const JsonHasAllKeys = (keys: Array<string>): IQueryOperator => ({
    requiresJsonSupport: true,
    buildClause: (col, i, p = pgPlaceholder) => ({
        sql: `${col} ?& ${p(i)}`,
        params: [keys],
    }),
});

/** col ?| $N — column has ANY of the given top-level keys */
export const JsonHasAnyKey = (keys: Array<string>): IQueryOperator => ({
    requiresJsonSupport: true,
    buildClause: (col, i, p = pgPlaceholder) => ({
        sql: `${col} ?| ${p(i)}`,
        params: [keys],
    }),
});
