import { IColumnOptions } from './column-options';

export interface IColumnMetadata {
    propertyKey: string;
    databaseName: string;
    options: IColumnOptions;
}
