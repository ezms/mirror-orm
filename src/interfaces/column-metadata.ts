import { IColumnOptions } from './column-options';
import { IGenerationOptions } from './generation-strategy';

export interface IColumnMetadata {
    propertyKey: string;
    databaseName: string;
    options: IColumnOptions;
    primary: boolean;
    generation?: IGenerationOptions;
    createdAt?: boolean;
    updatedAt?: boolean;
    deletedAt?: boolean;
}
