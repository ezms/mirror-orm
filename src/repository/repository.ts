import { EntityNotFoundError, GenerationStrategyError, MissingPrimaryKeyError, NoPrimaryColumnError, QueryError } from '../errors';
import { IColumnMetadata } from '../interfaces/column-metadata';
import { IEntityMetadata } from '../interfaces/entity-metadata';
import { IFindOptions } from '../interfaces/find-options';
import { IGenerationOptions } from '../interfaces/generation-strategy';
import { IRelationMetadata } from '../interfaces/relation-metadata';
import { INamedQuery, IQueryRunner } from '../interfaces/query-runner';
import { registry } from '../metadata/registry';
import { isOperator } from '../operators/query-operator';
import { generateUuidV4, generateUuidV7 } from '../utils/generators';

const HYDRATOR_HELPERS = Object.freeze({
    dateOnly: (v: Date): string => {
        const m = String(v.getMonth() + 1).padStart(2, '0');
        const d = String(v.getDate()).padStart(2, '0');
        return `${v.getFullYear()}-${m}-${d}`;
    },
});

export class RepositoryState<T> {
    public readonly cachedPrimaryColumn: IColumnMetadata | null;
    public readonly quotedTableName: string;
    public readonly selectClause: string;
    public readonly qualifiedSelectClause: string;
    public readonly columnMap: Map<string, IColumnMetadata & { quotedDatabaseName: string }>;
    public readonly hydrator: (row: Record<string, unknown>) => T;
    public readonly findAllStatement: INamedQuery;
    public readonly findByIdStatement: INamedQuery | null;
    public readonly metadata: IEntityMetadata;
    public readonly target: new () => T;

    private readonly relatedStateCache = new Map<string, RepositoryState<unknown>>();
    private readonly prefixedHydratorCache = new Map<string, (row: Record<string, unknown>) => T>();

    constructor(target: new () => T, metadata: IEntityMetadata) {
        this.target = target;
        this.metadata = metadata;
        this.quotedTableName = this.quoteIdentifier(metadata.tableName);
        this.columnMap = this.buildColumnMap();
        this.selectClause = this.buildSelectClause();
        this.qualifiedSelectClause = this.buildQualifiedSelectClause();
        this.cachedPrimaryColumn = this.resolvePrimaryColumn();
        this.hydrator = this.buildHydrator();
        this.findAllStatement = { name: `mirror_${metadata.tableName}_fa`, text: `SELECT ${this.selectClause} FROM ${this.quotedTableName}` };
        this.findByIdStatement = this.buildFindByIdStatement();
    }

    public quoteIdentifier(identifier: string): string {
        return `"${identifier}"`;
    }

    private buildColumnMap(): Map<string, IColumnMetadata & { quotedDatabaseName: string }> {
        return new Map(
            this.metadata.columns.map(c => [
                c.propertyKey,
                { ...c, quotedDatabaseName: this.quoteIdentifier(c.databaseName) },
            ]),
        );
    }

    private buildSelectClause(): string {
        return [...this.columnMap.values()].map(c => c.quotedDatabaseName).join(', ');
    }

    private buildQualifiedSelectClause(): string {
        return [...this.columnMap.values()]
            .map(c => `${this.quotedTableName}.${c.quotedDatabaseName}`)
            .join(', ');
    }

    public getRelatedState(relation: IRelationMetadata): RepositoryState<unknown> {
        const cached = this.relatedStateCache.get(relation.propertyKey);
        if (cached) return cached;
        const targetCtor = relation.target() as new () => unknown;
        const meta = registry.getEntity(targetCtor.name);
        if (!meta) throw new Error(`Related entity "${targetCtor.name}" not registered. Did you add @Entity?`);
        const state = new RepositoryState(targetCtor, meta);
        this.relatedStateCache.set(relation.propertyKey, state);
        return state;
    }

    public getOrBuildPrefixedHydrator(prefix: string): (row: Record<string, unknown>) => T {
        const cached = this.prefixedHydratorCache.get(prefix);
        if (cached) return cached;
        const assignments = this.metadata.columns
            .map(c => {
                const db = `${prefix}${c.databaseName}`;
                const prop = c.propertyKey;
                const rhs = this.buildCastExpression(db, c.options.type);
                return `if(r["${db}"]!==undefined&&r["${db}"]!==null)i["${prop}"]=${rhs};`;
            })
            .join('');
        const fn = new Function('C', 'H', `return function hydrate(r){var i=Object.create(C.prototype);${assignments}return i;}`);
        const hydrator = fn(this.target, HYDRATOR_HELPERS) as (row: Record<string, unknown>) => T;
        this.prefixedHydratorCache.set(prefix, hydrator);
        return hydrator;
    }

