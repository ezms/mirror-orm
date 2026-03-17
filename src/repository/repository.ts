import { EntityNotFoundError, GenerationStrategyError, MissingPrimaryKeyError, NoPrimaryColumnError, QueryError } from '../errors';
import { IColumnMetadata } from '../interfaces/column-metadata';
import { IEntityMetadata } from '../interfaces/entity-metadata';
import { IFindOptions } from '../interfaces/find-options';
import { IGenerationOptions } from '../interfaces/generation-strategy';
import { IQueryRunner } from '../interfaces/query-runner';
import { CascadeType, IRelationMetadata } from '../interfaces/relation-metadata';
import { generateCuid2, generateUlid, generateUuidV4, generateUuidV7 } from '../utils/generators';
import { entitySnapshots } from '../context/entity-snapshots';
import { transactionStore } from '../context/transaction-store';
import { RepositoryState } from './repository-state';
import { SqlAssembler } from './sql-assembler';

export { RepositoryState } from './repository-state';

export class Repository<T> {
    private readonly state: RepositoryState<T>;
    private readonly runner: IQueryRunner;
    private readonly assembler: SqlAssembler<T>;
    private readonly alsEnabled: boolean;

    constructor(target: new () => T, runner: IQueryRunner, metadata: IEntityMetadata);
    constructor(state: RepositoryState<T>, runner: IQueryRunner, alsEnabled?: boolean);
    constructor(
        targetOrState: (new () => T) | RepositoryState<T>,
        runner: IQueryRunner,
        metadataOrAls?: IEntityMetadata | boolean,
    ) {
        this.runner = runner;
        if (targetOrState instanceof RepositoryState) {
            this.state = targetOrState;
            this.alsEnabled = typeof metadataOrAls === 'boolean' ? metadataOrAls : true;
        } else {
            this.state = new RepositoryState(targetOrState, metadataOrAls as IEntityMetadata);
            this.alsEnabled = true;
        }
        this.assembler = new SqlAssembler(this.state);
    }

    private get activeRunner(): IQueryRunner {
        return (this.alsEnabled ? transactionStore.getStore() : undefined) ?? this.runner;
    }

    private async runHooks(entity: T, methods: Array<string>): Promise<void> {
        for (const method of methods) await ((entity as Record<string, unknown>)[method] as Function)?.();
    }

    private async hydrateWithHooks(rows: Array<Record<string, unknown>>): Promise<Array<T>> {
        const entities = rows.map(row => this.captureSnapshot(this.state.hydrator(row)));
        if (this.state.metadata.hooks.afterLoad.length > 0)
            for (const entity of entities) await this.runHooks(entity, this.state.metadata.hooks.afterLoad);
        return entities;
    }

    private captureSnapshot(entity: T): T {
        const snap: Record<string, unknown> = {};
        for (const col of this.state.metadata.columns) {
            snap[col.propertyKey] = (entity as Record<string, unknown>)[col.propertyKey];
        }
        entitySnapshots.set(entity as object, snap);
        return entity;
    }

    public withTransaction(runner: IQueryRunner): Repository<T> {
        return new Repository(this.state, runner, false);
    }

    public async findAll(): Promise<Array<T>> {
        const stmt = this.state.findAllStatement;
        try {
            const rows = await this.activeRunner.query<Record<string, unknown>>(stmt);
            return this.hydrateWithHooks(rows);
        } catch (error) {
            throw new QueryError(stmt.text, error, []);
        }
    }

    public async findById(id: number | string): Promise<T | null> {
        const stmt = this.state.findByIdStatement;
        if (!stmt) throw new NoPrimaryColumnError(this.state.metadata.className);
        try {
            const rows = await this.activeRunner.query<Record<string, unknown>>({ ...stmt, values: [id] });
            if (rows.length === 0) return null;
            return (await this.hydrateWithHooks(rows))[0];
        } catch (error) {
            throw new QueryError(stmt.text, error, [id]);
        }
    }

