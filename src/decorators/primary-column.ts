import { IColumnMetadata } from '../interfaces/column-metadata';
import { IPrimaryColumnOptions } from '../interfaces/primary-column-options';
import { COLUMNS_KEY } from '../metadata/symbols';

type PrimaryColumnDecorator = (
    _value: undefined,
    context: ClassFieldDecoratorContext,
) => void;

type PrimaryColumnFactory = {
    (_value: undefined, context: ClassFieldDecoratorContext): void;
    (options: IPrimaryColumnOptions): PrimaryColumnDecorator;
    (): PrimaryColumnDecorator;
};

const applyPrimaryColumn = (
    options: IPrimaryColumnOptions | undefined,
    context: ClassFieldDecoratorContext,
): void => {
    const columnName = options?.name ?? String(context.name);

    const column: IColumnMetadata = {
        propertyKey: String(context.name),
        databaseName: columnName,
        options: options?.type ? { type: options.type } : {},
        primary: true,
        generation: options?.strategy
            ? { strategy: options.strategy, generate: options.generate }
            : undefined,
    };

    /* v8 ignore next */
    if (!context.metadata) return;
    /* v8 ignore next */
    (context.metadata[COLUMNS_KEY] as Array<IColumnMetadata> | undefined) ??=
        [];
    (context.metadata[COLUMNS_KEY] as Array<IColumnMetadata>).push(column);
};

export const PrimaryColumn = ((
    arg?: IPrimaryColumnOptions | undefined,
    context?: ClassFieldDecoratorContext,
): PrimaryColumnDecorator | void => {
    if (context) {
        applyPrimaryColumn(undefined, context);
        return;
    }
    return (_value, ctx) => applyPrimaryColumn(arg, ctx);
}) as PrimaryColumnFactory;
