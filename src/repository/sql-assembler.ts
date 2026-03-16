import { QueryError } from '../errors';
import { IColumnMetadata } from '../interfaces/column-metadata';
import { IFindOptions } from '../interfaces/find-options';
import { IRelationMetadata } from '../interfaces/relation-metadata';
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

export type FindPlan<T> = {
    sql: string;
    params: unknown[];
    mtoRelations: ManyToOneInfo[];
    otmRelations: OtmInfo[];
    otoInverseRelations: OtmInfo[];
};

export class SqlAssembler<T> {
    constructor(private readonly state: RepositoryState<T>) {}

    buildFind(options: IFindOptions<T>): FindPlan<T> {
        const requestedRelations = options.relations ?? [];
        const mtoRelations: ManyToOneInfo[] = [];
        const otmRelations: OtmInfo[] = [];
        const otoInverseRelations: OtmInfo[] = [];

        for (const relName of requestedRelations) {
            const relation = this.state.metadata.relations.find(r => r.propertyKey === relName);
            if (!relation) continue;
            const relatedState = this.state.getRelatedState(relation);
            if (relation.type === 'many-to-one') {
                const prefix = `mirror__${relation.propertyKey}__`;
                mtoRelations.push({
                    relation,
                    relatedState,
                    prefix,
                    prefixedHydrator: relatedState.getOrBuildPrefixedHydrator(prefix),
                    pkDbName: relatedState.cachedPrimaryColumn?.databaseName ?? 'id',
                });
            } else if (relation.type === 'one-to-one') {
                const isOwner = this.state.metadata.columns.some(c => c.databaseName === relation.foreignKey);
                if (isOwner) {
                    const prefix = `mirror__${relation.propertyKey}__`;
                    mtoRelations.push({
                        relation,
                        relatedState,
                        prefix,
                        prefixedHydrator: relatedState.getOrBuildPrefixedHydrator(prefix),
                        pkDbName: relatedState.cachedPrimaryColumn?.databaseName ?? 'id',
                    });
                } else {
                    otoInverseRelations.push({ relation, relatedState });
                }
            } else {
                otmRelations.push({ relation, relatedState });
            }
        }

        const params: unknown[] = [];
        let selectPart = mtoRelations.length > 0 ? this.state.qualifiedSelectClause : this.state.selectClause;

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

        sql += this.buildWhere(options.where, params);

        if (options.orderBy) {
            const orderClauses = Object.entries(options.orderBy)
                .map(([key, direction]) => {
                    const column = this.state.columnMap.get(key);
                    return column ? `${column.quotedDatabaseName} ${direction}` : null;
                })
                .filter((clause): clause is string => clause !== null);
            if (orderClauses.length > 0) sql += ` ORDER BY ${orderClauses.join(', ')}`;
        }

        if (options.limit !== undefined) sql += ` LIMIT ${options.limit}`;
        if (options.offset !== undefined) sql += ` OFFSET ${options.offset}`;

        return { sql, params, mtoRelations, otmRelations, otoInverseRelations };
    }

    buildCount(where?: IFindOptions<T>['where']): { sql: string; params: unknown[] } {
        const params: unknown[] = [];
        return {
            sql: `SELECT COUNT(*) FROM ${this.state.quotedTableName}${this.buildWhere(where, params)}`,
            params,
        };
    }

