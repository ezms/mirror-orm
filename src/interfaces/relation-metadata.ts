export type RelationType = 'many-to-one' | 'one-to-many' | 'one-to-one' | 'many-to-many';
export type CascadeType = 'insert' | 'update' | 'remove';

export interface IRelationMetadata {
    propertyKey: string;
    type: RelationType;
    target: () => new () => unknown;
    foreignKey: string;
    joinTable?: string;
    inverseFk?: string;
    cascade?: boolean | Array<CascadeType>;
}
