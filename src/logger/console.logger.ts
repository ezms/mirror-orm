import { ILogger } from './logger.interface';

export class ConsoleLogger implements ILogger {
    query(sql: string, params?: unknown[]): void {
        const paramsInfo = params && params.length > 0
            ? ` -- ${JSON.stringify(params)}`
            : '';
        console.log(`[MirrorORM] ${sql}${paramsInfo}`);
    }
}
