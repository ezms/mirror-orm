import { INamedQuery, IQueryRunner } from '../interfaces/query-runner';
import { ITransactionRunner } from '../interfaces/transaction-runner';
import { ILogger } from './logger.interface';

export class LoggingQueryRunner implements IQueryRunner {
    constructor(
        protected readonly runner: IQueryRunner,
        protected readonly logger: ILogger,
    ) {}

    public async query<T = unknown>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        const sql = typeof input === 'string' ? input : input.text;
        const values = typeof input === 'string' ? params : input.values;
        this.logger.query(sql, values);
        return this.runner.query<T>(input, params);
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
