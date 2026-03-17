export type GenerationStrategy =
    | 'identity'
    | 'uuid_v4'
    | 'uuid_v7'
    | 'ulid'
    | 'cuid2'
    | 'custom';

export interface IGenerationOptions {
    strategy: GenerationStrategy;
    generate?: () => string | number;
}
