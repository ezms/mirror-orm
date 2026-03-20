import { MirrorError } from './mirror-error';

export class QueryError extends MirrorError {
    public static verbose = false;

    constructor(
        public readonly query: string,
        public readonly originalError: unknown,
        public readonly params?: Array<unknown>,
    ) {
        const cause =
            originalError instanceof Error
                ? originalError.message
                : String(originalError);
        const detail = QueryError.verbose
            ? `\n  SQL: ${query}${params?.length ? `\n  Params: ${JSON.stringify(params)}` : ''}`
            : '';
        super(`Query failed: ${cause}${detail}`, 'QUERY_ERROR');
        this.cause = originalError;
    }
}
