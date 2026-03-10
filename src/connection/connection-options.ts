import { IDriverAdapter } from '../adapters/adapter';

export interface IConnectionOptions {
    adapter: IDriverAdapter;
    url?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
}

export type IConnectionConfig = Omit<IConnectionOptions, 'adapter'>;
