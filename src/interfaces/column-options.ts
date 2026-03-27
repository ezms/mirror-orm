export type ColumnType =
    | 'number'
    | 'bigint'
    | 'boolean'
    | 'datetime'
    | 'date'
    | 'iso'
    | 'string'
    | 'json'
    | 'buffer';

export interface IColumnOptions {
    name?: string;
    nullable?: boolean;
    type?: ColumnType;
    select?: boolean;
}
