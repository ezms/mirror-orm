import { IDialect, PostgresDialect } from '../dialects';
import { IColumnMetadata } from '../interfaces/column-metadata';
import { IEntityMetadata } from '../interfaces/entity-metadata';
import { IRelationMetadata } from '../interfaces/relation-metadata';
import { registry } from '../metadata/registry';
import { INamedQuery } from '../interfaces/query-runner';

export type AutoFkEntry = {
    relationPropertyKey: string;
    fkPropertyKey: string;
    relatedPkPropertyKey: string;
};

const HYDRATOR_HELPERS = Object.freeze({
    dateOnly: (v: Date): string => {
        const m = String(v.getMonth() + 1).padStart(2, '0');
        const d = String(v.getDate()).padStart(2, '0');
        return `${v.getFullYear()}-${m}-${d}`;
    },
});

export class RepositoryState<T> {
    public readonly cachedPrimaryColumn: IColumnMetadata | null;
    public readonly cachedCreatedAtColumn: IColumnMetadata | null;
    public readonly cachedUpdatedAtColumn: IColumnMetadata | null;
    public readonly cachedDeletedAtColumn: IColumnMetadata | null;
    public readonly quotedTableName: string;
    public readonly selectClause: string;
    public readonly qualifiedSelectClause: string;
    public readonly columnMap: Map<string, IColumnMetadata & { quotedDatabaseName: string }>;
    public readonly hydrator: (row: Record<string, unknown>) => T;
    public readonly arrayHydrator: (row: unknown[]) => T;
    public readonly findAllStatement: INamedQuery;
    public readonly findByIdStatement: INamedQuery | null;
    public readonly autoFkMap: Array<AutoFkEntry>;
    public readonly metadata: IEntityMetadata;
    public readonly hooks: Required<IEntityMetadata>['hooks'];
    public readonly target: new () => T;

    private readonly dialect: IDialect;
    private readonly relatedStateCache = new Map<string, RepositoryState<unknown>>();
    private readonly prefixedHydratorCache = new Map<string, (row: Record<string, unknown>) => T>();

    constructor(target: new () => T, metadata: IEntityMetadata, dialect: IDialect = new PostgresDialect()) {
        this.target = target;
        this.metadata = metadata;
        this.dialect = dialect;
        this.quotedTableName = this.quoteIdentifier(metadata.tableName);
        this.columnMap = this.buildColumnMap();
        this.selectClause = this.buildSelectClause();
        this.qualifiedSelectClause = this.buildQualifiedSelectClause();
        this.cachedPrimaryColumn = this.metadata.columns.find(c => c.primary) ?? null;
        this.cachedCreatedAtColumn = this.metadata.columns.find(c => c.createdAt) ?? null;
        this.cachedUpdatedAtColumn = this.metadata.columns.find(c => c.updatedAt) ?? null;
        this.cachedDeletedAtColumn = this.metadata.columns.find(c => c.deletedAt) ?? null;
        this.hooks = metadata.hooks ?? { beforeInsert: [], beforeUpdate: [], afterLoad: [] };
        this.hydrator = this.buildHydrator();
        this.arrayHydrator = this.buildArrayHydrator();
        this.autoFkMap = this.buildAutoFkMap();
        const sdFilter = this.cachedDeletedAtColumn
            ? ` WHERE ${this.quoteIdentifier(this.cachedDeletedAtColumn.databaseName)} IS NULL`
            : '';
        this.findAllStatement = { name: `mirror_${metadata.tableName}_fa`, text: `SELECT ${this.selectClause} FROM ${this.quotedTableName}${sdFilter}` };
        this.findByIdStatement = this.buildFindByIdStatement();
    }

    public quoteIdentifier(identifier: string): string {
        return this.dialect.quoteIdentifier(identifier);
    }

    public placeholder(index: number): string {
        return this.dialect.placeholder(index);
    }

    public get supportsReturning(): boolean {
        return this.dialect.supportsReturning;
    }

    public get lastInsertIdQuery(): string | undefined {
        return this.dialect.lastInsertIdQuery;
    }

    public buildArrayInClause(quotedColumn: string, ids: unknown[], params: unknown[]): string {
        return this.dialect.buildArrayInClause(quotedColumn, ids, params);
    }

    private buildColumnMap(): Map<string, IColumnMetadata & { quotedDatabaseName: string }> {
        return new Map(
            this.metadata.columns.map(c => [
                c.propertyKey,
                { ...c, quotedDatabaseName: this.quoteIdentifier(c.databaseName) },
            ]),
        );
    }

    private buildSelectClause(): string {
        return [...this.columnMap.values()]
            .filter(c => c.options.select !== false)
            .map(c => c.quotedDatabaseName)
            .join(', ');
    }

    private buildQualifiedSelectClause(): string {
        return [...this.columnMap.values()]
            .filter(c => c.options.select !== false)
            .map(c => `${this.quotedTableName}.${c.quotedDatabaseName}`)
            .join(', ');
    }

    public getRelatedState(relation: IRelationMetadata): RepositoryState<unknown> {
        const cached = this.relatedStateCache.get(relation.propertyKey);
        if (cached) return cached;
        const targetCtor = relation.target() as new () => unknown;
        const meta = registry.getEntity(targetCtor.name);
        if (!meta) throw new Error(`Related entity "${targetCtor.name}" not registered. Did you add @Entity?`);
        const state = new RepositoryState(targetCtor, meta);
        this.relatedStateCache.set(relation.propertyKey, state);
        return state;
    }

