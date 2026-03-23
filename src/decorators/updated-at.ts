import { IColumnMetadata } from '../interfaces/column-metadata';
import { COLUMNS_KEY } from '../metadata/symbols';

type UpdatedAtDecorator = (
    _value: undefined,
    context: ClassFieldDecoratorContext,
) => void;

type UpdatedAtFactory = {
    (_value: undefined, context: ClassFieldDecoratorContext): void;
    (dbName?: string): UpdatedAtDecorator;
};

const applyUpdatedAt = (
    dbName: string | undefined,
    context: ClassFieldDecoratorContext,
): void => {
    const column: IColumnMetadata = {
        propertyKey: String(context.name),
        databaseName: dbName ?? 'updated_at',
        options: { type: 'datetime' },
        primary: false,
        updatedAt: true,
    };
    /* v8 ignore next */
    if (!context.metadata) return;
    /* v8 ignore next */
    (context.metadata[COLUMNS_KEY] as Array<IColumnMetadata> | undefined) ??=
        [];
    (context.metadata[COLUMNS_KEY] as Array<IColumnMetadata>).push(column);
};

export const UpdatedAt = ((
    arg?: string | undefined,
    context?: ClassFieldDecoratorContext,
): UpdatedAtDecorator | void => {
    if (context) {
        applyUpdatedAt(undefined, context);
        return;
    }
    return (_value, ctx) => applyUpdatedAt(arg, ctx);
}) as UpdatedAtFactory;
