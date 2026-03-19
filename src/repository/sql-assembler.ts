import { QueryError } from '../errors';
import { IColumnMetadata } from '../interfaces/column-metadata';
import { IFindOptions } from '../interfaces/find-options';
import { IRelationMetadata, RelationType } from '../interfaces/relation-metadata';
import { isOperator } from '../operators/query-operator';
import { RepositoryState } from './repository-state';

export type ManyToOneInfo = {
    relation: IRelationMetadata;
    relatedState: RepositoryState<unknown>;
    prefix: string;
    prefixedHydrator: (row: Record<string, unknown>) => unknown;
    pkDbName: string;
};

export type OtmInfo = {
    relation: IRelationMetadata;
    relatedState: RepositoryState<unknown>;
};

export type MtmInfo = {
    relation: IRelationMetadata;
    relatedState: RepositoryState<unknown>;
};

export type FindPlan = {
    sql: string;
    params: Array<unknown>;
    mtoRelations: Array<ManyToOneInfo>;
    otmRelations: Array<OtmInfo>;
    otoInverseRelations: Array<OtmInfo>;
    mtmRelations: Array<MtmInfo>;
};

export class SqlAssembler<T> {
    constructor(private readonly state: RepositoryState<T>) {}

    public buildFind(options: IFindOptions<T>): FindPlan {
        const mtoRelations: Array<ManyToOneInfo> = [];
        const otmRelations: Array<OtmInfo> = [];
        const otoInverseRelations: Array<OtmInfo> = [];
        const mtmRelations: Array<MtmInfo> = [];

        const classifyRelation: Record<RelationType, (relation: IRelationMetadata, relatedState: RepositoryState<unknown>) => void> = {
            'many-to-one':  (relation, relatedState) => mtoRelations.push(this.buildMtoInfo(relation, relatedState)),
            'one-to-many':  (relation, relatedState) => otmRelations.push({ relation, relatedState }),
            'many-to-many': (relation, relatedState) => mtmRelations.push({ relation, relatedState }),
            'one-to-one':   (relation, relatedState) => {
                const isOwner = this.state.metadata.columns.some(c => c.databaseName === relation.foreignKey);
                if (isOwner) mtoRelations.push(this.buildMtoInfo(relation, relatedState));
                else otoInverseRelations.push({ relation, relatedState });
            },
        };

        for (const relName of options.relations ?? []) {
            const relation = this.state.metadata.relations.find(r => r.propertyKey === relName);
            if (!relation) continue;
            classifyRelation[relation.type](relation, this.state.getRelatedState(relation));
        }

        const params: Array<unknown> = [];
        const qualified = mtoRelations.length > 0;
        const baseSelect = options.select && options.select.length > 0
            ? options.select
                .map(key => this.state.columnMap.get(key))
                .filter((c): c is NonNullable<typeof c> => c !== undefined)
                .map(c => qualified ? `${this.state.quotedTableName}.${c.quotedDatabaseName}` : c.quotedDatabaseName)
                .join(', ')
            : qualified ? this.state.qualifiedSelectClause : this.state.selectClause;
        let selectPart = baseSelect;

        if (mtoRelations.length > 0) {
            const joinCols = mtoRelations.flatMap(({ relatedState, prefix }) =>
                [...relatedState.columnMap.values()].map(
                    c => `${relatedState.quotedTableName}.${c.quotedDatabaseName} AS "${prefix}${c.databaseName}"`,
                ),
            ).join(', ');
            selectPart += `, ${joinCols}`;
        }

        let sql = `SELECT ${selectPart} FROM ${this.state.quotedTableName}`;

        for (const { relation, relatedState } of mtoRelations) {
            const relPk = relatedState.columnMap.get(relatedState.cachedPrimaryColumn!.propertyKey)!;
            sql += ` LEFT JOIN ${relatedState.quotedTableName} ON ${this.state.quotedTableName}."${relation.foreignKey}" = ${relatedState.quotedTableName}.${relPk.quotedDatabaseName}`;
        }

        let whereSql = this.buildWhere(options.where, params);

        if (options.filters?.length && this.state.metadata.filters) {
            for (const name of options.filters) {
                const condition = this.state.metadata.filters[name];
                if (!condition) continue;
                const clauses = this.buildWhereGroup(condition, params);
                if (clauses.length > 0) {
                    const clause = clauses.length > 1 ? `(${clauses.join(' AND ')})` : clauses[0];
                    whereSql += whereSql ? ` AND ${clause}` : ` WHERE ${clause}`;
                }
            }
        }

        const sdCol = this.state.cachedDeletedAtColumn;
        if (sdCol && !options.withDeleted) {
            const sdClause = `${this.state.quoteIdentifier(sdCol.databaseName)} IS NULL`;
            whereSql += whereSql ? ` AND ${sdClause}` : ` WHERE ${sdClause}`;
        }
        sql += whereSql;

        let hasOrderBy = false;
        if (options.orderBy) {
            const orderClauses = Object.entries(options.orderBy)
                .map(([key, direction]) => {
                    const column = this.state.columnMap.get(key);
                    return column ? `${column.quotedDatabaseName} ${direction}` : null;
                })
                .filter((clause): clause is string => clause !== null);
            if (orderClauses.length > 0) {
                sql += ` ORDER BY ${orderClauses.join(', ')}`;
                hasOrderBy = true;
            }
        }

        sql += this.state.buildLimitOffset(hasOrderBy, options.limit, options.offset);
        if (options.lock === 'pessimistic_write') sql += ' FOR UPDATE';
        if (options.lock === 'pessimistic_read')  sql += ' FOR SHARE';

        return { sql, params, mtoRelations, otmRelations, otoInverseRelations, mtmRelations };
    }

