import { IColumnMetadata } from '../interfaces/column-metadata';
import { registry } from '../metadata/registry';
import { COLUMNS_KEY } from '../metadata/symbols';

export const Entity = (tableName?: string) => {
    return <T extends new (...args: Array<any>) => any>(_value: T, context: ClassDecoratorContext) => {
        const className = String(context.name);
        const columns = (context.metadata?.[COLUMNS_KEY] as Array<IColumnMetadata> | undefined) ?? [];

        registry.registerEntity(className, {
            tableName: tableName ?? className,
            className,
            columns,
        });
    };
};
