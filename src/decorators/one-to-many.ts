import { IRelationMetadata } from '../interfaces/relation-metadata';
import { RELATIONS_KEY } from '../metadata/symbols';

export const OneToMany = (
    target: () => new () => unknown,
    foreignKey: string,
) => (_value: undefined, context: ClassFieldDecoratorContext): void => {
    const relation: IRelationMetadata = {
        propertyKey: String(context.name),
        type: 'one-to-many',
        target,
        foreignKey,
    };
    if (!context.metadata) return;
    (context.metadata[RELATIONS_KEY] as Array<IRelationMetadata> | undefined) ??= [];
    (context.metadata[RELATIONS_KEY] as Array<IRelationMetadata>).push(relation);
};
