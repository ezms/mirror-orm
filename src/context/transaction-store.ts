import { AsyncLocalStorage } from 'async_hooks';
import { IQueryRunner } from '../interfaces/query-runner';

export const transactionStore = new AsyncLocalStorage<IQueryRunner>();
