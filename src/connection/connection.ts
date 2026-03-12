import { PgAdapter } from '../adapters/pg/pg-adapter';
import { IQueryRunner } from '../interfaces/query-runner';
import { LoggingQueryRunner, LoggingTransactionRunner } from '../logger/logging-runner';
import { registry } from '../metadata/registry';
import { Repository } from '../repository/repository';
import { IConnectionConfig, IConnectionOptions } from './connection-options';
import { TransactionContext } from './transaction-context';

export class Connection {
    private constructor(private readonly options: IConnectionOptions) {}

    public static async create(options: IConnectionOptions): Promise<Connection> {
        await options.adapter.connect(options);
        return new Connection(options);
    }

    public static async postgres(config: IConnectionConfig): Promise<Connection> {
        return Connection.create({ ...config, adapter: new PgAdapter() });
    }

    public static fromRunner(runner: IQueryRunner): Pick<Connection, 'getRepository'> {
        return new Connection({ adapter: { connect: async () => {}, query: runner.query.bind(runner), acquireTransactionRunner: async () => { throw new Error('transactions not supported on fromRunner'); }, disconnect: async () => {} } });
    }

    public async query<T = unknown>(sql: string, params?: Array<unknown>): Promise<Array<T>> {
        return this.options.adapter.query<T>(sql, params);
    }

    public getRepository<T>(target: new () => T): Repository<T> {
        const metadata = registry.getEntity(target.name);
        if (!metadata) throw new Error(`Entity "${target.name}" not registered. Did you add @Entity?`);
        return new Repository(target, this.withLogger(this), metadata);
    }

    public async transaction<R>(callback: (trx: TransactionContext) => Promise<R>): Promise<R> {
        const runner = await this.options.adapter.acquireTransactionRunner();
        const loggingRunner = this.options.logger
            ? new LoggingTransactionRunner(runner, this.options.logger)
            : runner;
        try {
            const result = await callback(new TransactionContext(loggingRunner));
            await runner.commit();
            return result;
        } catch (error) {
            await runner.rollback();
            throw error;
        } finally {
            runner.release();
        }
    }

    public async disconnect(): Promise<void> {
        await this.options.adapter.disconnect();
    }

    private withLogger(runner: IQueryRunner): IQueryRunner {
        return this.options.logger
            ? new LoggingQueryRunner(runner, this.options.logger)
            : runner;
    }
}
