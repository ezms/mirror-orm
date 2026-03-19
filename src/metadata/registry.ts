import { IEntityMetadata } from '../interfaces/entity-metadata';

class MetadataRegistry {
    private readonly entities = new Map<string, IEntityMetadata>();

    public registerEntity(className: string, metadata: IEntityMetadata): void {
        this.entities.set(className, metadata);
    }

    public registerStiChild(parentClassName: string, discriminatorValue: string, ctor: new () => unknown): void {
        const meta = this.entities.get(parentClassName);
        if (!meta) return;
        if (!meta.stiChildren) meta.stiChildren = new Map();
        meta.stiChildren.set(discriminatorValue, ctor);
    }

    public getEntity(className: string): IEntityMetadata | undefined {
        return this.entities.get(className);
    }

    public getAll(): Array<IEntityMetadata> {
        return Array.from(this.entities.values());
    }
}

export const registry = new MetadataRegistry();
