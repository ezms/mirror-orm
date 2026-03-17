import { GenerationStrategy } from './generation-strategy';
import { ColumnType } from './column-options';

export interface IPrimaryColumnOptions {
    name?: string;
    strategy?: GenerationStrategy;
    generate?: () => string | number;
    type?: ColumnType;
}
