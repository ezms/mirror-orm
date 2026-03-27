import type * as MssqlNS from 'mssql';
import { IConnectionOptions, ISslOptions } from '../../connection/connection-options';
import { QueryError } from '../../errors';
import { INamedQuery } from '../../interfaces/query-runner';
import { ITransactionRunner } from '../../interfaces/transaction-runner';
import { IDriverAdapter } from '../adapter';

type MssqlModule = typeof MssqlNS;

function buildMssqlOptions(ssl: boolean | ISslOptions | undefined): MssqlNS.config['options'] {
    if (ssl === undefined) return { trustServerCertificate: true };
    if (ssl === false) return { encrypt: false, trustServerCertificate: false };
    if (ssl === true) return { encrypt: true, trustServerCertificate: false };
    return {
        encrypt: true,
        trustServerCertificate: ssl.rejectUnauthorized === false,
        cryptoCredentialsDetails: {
            ...(ssl.ca && { ca: ssl.ca }),
            ...(ssl.cert && { cert: ssl.cert }),
            ...(ssl.key && { key: ssl.key }),
        },
    };
}

function resolveParams(input: string | INamedQuery, params?: Array<unknown>): Array<unknown> {
    if (params && params.length > 0) return params;
    if (typeof input === 'object' && input.values && input.values.length > 0) return input.values;
    return [];
}

function addInputs(request: MssqlNS.Request, params: Array<unknown>): void {
    params.forEach((p, i) => request.input(`p${i + 1}`, p));
}

function columnsToOrder(columns: Record<string, { index: number }>): string[] {
    return Object.entries(columns)
        .sort(([, a], [, b]) => a.index - b.index)
        .map(([name]) => name);
}

class MssqlTransactionRunner implements ITransactionRunner {
    constructor(
        private readonly transaction: MssqlNS.Transaction,
        private readonly sql: MssqlModule,
    ) {}

    public async query<T = unknown>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        const sqlText = typeof input === 'string' ? input : input.text;
        const p = resolveParams(input, params);
        try {
            const request = new this.sql.Request(this.transaction);
            addInputs(request, p);
            const result = await request.query<T>(sqlText);
            return result.recordset;
        } catch (error) {
            throw new QueryError(sqlText, error);
        }
    }

    public async queryArray<T extends Array<unknown> = Array<unknown>>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        const sqlText = typeof input === 'string' ? input : input.text;
        const p = resolveParams(input, params);
        try {
            const request = new this.sql.Request(this.transaction);
            addInputs(request, p);
            const result = await request.query(sqlText);
            const colOrder = columnsToOrder(result.recordset.columns as Record<string, { index: number }>);
            return result.recordset.map((row: Record<string, unknown>) => colOrder.map(col => row[col])) as Array<T>;
        } catch (error) {
            throw new QueryError(sqlText, error);
        }
    }

    public async commit(): Promise<void> {
        await this.transaction.commit();
    }

    public async rollback(): Promise<void> {
        await this.transaction.rollback();
    }

    public release(): void {
        // mssql transactions release the connection automatically on commit/rollback
    }
}

export class MssqlAdapter implements IDriverAdapter {
    private pool: MssqlNS.ConnectionPool | null = null;
    private sql: MssqlModule | null = null;

    public async connect(options: IConnectionOptions): Promise<void> {
        this.sql = await import('mssql');
        const config: MssqlNS.config = options.url
            ? { server: options.url } as MssqlNS.config
            : {
                server: options.host ?? 'localhost',
                port: options.port,
                database: options.database,
                user: options.user,
                password: options.password,
                connectionTimeout: options.pool?.connectTimeoutMs,
                requestTimeout: options.pool?.queryTimeoutMs,
                options: buildMssqlOptions(options.ssl),
                pool: {
                    max: options.pool?.max,
                    idleTimeoutMillis: options.pool?.idleTimeoutMs,
                    acquireTimeoutMillis: options.pool?.acquireTimeoutMs,
                },
            };
        this.pool = await new this.sql.ConnectionPool(config).connect();
        if (options.onPoolError) {
            this.pool.on('error', options.onPoolError);
        }
    }

    public async query<T = unknown>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        if (!this.pool || !this.sql) throw new Error('Not connected');
        const sql = typeof input === 'string' ? input : input.text;
        const p = resolveParams(input, params);
        try {
            const request = this.pool.request();
            addInputs(request, p);
            const result = await request.query<T>(sql);
            return result.recordset;
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async queryArray<T extends Array<unknown> = Array<unknown>>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        if (!this.pool) throw new Error('Not connected');
        const sql = typeof input === 'string' ? input : input.text;
        const p = resolveParams(input, params);
        try {
            const request = this.pool.request();
            addInputs(request, p);
            const result = await request.query(sql);
            const colOrder = columnsToOrder(result.recordset.columns as Record<string, { index: number }>);
            return result.recordset.map((row: Record<string, unknown>) => colOrder.map(col => row[col])) as Array<T>;
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async *queryStream(sql: string, params?: Array<unknown>): AsyncIterable<Array<unknown>> {
        if (!this.pool) throw new Error('Not connected');

        const request = this.pool.request();
        addInputs(request, params ?? []);
        request.stream = true;

        const queue: Array<Array<unknown>> = [];
        let colOrder: string[] = [];
        let done = false;
        let streamError: unknown = null;
        let notify: (() => void) | null = null;
        const wake = () => { notify?.(); notify = null; };

        request.on('recordset', (columns: Record<string, { index: number }>) => {
            colOrder = columnsToOrder(columns);
        });
        request.on('row', (row: Record<string, unknown>) => {
            queue.push(colOrder.map(col => row[col]));
            wake();
        });
        request.on('error', (err: unknown) => { streamError = err; wake(); });
        request.on('done', () => { done = true; wake(); });

        request.query(sql);

        try {
            while (true) {
                while (queue.length > 0) yield queue.shift()!;
                if (streamError) throw new QueryError(sql, streamError);
                if (done) break;
                await new Promise<void>(r => { notify = r; });
            }
            while (queue.length > 0) yield queue.shift()!;
        } catch (error) {
            if (error instanceof QueryError) throw error;
            throw new QueryError(sql, error);
        }
    }

    public async acquireTransactionRunner(): Promise<ITransactionRunner> {
        if (!this.pool || !this.sql) throw new Error('Not connected');
        const transaction = new this.sql.Transaction(this.pool);
        await transaction.begin();
        return new MssqlTransactionRunner(transaction, this.sql);
    }

    public async disconnect(): Promise<void> {
        await this.pool?.close();
        this.pool = null;
        this.sql = null;
    }
}
