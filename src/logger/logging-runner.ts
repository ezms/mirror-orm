import { IQueryRunner } from '../interfaces/query-runner';
import { ITransactionRunner } from '../interfaces/transaction-runner';
import { ILogger } from './logger.interface';

export class LoggingQueryRunner implements IQueryRunner {
    constructor(
        protected readonly runner: IQueryRunner,
        protected readonly logger: ILogger,
    ) {}

    public async query<T = unknown>(sql: string, params?: Array<unknown>): Promise<Array<T>> {
        this.logger.query(sql, params);
        return this.runner.query<T>(sql, params);
    }
}

export class LoggingTransactionRunner extends LoggingQueryRunner implements ITransactionRunner {
    constructor(
        protected readonly runner: ITransactionRunner,
        protected readonly logger: ILogger,
    ) {
        super(runner, logger);
    }

    public commit(): Promise<void> {
        return this.runner.commit();
    }

    public rollback(): Promise<void> {
        return this.runner.rollback();
    }

    public release(): void {
        this.runner.release();
    }
}
