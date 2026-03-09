import { registry } from "../metadata/registry";

export const Entity = (tableName: string) => {
    return <T extends new (...args: Array<any>) => any> (_value: T, context: ClassDecoratorContext) => {
        const className = String(context.name);
        registry.registerEntity(className, {
            tableName,
            className,
            columns: [],
        });
    } 
}
