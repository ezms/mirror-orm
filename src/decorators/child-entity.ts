import { IColumnMetadata } from '../interfaces/column-metadata';
import { IRelationMetadata } from '../interfaces/relation-metadata';
import { registry } from '../metadata/registry';
import { COLUMNS_KEY, HOOKS_KEY, RELATIONS_KEY } from '../metadata/symbols';

export const ChildEntity = (discriminatorValue: string) =>
    <T extends new (...args: Array<any>) => any>(value: T, context: ClassDecoratorContext): void => {
        const className    = String(context.name);
        const childColumns = (context.metadata?.[COLUMNS_KEY] as Array<IColumnMetadata>  | undefined) ?? [];
        const childRels    = (context.metadata?.[RELATIONS_KEY] as Array<IRelationMetadata> | undefined) ?? [];
        const rawHooks     = (context.metadata?.[HOOKS_KEY] as Record<string, Array<string>> | undefined) ?? {};

        const parentClass = Object.getPrototypeOf(value) as new (...args: Array<any>) => any;
        const parentMeta  = registry.getEntity(parentClass.name);
        if (!parentMeta) throw new Error(`@ChildEntity: parent "${parentClass.name}" has no @Entity registration.`);
        if (!parentMeta.discriminatorColumn) throw new Error(`@ChildEntity: parent "${parentClass.name}" has no discriminatorColumn.`);

        // Parent columns + child-only columns (child overrides if same propertyKey)
        const parentCols = parentMeta.columns.filter(p => !childColumns.some(c => c.propertyKey === p.propertyKey));
        const allColumns = [...parentCols, ...childColumns];

        registry.registerEntity(className, {
            tableName:           parentMeta.tableName,
            className,
            columns:             allColumns,
            relations:           [...parentMeta.relations, ...childRels],
            hooks: {
                beforeInsert: rawHooks.beforeInsert ?? parentMeta.hooks?.beforeInsert ?? [],
                beforeUpdate: rawHooks.beforeUpdate ?? parentMeta.hooks?.beforeUpdate ?? [],
                afterLoad:    rawHooks.afterLoad    ?? parentMeta.hooks?.afterLoad    ?? [],
            },
            filters:             parentMeta.filters,
            discriminatorColumn: parentMeta.discriminatorColumn,
            discriminatorValue,
            stiParent:           parentClass.name,
        });

        registry.registerStiChild(parentClass.name, discriminatorValue, value as new () => unknown);
    };
