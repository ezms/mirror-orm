import { IRelationMetadata } from '../interfaces/relation-metadata';
import { RELATIONS_KEY } from '../metadata/symbols';

export const ManyToMany = (
    target: () => new () => unknown,
    joinTable: string,
    ownerFk: string,
    inverseFk: string,
) => (_value: undefined, context: ClassFieldDecoratorContext): void => {
    const relation: IRelationMetadata = {
        propertyKey: String(context.name),
        type: 'many-to-many',
        target,
        foreignKey: ownerFk,
        joinTable,
        inverseFk,
    };
    /* v8 ignore next */
    if (!context.metadata) return;
    /* v8 ignore next */
    (context.metadata[RELATIONS_KEY] as Array<IRelationMetadata> | undefined) ??= [];
    (context.metadata[RELATIONS_KEY] as Array<IRelationMetadata>).push(relation);
};
