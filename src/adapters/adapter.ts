import { IConnectionOptions } from '../connection/connection-options';

export interface IDriverAdapter {
    connect(options: IConnectionOptions): Promise<void>;
    query<T = unknown>(sql: string, params?: Array<unknown>): Promise<Array<T>>;
    disconnect(): Promise<void>;
}
