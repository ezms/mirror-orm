import { IEmbedMetadata } from '../interfaces/entity-metadata';
import { EMBEDS_KEY } from '../metadata/symbols';

export const Embedded =
    (target: () => new () => unknown, prefix?: string) =>
    (_value: undefined, context: ClassFieldDecoratorContext): void => {
        const embed: IEmbedMetadata = {
            propertyKey: String(context.name),
            prefix: prefix ?? `${String(context.name)}_`,
            target,
        };
        /* v8 ignore next */
        if (!context.metadata) return;
        /* v8 ignore next */
        (context.metadata[EMBEDS_KEY] as Array<IEmbedMetadata> | undefined) ??=
            [];
        (context.metadata[EMBEDS_KEY] as Array<IEmbedMetadata>).push(embed);
    };
