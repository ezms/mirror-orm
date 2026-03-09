import { IColumnMetadata } from "./column-metadata";

export interface IEntityMetadata {
    tableName: string;
    className: string;
    columns: Array<IColumnMetadata>;
}
