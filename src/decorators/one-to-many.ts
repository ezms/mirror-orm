import { CascadeType, IRelationMetadata } from '../interfaces/relation-metadata';
import { RELATIONS_KEY } from '../metadata/symbols';

export const OneToMany = (
    target: () => new () => unknown,
    foreignKey: string,
    options?: { cascade?: boolean | Array<CascadeType> },
) => (_value: undefined, context: ClassFieldDecoratorContext): void => {
    const relation: IRelationMetadata = {
        propertyKey: String(context.name),
        type: 'one-to-many',
        target,
        foreignKey,
        cascade: options?.cascade,
    };
    /* v8 ignore next */
    if (!context.metadata) return;
    /* v8 ignore next */
    (context.metadata[RELATIONS_KEY] as Array<IRelationMetadata> | undefined) ??= [];
    (context.metadata[RELATIONS_KEY] as Array<IRelationMetadata>).push(relation);
};