    public buildCount(where?: IFindOptions<T>['where'], withDeleted?: boolean): { sql: string; params: Array<unknown> } {
        const params: Array<unknown> = [];
        let whereSql = this.buildWhere(where, params);
        const sdCol = this.state.cachedDeletedAtColumn;
        if (sdCol && !withDeleted) {
            const sdClause = `${this.state.quoteIdentifier(sdCol.databaseName)} IS NULL`;
            whereSql += whereSql ? ` AND ${sdClause}` : ` WHERE ${sdClause}`;
        }
        return {
            sql: `SELECT COUNT(*) FROM ${this.state.quotedTableName}${whereSql}`,
            params,
        };
    }

    public buildInsert(record: Record<string, unknown>, isIdentity: boolean): { sql: string; params: Array<unknown> } {
        const columns = this.state.metadata.columns.filter(c => (!c.primary || !isIdentity) && record[c.propertyKey] !== undefined);
        const names = columns.map(c => this.state.columnMap.get(c.propertyKey)!.quotedDatabaseName);
        const params = columns.map(c => record[c.propertyKey]);
        const placeholders = params.map((_, i) => this.state.placeholder(i + 1));
        return {
            sql: this.state.supportsOutputInserted
                ? `INSERT INTO ${this.state.quotedTableName} (${names.join(', ')}) OUTPUT INSERTED.* VALUES (${placeholders.join(', ')})`
                : `INSERT INTO ${this.state.quotedTableName} (${names.join(', ')}) VALUES (${placeholders.join(', ')})${this.state.supportsReturning ? ' RETURNING *' : ''}`,
            params,
        };
    }

