export type WhereCondition<T> = Partial<Record<keyof T, unknown>>;

export interface IFindOptions<T> {
    where?: WhereCondition<T> | Array<WhereCondition<T>>;
    orderBy?: Partial<Record<keyof T, 'ASC' | 'DESC'>>;
    limit?: number;
    offset?: number;
    relations?: Array<keyof T & string>;
    withDeleted?: boolean;
    select?: Array<keyof T & string>;
    lock?: 'pessimistic_write' | 'pessimistic_read';
}
