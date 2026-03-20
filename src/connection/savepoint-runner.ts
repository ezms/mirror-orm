import { INamedQuery, IQueryRunner } from '../interfaces/query-runner';
import { ITransactionRunner } from '../interfaces/transaction-runner';

export class SavepointRunner implements ITransactionRunner {
    constructor(
        private readonly inner: IQueryRunner,
        private readonly name: string,
    ) {}

    public query<T = unknown>(
        input: string | INamedQuery,
        params?: Array<unknown>,
    ): Promise<Array<T>> {
        return this.inner.query<T>(input, params);
    }

    public async commit(): Promise<void> {
        await this.inner.query(`RELEASE SAVEPOINT "${this.name}"`);
    }

    public async rollback(): Promise<void> {
        await this.inner.query(`ROLLBACK TO SAVEPOINT "${this.name}"`);
    }

    public release(): void {
        // no-op: connection is owned by the outer transaction
    }
}
