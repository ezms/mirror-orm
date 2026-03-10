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