    public buildBulkInsert(records: Record<string, unknown>[], isIdentity: boolean): { sql: string; params: Array<unknown> } {
        const columns = this.state.metadata.columns.filter(c => (!c.primary || !isIdentity) && records.some(r => r[c.propertyKey] !== undefined));
        const names = columns.map(c => this.state.columnMap.get(c.propertyKey)!.quotedDatabaseName);
        const allParams: Array<unknown> = [];
        const rowPlaceholders = records.map(record => {
            const placeholders = columns.map(c => {
                allParams.push(record[c.propertyKey]);
                return this.state.placeholder(allParams.length);
            });
            return `(${placeholders.join(', ')})`;
        });
        return {
            sql: `INSERT INTO ${this.state.quotedTableName} (${names.join(', ')}) VALUES ${rowPlaceholders.join(', ')}${this.state.supportsReturning ? ' RETURNING *' : ''}`,
            params: allParams,
        };
    }

    public buildUpdateById(
        record: Record<string, unknown>,
        pk: IColumnMetadata & { quotedDatabaseName: string },
        pkValue: unknown,
        dirtyColumns?: Array<IColumnMetadata>,
        versionInfo?: { column: IColumnMetadata & { quotedDatabaseName: string }; currentVersion: number },
    ): { sql: string; params: Array<unknown> } {
        const columns = dirtyColumns ?? this.state.metadata.columns.filter(c => !c.primary && !c.version && record[c.propertyKey] !== undefined);
        const setClauses = columns.map((c, i) => `${this.state.columnMap.get(c.propertyKey)!.quotedDatabaseName} = ${this.state.placeholder(i + 1)}`);
        const params: Array<unknown> = [...columns.map(c => record[c.propertyKey])];

        if (versionInfo) {
            setClauses.push(`${versionInfo.column.quotedDatabaseName} = ${this.state.placeholder(params.length + 1)}`);
            params.push(versionInfo.currentVersion + 1);
        }

        params.push(pkValue);
        let whereSql = `${pk.quotedDatabaseName} = ${this.state.placeholder(params.length)}`;

        if (versionInfo) {
            params.push(versionInfo.currentVersion);
            whereSql += ` AND ${versionInfo.column.quotedDatabaseName} = ${this.state.placeholder(params.length)}`;
        }

        return {
            sql: this.state.supportsOutputInserted
                ? `UPDATE ${this.state.quotedTableName} SET ${setClauses.join(', ')} OUTPUT INSERTED.* WHERE ${whereSql}`
                : `UPDATE ${this.state.quotedTableName} SET ${setClauses.join(', ')} WHERE ${whereSql}${this.state.supportsReturning ? ' RETURNING *' : ''}`,
            params,
        };
    }

    public buildUpdate(data: Partial<T>, where: IFindOptions<T>['where']): { sql: string; params: Array<unknown> } {
        const record = data as Record<string, unknown>;
        const params: Array<unknown> = [];
        const columns = this.state.metadata.columns.filter(c => !c.primary && record[c.propertyKey] !== undefined);
        if (columns.length === 0) throw new QueryError('UPDATE', new Error('No updatable columns provided'));
        const setClauses = columns.map(c => {
            params.push(record[c.propertyKey]);
            return `${this.state.columnMap.get(c.propertyKey)!.quotedDatabaseName} = ${this.state.placeholder(params.length)}`;
        });
        const whereSql = this.buildWhere(where, params);
        return {
            sql: `UPDATE ${this.state.quotedTableName} SET ${setClauses.join(', ')}${whereSql}${this.state.supportsReturning ? ' RETURNING 1' : ''}`,
            params,
        };
    }

    public buildDelete(where: IFindOptions<T>['where']): { sql: string; params: Array<unknown> } {
        const params: Array<unknown> = [];
        return {
            sql: `DELETE FROM ${this.state.quotedTableName}${this.buildWhere(where, params)}${this.state.supportsReturning ? ' RETURNING 1' : ''}`,
            params,
        };
    }

