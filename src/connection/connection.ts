import { PgAdapter } from '../adapters/pg/pg-adapter';
import { transactionStore } from '../context/transaction-store';
import { PostgresDialect } from '../dialects';
import { IQueryRunner } from '../interfaces/query-runner';
import { LoggingQueryRunner, LoggingTransactionRunner } from '../logger/logging-runner';
import { registry } from '../metadata/registry';
import { QueryBuilder } from '../query-builder/query-builder';
import { Repository, RepositoryState } from '../repository/repository';
import { IConnectionConfig, IConnectionOptions } from './connection-options';
import { SavepointRunner } from './savepoint-runner';
import { TransactionContext } from './transaction-context';

export class Connection {
    private readonly repoCache = new Map<string, RepositoryState<unknown>>();

    private constructor(private readonly options: IConnectionOptions) {
        if (options.adapter.queryArray) {
            this.queryArray = (input, params) => options.adapter.queryArray!(input, params);
        }
    }

    public static async create(options: IConnectionOptions): Promise<Connection> {
        await options.adapter.connect(options);
        return new Connection(options);
    }

    public static async postgres(config: IConnectionConfig): Promise<Connection> {
        return Connection.create({ ...config, adapter: new PgAdapter(), dialect: new PostgresDialect() });
    }

    public static fromRunner(runner: IQueryRunner): Pick<Connection, 'getRepository'> {
        return new Connection({ adapter: { connect: async () => {}, query: runner.query.bind(runner), acquireTransactionRunner: async () => { throw new Error('transactions not supported on fromRunner'); }, disconnect: async () => {} } });
    }

    public async query<T = unknown>(sql: string, params?: Array<unknown>): Promise<Array<T>> {
        return this.options.adapter.query<T>(sql, params);
    }

    public queryArray?: IQueryRunner['queryArray'];

    public getRepository<T>(target: new () => T): Repository<T> {
        return new Repository(this.getOrCompile(target), this.withLogger(this));
    }

    private savepointCounter = 0;

    public async transaction<R>(callback: (trx: TransactionContext) => Promise<R>): Promise<R> {
        const activeRunner = transactionStore.getStore();

        if (activeRunner) {
            const name = `mirror_sp_${++this.savepointCounter}`;
            await activeRunner.query(`SAVEPOINT "${name}"`);
            const spRunner = new SavepointRunner(activeRunner, name);
            const repoFactory = <T>(target: new () => T) =>
                new Repository<T>(this.getOrCompile(target), spRunner, false);
            try {
                const result = await transactionStore.run(spRunner, () =>
                    callback(new TransactionContext(spRunner, repoFactory)),
                );
                await spRunner.commit();
                return result;
            } catch (error) {
                await spRunner.rollback();
                throw error;
            }
        }

        const runner = await this.options.adapter.acquireTransactionRunner();
        const loggingRunner = this.options.logger
            ? new LoggingTransactionRunner(runner, this.options.logger)
            : runner;
        try {
            const result = await transactionStore.run(loggingRunner, () =>
                callback(
                    new TransactionContext(
                        loggingRunner,
                        <T>(target: new () => T) => new Repository<T>(this.getOrCompile(target), loggingRunner, false),
                    ),
                ),
            );
            await runner.commit();
            return result;
        } catch (error) {
            await runner.rollback();
            throw error;
        } finally {
            runner.release();
        }
    }

    public createQueryBuilder<T>(entity: new () => T): QueryBuilder<T> {
        const state = this.getOrCompile(entity);
        const adapter = this.options.adapter;
        const runner: IQueryRunner = { query: (sql, params) => adapter.query(sql as string, params) };
        return new QueryBuilder(state, this.withLogger(runner));
    }

    public async disconnect(): Promise<void> {
        await this.options.adapter.disconnect();
    }

    private getOrCompile<T>(target: new () => T): RepositoryState<T> {
        const key = target.name;
        if (this.repoCache.has(key)) {
            return this.repoCache.get(key) as RepositoryState<T>;
        }
        const metadata = registry.getEntity(key);
        if (!metadata) throw new Error(`Entity "${key}" not registered. Did you add @Entity?`);
        const state = new RepositoryState(target, metadata, this.options.dialect);
        this.repoCache.set(key, state as RepositoryState<unknown>);
        return state;
    }

    private withLogger(runner: IQueryRunner): IQueryRunner {
        return this.options.logger
            ? new LoggingQueryRunner(runner, this.options.logger)
            : runner;
    }
}
