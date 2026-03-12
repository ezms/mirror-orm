export interface ILogger {
    query(sql: string, params?: Array<unknown>): void;
}
