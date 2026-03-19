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
