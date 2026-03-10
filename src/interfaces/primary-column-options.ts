import { GenerationStrategy } from './generation-strategy';

export interface IPrimaryColumnOptions {
    name?: string;
    strategy?: GenerationStrategy;
    generate?: () => string | number;
}
