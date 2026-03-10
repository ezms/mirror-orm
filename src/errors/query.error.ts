import { MirrorError } from './mirror-error';

export class QueryError extends MirrorError {
    constructor(
        public readonly query: string,
        public readonly originalError: unknown,
    ) {
        const message = originalError instanceof Error
            ? originalError.message
            : String(originalError);
        super(`Query failed: ${message}`, 'QUERY_ERROR');
        this.cause = originalError;
    }
}