    private resolvePrimaryColumn(): IColumnMetadata | null {
        return this.metadata.columns.find(c => c.primary) ?? null;
    }

    private buildFindByIdStatement(): INamedQuery | null {
        if (!this.cachedPrimaryColumn) return null;
        const pk = this.columnMap.get(this.cachedPrimaryColumn.propertyKey)!;
        return {
            name: `mirror_${this.metadata.tableName}_fbi`,
            text: `SELECT ${this.selectClause} FROM ${this.quotedTableName} WHERE ${pk.quotedDatabaseName} = $1`,
        };
    }

    private buildHydrator(): (row: Record<string, unknown>) => T {
        const assignments = this.metadata.columns
            .map(c => {
                const db = c.databaseName;
                const prop = c.propertyKey;
                const rhs = this.buildCastExpression(db, c.options.type);
                return `if(r["${db}"]!==undefined)i["${prop}"]=${rhs};`;
            })
            .join('');
        const fn = new Function('C', 'H', `return function hydrate(r){var i=Object.create(C.prototype);${assignments}return i;}`);
        return fn(this.target, HYDRATOR_HELPERS) as (row: Record<string, unknown>) => T;
    }

    private buildCastExpression(db: string, type: import('../interfaces/column-options').ColumnType | undefined): string {
        const v = `r["${db}"]`;
        switch (type) {
            case 'number':   return `${v}!==null?+${v}:null`;
            case 'bigint':   return `${v}!==null?BigInt(${v}):null`;
            case 'boolean':  return `${v}!==null?Boolean(${v}):null`;
            case 'datetime': return `${v}!==null?new Date(${v}):null`;
            case 'date':     return `${v}!==null?H.dateOnly(${v}):null`;
            case 'iso':      return `${v}!==null?(${v} instanceof Date?${v}:new Date(${v})).toISOString():null`;
            default:         return v;
        }
    }
}

export class Repository<T> {
    private readonly state: RepositoryState<T>;
    private readonly runner: IQueryRunner;

    constructor(target: new () => T, runner: IQueryRunner, metadata: IEntityMetadata);
    constructor(state: RepositoryState<T>, runner: IQueryRunner);
    constructor(
        targetOrState: (new () => T) | RepositoryState<T>,
        runner: IQueryRunner,
        metadata?: IEntityMetadata,
    ) {
        this.runner = runner;
        if (targetOrState instanceof RepositoryState) {
            this.state = targetOrState;
        } else {
            this.state = new RepositoryState(targetOrState, metadata!);
        }
    }

    public withTransaction(runner: IQueryRunner): Repository<T> {
        return new Repository(this.state, runner);
    }

    public async findAll(): Promise<Array<T>> {
        const stmt = this.state.findAllStatement;
        try {
            const rows = await this.runner.query<Record<string, unknown>>(stmt);
            return rows.map(this.state.hydrator);
        } catch (error) {
            throw new QueryError(stmt.text, error);
        }
    }

    public async findById(id: number | string): Promise<T | null> {
        const stmt = this.state.findByIdStatement;
        if (!stmt) throw new NoPrimaryColumnError(this.state.metadata.className);
        try {
            const rows = await this.runner.query<Record<string, unknown>>({ ...stmt, values: [id] });
            return rows.length > 0 ? this.state.hydrator(rows[0]) : null;
        } catch (error) {
            throw new QueryError(stmt.text, error);
        }
    }

