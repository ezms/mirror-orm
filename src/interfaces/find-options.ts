export interface IFindOptions<T> {
    where?: Partial<Record<keyof T, unknown>>;
    orderBy?: Partial<Record<keyof T, 'ASC' | 'DESC'>>;
    limit?: number;
    offset?: number;
}
