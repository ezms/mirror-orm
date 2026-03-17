import { IConnectionOptions } from '../connection/connection-options';
import { ITransactionRunner } from '../interfaces/transaction-runner';

export interface IDriverAdapter {
    connect(options: IConnectionOptions): Promise<void>;
    query<T = unknown>(sql: string, params?: Array<unknown>): Promise<Array<T>>;
    queryArray?<T extends unknown[] = unknown[]>(input: string | import('../interfaces/query-runner').INamedQuery, params?: Array<unknown>): Promise<Array<T>>;
    acquireTransactionRunner(): Promise<ITransactionRunner>;
    disconnect(): Promise<void>;
}
