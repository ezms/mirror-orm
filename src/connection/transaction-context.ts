import { INamedQuery, IQueryRunner } from '../interfaces/query-runner';
import { ITransactionRunner } from '../interfaces/transaction-runner';
import { Repository } from '../repository/repository';

export class TransactionContext implements IQueryRunner {
    constructor(
        private readonly runner: ITransactionRunner,
        private readonly repoFactory: <T>(target: new () => T) => Repository<T>,
    ) {}

    public query<T = unknown>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>> {
        return this.runner.query<T>(input, params);
    }

    public getRepository<T>(target: new () => T): Repository<T> {
        return this.repoFactory(target);
    }
}
