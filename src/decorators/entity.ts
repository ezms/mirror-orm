import { IColumnMetadata } from '../interfaces/column-metadata';
import { registry } from '../metadata/registry';
import { COLUMNS_KEY } from '../metadata/symbols';

type EntityDecorator = <T extends new (...args: Array<any>) => any>(value: T, context: ClassDecoratorContext) => void;

type EntityFactory = {
    <T extends new (...args: Array<any>) => any>(value: T, context: ClassDecoratorContext): void;
    (tableName: string): EntityDecorator;
    (): EntityDecorator;
};

const applyEntity = (tableName: string | undefined, context: ClassDecoratorContext): void => {
    const className = String(context.name);
    const columns = (context.metadata?.[COLUMNS_KEY] as Array<IColumnMetadata> | undefined) ?? [];

    registry.registerEntity(className, {
        tableName: tableName ?? className,
        className,
        columns,
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
