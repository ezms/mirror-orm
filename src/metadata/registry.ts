import { IColumnMetadata } from '../interfaces/column-metadata';
import { IEntityMetadata } from '../interfaces/entity-metadata';

class MetadataRegistry {
    private readonly entities = new Map<string, IEntityMetadata>();

    public registerEntity(className: string, metadata: IEntityMetadata): void {
        this.entities.set(className, metadata);
    }

    public getEntity(className: string): IEntityMetadata | undefined {
        return this.entities.get(className);
    }

    public getAll(): Array<IEntityMetadata> {
        return Array.from(this.entities.values());
    }


}

export const registry = new MetadataRegistry();
