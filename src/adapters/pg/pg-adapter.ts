import { Pool, PoolClient, types } from 'pg';
import { IConnectionOptions } from '../../connection/connection-options';
import { QueryError } from '../../errors';
import { INamedQuery } from '../../interfaces/query-runner';
import { ITransactionRunner } from '../../interfaces/transaction-runner';
import { IDriverAdapter } from '../adapter';

const RAW_STRING = (val: string) => val;
const ARRAY_QUERY_TYPES = {
    getTypeParser: (typeId: number, format?: 'text' | 'binary') => {
        if (
            typeId === types.builtins.TIMESTAMPTZ ||
            typeId === types.builtins.TIMESTAMP ||
            typeId === types.builtins.DATE ||
            typeId === types.builtins.INTERVAL ||
            typeId === 1231 || typeId === 1115 || typeId === 1185 || typeId === 1187 || typeId === 1182
        ) return RAW_STRING;
        return types.getTypeParser(typeId, format);
    },
};

class PgTransactionRunner implements ITransactionRunner {
    constructor(private readonly client: PoolClient) {}

    public async query<T = unknown>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        const result = typeof input === 'string'
            ? params && params.length > 0
                ? await this.client.query(input, params)
                : await this.client.query(input)
            : await this.client.query(input);
        return result.rows as Array<T>;
    }

    public async queryArray<T extends unknown[] = unknown[]>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        const config = typeof input === 'string'
            ? { text: input, rowMode: 'array' as const, types: ARRAY_QUERY_TYPES, ...(params && params.length > 0 ? { values: params } : {}) }
            : { ...input, rowMode: 'array' as const, types: ARRAY_QUERY_TYPES };
        const result = await this.client.query(config);
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
                ? { connectionString: options.url, ssl: options.ssl }
                : {
                    host: options.host,
                    port: options.port,
                    database: options.database,
                    user: options.user,
                    password: options.password,
                    ssl: options.ssl,
                },
        );
    }

    public async query<T = unknown>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        if (!this.pool) throw new Error('Not connected');
        const sqlText = typeof input === 'string' ? input : input.text;
        try {
            const result = typeof input === 'string'
                ? params && params.length > 0
                    ? await this.pool.query(input, params)
                    : await this.pool.query(input)
                : await this.pool.query(input);
            return result.rows as Array<T>;
        } catch (error) {
            throw new QueryError(sqlText, error);
        }
    }

    public async queryArray<T extends unknown[] = unknown[]>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        if (!this.pool) throw new Error('Not connected');
        const sqlText = typeof input === 'string' ? input : input.text;
        try {
            const config = typeof input === 'string'
                ? { text: input, rowMode: 'array' as const, types: ARRAY_QUERY_TYPES, ...(params && params.length > 0 ? { values: params } : {}) }
                : { ...input, rowMode: 'array' as const, types: ARRAY_QUERY_TYPES };
            const result = await this.pool.query(config);
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
