export interface ILogger {
    query(sql: string, params?: unknown[]): void;
}