    buildInsert(record: Record<string, unknown>, isIdentity: boolean): { sql: string; params: unknown[] } {
        const columns = this.state.metadata.columns.filter(c => (!c.primary || !isIdentity) && record[c.propertyKey] !== undefined);
        const names = columns.map(c => this.state.columnMap.get(c.propertyKey)!.quotedDatabaseName);
        const params = columns.map(c => record[c.propertyKey]);
        const placeholders = params.map((_, i) => `$${i + 1}`);
        return {
            sql: `INSERT INTO ${this.state.quotedTableName} (${names.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
            params,
        };
    }

    buildBulkInsert(records: Record<string, unknown>[], isIdentity: boolean): { sql: string; params: unknown[] } {
        const columns = this.state.metadata.columns.filter(c => (!c.primary || !isIdentity) && records[0][c.propertyKey] !== undefined);
        const names = columns.map(c => this.state.columnMap.get(c.propertyKey)!.quotedDatabaseName);
        const allParams: unknown[] = [];
        const rowPlaceholders = records.map(record => {
            const placeholders = columns.map(c => {
                allParams.push(record[c.propertyKey]);
                return `$${allParams.length}`;
            });
            return `(${placeholders.join(', ')})`;
        });
        return {
            sql: `INSERT INTO ${this.state.quotedTableName} (${names.join(', ')}) VALUES ${rowPlaceholders.join(', ')} RETURNING *`,
            params: allParams,
        };
    }

    buildUpdateById(record: Record<string, unknown>, pk: IColumnMetadata & { quotedDatabaseName: string }, pkValue: unknown): { sql: string; params: unknown[] } {
        const columns = this.state.metadata.columns.filter(c => !c.primary && record[c.propertyKey] !== undefined);
        const setClauses = columns.map((c, i) => `${this.state.columnMap.get(c.propertyKey)!.quotedDatabaseName} = $${i + 1}`);
        const params = [...columns.map(c => record[c.propertyKey]), pkValue];
        return {
            sql: `UPDATE ${this.state.quotedTableName} SET ${setClauses.join(', ')} WHERE ${pk.quotedDatabaseName} = $${columns.length + 1} RETURNING *`,
            params,
        };
    }

    buildUpdate(data: Partial<T>, where: IFindOptions<T>['where']): { sql: string; params: unknown[] } {
        const record = data as Record<string, unknown>;
        const params: unknown[] = [];
        const columns = this.state.metadata.columns.filter(c => !c.primary && record[c.propertyKey] !== undefined);
        if (columns.length === 0) throw new QueryError('UPDATE', new Error('No updatable columns provided'));
        const setClauses = columns.map(c => {
            params.push(record[c.propertyKey]);
            return `${this.state.columnMap.get(c.propertyKey)!.quotedDatabaseName} = $${params.length}`;
        });
        const whereSql = this.buildWhere(where, params);
        return {
            sql: `UPDATE ${this.state.quotedTableName} SET ${setClauses.join(', ')}${whereSql} RETURNING 1`,
            params,
        };
    }

    buildDelete(where: IFindOptions<T>['where']): { sql: string; params: unknown[] } {
        const params: unknown[] = [];
        return {
            sql: `DELETE FROM ${this.state.quotedTableName}${this.buildWhere(where, params)} RETURNING 1`,
            params,
        };
    }

    buildRemove(pk: IColumnMetadata & { quotedDatabaseName: string }): string {
        return `DELETE FROM ${this.state.quotedTableName} WHERE ${pk.quotedDatabaseName} = $1`;
    }

    buildRemoveMany(pk: IColumnMetadata & { quotedDatabaseName: string }): string {
        return `DELETE FROM ${this.state.quotedTableName} WHERE ${pk.quotedDatabaseName} = ANY($1)`;
    }

    private buildWhere(where: IFindOptions<T>['where'], params: unknown[]): string {
        if (!where) return '';
        const groups = Array.isArray(where) ? where : [where];
        const clauses = groups
            .map(condition => this.buildWhereGroup(condition as Record<string, unknown>, params))
            .filter(group => group.length > 0)
            .map(group => group.length > 1 ? `(${group.join(' AND ')})` : group[0]);
        return clauses.length > 0 ? ` WHERE ${clauses.join(' OR ')}` : '';
    }

    private buildWhereGroup(condition: Record<string, unknown>, params: unknown[]): string[] {
        const clauses: string[] = [];
        for (const [key, value] of Object.entries(condition)) {
            const column = this.state.columnMap.get(key);
            if (!column) continue;
            if (isOperator(value)) {
                const { sql, params: opParams } = value.buildClause(column.quotedDatabaseName, params.length + 1);
                clauses.push(sql);
                params.push(...opParams);
            } else {
                params.push(value);
                clauses.push(`${column.quotedDatabaseName} = $${params.length}`);
            }
        }
        return clauses;
    }
}
