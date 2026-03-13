import { Pool, PoolClient } from 'pg';
import { IConnectionOptions } from '../../connection/connection-options';
import { QueryError } from '../../errors';
import { INamedQuery } from '../../interfaces/query-runner';
import { ITransactionRunner } from '../../interfaces/transaction-runner';
import { IDriverAdapter } from '../adapter';

class PgTransactionRunner implements ITransactionRunner {
    constructor(private readonly client: PoolClient) {}

    public async query<T = unknown>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        const result = typeof input === 'string'
            ? await this.client.query(input, params)
            : await this.client.query(input);
        return result.rows as Array<T>;
    }

    public async commit(): Promise<void> {
        await this.client.query('COMMIT');
    }

    public async rollback(): Promise<void> {
        await this.client.query('ROLLBACK');
    }

    public release(): void {
        this.client.release();
    }
}

export class PgAdapter implements IDriverAdapter {
    private pool: Pool | null = null;

    public async connect(options: IConnectionOptions): Promise<void> {
        this.pool = new Pool(
            options.url
                ? { connectionString: options.url }
                : {
                    host: options.host,
                    port: options.port,
                    database: options.database,
                    user: options.user,
                    password: options.password,
                },
        );
    }

    public async query<T = unknown>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        if (!this.pool) throw new Error('Not connected');
        const sqlText = typeof input === 'string' ? input : input.text;
        try {
            const result = typeof input === 'string'
                ? await this.pool.query(input, params)
                : await this.pool.query(input);
            return result.rows as Array<T>;
        } catch (error) {
            throw new QueryError(sqlText, error);
        }
    }

    public async acquireTransactionRunner(): Promise<ITransactionRunner> {
        if (!this.pool) throw new Error('Not connected');
        const client = await this.pool.connect();
        await client.query('BEGIN');
        return new PgTransactionRunner(client);
    }

    public async disconnect(): Promise<void> {
        await this.pool?.end();
        this.pool = null;
    }
}
