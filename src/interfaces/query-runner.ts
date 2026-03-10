export interface IQueryRunner {
    query<T = unknown>(sql: string, params?: Array<unknown>): Promise<Array<T>>;
}
