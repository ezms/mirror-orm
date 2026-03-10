import { IColumnMetadata } from '../interfaces/column-metadata';
import { IEntityMetadata } from '../interfaces/entity-metadata';
import { IFindOptions } from '../interfaces/find-options';
import { IGenerationOptions } from '../interfaces/generation-strategy';
import { IQueryRunner } from '../interfaces/query-runner';
import { isOperator } from '../operators/query-operator';
import { generateUuidV4, generateUuidV7 } from '../utils/generators';

export class Repository<T> {
    constructor(
        private readonly target: new () => T,
        private readonly runner: IQueryRunner,
        private readonly metadata: IEntityMetadata,
    ) {}

    public async findAll(): Promise<Array<T>> {
        const rows = await this.runner.query<Record<string, unknown>>(
            `SELECT * FROM ${this.metadata.tableName}`,
        );
        return rows.map(row => this.hydrate(row));
    }

    public async findById(id: number | string): Promise<T | null> {
        const pk = this.primaryColumn();

        const rows = await this.runner.query<Record<string, unknown>>(
            `SELECT * FROM ${this.metadata.tableName} WHERE ${pk.databaseName} = $1`,
            [id],
        );

        return rows.length > 0 ? this.hydrate(rows[0]) : null;
    }

    public async find(options: IFindOptions<T> = {}): Promise<Array<T>> {
        let sql = `SELECT * FROM ${this.metadata.tableName}`;
        const params: unknown[] = [];

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
                    return column ? `${column.databaseName} ${direction}` : null;
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

        const rows = await this.runner.query<Record<string, unknown>>(sql, params);
        return rows.map(row => this.hydrate(row));
    }

    public async count(where?: IFindOptions<T>['where']): Promise<number> {
        let sql = `SELECT COUNT(*) FROM ${this.metadata.tableName}`;
        const params: unknown[] = [];

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

        const rows = await this.runner.query<{ count: string }>(sql, params);
        return parseInt(rows[0].count, 10);
    }

    public async save(entity: T): Promise<T> {
        const pk = this.primaryColumn();
        const record = entity as Record<string, unknown>;
        const pkValue = record[pk.propertyKey];

        return typeof pkValue === 'undefined' || pkValue === null
            ? this.insert(record, pk)
            : this.update(record, pk, pkValue);
    }

    async remove(entity: T): Promise<void> {
        const pk = this.primaryColumn();
        const pkValue = (entity as Record<string, unknown>)[pk.propertyKey];

        if (typeof pkValue === 'undefined' || pkValue === null) {
            throw new Error(`Cannot remove "${this.metadata.className}" without a primary key value`);
        }

        await this.runner.query(
            `DELETE FROM ${this.metadata.tableName} WHERE ${pk.databaseName} = $1`,
            [pkValue],
        );
    }

    private async insert(record: Record<string, unknown>, pk: IColumnMetadata): Promise<T> {
        const isIdentity = pk.generation?.strategy === 'identity';

        if (!isIdentity && pk.generation) {
            record[pk.propertyKey] = this.generatePk(pk.generation);
        }

        const columns = this.metadata.columns.filter(c => !c.primary || !isIdentity);
        const names = columns.map(c => c.databaseName);
        const values = columns.map(c => record[c.propertyKey]);
        const placeholders = values.map((_, i) => `$${i + 1}`);

        const rows = await this.runner.query<Record<string, unknown>>(
            `INSERT INTO ${this.metadata.tableName} (${names.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
            values,
        );

        return this.hydrate(rows[0]);
    }

    private async update(record: Record<string, unknown>, pk: IColumnMetadata, pkValue: unknown): Promise<T> {
        const columns = this.metadata.columns.filter(c => !c.primary);
        const setClauses = columns.map((c, i) => `${c.databaseName} = $${i + 1}`);
        const values = columns.map(c => record[c.propertyKey]);

        const rows = await this.runner.query<Record<string, unknown>>(
            `UPDATE ${this.metadata.tableName} SET ${setClauses.join(', ')} WHERE ${pk.databaseName} = $${columns.length + 1} RETURNING *`,
            [...values, pkValue],
        );

        return this.hydrate(rows[0]);
    }

    private primaryColumn(): IColumnMetadata {
        const pk = this.metadata.columns.find(c => c.primary);
        if (!pk) throw new Error(`No primary column defined on "${this.metadata.className}". Did you add @PrimaryColumn?`);
        return pk;
    }

    private generatePk(generation: IGenerationOptions): string | number {
        switch (generation.strategy) {
            case 'uuid_v4': return generateUuidV4();
            case 'uuid_v7': return generateUuidV7();
            case 'custom': {
                if (!generation.generate) throw new Error('custom strategy requires a generate() function');
                return generation.generate();
            }
            case 'identity':
                throw new Error('identity strategy is managed by the database and cannot generate a value');
        }
    }

    private buildWhereGroup(condition: Record<string, unknown>, params: unknown[]): string[] {
        const clauses: string[] = [];

        for (const [key, value] of Object.entries(condition)) {
            const column = this.metadata.columns.find(c => c.propertyKey === key);
            if (!column) continue;

            if (isOperator(value)) {
                const { sql, params: opParams } = value.buildClause(column.databaseName, params.length + 1);
                clauses.push(sql);
                params.push(...opParams);
            } else {
                params.push(value);
                clauses.push(`${column.databaseName} = $${params.length}`);
            }
        }

        return clauses;
    }

    private hydrate(row: Record<string, unknown>): T {
        const instance = new this.target();

        for (const column of this.metadata.columns) {
            if (column.databaseName in row) {
                (instance as Record<string, unknown>)[column.propertyKey] = row[column.databaseName];
            }
        }

        return instance;
    }
}
