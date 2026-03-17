import { CascadeType, IRelationMetadata } from '../interfaces/relation-metadata';
import { RELATIONS_KEY } from '../metadata/symbols';

export const OneToOne = (
    target: () => new () => unknown,
    foreignKey: string,
    options?: { cascade?: boolean | Array<CascadeType> },
) => (_value: undefined, context: ClassFieldDecoratorContext): void => {
    const relation: IRelationMetadata = {
        propertyKey: String(context.name),
        type: 'one-to-one',
        target,
        foreignKey,
        cascade: options?.cascade,
    };
    if (!context.metadata) return;
    (context.metadata[RELATIONS_KEY] as Array<IRelationMetadata> | undefined) ??= [];
    (context.metadata[RELATIONS_KEY] as Array<IRelationMetadata>).push(relation);
};
