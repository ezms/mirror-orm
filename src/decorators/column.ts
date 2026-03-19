import { IColumnMetadata } from '../interfaces/column-metadata';
import { IColumnOptions } from '../interfaces/column-options';
import { COLUMNS_KEY } from '../metadata/symbols';

type ColumnDecorator = (_value: undefined, context: ClassFieldDecoratorContext) => void;

type ColumnFactory = {
    (_value: undefined, context: ClassFieldDecoratorContext): void;
    (name: string): ColumnDecorator;
    (options: IColumnOptions): ColumnDecorator;
    (): ColumnDecorator;
};

const applyColumn = (nameOrOptions: string | IColumnOptions | undefined, context: ClassFieldDecoratorContext): void => {
    let columnName = String(context.name);
    let options: IColumnOptions = {};

    if (typeof nameOrOptions === 'string') {
        columnName = nameOrOptions;
    } else if (nameOrOptions && typeof nameOrOptions === 'object') {
        options = nameOrOptions;
        columnName = options.name ?? columnName;
    }

    const column: IColumnMetadata = {
        propertyKey: String(context.name),
        databaseName: columnName,
        options,
        primary: false,
    };

    /* v8 ignore next */
    if (!context.metadata) return;
    /* v8 ignore next */
    (context.metadata[COLUMNS_KEY] as Array<IColumnMetadata> | undefined) ??= [];
    (context.metadata[COLUMNS_KEY] as Array<IColumnMetadata>).push(column);
};

export const Column = ((
    arg?: string | IColumnOptions | undefined,
    context?: ClassFieldDecoratorContext,
): ColumnDecorator | void => {
    if (context) {
        applyColumn(undefined, context);
        return;
    }
    return (_value, ctx) => applyColumn(arg, ctx);
}) as ColumnFactory;
