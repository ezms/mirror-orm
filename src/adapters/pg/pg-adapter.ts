import { Pool } from 'pg';
import { IConnectionOptions } from '../../connection/connection-options';
import { IDriverAdapter } from '../adapter';

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

    public async query<T = unknown>(sql: string, params?: Array<unknown>): Promise<Array<T>> {
        if (!this.pool) throw new Error('Not connected');
        const result = await this.pool.query(sql, params);
        return result.rows as Array<T>;
    }

    public async disconnect(): Promise<void> {
        await this.pool?.end();
        this.pool = null;
    }
}
