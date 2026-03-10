import { ITransactionRunner } from '../interfaces/transaction-runner';
import { registry } from '../metadata/registry';
import { Repository } from '../repository/repository';

export class TransactionContext {
    constructor(private readonly runner: ITransactionRunner) {}

    public getRepository<T>(target: new () => T): Repository<T> {
        const metadata = registry.getEntity(target.name);
        if (!metadata) throw new Error(`Entity "${target.name}" not registered. Did you add @Entity?`);
        return new Repository(target, this.runner, metadata);
    }
}
