import { IQueryRunner } from '../interfaces/query-runner';
import { isOperator } from '../operators/query-operator';
import { RepositoryState } from '../repository/repository-state';

type JoinClause = {
    type: 'LEFT' | 'INNER';
    quotedTable: string;
    alias: string;
    condition: string;
};

// Wider than WhereCondition<T> to allow alias-prefixed keys like 'a.age'
type QBWhere = Record<string, unknown> | Record<string, unknown>[];

export class QueryBuilder<T> {
    private _selectKeys: Array<string> | null = null;
    private _joins: JoinClause[] = [];
    private _where: QBWhere | null = null;
    private _rawWheres: Array<{ sql: string; params: unknown[] }> = [];
    private _groupBy: string[] = [];
    private _having: string | null = null;
    private _orderBy: Record<string, 'ASC' | 'DESC'> | null = null;
    private _limit: number | null = null;
    private _offset: number | null = null;

    constructor(
        private readonly state: RepositoryState<T>,
        private readonly runner: IQueryRunner,
    ) {}

    select(keys: Array<string>): this {
        this._selectKeys = keys;
        return this;
    }

    leftJoin(relationKey: string, alias: string): this {
        const relation = this.state.metadata.relations.find(
            (r) => r.propertyKey === relationKey,
        );
        if (!relation)
            throw new Error(
                `Relation "${relationKey}" not found on ${this.state.metadata.className}`,
            );
        const relatedState = this.state.getRelatedState(relation);
        const relPk = relatedState.cachedPrimaryColumn;
        if (!relPk)
            throw new Error(
                `Related entity "${relatedState.metadata.className}" has no primary column`,
            );
        const quotedAlias = `"${alias}"`;
        const relPkQuoted = relatedState.columnMap.get(
            relPk.propertyKey,
        )!.quotedDatabaseName;
        const condition = `${this.state.quotedTableName}."${relation.foreignKey}" = ${quotedAlias}.${relPkQuoted}`;
        this._joins.push({
            type: 'LEFT',
            quotedTable: relatedState.quotedTableName,
            alias: quotedAlias,
            condition,
        });
        return this;
    }

    where(condition: QBWhere): this {
        this._where = condition;
        return this;
    }

    andWhere(sql: string, params: unknown[] = []): this {
        this._rawWheres.push({ sql, params });
        return this;
    }

    groupBy(columns: string | string[]): this {
        this._groupBy = Array.isArray(columns) ? columns : [columns];
        return this;
    }

    having(condition: string): this {
        this._having = condition;
        return this;
    }

    orderBy(options: Record<string, 'ASC' | 'DESC'>): this {
        this._orderBy = options;
        return this;
    }

    limit(n: number): this {
        this._limit = n;
        return this;
    }

    offset(n: number): this {
        this._offset = n;
        return this;
    }

    async getMany(): Promise<T[]> {
        const { sql, params } = this.build();
        const rows = await this.runner.query<Record<string, unknown>>(
            sql,
            params,
        );
        return rows.map((row) => this.state.hydrator(row));
    }

    async getRaw(): Promise<Record<string, unknown>[]> {
        const { sql, params } = this.build();
        return this.runner.query<Record<string, unknown>>(sql, params);
    }

    async getCount(): Promise<number> {
        const params: unknown[] = [];
        const joinsSql = this.buildJoins();
        let whereSql = this.buildWhere(params);
        const sdCol = this.state.cachedDeletedAtColumn;
        if (sdCol) {
            const sdClause = `${this.state.quoteIdentifier(sdCol.databaseName)} IS NULL`;
            whereSql += whereSql ? ` AND ${sdClause}` : ` WHERE ${sdClause}`;
        }
        const from = `${this.state.quotedTableName}${joinsSql ? ` ${joinsSql}` : ''}`;
        const rows = await this.runner.query<{ count: string }>(
            `SELECT COUNT(*) FROM ${from}${whereSql}`,
            params,
        );
        return parseInt(rows[0].count, 10);
    }

