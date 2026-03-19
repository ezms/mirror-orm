import { IColumnMetadata } from '../interfaces/column-metadata';
import { COLUMNS_KEY } from '../metadata/symbols';

export const VersionColumn = (dbName = 'version') => (_value: undefined, context: ClassFieldDecoratorContext): void => {
    const column: IColumnMetadata = {
        propertyKey: String(context.name),
        databaseName: dbName,
        options: { type: 'number' },
        primary: false,
        version: true,
    };
    /* v8 ignore next */
    if (!context.metadata) return;
    /* v8 ignore next */
    (context.metadata[COLUMNS_KEY] as Array<IColumnMetadata> | undefined) ??= [];
    (context.metadata[COLUMNS_KEY] as Array<IColumnMetadata>).push(column);
};
