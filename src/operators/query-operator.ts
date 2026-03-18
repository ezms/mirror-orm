export const pgPlaceholder = (i: number): string => `$${i}`;

export interface IQueryOperator {
    buildClause(columnName: string, startIndex: number, p?: (i: number) => string): { sql: string; params: Array<unknown> };
    readonly requiresJsonSupport?: boolean;
}

export const isOperator = (value: unknown): value is IQueryOperator => {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as Record<string, unknown>)['buildClause'] === 'function'
    );
}
