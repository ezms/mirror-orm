export type RelationType = 'many-to-one' | 'one-to-many';

export interface IRelationMetadata {
    propertyKey: string;
    type: RelationType;
    target: () => new () => unknown;
    foreignKey: string;
}
