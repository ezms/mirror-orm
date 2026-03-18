export interface INamedQuery {
    name: string;
    text: string;
    values?: Array<unknown>;
}

export interface IQueryRunner {
    query<T = unknown>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>>;
    queryArray?<T extends unknown[] = unknown[]>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>>;
    queryStream?(sql: string, params?: Array<unknown>): AsyncIterable<unknown[]>;
}
