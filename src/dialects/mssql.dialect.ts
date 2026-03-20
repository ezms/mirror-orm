import { IDialect } from './dialect';

export class MssqlDialect implements IDialect {
    public readonly supportsReturning = false;
    public readonly supportsOutputInserted = true;

    public quoteIdentifier(identifier: string): string {
        return `[${identifier.replace(/]/g, ']]')}]`;
    }

    public placeholder(index: number): string {
        return `@p${index}`;
    }

    public buildArrayInClause(
        quotedColumn: string,
        ids: Array<unknown>,
        params: Array<unknown>,
    ): string {
        const placeholders = ids.map((id) => {
            params.push(id);
            return `@p${params.length}`;
        });
        return `${quotedColumn} IN (${placeholders.join(', ')})`;
    }

    public buildLimitOffset(
        hasOrderBy: boolean,
        limit?: number,
        offset?: number,
    ): string {
        if (limit === undefined && offset === undefined) return '';
        const off = offset ?? 0;
        const orderPrefix = hasOrderBy ? '' : ' ORDER BY (SELECT NULL)';
        if (limit !== undefined) {
            return `${orderPrefix} OFFSET ${off} ROWS FETCH NEXT ${limit} ROWS ONLY`;
        }
        return `${orderPrefix} OFFSET ${off} ROWS`;
    }
}
