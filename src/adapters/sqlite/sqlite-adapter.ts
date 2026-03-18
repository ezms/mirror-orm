import Database, { Database as DatabaseType } from 'better-sqlite3';
import { IConnectionOptions } from '../../connection/connection-options';
import { QueryError } from '../../errors';
import { INamedQuery } from '../../interfaces/query-runner';
import { ITransactionRunner } from '../../interfaces/transaction-runner';
import { IDriverAdapter } from '../adapter';

function resolveParams(input: string | INamedQuery, params?: Array<unknown>): Array<unknown> {
    if (params && params.length > 0) return params;
    if (typeof input === 'object' && input.values && input.values.length > 0) return input.values;
    return [];
}

class SqliteTransactionRunner implements ITransactionRunner {
    constructor(private readonly db: DatabaseType) {}

    public async query<T = unknown>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        const sql = typeof input === 'string' ? input : input.text;
        const p = resolveParams(input, params);
        try {
            const stmt = this.db.prepare(sql);
            if (stmt.reader) {
                return stmt.all(...p) as Array<T>;
            }
            stmt.run(...p);
            return [] as Array<T>;
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async queryArray<T extends Array<unknown> = Array<unknown>>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        const sql = typeof input === 'string' ? input : input.text;
        const p = resolveParams(input, params);
        try {
            return this.db.prepare(sql).raw().all(...p) as Array<T>;
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async commit(): Promise<void> {
        this.db.prepare('COMMIT').run();
    }

    public async rollback(): Promise<void> {
        this.db.prepare('ROLLBACK').run();
    }

    public release(): void {
        // nothing to release — SQLite is single-connection
    }
}

export class SqliteAdapter implements IDriverAdapter {
    private db: DatabaseType | null = null;

    public async connect(options: IConnectionOptions): Promise<void> {
        const file = options.database ?? options.url ?? ':memory:';
        this.db = new Database(file);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
    }

    public async query<T = unknown>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        if (!this.db) throw new Error('Not connected');
        const sql = typeof input === 'string' ? input : input.text;
        const p = resolveParams(input, params);
        try {
            const stmt = this.db.prepare(sql);
            if (stmt.reader) {
                return stmt.all(...p) as Array<T>;
            }
            stmt.run(...p);
            return [] as Array<T>;
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async queryArray<T extends Array<unknown> = Array<unknown>>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        if (!this.db) throw new Error('Not connected');
        const sql = typeof input === 'string' ? input : input.text;
        const p = resolveParams(input, params);
        try {
            return this.db.prepare(sql).raw().all(...p) as Array<T>;
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async *queryStream(sql: string, params?: Array<unknown>): AsyncIterable<Array<unknown>> {
        if (!this.db) throw new Error('Not connected');
        try {
            const iter = this.db.prepare(sql).raw().iterate(...(params ?? []));
            for (const row of iter) {
                yield row as Array<unknown>;
            }
        } catch (error) {
            throw new QueryError(sql, error);
        }
    }

    public async acquireTransactionRunner(): Promise<ITransactionRunner> {
        if (!this.db) throw new Error('Not connected');
        this.db.prepare('BEGIN').run();
        return new SqliteTransactionRunner(this.db);
    }

    public async disconnect(): Promise<void> {
        this.db?.close();
        this.db = null;
    }
}
