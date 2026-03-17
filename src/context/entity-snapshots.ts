export const LOAD_STATE_KEY = Symbol('mirror.entity.loadState');

export const entitySnapshots = {
    set(entity: object, snap: Array<unknown>): void {
        (entity as Record<symbol, unknown>)[LOAD_STATE_KEY] = snap;
    },
    get(entity: object): Array<unknown> | undefined {
        return (entity as Record<symbol, unknown>)[LOAD_STATE_KEY] as Array<unknown> | undefined;
    },
    has(entity: object): boolean {
        return LOAD_STATE_KEY in entity;
    },
};
