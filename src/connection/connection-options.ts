import { IDriverAdapter } from '../adapters/adapter';
import type { IDialect } from '../dialects';
import type { ILogger } from '../logger/logger.interface';

export interface IConnectionOptions {
    adapter: IDriverAdapter;
    dialect?: IDialect;
    url?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    logger?: ILogger;
}

export type IConnectionConfig = Omit<IConnectionOptions, 'adapter'>;
