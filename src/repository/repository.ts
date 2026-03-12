import { GenerationStrategyError, MissingPrimaryKeyError, NoPrimaryColumnError, QueryError } from '../errors';
import { IColumnMetadata } from '../interfaces/column-metadata';
import { IEntityMetadata } from '../interfaces/entity-metadata';
import { IFindOptions } from '../interfaces/find-options';
import { IGenerationOptions } from '../interfaces/generation-strategy';
import { IQueryRunner } from '../interfaces/query-runner';
import { isOperator } from '../operators/query-operator';
import { generateUuidV4, generateUuidV7 } from '../utils/generators';

export class Repository<T> {
    private readonly hydratorKeys: Array<[string, string]>;
    private readonly cachedPrimaryColumn: IColumnMetadata | null;

    constructor(
        private readonly target: new () => T,
        private readonly runner: IQueryRunner,
        private readonly metadata: IEntityMetadata,
    ) {
        this.hydratorKeys = this.buildHydratorKeys();
        this.cachedPrimaryColumn = this.resolvePrimaryColumn();
    }

    private buildHydratorKeys(): Array<[string, string]> {
        return this.metadata.columns.map(c => [c.propertyKey, c.databaseName]);
    }

    private resolvePrimaryColumn(): IColumnMetadata | null {
        return this.metadata.columns.find(c => c.primary) ?? null;
    }

    private quoteIdentifier(identifier: string): string {
        return `"${identifier}"`;
    }

    public async findAll(): Promise<Array<T>> {
        const sql = `SELECT * FROM ${this.quoteIdentifier(this.metadata.tableName)}`;
        try {
            const rows = await this.runner.query<Record<string, unknown>>(sql);
            return rows.map(row => this.hydrate(row));
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async findById(id: number | string): Promise<T | null> {
        const pk = this.primaryColumn();
        const sql = `SELECT * FROM ${this.quoteIdentifier(this.metadata.tableName)} WHERE ${this.quoteIdentifier(pk.databaseName)} = $1`;
        try {
            const rows = await this.runner.query<Record<string, unknown>>(sql, [id]);
            return rows.length > 0 ? this.hydrate(rows[0]) : null;
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async find(options: IFindOptions<T> = {}): Promise<Array<T>> {
        let sql = `SELECT * FROM ${this.quoteIdentifier(this.metadata.tableName)}`;
        const params: Array<unknown> = [];

        if (options.where) {
            const groups = Array.isArray(options.where) ? options.where : [options.where];
            const whereClauses = groups
                .map(condition => this.buildWhereGroup(condition as Record<string, unknown>, params))
                .filter(group => group.length > 0)
                .map(group => group.length > 1 ? `(${group.join(' AND ')})` : group[0]);

            if (whereClauses.length > 0) {
                sql += ` WHERE ${whereClauses.join(' OR ')}`;
            }
        }

        if (options.orderBy) {
            const orderClauses = Object.entries(options.orderBy)
                .map(([key, direction]) => {
                    const column = this.metadata.columns.find(c => c.propertyKey === key);
                    return column ? `${this.quoteIdentifier(column.databaseName)} ${direction}` : null;
                })
                .filter((clause): clause is string => clause !== null);

            if (orderClauses.length > 0) {
                sql += ` ORDER BY ${orderClauses.join(', ')}`;
            }
        }

        if (options.limit !== undefined) {
            sql += ` LIMIT ${options.limit}`;
        }
        if (options.offset !== undefined) {
            sql += ` OFFSET ${options.offset}`;
        }

        try {
            const rows = await this.runner.query<Record<string, unknown>>(sql, params);
            return rows.map(row => this.hydrate(row));
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async count(where?: IFindOptions<T>['where']): Promise<number> {
        let sql = `SELECT COUNT(*) FROM ${this.quoteIdentifier(this.metadata.tableName)}`;
        const params: Array<unknown> = [];

        if (where) {
            const groups = Array.isArray(where) ? where : [where];
            const whereClauses = groups
                .map(condition => this.buildWhereGroup(condition as Record<string, unknown>, params))
                .filter(group => group.length > 0)
                .map(group => group.length > 1 ? `(${group.join(' AND ')})` : group[0]);

            if (whereClauses.length > 0) {
                sql += ` WHERE ${whereClauses.join(' OR ')}`;
            }
        }

        try {
            const rows = await this.runner.query<{ count: string }>(sql, params);
            return parseInt(rows[0].count, 10);
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
            : this.update(record, pk, pkValue);
    }

    public async remove(entity: T): Promise<void> {
        const pk = this.primaryColumn();
        const pkValue = (entity as Record<string, unknown>)[pk.propertyKey];

        if (typeof pkValue === 'undefined' || pkValue === null) {
            throw new MissingPrimaryKeyError(this.metadata.className, 'remove');
        }

        const sql = `DELETE FROM ${this.quoteIdentifier(this.metadata.tableName)} WHERE ${this.quoteIdentifier(pk.databaseName)} = $1`;
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

        const columns = this.metadata.columns.filter(c => (!c.primary || !isIdentity) && record[c.propertyKey] !== undefined);
        const names = columns.map(c => this.quoteIdentifier(c.databaseName));
        const values = columns.map(c => record[c.propertyKey]);
        const placeholders = values.map((_, i) => `$${i + 1}`);
        const sql = `INSERT INTO ${this.quoteIdentifier(this.metadata.tableName)} (${names.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;

        try {
            const rows = await this.runner.query<Record<string, unknown>>(sql, values);
            return this.hydrate(rows[0]);
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    private async update(record: Record<string, unknown>, pk: IColumnMetadata, pkValue: unknown): Promise<T> {
        const columns = this.metadata.columns.filter(c => !c.primary && record[c.propertyKey] !== undefined);
        const setClauses = columns.map((c, i) => `${this.quoteIdentifier(c.databaseName)} = $${i + 1}`);
        const values = columns.map(c => record[c.propertyKey]);
        const sql = `UPDATE ${this.quoteIdentifier(this.metadata.tableName)} SET ${setClauses.join(', ')} WHERE ${this.quoteIdentifier(pk.databaseName)} = $${columns.length + 1} RETURNING *`;

        try {
            const rows = await this.runner.query<Record<string, unknown>>(sql, [...values, pkValue]);
            return this.hydrate(rows[0]);
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    private primaryColumn(): IColumnMetadata {
        const pk = this.cachedPrimaryColumn;
        if (!pk) throw new NoPrimaryColumnError(this.metadata.className);
        return pk;
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

    private buildWhereGroup(condition: Record<string, unknown>, params: Array<unknown>): Array<string> {
        const clauses: Array<string> = [];

        for (const [key, value] of Object.entries(condition)) {
            const column = this.metadata.columns.find(c => c.propertyKey === key);
            if (!column) continue;

            if (isOperator(value)) {
                const { sql, params: opParams } = value.buildClause(this.quoteIdentifier(column.databaseName), params.length + 1);
                clauses.push(sql);
                params.push(...opParams);
            } else {
                params.push(value);
                clauses.push(`${this.quoteIdentifier(column.databaseName)} = $${params.length}`);
            }
        }

        return clauses;
    }

    private hydrate(row: Record<string, unknown>): T {
        const instance = Object.create(this.target.prototype) as T;

        for (let i = 0; i < this.hydratorKeys.length; i++) {
            const val = row[this.hydratorKeys[i][1]];
            if (val !== undefined) (instance as Record<string, unknown>)[this.hydratorKeys[i][0]] = val;
        }

        return instance;
    }
}