    async explain(): Promise<string> {
        const { sql, params } = this.build();
        const rows = await this.runner.query<{ 'QUERY PLAN': string }>(
            `EXPLAIN ANALYZE ${sql}`,
            params,
        );
        return rows.map((r) => r['QUERY PLAN']).join('\n');
    }

    build(): { sql: string; params: unknown[] } {
        const params: unknown[] = [];

        const selectClause = this._selectKeys
            ? this._selectKeys
                  .map((key) => {
                      const col = this.state.columnMap.get(key);
                      return col ? col.quotedDatabaseName : key;
                  })
                  .join(', ')
            : this.state.selectClause;

        const joinsSql = this.buildJoins();
        let sql = `SELECT ${selectClause} FROM ${this.state.quotedTableName}`;
        if (joinsSql) sql += ` ${joinsSql}`;

        let whereSql = this.buildWhere(params);
        const sdCol = this.state.cachedDeletedAtColumn;
        if (sdCol) {
            const sdClause = `${this.state.quoteIdentifier(sdCol.databaseName)} IS NULL`;
            whereSql += whereSql ? ` AND ${sdClause}` : ` WHERE ${sdClause}`;
        }
        sql += whereSql;

        if (this._groupBy.length > 0)
            sql += ` GROUP BY ${this._groupBy.join(', ')}`;
        if (this._having) sql += ` HAVING ${this._having}`;

        if (this._orderBy) {
            const orderClauses = Object.entries(this._orderBy).map(
                ([key, dir]) => {
                    const col = this.state.columnMap.get(key);
                    return col
                        ? `${col.quotedDatabaseName} ${dir}`
                        : `${key} ${dir}`;
                },
            );
            if (orderClauses.length > 0)
                sql += ` ORDER BY ${orderClauses.join(', ')}`;
        }

        if (this._limit !== null) sql += ` LIMIT ${this._limit}`;
        if (this._offset !== null) sql += ` OFFSET ${this._offset}`;

        return { sql, params };
    }

    private buildJoins(): string {
        return this._joins
            .map(
                (j) =>
                    `${j.type} JOIN ${j.quotedTable} ${j.alias} ON ${j.condition}`,
            )
            .join(' ');
    }

    private buildWhere(params: unknown[]): string {
        const parts: string[] = [];

        if (this._where) {
            const groups = Array.isArray(this._where)
                ? this._where
                : [this._where];
            const groupClauses = groups
                .map((condition) => this.buildWhereGroup(condition, params))
                .filter((g) => g.length > 0)
                .map((g) => (g.length > 1 ? `(${g.join(' AND ')})` : g[0]));
            if (groupClauses.length > 0) parts.push(groupClauses.join(' OR '));
        }

        for (const raw of this._rawWheres) {
            const offset = params.length;
            const remapped = raw.sql.replace(/\$(\d+)/g, (_, n) =>
                this.state.placeholder(parseInt(n, 10) + offset),
            );
            params.push(...raw.params);
            parts.push(remapped);
        }

        return parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
    }

    private buildWhereGroup(
        condition: Record<string, unknown>,
        params: unknown[],
    ): string[] {
        const clauses: string[] = [];
        for (const [key, value] of Object.entries(condition)) {
            let quotedCol: string;
            if (key.includes('.')) {
                const [alias, col] = key.split('.', 2);
                quotedCol = `"${alias}"."${col}"`;
            } else {
                const col = this.state.columnMap.get(key);
                if (!col) continue;
                quotedCol = col.quotedDatabaseName;
            }
            if (isOperator(value)) {
                const { sql, params: opParams } = value.buildClause(
                    quotedCol,
                    params.length + 1,
                    this.state.placeholder.bind(this.state),
                );
                clauses.push(sql);
                params.push(...opParams);
            } else {
                params.push(value);
                clauses.push(
                    `${quotedCol} = ${this.state.placeholder(params.length)}`,
                );
            }
        }
        return clauses;
    }
}
