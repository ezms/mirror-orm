import { IDialect } from './dialect';

export class PostgresDialect implements IDialect {
    public readonly supportsReturning = true;

    public quoteIdentifier(identifier: string): string {
        return `"${identifier.replace(/"/g, '""')}"`;
    }

    public placeholder(index: number): string {
        return `$${index}`;
    }
}
