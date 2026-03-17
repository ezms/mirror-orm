import { HOOKS_KEY } from '../metadata/symbols';

export const AfterLoad = () => (_value: unknown, context: ClassMethodDecoratorContext): void => {
    if (!context.metadata) return;
    const hooks = (context.metadata[HOOKS_KEY] as Record<string, Array<string>>) ??= {};
    (hooks.afterLoad ??= []).push(String(context.name));
};
