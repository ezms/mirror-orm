import { EntityNotFoundError, GenerationStrategyError, MissingPrimaryKeyError, NoPrimaryColumnError, QueryError } from '../errors';
import { IColumnMetadata } from '../interfaces/column-metadata';
import { IEntityMetadata } from '../interfaces/entity-metadata';
import { IFindOptions } from '../interfaces/find-options';
import { IGenerationOptions } from '../interfaces/generation-strategy';
import { IQueryRunner } from '../interfaces/query-runner';
import { generateUuidV4, generateUuidV7 } from '../utils/generators';
import { RepositoryState } from './repository-state';
import { SqlAssembler } from './sql-assembler';

export { RepositoryState } from './repository-state';

export class Repository<T> {
    private readonly state: RepositoryState<T>;
    private readonly runner: IQueryRunner;
    private readonly assembler: SqlAssembler<T>;

    constructor(target: new () => T, runner: IQueryRunner, metadata: IEntityMetadata);
    constructor(state: RepositoryState<T>, runner: IQueryRunner);
    constructor(
        targetOrState: (new () => T) | RepositoryState<T>,
        runner: IQueryRunner,
        metadata?: IEntityMetadata,
    ) {
        this.runner = runner;
        this.state = targetOrState instanceof RepositoryState
            ? targetOrState
            : new RepositoryState(targetOrState, metadata!);
        this.assembler = new SqlAssembler(this.state);
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
        const plan = this.assembler.buildFind(options);
        try {
            const rows = await this.runner.query<Record<string, unknown>>(plan.sql, plan.params);

            const entities = rows.map(row => {
                const entity = this.state.hydrator(row) as Record<string, unknown>;
                for (const mto of plan.mtoRelations) {
                    const pkRowKey = `${mto.prefix}${mto.pkDbName}`;
                    entity[mto.relation.propertyKey] = row[pkRowKey] !== null && row[pkRowKey] !== undefined
                        ? mto.prefixedHydrator(row)
                        : null;
                }
                return entity as T;
            });

            if (rows.length > 0) {
                const mainPkDbName = this.state.cachedPrimaryColumn!.databaseName;
                const mainIds = rows.map(row => row[mainPkDbName]);

                for (const { relation, relatedState } of plan.otmRelations) {
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

                for (const { relation, relatedState } of plan.otoInverseRelations) {
                    const fkSql = `SELECT ${relatedState.selectClause} FROM ${relatedState.quotedTableName} WHERE "${relation.foreignKey}" = ANY($1)`;
                    const relRows = await this.runner.query<Record<string, unknown>>(fkSql, [mainIds]);

                    const grouped = new Map<unknown, unknown>();
                    for (const relRow of relRows) {
                        const fkVal = relRow[relation.foreignKey];
                        grouped.set(fkVal, relatedState.hydrator(relRow));
                    }

                    for (let i = 0; i < entities.length; i++) {
                        const pkVal = rows[i][mainPkDbName];
                        (entities[i] as Record<string, unknown>)[relation.propertyKey] = grouped.get(pkVal) ?? null;
                    }
                }

                for (const { relation, relatedState } of plan.mtmRelations) {
                    const relPk = relatedState.columnMap.get(relatedState.cachedPrimaryColumn!.propertyKey)!;
                    const qtJoin = this.state.quoteIdentifier(relation.joinTable!);
                    const ownerAlias = '_mirror_mtm_fk_';
                    const mtmSql = `SELECT ${relatedState.selectClause}, ${qtJoin}.${this.state.quoteIdentifier(relation.foreignKey)} AS "${ownerAlias}" FROM ${relatedState.quotedTableName} INNER JOIN ${qtJoin} ON ${qtJoin}.${this.state.quoteIdentifier(relation.inverseFk!)} = ${relatedState.quotedTableName}.${relPk.quotedDatabaseName} WHERE ${qtJoin}.${this.state.quoteIdentifier(relation.foreignKey)} = ANY($1)`;
                    const relRows = await this.runner.query<Record<string, unknown>>(mtmSql, [mainIds]);

                    const grouped = new Map<unknown, Array<unknown>>();
                    for (const relRow of relRows) {
                        const ownerFkVal = relRow[ownerAlias];
                        if (!grouped.has(ownerFkVal)) grouped.set(ownerFkVal, []);
                        grouped.get(ownerFkVal)!.push(relatedState.hydrator(relRow));
                    }

                    for (let i = 0; i < entities.length; i++) {
                        const pkVal = rows[i][mainPkDbName];
                        (entities[i] as Record<string, unknown>)[relation.propertyKey] = grouped.get(pkVal) ?? [];
                    }
                }
            }

            return entities;
        } catch (error) {
            throw new QueryError(plan.sql, error);
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
        const { sql, params } = this.assembler.buildCount(where);
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

        const { sql, params } = this.assembler.buildBulkInsert(records, isIdentity);
        try {
            const rows = await this.runner.query<Record<string, unknown>>(sql, params);
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

        const sql = this.assembler.buildRemoveMany(pk);
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

        const sql = this.assembler.buildRemove(pk);
        try {
            await this.runner.query(sql, [pkValue]);
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async update(data: Partial<T>, where: IFindOptions<T>['where']): Promise<number> {
        const { sql, params } = this.assembler.buildUpdate(data, where);
        try {
            const rows = await this.runner.query(sql, params);
            return rows.length;
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async delete(where: IFindOptions<T>['where']): Promise<number> {
        const { sql, params } = this.assembler.buildDelete(where);
        try {
            const rows = await this.runner.query(sql, params);
            return rows.length;
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    private async insert(record: Record<string, unknown>, pk: IColumnMetadata): Promise<T> {
        const isIdentity = pk.generation?.strategy === 'identity';
        if (!isIdentity && pk.generation) {
            record[pk.propertyKey] = this.generatePk(pk.generation);
        }
        const { sql, params } = this.assembler.buildInsert(record, isIdentity);
        try {
            const rows = await this.runner.query<Record<string, unknown>>(sql, params);
            return this.state.hydrator(rows[0]);
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    private async updateById(record: Record<string, unknown>, pk: IColumnMetadata & { quotedDatabaseName: string }, pkValue: unknown): Promise<T> {
        const { sql, params } = this.assembler.buildUpdateById(record, pk, pkValue);
        try {
            const rows = await this.runner.query<Record<string, unknown>>(sql, params);
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
}
