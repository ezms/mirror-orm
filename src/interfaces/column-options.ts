export type ColumnType = 'number' | 'bigint' | 'boolean' | 'datetime' | 'date' | 'iso' | 'string';

export interface IColumnOptions {
    name?: string;
    nullable?: boolean;
    type?: ColumnType;
}
