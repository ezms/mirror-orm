import { IColumnMetadata } from '../interfaces/column-metadata';
import { COLUMNS_KEY } from '../metadata/symbols';

type CreatedAtDecorator = (
    _value: undefined,
    context: ClassFieldDecoratorContext,
) => void;

type CreatedAtFactory = {
    (_value: undefined, context: ClassFieldDecoratorContext): void;
    (dbName?: string): CreatedAtDecorator;
};

const applyCreatedAt = (
    dbName: string | undefined,
    context: ClassFieldDecoratorContext,
): void => {
    const column: IColumnMetadata = {
        propertyKey: String(context.name),
        databaseName: dbName ?? 'created_at',
        options: { type: 'datetime' },
        primary: false,
        createdAt: true,
    };
    /* v8 ignore next */
    if (!context.metadata) return;
    /* v8 ignore next */
    (context.metadata[COLUMNS_KEY] as Array<IColumnMetadata> | undefined) ??=
        [];
    (context.metadata[COLUMNS_KEY] as Array<IColumnMetadata>).push(column);
};

export const CreatedAt = ((
    arg?: string | undefined,
    context?: ClassFieldDecoratorContext,
): CreatedAtDecorator | void => {
    if (context) {
        applyCreatedAt(undefined, context);
        return;
    }
    return (_value, ctx) => applyCreatedAt(arg, ctx);
}) as CreatedAtFactory;