    public async find(options: IFindOptions<T> = {}): Promise<Array<T>> {
        const plan = this.assembler.buildFind(options);
        try {
            const rows = await this.activeRunner.query<Record<string, unknown>>(plan.sql, plan.params);

            const entities = rows.map(row => {
                const entity = this.captureSnapshot(this.state.hydrator(row)) as Record<string, unknown>;
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
                    const relRows = await this.activeRunner.query<Record<string, unknown>>(fkSql, [mainIds]);

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
                    const relRows = await this.activeRunner.query<Record<string, unknown>>(fkSql, [mainIds]);

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
                    const relRows = await this.activeRunner.query<Record<string, unknown>>(mtmSql, [mainIds]);

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

            if (this.state.metadata.hooks.afterLoad.length > 0)
                for (const entity of entities) await this.runHooks(entity, this.state.metadata.hooks.afterLoad);

            return entities;
        } catch (error) {
            throw new QueryError(plan.sql, error, plan.params);
        }
    }

    public async findAndCount(options: IFindOptions<T> = {}): Promise<[Array<T>, number]> {
        const { sql, params } = this.assembler.buildCount(options.where, options.withDeleted);
        const countPromise = this.activeRunner.query<{ count: string }>(sql, params)
            .then(rows => parseInt(rows[0].count, 10))
            .catch(error => { throw new QueryError(sql, error, params); });
        return Promise.all([this.find(options), countPromise]);
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
            const rows = await this.activeRunner.query<{ count: string }>(sql, params);
            return parseInt(rows[0].count, 10);
        } catch (error) {
            throw new QueryError(sql, error, params);
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
            const rows = await this.activeRunner.query<Record<string, unknown>>(sql, params);
            return rows.map(row => this.captureSnapshot(this.state.hydrator(row)));
        } catch (error) {
            throw new QueryError(sql, error, params);
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
            await this.activeRunner.query(sql, [ids]);
        } catch (error) {
            throw new QueryError(sql, error, [ids]);
        }
    }

    public async save(entity: T): Promise<T> {
        return this.saveInternal(entity, new Set<object>());
    }

    public async remove(entity: T): Promise<void> {
        return this.removeInternal(entity, new Set<object>());
    }

    private hasCascade(relation: IRelationMetadata, op: CascadeType): boolean {
        if (!relation.cascade) return false;
        if (relation.cascade === true) return true;
        return (relation.cascade as Array<CascadeType>).includes(op);
    }

    private isOtmOrOtoInverse(relation: IRelationMetadata): boolean {
        return relation.type === 'one-to-many' ||
            (relation.type === 'one-to-one' && !this.state.metadata.columns.some(c => c.databaseName === relation.foreignKey));
    }

    private isMtoOrOtoOwner(relation: IRelationMetadata): boolean {
        return relation.type === 'many-to-one' ||
            (relation.type === 'one-to-one' && this.state.metadata.columns.some(c => c.databaseName === relation.foreignKey));
    }

    private relatedRepo<R>(relatedState: RepositoryState<R>): Repository<R> {
        return new Repository(relatedState, this.activeRunner, false);
    }

    private applyAutoFkMapping(record: Record<string, unknown>): void {
        for (const relation of this.state.metadata.relations) {
            if (!this.isMtoOrOtoOwner(relation)) continue;
            const related = record[relation.propertyKey];
            if (!related || typeof related !== 'object') continue;
            const fkCol = this.state.metadata.columns.find(c => c.databaseName === relation.foreignKey);
            if (!fkCol) continue;
            const pkVal = (related as Record<string, unknown>)[
                this.state.getRelatedState(relation).cachedPrimaryColumn?.propertyKey ?? ''
            ];
            if (pkVal != null) record[fkCol.propertyKey] = pkVal;
        }
    }

    private injectFk(child: Record<string, unknown>, relatedState: RepositoryState<unknown>, fkDbName: string, fkValue: unknown): void {
        const fkColumn = relatedState.metadata.columns.find(c => c.databaseName === fkDbName);
        if (fkColumn) child[fkColumn.propertyKey] = fkValue;
    }

    private async saveInternal(entity: T, visited: Set<object>): Promise<T> {
        if (visited.has(entity as object)) return entity;
        visited.add(entity as object);

        const record = entity as Record<string, unknown>;

        for (const relation of this.state.metadata.relations) {
            if (!this.isMtoOrOtoOwner(relation)) continue;
            if (!this.hasCascade(relation, 'insert') && !this.hasCascade(relation, 'update')) continue;
            const related = record[relation.propertyKey];
            if (!related || typeof related !== 'object') continue;
            const relatedState = this.state.getRelatedState(relation);
            const savedRelated = await this.relatedRepo(relatedState).saveInternal(related as T, visited) as Record<string, unknown>;
            const relPk = relatedState.cachedPrimaryColumn;
            if (relPk) {
                const fkCol = this.state.metadata.columns.find(c => c.databaseName === relation.foreignKey);
                if (fkCol) record[fkCol.propertyKey] = savedRelated[relPk.propertyKey];
            }
            record[relation.propertyKey] = savedRelated;
        }

        this.applyAutoFkMapping(record);

        const pk = this.primaryColumn();
        const pkValue = record[pk.propertyKey];
        const createdAtCol = this.state.cachedCreatedAtColumn;
        const updatedAtCol = this.state.cachedUpdatedAtColumn;
        let saved: T;

        if (typeof pkValue !== 'undefined' && pkValue !== null) {
            await this.runHooks(entity, this.state.metadata.hooks.beforeUpdate);
            if (updatedAtCol) record[updatedAtCol.propertyKey] = new Date();
            const snapshot = entitySnapshots.get(entity as object);
            if (snapshot) {
                const dirtyColumns = this.state.metadata.columns.filter(
                    c => !c.primary && record[c.propertyKey] !== snapshot[c.propertyKey],
                );
                saved = dirtyColumns.length === 0 ? entity : await this.updateById(record, pk, pkValue, dirtyColumns);
            } else {
                saved = await this.updateById(record, pk, pkValue);
            }
        } else {
            await this.runHooks(entity, this.state.metadata.hooks.beforeInsert);
            if (createdAtCol) record[createdAtCol.propertyKey] = new Date();
            if (updatedAtCol) record[updatedAtCol.propertyKey] = new Date();
            saved = await this.insert(record, pk);
        }

        const savedPk = (saved as Record<string, unknown>)[pk.propertyKey];

        for (const relation of this.state.metadata.relations) {
            if (!this.isOtmOrOtoInverse(relation)) continue;
            if (!this.hasCascade(relation, 'insert') && !this.hasCascade(relation, 'update')) continue;
            const children = record[relation.propertyKey];
            if (!children) continue;
            const relatedState = this.state.getRelatedState(relation);
            const relRepo = this.relatedRepo(relatedState);

            if (relation.type === 'one-to-many') {
                const childArray = children as Array<Record<string, unknown>>;
                for (const child of childArray) this.injectFk(child, relatedState, relation.foreignKey, savedPk);
                const relPk = relatedState.cachedPrimaryColumn;
                const isNew = (c: Record<string, unknown>) => !relPk || c[relPk.propertyKey] === undefined || c[relPk.propertyKey] === null;
                const newOnes = childArray.filter(isNew);
                const existing = childArray.filter(c => !isNew(c));
                if (newOnes.length > 0) await relRepo.saveMany(newOnes as Array<T>);
                for (const child of existing) await relRepo.saveInternal(child as T, visited);
            } else {
                const child = children as Record<string, unknown>;
                this.injectFk(child, relatedState, relation.foreignKey, savedPk);
                await relRepo.saveInternal(child as T, visited);
            }
        }

        return saved;
    }

    private async removeInternal(entity: T, visited: Set<object>): Promise<void> {
        if (visited.has(entity as object)) return;
        visited.add(entity as object);

        const pk = this.primaryColumn();
        const pkValue = (entity as Record<string, unknown>)[pk.propertyKey];
        if (typeof pkValue === 'undefined' || pkValue === null) {
            throw new MissingPrimaryKeyError(this.state.metadata.className, 'remove');
        }

        for (const relation of this.state.metadata.relations) {
            if (!this.isOtmOrOtoInverse(relation)) continue;
            if (!this.hasCascade(relation, 'remove')) continue;
            const relatedState = this.state.getRelatedState(relation);
            const deleteSql = `DELETE FROM ${relatedState.quotedTableName} WHERE ${relatedState.quoteIdentifier(relation.foreignKey)} = $1`;
            try {
                await this.activeRunner.query(deleteSql, [pkValue]);
            } catch (error) {
                throw new QueryError(deleteSql, error, [pkValue]);
            }
        }

        const deletedAtCol = this.state.cachedDeletedAtColumn;
        if (deletedAtCol) {
            (entity as Record<string, unknown>)[deletedAtCol.propertyKey] = new Date();
            await this.updateById(entity as Record<string, unknown>, pk, pkValue, [deletedAtCol]);
        } else {
            const sql = this.assembler.buildRemove(pk);
            try {
                await this.activeRunner.query(sql, [pkValue]);
            } catch (error) {
                throw new QueryError(sql, error, [pkValue]);
            }
        }

        for (const relation of this.state.metadata.relations) {
            if (!this.isMtoOrOtoOwner(relation)) continue;
            if (!this.hasCascade(relation, 'remove')) continue;
            const related = (entity as Record<string, unknown>)[relation.propertyKey];
            if (!related || typeof related !== 'object') continue;
            const relatedState = this.state.getRelatedState(relation);
            await this.relatedRepo(relatedState).removeInternal(related as T, visited);
        }
    }

    public async softRestore(entity: T): Promise<T> {
        const pk = this.primaryColumn();
        const record = entity as Record<string, unknown>;
        const pkValue = record[pk.propertyKey];
        if (!pkValue) throw new MissingPrimaryKeyError(this.state.metadata.className, 'softRestore');
        const deletedAtCol = this.state.cachedDeletedAtColumn;
        if (!deletedAtCol) return entity;
        record[deletedAtCol.propertyKey] = null;
        return this.updateById(record, pk, pkValue, [deletedAtCol]);
    }

    public async upsert(entity: T, conflictKeys: Array<keyof T & string>, options?: { update?: Array<keyof T & string> }): Promise<T> {
        const pk = this.primaryColumn();
        const record = { ...(entity as Record<string, unknown>) };

        if (pk.generation && pk.generation.strategy !== 'identity') {
            if (record[pk.propertyKey] === undefined || record[pk.propertyKey] === null) {
                record[pk.propertyKey] = this.generatePk(pk.generation);
            }
        }

        await this.runHooks(entity, this.state.metadata.hooks.beforeInsert);

        const createdAtCol = this.state.cachedCreatedAtColumn;
        const updatedAtCol = this.state.cachedUpdatedAtColumn;
        if (createdAtCol && record[createdAtCol.propertyKey] == null) record[createdAtCol.propertyKey] = new Date();
        if (updatedAtCol) record[updatedAtCol.propertyKey] = new Date();

        const { sql, params } = this.assembler.buildUpsert(record, conflictKeys, options?.update);
        try {
            const rows = await this.activeRunner.query<Record<string, unknown>>(sql, params);
            return this.captureSnapshot(this.state.hydrator(rows[0]));
        } catch (error) {
            throw new QueryError(sql, error, params);
        }
    }

    public async update(data: Partial<T>, where: IFindOptions<T>['where']): Promise<number> {
        const { sql, params } = this.assembler.buildUpdate(data, where);
        try {
            const rows = await this.activeRunner.query(sql, params);
            return rows.length;
        } catch (error) {
            throw new QueryError(sql, error, params);
        }
    }

    public async delete(where: IFindOptions<T>['where']): Promise<number> {
        const { sql, params } = this.assembler.buildDelete(where);
        try {
            const rows = await this.activeRunner.query(sql, params);
            return rows.length;
        } catch (error) {
            throw new QueryError(sql, error, params);
        }
    }

    private async insert(record: Record<string, unknown>, pk: IColumnMetadata): Promise<T> {
        const isIdentity = pk.generation?.strategy === 'identity';
        if (!isIdentity && pk.generation) {
            record[pk.propertyKey] = this.generatePk(pk.generation);
        }
        const { sql, params } = this.assembler.buildInsert(record, isIdentity);
        try {
            const rows = await this.activeRunner.query<Record<string, unknown>>(sql, params);
            return this.captureSnapshot(this.state.hydrator(rows[0]));
        } catch (error) {
            throw new QueryError(sql, error, params);
        }
    }

    private async updateById(record: Record<string, unknown>, pk: IColumnMetadata & { quotedDatabaseName: string }, pkValue: unknown, dirtyColumns?: Array<IColumnMetadata>): Promise<T> {
        const { sql, params } = this.assembler.buildUpdateById(record, pk, pkValue, dirtyColumns);
        try {
            const rows = await this.activeRunner.query<Record<string, unknown>>(sql, params);
            return this.captureSnapshot(this.state.hydrator(rows[0]));
        } catch (error) {
            throw new QueryError(sql, error, params);
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
            case 'ulid': return generateUlid();
            case 'cuid2': return generateCuid2();
            case 'custom': {
                if (!generation.generate) throw new GenerationStrategyError('custom strategy requires a generate() function');
                return generation.generate();
            }
            case 'identity':
                throw new GenerationStrategyError('identity strategy is managed by the database and cannot generate a value');
        }
    }
}
