import { IDriverAdapter } from '../adapters/adapter';
import type { IDialect } from '../dialects';
import type { ILogger } from '../logger/logger.interface';

export interface ISslOptions {
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
}

export interface IPoolOptions {
    /** Maximum number of connections in the pool. Default varies by driver (usually 10). */
    max?: number;
    /** How long (ms) an idle connection stays open before being released. */
    idleTimeoutMs?: number;
    /** How long (ms) to wait for an available connection from the pool before throwing. */
    acquireTimeoutMs?: number;
    /** TCP connection timeout (ms). Applied during initial handshake with the database server. */
    connectTimeoutMs?: number;
    /** Maximum time (ms) a single query is allowed to run before being cancelled by the server. */
    queryTimeoutMs?: number;
}

export type IReplicaConfig = {
    url?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    ssl?: boolean | ISslOptions;
    pool?: IPoolOptions;
};

export interface IConnectionOptions {
    adapter: IDriverAdapter;
    replicaAdapter?: IDriverAdapter;
    dialect?: IDialect;
    url?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    ssl?: boolean | ISslOptions;
    pool?: IPoolOptions;
    logger?: ILogger;
}

export type IConnectionConfig = Omit<
    IConnectionOptions,
    'adapter' | 'replicaAdapter'
> & {
    replica?: IReplicaConfig;
};
