import { ILogger } from './logger.interface';

export class ConsoleLogger implements ILogger {
    public query(sql: string, params?: Array<unknown>): void {
        const paramsInfo = params && params.length > 0
            ? ` -- ${JSON.stringify(params)}`
            : '';
        console.log(`[MirrorORM] ${sql}${paramsInfo}`);
    }
}
