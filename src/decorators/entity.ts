import { IColumnMetadata } from '../interfaces/column-metadata';
import { IRelationMetadata } from '../interfaces/relation-metadata';
import { registry } from '../metadata/registry';
import { COLUMNS_KEY, RELATIONS_KEY } from '../metadata/symbols';

type EntityDecorator = <T extends new (...args: Array<any>) => any>(value: T, context: ClassDecoratorContext) => void;

type EntityFactory = {
    <T extends new (...args: Array<any>) => any>(value: T, context: ClassDecoratorContext): void;
    (tableName: string): EntityDecorator;
    (): EntityDecorator;
};

const applyEntity = (tableName: string | undefined, context: ClassDecoratorContext): void => {
    const className = String(context.name);
    const columns = (context.metadata?.[COLUMNS_KEY] as Array<IColumnMetadata> | undefined) ?? [];
    const relations = (context.metadata?.[RELATIONS_KEY] as Array<IRelationMetadata> | undefined) ?? [];

    registry.registerEntity(className, {
        tableName: tableName ?? className,
        className,
        columns,
        relations,
    });
};

export const Entity = ((
    arg?: string | (new (...args: Array<any>) => any),
    context?: ClassDecoratorContext,
): EntityDecorator | void => {
    if (context) {
        applyEntity(undefined, context);
        return;
    }
    return (_value: new (...args: Array<any>) => any, ctx: ClassDecoratorContext) =>
        applyEntity(arg as string | undefined, ctx);
}) as EntityFactory;
