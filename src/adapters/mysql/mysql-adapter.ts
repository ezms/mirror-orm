import type { Pool, PoolConnection } from 'mysql2/promise';
import { IConnectionOptions } from '../../connection/connection-options';
import { QueryError } from '../../errors';
import { INamedQuery } from '../../interfaces/query-runner';
import { ITransactionRunner } from '../../interfaces/transaction-runner';
import { IDriverAdapter } from '../adapter';

type SqlParams = Array<string | number | boolean | null | Buffer | bigint>;


function resolveParams(input: string | INamedQuery, params?: Array<unknown>): SqlParams {
    if (params && params.length > 0) return params as SqlParams;
    if (typeof input === 'object' && input.values && input.values.length > 0) return input.values as SqlParams;
    return [];
}

class MysqlTransactionRunner implements ITransactionRunner {
    constructor(private readonly conn: PoolConnection) {}

    public async query<T = unknown>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        const sql = typeof input === 'string' ? input : input.text;
        const p = resolveParams(input, params);
        try {
            const [rows] = await this.conn.execute(sql, p);
            return rows as Array<T>;
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async queryArray<T extends Array<unknown> = Array<unknown>>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        const sql = typeof input === 'string' ? input : input.text;
        const p = resolveParams(input, params);
        try {
            const [rows] = await (this.conn as unknown as { query(opts: object): Promise<[Array<T>, unknown]> })
                .query({ sql, rowsAsArray: true, values: p });
            return rows;
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async commit(): Promise<void> {
        await this.conn.commit();
    }

    public async rollback(): Promise<void> {
        await this.conn.rollback();
    }

    public release(): void {
        this.conn.release();
    }
}

export class MysqlAdapter implements IDriverAdapter {
    private pool: Pool | null = null;

    public async connect(options: IConnectionOptions): Promise<void> {
        const mysql = await import('mysql2/promise');
        const ssl = options.ssl === true ? {} : options.ssl === false ? undefined : options.ssl;
        this.pool = mysql.createPool(
            options.url
                ? {
                    uri: options.url,
                    waitForConnections: true,
                    timezone: '+00:00',
                    connectionLimit: options.pool?.max,
                    idleTimeout: options.pool?.idleTimeoutMs,
                    connectTimeout: options.pool?.connectTimeoutMs,
                    ...(ssl !== undefined && { ssl: ssl as object }),
                }
                : {
                    host: options.host,
                    port: options.port,
                    database: options.database,
                    user: options.user,
                    password: options.password,
                    waitForConnections: true,
                    timezone: '+00:00',
                    connectionLimit: options.pool?.max,
                    idleTimeout: options.pool?.idleTimeoutMs,
                    connectTimeout: options.pool?.connectTimeoutMs,
                    ...(ssl !== undefined && { ssl: ssl as object }),
                },
        );
    }

    public async query<T = unknown>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        if (!this.pool) throw new Error('Not connected');
        const sql = typeof input === 'string' ? input : input.text;
        const p = resolveParams(input, params);
        try {
            const [rows] = await this.pool.execute(sql, p);
            return rows as Array<T>;
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async queryArray<T extends Array<unknown> = Array<unknown>>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        if (!this.pool) throw new Error('Not connected');
        const sql = typeof input === 'string' ? input : input.text;
        const p = resolveParams(input, params);
        try {
            const [rows] = await (this.pool as unknown as { query(opts: object): Promise<[Array<T>, unknown]> })
                .query({ sql, rowsAsArray: true, values: p });
            return rows;
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async *queryStream(sql: string, params?: Array<unknown>): AsyncIterable<Array<unknown>> {
        if (!this.pool) throw new Error('Not connected');
        const conn = await this.pool.getConnection();
        try {
            const stream = (conn as unknown as { connection: { query(opts: object): { stream(): AsyncIterable<Array<unknown>> } } })
                .connection.query({ sql, rowsAsArray: true, values: params ?? [] }).stream();
            for await (const row of stream) {
                yield row as Array<unknown>;
            }
        } catch (error) {
            throw new QueryError(sql, error);
        } finally {
            conn.release();
        }
    }

    public async acquireTransactionRunner(): Promise<ITransactionRunner> {
        if (!this.pool) throw new Error('Not connected');
        const conn = await this.pool.getConnection();
        await conn.beginTransaction();
        return new MysqlTransactionRunner(conn);
    }

    public async disconnect(): Promise<void> {
        await this.pool?.end();
        this.pool = null;
    }
}
