import { IFindOptions } from './find-options';

export type IPaginationOptions<T> = Omit<IFindOptions<T>, 'limit' | 'offset'> & {
    page: number;
    limit: number;
};

export interface IPaginationMeta {
    total: number;
    page: number;
    lastPage: number;
    limit: number;
}

export interface IPaginatedResult<T> {
    data: Array<T>;
    meta: IPaginationMeta;
}
