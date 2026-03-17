import { HOOKS_KEY } from '../metadata/symbols';

export const BeforeInsert = () => (_value: unknown, context: ClassMethodDecoratorContext): void => {
    if (!context.metadata) return;
    const hooks = (context.metadata[HOOKS_KEY] as Record<string, Array<string>>) ??= {};
    (hooks.beforeInsert ??= []).push(String(context.name));
};
