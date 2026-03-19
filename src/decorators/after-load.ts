import { HOOKS_KEY } from '../metadata/symbols';

export const AfterLoad = () => (_value: unknown, context: ClassMethodDecoratorContext): void => {
    /* v8 ignore next */
   if (!context.metadata) return;
    /* v8 ignore next */
    const hooks = (context.metadata[HOOKS_KEY] as Record<string, Array<string>>) ??= {};
    /* v8 ignore next */
    (hooks.afterLoad ??= []).push(String(context.name));
};