    public async find(options: IFindOptions<T> = {}): Promise<Array<T>> {
        const requestedRelations = options.relations ?? [];

        type ManyToOneInfo = {
            relation: IRelationMetadata;
            relatedState: RepositoryState<unknown>;
            prefix: string;
            prefixedHydrator: (row: Record<string, unknown>) => unknown;
            pkDbName: string;
        };

        const mtoRelations: Array<ManyToOneInfo> = [];
        const otmRelations: Array<{ relation: IRelationMetadata; relatedState: RepositoryState<unknown> }> = [];

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
            } else {
                otmRelations.push({ relation, relatedState });
            }
        }

        const params: Array<unknown> = [];

        // SELECT: qualify main columns when JOINs are needed to avoid ambiguity
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

        sql += this.buildWhereSql(options.where, params);

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

        try {
            const rows = await this.runner.query<Record<string, unknown>>(sql, params);

            const entities = rows.map(row => {
                const entity = this.state.hydrator(row) as Record<string, unknown>;
                for (const mto of mtoRelations) {
                    const pkRowKey = `${mto.prefix}${mto.pkDbName}`;
                    entity[mto.relation.propertyKey] = row[pkRowKey] !== null && row[pkRowKey] !== undefined
                        ? mto.prefixedHydrator(row)
                        : null;
                }
                return entity as T;
            });

            if (otmRelations.length > 0) {
                const mainPk = this.state.cachedPrimaryColumn!;
                const mainPkDbName = mainPk.databaseName;
                const mainIds = rows.map(row => row[mainPkDbName]);

                for (const { relation, relatedState } of otmRelations) {
                    const fkSql = `SELECT ${relatedState.selectClause} FROM ${relatedState.quotedTableName} WHERE "${relation.foreignKey}" = ANY($1)`;
                    const relRows = await this.runner.query<Record<string, unknown>>(fkSql, [mainIds]);

                    const grouped = new Map<unknown, Array<unknown>>();
                    for (const relRow of relRows) {
                        const fkVal = relRow[relation.foreignKey];
                        if (!grouped.has(fkVal)) grouped.set(fkVal, []);
                        grouped.get(fkVal)!.push(relatedState.hydrator(relRow));
                    }

                    for (let i = 0; i < entities.length; i++) {
                        const pkVal = rows[i][mainPkDbName];
                        (entities[i] as Record<string, unknown>)[relation.propertyKey] = grouped.get(pkVal) ?? [];
                    }
                }
            }

            return entities;
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async findOne(options: Omit<IFindOptions<T>, 'limit'> = {}): Promise<T | null> {
        const rows = await this.find({ ...options, limit: 1 });
        return rows.length > 0 ? rows[0] : null;
    }

    public async findOneOrFail(options: Omit<IFindOptions<T>, 'limit'> = {}): Promise<T> {
        const entity = await this.findOne(options);
        if (entity === null) throw new EntityNotFoundError(this.state.metadata.className);
        return entity;
    }

    public async exists(where?: IFindOptions<T>['where']): Promise<boolean> {
        return (await this.count(where)) > 0;
    }

    public async count(where?: IFindOptions<T>['where']): Promise<number> {
        const params: Array<unknown> = [];
        const sql = `SELECT COUNT(*) FROM ${this.state.quotedTableName}${this.buildWhereSql(where, params)}`;

        try {
            const rows = await this.runner.query<{ count: string }>(sql, params);
            return parseInt(rows[0].count, 10);
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async saveMany(entities: Array<T>): Promise<Array<T>> {
        if (entities.length === 0) return [];
        const pk = this.primaryColumn();
        const isIdentity = pk.generation?.strategy === 'identity';
        const records = entities.map(e => ({ ...(e as Record<string, unknown>) }));

        if (!isIdentity && pk.generation) {
            for (const record of records) {
                if (record[pk.propertyKey] === undefined || record[pk.propertyKey] === null) {
                    record[pk.propertyKey] = this.generatePk(pk.generation);
                }
            }
        }

        const columns = this.state.metadata.columns.filter(
            c => (!c.primary || !isIdentity) && records[0][c.propertyKey] !== undefined,
        );
        const names = columns.map(c => this.state.columnMap.get(c.propertyKey)!.quotedDatabaseName);
        const allValues: Array<unknown> = [];
        const rowPlaceholders = records.map(record => {
            const placeholders = columns.map(c => {
                allValues.push(record[c.propertyKey]);
                return `$${allValues.length}`;
            });
            return `(${placeholders.join(', ')})`;
        });

        const sql = `INSERT INTO ${this.state.quotedTableName} (${names.join(', ')}) VALUES ${rowPlaceholders.join(', ')} RETURNING *`;
        try {
            const rows = await this.runner.query<Record<string, unknown>>(sql, allValues);
            return rows.map(this.state.hydrator);
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async removeMany(entities: Array<T>): Promise<void> {
        if (entities.length === 0) return;
        const pk = this.primaryColumn();
        const ids = entities.map(e => (e as Record<string, unknown>)[pk.propertyKey]);

        if (ids.some(id => id === undefined || id === null)) {
            throw new MissingPrimaryKeyError(this.state.metadata.className, 'removeMany');
        }

        const sql = `DELETE FROM ${this.state.quotedTableName} WHERE ${pk.quotedDatabaseName} = ANY($1)`;
        try {
            await this.runner.query(sql, [ids]);
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async save(entity: T): Promise<T> {
        const pk = this.primaryColumn();
        const record = entity as Record<string, unknown>;
        const pkValue = record[pk.propertyKey];

        return typeof pkValue === 'undefined' || pkValue === null
            ? this.insert(record, pk)
            : this.updateById(record, pk, pkValue);
    }

    public async remove(entity: T): Promise<void> {
        const pk = this.primaryColumn();
        const pkValue = (entity as Record<string, unknown>)[pk.propertyKey];

        if (typeof pkValue === 'undefined' || pkValue === null) {
            throw new MissingPrimaryKeyError(this.state.metadata.className, 'remove');
        }

        const sql = `DELETE FROM ${this.state.quotedTableName} WHERE ${pk.quotedDatabaseName} = $1`;
        try {
            await this.runner.query(sql, [pkValue]);
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    private async insert(record: Record<string, unknown>, pk: IColumnMetadata): Promise<T> {
        const isIdentity = pk.generation?.strategy === 'identity';

        if (!isIdentity && pk.generation) {
            record[pk.propertyKey] = this.generatePk(pk.generation);
        }

        const columns = this.state.metadata.columns.filter(c => (!c.primary || !isIdentity) && record[c.propertyKey] !== undefined);
        const names = columns.map(c => this.state.columnMap.get(c.propertyKey)!.quotedDatabaseName);
        const values = columns.map(c => record[c.propertyKey]);
        const placeholders = values.map((_, i) => `$${i + 1}`);
        const sql = `INSERT INTO ${this.state.quotedTableName} (${names.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;

        try {
            const rows = await this.runner.query<Record<string, unknown>>(sql, values);
            return this.state.hydrator(rows[0]);
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async update(data: Partial<T>, where: IFindOptions<T>['where']): Promise<number> {
        const record = data as Record<string, unknown>;
        const params: Array<unknown> = [];
        const columns = this.state.metadata.columns.filter(c => !c.primary && record[c.propertyKey] !== undefined);
        if (columns.length === 0) throw new QueryError('UPDATE', new Error('No updatable columns provided'));

        const setClauses = columns.map(c => {
            params.push(record[c.propertyKey]);
            return `${this.state.columnMap.get(c.propertyKey)!.quotedDatabaseName} = $${params.length}`;
        });

        const sql = `UPDATE ${this.state.quotedTableName} SET ${setClauses.join(', ')}${this.buildWhereSql(where, params)} RETURNING 1`;
        try {
            const rows = await this.runner.query(sql, params);
            return rows.length;
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async delete(where: IFindOptions<T>['where']): Promise<number> {
        const params: Array<unknown> = [];
        const sql = `DELETE FROM ${this.state.quotedTableName}${this.buildWhereSql(where, params)} RETURNING 1`;
        try {
            const rows = await this.runner.query(sql, params);
            return rows.length;
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    private async updateById(record: Record<string, unknown>, pk: IColumnMetadata & { quotedDatabaseName: string }, pkValue: unknown): Promise<T> {
        const columns = this.state.metadata.columns.filter(c => !c.primary && record[c.propertyKey] !== undefined);
        const setClauses = columns.map((c, i) => `${this.state.columnMap.get(c.propertyKey)!.quotedDatabaseName} = $${i + 1}`);
        const values = columns.map(c => record[c.propertyKey]);
        const sql = `UPDATE ${this.state.quotedTableName} SET ${setClauses.join(', ')} WHERE ${pk.quotedDatabaseName} = $${columns.length + 1} RETURNING *`;

        try {
            const rows = await this.runner.query<Record<string, unknown>>(sql, [...values, pkValue]);
            return this.state.hydrator(rows[0]);
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    private primaryColumn(): IColumnMetadata & { quotedDatabaseName: string } {
        const pk = this.state.cachedPrimaryColumn;
        if (!pk) throw new NoPrimaryColumnError(this.state.metadata.className);
        return this.state.columnMap.get(pk.propertyKey)!;
    }

    private generatePk(generation: IGenerationOptions): string | number {
        switch (generation.strategy) {
            case 'uuid_v4': return generateUuidV4();
            case 'uuid_v7': return generateUuidV7();
            case 'custom': {
                if (!generation.generate) throw new GenerationStrategyError('custom strategy requires a generate() function');
                return generation.generate();
            }
            case 'identity':
                throw new GenerationStrategyError('identity strategy is managed by the database and cannot generate a value');
        }
    }

    private buildWhereSql(where: IFindOptions<T>['where'], params: Array<unknown>): string {
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
