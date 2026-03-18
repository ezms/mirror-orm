import { IDialect } from './dialect';

export class SQLiteDialect implements IDialect {
    public readonly supportsReturning = false;
    public readonly lastInsertIdQuery = 'SELECT last_insert_rowid() AS _lid';

    public quoteIdentifier(identifier: string): string {
        return `"${identifier.replace(/"/g, '""')}"`;
    }

    public placeholder(_index: number): string {
        return '?';
    }

    public buildArrayInClause(quotedColumn: string, ids: Array<unknown>, params: Array<unknown>): string {
        ids.forEach(id => params.push(id));
        const placeholders = ids.map(() => '?').join(', ');
        return `${quotedColumn} IN (${placeholders})`;
    }
}
