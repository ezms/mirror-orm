import { IColumnMetadata } from "./column-metadata";
import { IRelationMetadata } from "./relation-metadata";

export interface IEntityMetadata {
    tableName: string;
    className: string;
    columns: Array<IColumnMetadata>;
    relations: Array<IRelationMetadata>;
}
