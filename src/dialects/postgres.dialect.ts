import { IDialect } from './dialect';

export class PostgresDialect implements IDialect {
    public quoteIdentifier(identifier: string): string {
        return `"${identifier.replace(/"/g, '""')}"`;
    }
}
