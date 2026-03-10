import { IQueryRunner } from './query-runner';

export interface ITransactionRunner extends IQueryRunner {
    commit(): Promise<void>;
    rollback(): Promise<void>;
    release(): void;
}
