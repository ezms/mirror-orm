export interface IEntityHooks {
    beforeInsert: Array<string>;
    beforeUpdate: Array<string>;
    afterLoad: Array<string>;
}
