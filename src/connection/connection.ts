import { PgAdapter } from '../adapters/pg/pg-adapter';
import { registry } from '../metadata/registry';
import { Repository } from '../repository/repository';
import { IConnectionConfig, IConnectionOptions } from './connection-options';

export class Connection {
    private constructor(private readonly options: IConnectionOptions) {}

    public static async create(options: IConnectionOptions): Promise<Connection> {
        await options.adapter.connect(options);
        return new Connection(options);
    }

    public static async postgres(config: IConnectionConfig): Promise<Connection> {
        return Connection.create({ ...config, adapter: new PgAdapter() });
    }

    public async query<T = unknown>(sql: string, params?: Array<unknown>): Promise<Array<T>> {
        return this.options.adapter.query<T>(sql, params);
    }

    public getRepository<T>(target: new () => T): Repository<T> {
        const metadata = registry.getEntity(target.name);
        if (!metadata) throw new Error(`Entity "${target.name}" not registered. Did you add @Entity?`);
        return new Repository(target, this, metadata);
    }

    public async disconnect(): Promise<void> {
        await this.options.adapter.disconnect();
    }
}
