import { IEntityMetadata } from '../interfaces/entity-metadata';
import { IQueryRunner } from '../interfaces/query-runner';

export class Repository<T> {
    constructor(
        private readonly target: new () => T,
        private readonly runner: IQueryRunner,
        private readonly metadata: IEntityMetadata,
    ) {}

    async findAll(): Promise<Array<T>> {
        const rows = await this.runner.query<Record<string, unknown>>(
            `SELECT * FROM ${this.metadata.tableName}`,
        );
        return rows.map(row => this.hydrate(row));
    }

    async findById(id: number | string): Promise<T | null> {
        const pk = this.metadata.columns.find(col => col.propertyKey === 'id');
        const pkColumn = pk?.databaseName ?? 'id';

        const rows = await this.runner.query<Record<string, unknown>>(
            `SELECT * FROM ${this.metadata.tableName} WHERE ${pkColumn} = $1`,
            [id],
        );

        return rows.length > 0 ? this.hydrate(rows[0]) : null;
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
