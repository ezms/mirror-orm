import { IColumnMetadata } from "./column-metadata";
import { IEntityHooks } from "./entity-hooks";
import { IRelationMetadata } from "./relation-metadata";

export interface IEmbedMetadata {
    propertyKey: string;
    prefix: string;
    target: () => new () => unknown;
}

export interface IEntityMetadata {
    tableName: string;
    className: string;
    columns: Array<IColumnMetadata>;
    relations: Array<IRelationMetadata>;
    hooks?: IEntityHooks;
    filters?: Record<string, Record<string, unknown>>;
    embeds?: Array<IEmbedMetadata>;
}
