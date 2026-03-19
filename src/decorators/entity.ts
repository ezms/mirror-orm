import { IColumnMetadata } from '../interfaces/column-metadata';
import { IRelationMetadata } from '../interfaces/relation-metadata';
import { registry } from '../metadata/registry';
import { COLUMNS_KEY, HOOKS_KEY, RELATIONS_KEY } from '../metadata/symbols';

type EntityDecorator = <T extends new (...args: Array<any>) => any>(value: T, context: ClassDecoratorContext) => void;

export type EntityOptions = {
    tableName?: string;
    filters?: Record<string, Record<string, unknown>>;
};

type EntityFactory = {
    <T extends new (...args: Array<any>) => any>(value: T, context: ClassDecoratorContext): void;
    (options: EntityOptions): EntityDecorator;
    (tableName: string): EntityDecorator;
    (): EntityDecorator;
};

const applyEntity = (arg: string | EntityOptions | undefined, context: ClassDecoratorContext): void => {
    const className = String(context.name);
    const columns = (context.metadata?.[COLUMNS_KEY] as Array<IColumnMetadata> | undefined) ?? [];
    const relations = (context.metadata?.[RELATIONS_KEY] as Array<IRelationMetadata> | undefined) ?? [];
    const rawHooks = (context.metadata?.[HOOKS_KEY] as Record<string, Array<string>> | undefined) ?? {};

    const tableName = typeof arg === 'object' ? arg.tableName : arg;
    const filters   = typeof arg === 'object' ? arg.filters   : undefined;

    registry.registerEntity(className, {
        tableName: tableName ?? className.toLowerCase(),
        className,
        columns,
        relations,
        hooks: {
            beforeInsert: rawHooks.beforeInsert ?? [],
            beforeUpdate: rawHooks.beforeUpdate ?? [],
            afterLoad:    rawHooks.afterLoad    ?? [],
        },
        filters,
    });
};

export const Entity = ((
    arg?: string | EntityOptions | (new (...args: Array<any>) => any),
    context?: ClassDecoratorContext,
): EntityDecorator | void => {
    if (context) {
        applyEntity(undefined, context);
        return;
    }
    return (_value: new (...args: Array<any>) => any, ctx: ClassDecoratorContext) =>
        applyEntity(arg as string | EntityOptions | undefined, ctx);
}) as EntityFactory;
