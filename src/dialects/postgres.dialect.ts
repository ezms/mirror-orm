import { IDialect } from './dialect';

export class PostgresDialect implements IDialect {
    public readonly supportsReturning = true;
    public readonly supportsJsonOperators = true;

    public quoteIdentifier(identifier: string): string {
        return `"${identifier.replace(/"/g, '""')}"`;
    }

    public placeholder(index: number): string {
        return `$${index}`;
    }

    public buildArrayInClause(quotedColumn: string, ids: unknown[], params: unknown[]): string {
        params.push(ids);
        return `${quotedColumn} = ANY(${this.placeholder(params.length)})`;
    }
}
