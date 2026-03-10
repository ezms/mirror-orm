import { IDriverAdapter } from '../adapters/adapter';
import type { ILogger } from '../logger/logger.interface';

export interface IConnectionOptions {
    adapter: IDriverAdapter;
    url?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    logger?: ILogger;
}

export type IConnectionConfig = Omit<IConnectionOptions, 'adapter'>;
