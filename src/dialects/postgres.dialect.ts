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

    public buildArrayInClause(
        quotedColumn: string,
        ids: unknown[],
        params: unknown[],
    ): string {
        params.push(ids);
        return `${quotedColumn} = ANY(${this.placeholder(params.length)})`;
    }

    public buildLimitOffset(
        _hasOrderBy: boolean,
        limit?: number,
        offset?: number,
    ): string {
        let sql = '';
        if (limit !== undefined) sql += ` LIMIT ${limit}`;
        if (offset !== undefined) sql += ` OFFSET ${offset}`;
        return sql;
    }

    public buildExplainQuery(sql: string): string {
        return `EXPLAIN ANALYZE ${sql}`;
    }

    public formatExplainResult(rows: Array<Record<string, unknown>>): string {
        return rows.map((r) => String(r['QUERY PLAN'] ?? '')).join('\n');
    }
}
