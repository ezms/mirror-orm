export interface IQueryOperator {
    buildClause(columnName: string, startIndex: number): { sql: string; params: unknown[] };
}

export function isOperator(value: unknown): value is IQueryOperator {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as Record<string, unknown>)['buildClause'] === 'function'
    );
}
