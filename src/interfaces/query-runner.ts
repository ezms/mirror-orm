export interface INamedQuery {
    name: string;
    text: string;
    values?: Array<unknown>;
}

export interface IQueryRunner {
    query<T = unknown>(input: string | INamedQuery, params?: Array<unknown>): Promise<Array<T>>;
}
