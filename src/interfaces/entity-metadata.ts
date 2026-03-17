import { IColumnMetadata } from "./column-metadata";
import { IEntityHooks } from "./entity-hooks";
import { IRelationMetadata } from "./relation-metadata";

export interface IEntityMetadata {
    tableName: string;
    className: string;
    columns: Array<IColumnMetadata>;
    relations: Array<IRelationMetadata>;
    hooks: IEntityHooks;
}
