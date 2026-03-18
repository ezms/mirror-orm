import { MysqlAdapter } from '../adapters/mysql/mysql-adapter';
import { MssqlAdapter } from '../adapters/mssql/mssql-adapter';
import { PostgresAdapter } from '../adapters/pg/pg-adapter';
import { SqliteAdapter } from '../adapters/sqlite/sqlite-adapter';
import { transactionStore } from '../context/transaction-store';
import { MySQLDialect, MssqlDialect, PostgresDialect, SQLiteDialect } from '../dialects';
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
        if (options.adapter.queryStream) {
            this.queryStream = (sql, params) => options.adapter.queryStream!(sql, params);
        }
    }

    public static async create(options: IConnectionOptions): Promise<Connection> {
        await options.adapter.connect(options);
        if (options.replicaAdapter) {
            await options.replicaAdapter.connect(options);
        }
        return new Connection(options);
    }

    public static async postgres(config: IConnectionConfig): Promise<Connection> {
        const adapter = new PostgresAdapter();
        const replicaAdapter = config.replica ? new PostgresAdapter() : undefined;
        if (replicaAdapter) await replicaAdapter.connect({ ...config, ...config.replica, adapter: replicaAdapter });
        return Connection.create({ ...config, adapter, replicaAdapter, dialect: new PostgresDialect() });
    }

    public static async sqlite(config: IConnectionConfig): Promise<Connection> {
        return Connection.create({ ...config, adapter: new SqliteAdapter(), dialect: new SQLiteDialect() });
    }

    public static async mysql(config: IConnectionConfig): Promise<Connection> {
        const adapter = new MysqlAdapter();
        const replicaAdapter = config.replica ? new MysqlAdapter() : undefined;
        if (replicaAdapter) await replicaAdapter.connect({ ...config, ...config.replica, adapter: replicaAdapter });
        return Connection.create({ ...config, adapter, replicaAdapter, dialect: new MySQLDialect() });
    }

    public static async sqlServer(config: IConnectionConfig): Promise<Connection> {
        const adapter = new MssqlAdapter();
        const replicaAdapter = config.replica ? new MssqlAdapter() : undefined;
        if (replicaAdapter) await replicaAdapter.connect({ ...config, ...config.replica, adapter: replicaAdapter });
        return Connection.create({ ...config, adapter, replicaAdapter, dialect: new MssqlDialect() });
    }

    public static fromRunner(runner: IQueryRunner): Pick<Connection, 'getRepository'> {
        return new Connection({ adapter: { connect: async () => {}, query: runner.query.bind(runner), acquireTransactionRunner: async () => { throw new Error('transactions not supported on fromRunner'); }, disconnect: async () => {} } });
    }

    public async query<T = unknown>(sql: string, params?: Array<unknown>): Promise<Array<T>> {
        return this.options.adapter.query<T>(sql, params);
    }

    public queryArray?: IQueryRunner['queryArray'];
    public queryStream?: IQueryRunner['queryStream'];

    public getRepository<T>(target: new () => T): Repository<T> {
        const replicaRunner = this.options.replicaAdapter
            ? this.withLogger({ query: (sql, params) => this.options.replicaAdapter!.query(sql as string, params) })
            : undefined;
        return new Repository(this.getOrCompile(target), this.withLogger(this), true, replicaRunner);
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
        await this.options.replicaAdapter?.disconnect();
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
