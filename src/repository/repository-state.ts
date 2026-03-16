import { IColumnMetadata } from '../interfaces/column-metadata';
import { IEntityMetadata } from '../interfaces/entity-metadata';
import { IRelationMetadata } from '../interfaces/relation-metadata';
import { registry } from '../metadata/registry';
import { INamedQuery } from '../interfaces/query-runner';

const HYDRATOR_HELPERS = Object.freeze({
    dateOnly: (v: Date): string => {
        const m = String(v.getMonth() + 1).padStart(2, '0');
        const d = String(v.getDate()).padStart(2, '0');
        return `${v.getFullYear()}-${m}-${d}`;
    },
});

export class RepositoryState<T> {
    public readonly cachedPrimaryColumn: IColumnMetadata | null;
    public readonly quotedTableName: string;
    public readonly selectClause: string;
    public readonly qualifiedSelectClause: string;
    public readonly columnMap: Map<string, IColumnMetadata & { quotedDatabaseName: string }>;
    public readonly hydrator: (row: Record<string, unknown>) => T;
    public readonly findAllStatement: INamedQuery;
    public readonly findByIdStatement: INamedQuery | null;
    public readonly metadata: IEntityMetadata;
    public readonly target: new () => T;

    private readonly relatedStateCache = new Map<string, RepositoryState<unknown>>();
    private readonly prefixedHydratorCache = new Map<string, (row: Record<string, unknown>) => T>();

    constructor(target: new () => T, metadata: IEntityMetadata) {
        this.target = target;
        this.metadata = metadata;
        this.quotedTableName = this.quoteIdentifier(metadata.tableName);
        this.columnMap = this.buildColumnMap();
        this.selectClause = this.buildSelectClause();
        this.qualifiedSelectClause = this.buildQualifiedSelectClause();
        this.cachedPrimaryColumn = this.resolvePrimaryColumn();
        this.hydrator = this.buildHydrator();
        this.findAllStatement = { name: `mirror_${metadata.tableName}_fa`, text: `SELECT ${this.selectClause} FROM ${this.quotedTableName}` };
        this.findByIdStatement = this.buildFindByIdStatement();
    }

    public quoteIdentifier(identifier: string): string {
        return `"${identifier.replace(/"/g, '""')}"`;
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
        return [...this.columnMap.values()].map(c => c.quotedDatabaseName).join(', ');
    }

    private buildQualifiedSelectClause(): string {
        return [...this.columnMap.values()]
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

    private resolvePrimaryColumn(): IColumnMetadata | null {
        return this.metadata.columns.find(c => c.primary) ?? null;
    }

    private buildFindByIdStatement(): INamedQuery | null {
        if (!this.cachedPrimaryColumn) return null;
        const pk = this.columnMap.get(this.cachedPrimaryColumn.propertyKey)!;
        return {
            name: `mirror_${this.metadata.tableName}_fbi`,
            text: `SELECT ${this.selectClause} FROM ${this.quotedTableName} WHERE ${pk.quotedDatabaseName} = $1`,
        };
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
