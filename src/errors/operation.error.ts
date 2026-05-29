import { MirrorError } from './mirror-error';

export class MissingPrimaryKeyError extends MirrorError {
    constructor(className: string, operation: string) {
        super(
            `Cannot "${operation}" on "${className}" without a primary key value.`,
            'MISSING_PRIMARY_KEY',
        );
    }
}

export class GenerationStrategyError extends MirrorError {
    constructor(message: string) {
        super(message, 'GENERATION_STRATEGY_ERROR');
    }
}

export class EntityNotFoundError extends MirrorError {
    constructor(className: string) {
        super(`Entity "${className}" not found.`, 'ENTITY_NOT_FOUND');
    }
}

export class OptimisticLockError extends MirrorError {
    constructor(className: string) {
        super(
            `Optimistic lock failed on "${className}": the row was updated or deleted by another transaction.`,
            'OPTIMISTIC_LOCK',
        );
    }
}

export class RelationJoinError extends MirrorError {
    constructor(propertyKey: string, relationType: string, className: string) {
        super(
            `Cannot join "${propertyKey}" (${relationType}) on "${className}" — joining a collection relation produces duplicate rows. Use find({ relations: ['${propertyKey}'] }) to load related data, or raw SQL for custom JOIN behavior.`,
            'RELATION_JOIN_ERROR',
        );
    }
}

export class RelationNotFoundError extends MirrorError {
    constructor(propertyKey: string, className: string) {
        super(
            `Relation "${propertyKey}" not found on "${className}". Did you add @ManyToOne, @OneToOne, @OneToMany or @ManyToMany?`,
            'RELATION_NOT_FOUND',
        );
    }
}

export class UnsupportedOperationError extends MirrorError {
    constructor(operation: string, dialect: string) {
        super(
            `"${operation}" is not supported by the ${dialect} dialect.`,
            'UNSUPPORTED_OPERATION',
        );
    }
}
