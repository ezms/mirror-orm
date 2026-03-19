import { IColumnMetadata } from '../interfaces/column-metadata';
import { COLUMNS_KEY } from '../metadata/symbols';

export const UpdatedAt = (dbName = 'updated_at') => (_value: undefined, context: ClassFieldDecoratorContext): void => {
    const column: IColumnMetadata = {
        propertyKey: String(context.name),
        databaseName: dbName,
        options: { type: 'datetime' },
        primary: false,
        updatedAt: true,
    };
    /* v8 ignore next */
    if (!context.metadata) return;
    /* v8 ignore next */
    (context.metadata[COLUMNS_KEY] as Array<IColumnMetadata> | undefined) ??= [];
    (context.metadata[COLUMNS_KEY] as Array<IColumnMetadata>).push(column);
};