    public buildUpsert(
        record: Record<string, unknown>,
        conflictPropertyKeys: Array<string>,
        updatePropertyKeys?: Array<string>,
    ): { sql: string; params: Array<unknown> } {
        const pk = this.state.cachedPrimaryColumn;
        const isIdentity = pk?.generation?.strategy === 'identity';
        const insertCols = this.state.metadata.columns.filter(c => (!c.primary || !isIdentity) && record[c.propertyKey] !== undefined);
        const names = insertCols.map(c => this.state.columnMap.get(c.propertyKey)!.quotedDatabaseName);
        const params = insertCols.map(c => record[c.propertyKey]);
        const placeholders = params.map((_, i) => this.state.placeholder(i + 1));

        const conflictCols = conflictPropertyKeys
            .map(k => this.state.columnMap.get(k)?.quotedDatabaseName)
            .filter((n): n is string => n !== undefined);

        const updateCols = updatePropertyKeys
            ? updatePropertyKeys
                .map(k => this.state.columnMap.get(k))
                .filter((c): c is NonNullable<typeof c> => c !== undefined)
            : insertCols.filter(c =>
                !c.primary &&
                !c.createdAt &&
                !conflictPropertyKeys.includes(c.propertyKey),
            ).map(c => this.state.columnMap.get(c.propertyKey)!);

        const setClauses = updateCols.map(c => `${c.quotedDatabaseName} = EXCLUDED.${c.quotedDatabaseName}`);

        return {
            sql: `INSERT INTO ${this.state.quotedTableName} (${names.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (${conflictCols.join(', ')}) DO UPDATE SET ${setClauses.join(', ')}${this.state.supportsReturning ? ' RETURNING *' : ''}`,
            params,
        };
    }

    public buildRemove(pk: IColumnMetadata & { quotedDatabaseName: string }): string {
        return `DELETE FROM ${this.state.quotedTableName} WHERE ${pk.quotedDatabaseName} = ${this.state.placeholder(1)}`;
    }

    public buildRemoveMany(pk: IColumnMetadata & { quotedDatabaseName: string }, ids: Array<unknown>): { sql: string; params: Array<unknown> } {
        const params: Array<unknown> = [];
        const inClause = this.state.buildArrayInClause(pk.quotedDatabaseName, ids, params);
        return { sql: `DELETE FROM ${this.state.quotedTableName} WHERE ${inClause}`, params };
    }

    private buildMtoInfo(relation: IRelationMetadata, relatedState: RepositoryState<unknown>): ManyToOneInfo {
        const prefix = `mirror__${relation.propertyKey}__`;
        return {
            relation,
            relatedState,
            prefix,
            prefixedHydrator: relatedState.getOrBuildPrefixedHydrator(prefix),
            pkDbName: relatedState.cachedPrimaryColumn?.databaseName ?? 'id',
        };
    }

    private buildWhere(where: IFindOptions<T>['where'], params: Array<unknown>): string {
        if (!where) return '';
        const groups = Array.isArray(where) ? where : [where];
        const clauses = groups
            .map(condition => this.buildWhereGroup(condition as Record<string, unknown>, params))
            .filter(group => group.length > 0)
            .map(group => group.length > 1 ? `(${group.join(' AND ')})` : group[0]);
        return clauses.length > 0 ? ` WHERE ${clauses.join(' OR ')}` : '';
    }

    private buildWhereGroup(condition: Record<string, unknown>, params: Array<unknown>): Array<string> {
        const clauses: Array<string> = [];
        for (const [key, value] of Object.entries(condition)) {
            const column = this.state.columnMap.get(key);
            if (!column) continue;
            if (isOperator(value)) {
                if (value.requiresJsonSupport && !this.state.supportsJsonOperators) {
                    throw new Error(`JSON operators are only supported on PostgreSQL. The current dialect does not support JSON operators.`);
                }
                const { sql, params: opParams } = value.buildClause(column.quotedDatabaseName, params.length + 1, this.state.placeholder.bind(this.state));
                clauses.push(sql);
                params.push(...opParams);
            } else {
                params.push(value);
                clauses.push(`${column.quotedDatabaseName} = ${this.state.placeholder(params.length)}`);
            }
        }
        return clauses;
    }
}