    public getOrBuildPrefixedHydrator(prefix: string): (row: Record<string, unknown>) => T {
        const cached = this.prefixedHydratorCache.get(prefix);
        if (cached) return cached;
        const assignments = this.metadata.columns
            .map(c => {
                const db = `${prefix}${c.databaseName}`;
                const prop = c.propertyKey;
                const rhs = this.buildCastExpression(db, c.options.type);
                return `if(r["${db}"]!==undefined&&r["${db}"]!==null)i["${prop}"]=${rhs};`;
            })
            .join('');
        const fn = new Function('C', 'H', `return function hydrate(r){var i=Object.create(C.prototype);${assignments}return i;}`);
        const hydrator = fn(this.target, HYDRATOR_HELPERS) as (row: Record<string, unknown>) => T;
        this.prefixedHydratorCache.set(prefix, hydrator);
        return hydrator;
    }

    private buildAutoFkMap(): Array<AutoFkEntry> {
        return this.metadata.relations.flatMap(r => {
            const isOwner = r.type === 'many-to-one' ||
                (r.type === 'one-to-one' && this.metadata.columns.some(c => c.databaseName === r.foreignKey));
            if (!isOwner) return [];
            const fkCol = this.metadata.columns.find(c => c.databaseName === r.foreignKey);
            if (!fkCol) return [];
            const relatedMeta = registry.getEntity((r.target() as new () => unknown).name);
            if (!relatedMeta) return [];
            const relatedPk = relatedMeta.columns.find(c => c.primary);
            if (!relatedPk) return [];
            return [{ relationPropertyKey: r.propertyKey, fkPropertyKey: fkCol.propertyKey, relatedPkPropertyKey: relatedPk.propertyKey }];
        });
    }

    private buildFindByIdStatement(): INamedQuery | null {
        if (!this.cachedPrimaryColumn) return null;
        const pk = this.columnMap.get(this.cachedPrimaryColumn.propertyKey)!;
        const sdExtra = this.cachedDeletedAtColumn
            ? ` AND ${this.quoteIdentifier(this.cachedDeletedAtColumn.databaseName)} IS NULL`
            : '';
        return {
            name: `mirror_${this.metadata.tableName}_fbi`,
            text: `SELECT ${this.selectClause} FROM ${this.quotedTableName} WHERE ${pk.quotedDatabaseName} = ${this.placeholder(1)}${sdExtra}`,
        };
    }

    private buildArrayHydrator(): (row: unknown[]) => T {
        let idx = 0;
        const assignments = this.metadata.columns
            .map(c => {
                if (c.options.select === false) return '';
                const i = idx++;
                const prop = c.propertyKey;
                const rhs = this.buildArrayCastExpression(i, c.options.type);
                return `if(r[${i}]!==undefined&&r[${i}]!==null)i["${prop}"]=${rhs};`;
            })
            .join('');
        const fn = new Function('C', 'H', `return function hydrateArray(r){var i=Object.create(C.prototype);${assignments}return i;}`);
        return fn(this.target, HYDRATOR_HELPERS) as (row: unknown[]) => T;
    }

    private buildArrayCastExpression(idx: number, type: import('../interfaces/column-options').ColumnType | undefined): string {
        const v = `r[${idx}]`;
        switch (type) {
            case 'number':   return `${v}!==null?+${v}:null`;
            case 'bigint':   return `${v}!==null?BigInt(${v}):null`;
            case 'boolean':  return `${v}!==null?Boolean(${v}):null`;
            case 'datetime': return `${v}!==null?new Date(${v}):null`;
            case 'date':     return `${v}!==null?H.dateOnly(${v}):null`;
            case 'iso':      return `${v}!==null?(${v} instanceof Date?${v}:new Date(${v})).toISOString():null`;
            default:         return v;
        }
    }

    private buildHydrator(): (row: Record<string, unknown>) => T {
        const assignments = this.metadata.columns
            .map(c => {
                const db = c.databaseName;
                const prop = c.propertyKey;
                const rhs = this.buildCastExpression(db, c.options.type);
                return `if(r["${db}"]!==undefined)i["${prop}"]=${rhs};`;
            })
            .join('');
        const fn = new Function('C', 'H', `return function hydrate(r){var i=Object.create(C.prototype);${assignments}return i;}`);
        return fn(this.target, HYDRATOR_HELPERS) as (row: Record<string, unknown>) => T;
    }

    private buildCastExpression(db: string, type: import('../interfaces/column-options').ColumnType | undefined): string {
        const v = `r["${db}"]`;
        switch (type) {
            case 'number':   return `${v}!==null?+${v}:null`;
            case 'bigint':   return `${v}!==null?BigInt(${v}):null`;
            case 'boolean':  return `${v}!==null?Boolean(${v}):null`;
            case 'datetime': return `${v}!==null?new Date(${v}):null`;
            case 'date':     return `${v}!==null?H.dateOnly(${v}):null`;
            case 'iso':      return `${v}!==null?(${v} instanceof Date?${v}:new Date(${v})).toISOString():null`;
            default:         return v;
        }
    }
}
