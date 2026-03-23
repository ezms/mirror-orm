import { IColumnMetadata } from '../interfaces/column-metadata';
import { COLUMNS_KEY } from '../metadata/symbols';

type DeletedAtDecorator = (
    _value: undefined,
    context: ClassFieldDecoratorContext,
) => void;

type DeletedAtFactory = {
    (_value: undefined, context: ClassFieldDecoratorContext): void;
    (dbName?: string): DeletedAtDecorator;
};

const applyDeletedAt = (
    dbName: string | undefined,
    context: ClassFieldDecoratorContext,
): void => {
    const column: IColumnMetadata = {
        propertyKey: String(context.name),
        databaseName: dbName ?? 'deleted_at',
        options: { type: 'datetime' },
        primary: false,
        deletedAt: true,
    };
    /* v8 ignore next */
    if (!context.metadata) return;
    /* v8 ignore next */
    (context.metadata[COLUMNS_KEY] as Array<IColumnMetadata> | undefined) ??=
        [];
    (context.metadata[COLUMNS_KEY] as Array<IColumnMetadata>).push(column);
};

export const DeletedAt = ((
    arg?: string | undefined,
    context?: ClassFieldDecoratorContext,
): DeletedAtDecorator | void => {
    if (context) {
        applyDeletedAt(undefined, context);
        return;
    }
    return (_value, ctx) => applyDeletedAt(arg, ctx);
}) as DeletedAtFactory;
