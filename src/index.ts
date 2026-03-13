// Polyfill para Symbol.metadata (Stage 3 decorators) — deve ser o primeiro import
import './polyfills';

// ─── Decorators ──────────────────────────────────────────────────────────────
export { Entity } from './decorators/entity';
export { Column } from './decorators/column';
export { PrimaryColumn } from './decorators/primary-column';
export { ManyToOne } from './decorators/many-to-one';
export { OneToMany } from './decorators/one-to-many';

// ─── Connection ───────────────────────────────────────────────────────────────
export { Connection } from './connection/connection';
export { TransactionContext } from './connection/transaction-context';
export type { IConnectionOptions, IConnectionConfig } from './connection/connection-options';

// ─── Adapters ─────────────────────────────────────────────────────────────────
export { PgAdapter } from './adapters/pg/pg-adapter';
export type { IDriverAdapter } from './adapters/adapter';

// ─── Repository ───────────────────────────────────────────────────────────────
export { Repository } from './repository/repository';

// ─── Operators ────────────────────────────────────────────────────────────────
export {
    Like,
    ILike,
    In,
    MoreThan,
    MoreThanOrEqual,
    LessThan,
    LessThanOrEqual,
    Between,
    Not,
    IsNull,
    IsNotNull,
} from './operators';
export type { IQueryOperator } from './operators';

// ─── Logger ───────────────────────────────────────────────────────────────────
export { ConsoleLogger } from './logger/console.logger';
export type { ILogger } from './logger/logger.interface';

// ─── Errors ───────────────────────────────────────────────────────────────────
export { MirrorError } from './errors/mirror-error';
export { NoPrimaryColumnError } from './errors/metadata.error';
export { MissingPrimaryKeyError, GenerationStrategyError, EntityNotFoundError } from './errors/operation.error';
export { QueryError } from './errors/query.error';

// ─── Types & Interfaces ───────────────────────────────────────────────────────
export type { IFindOptions, WhereCondition } from './interfaces/find-options';
export type { IColumnOptions, ColumnType } from './interfaces/column-options';
export type { IPrimaryColumnOptions } from './interfaces/primary-column-options';
export type { GenerationStrategy } from './interfaces/generation-strategy';
export type { INamedQuery, IQueryRunner } from './interfaces/query-runner';
export type { ITransactionRunner } from './interfaces/transaction-runner';
export type { IRelationMetadata, RelationType } from './interfaces/relation-metadata';
