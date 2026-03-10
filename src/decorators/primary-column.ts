import { IColumnMetadata } from '../interfaces/column-metadata';
import { IPrimaryColumnOptions } from '../interfaces/primary-column-options';
import { COLUMNS_KEY } from '../metadata/symbols';

type PrimaryColumnDecorator = (_value: undefined, context: ClassFieldDecoratorContext) => void;

type PrimaryColumnFactory = {
    (_value: undefined, context: ClassFieldDecoratorContext): void;
    (options: IPrimaryColumnOptions): PrimaryColumnDecorator;
    (): PrimaryColumnDecorator;
};

const applyPrimaryColumn = (options: IPrimaryColumnOptions | undefined, context: ClassFieldDecoratorContext): void => {
    const columnName = options?.name ?? String(context.name);

    const column: IColumnMetadata = {
        propertyKey: String(context.name),
        databaseName: columnName,
        options: {},
        primary: true,
        generation: options?.strategy
            ? { strategy: options.strategy, generate: options.generate }
            : undefined,
    };

    if (!context.metadata) return;
    (context.metadata[COLUMNS_KEY] as Array<IColumnMetadata> | undefined) ??= [];
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
