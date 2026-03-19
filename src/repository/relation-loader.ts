import { IRelationMetadata } from '../interfaces/relation-metadata';
import { IQueryRunner } from '../interfaces/query-runner';
import { RepositoryState } from './repository-state';

export function buildRelationTree(relations: Array<string>): Map<string, Array<string>> {
    const tree = new Map<string, Array<string>>();
    for (const rel of relations) {
        const dot = rel.indexOf('.');
        if (dot === -1) {
            if (!tree.has(rel)) tree.set(rel, []);
        } else {
            const parent = rel.slice(0, dot);
            const child  = rel.slice(dot + 1);
            if (!tree.has(parent)) tree.set(parent, []);
            tree.get(parent)!.push(child);
        }
    }
    return tree;
}

export async function loadRelationsForEntities(
    entities:  Array<unknown>,
    state:     RepositoryState<unknown>,
    relations: Array<string>,
    runner:    IQueryRunner,
): Promise<void> {
    for (const [propertyKey, childRelations] of buildRelationTree(relations)) {
        const relation = state.metadata.relations.find(r => r.propertyKey === propertyKey);
        if (!relation) continue;
        const childState = state.getRelatedState(relation);
        const isOwnerSide = relation.type === 'many-to-one' ||
            (relation.type === 'one-to-one' && state.metadata.columns.some(c => c.databaseName === relation.foreignKey));

        let loaded: Array<unknown>;
        if (isOwnerSide)                          loaded = await nestedOwnerSide(entities, state, childState, relation, propertyKey, runner);
        else if (relation.type === 'many-to-many') loaded = await nestedMtm(entities, state, childState, relation, propertyKey, runner);
        else                                       loaded = await nestedInverse(entities, state, childState, relation, propertyKey, runner);

        if (childRelations.length > 0 && loaded.length > 0)
            await loadRelationsForEntities(loaded, childState, childRelations, runner);
    }
}

const nestedOwnerSide = async (
    parents:     Array<unknown>,
    parentState: RepositoryState<unknown>,
    childState:  RepositoryState<unknown>,
    relation:    IRelationMetadata,
    propertyKey: string,
    runner:      IQueryRunner,
): Promise<Array<unknown>> => {
    const fkColumn = parentState.metadata.columns.find(c => c.databaseName === relation.foreignKey);
    const childPk  = childState.cachedPrimaryColumn;
    if (!fkColumn || !childPk) return [];
    const childPkCol = childState.columnMap.get(childPk.propertyKey)!;

    const fkValues = [...new Set(
        parents.map(p => (p as Record<string, unknown>)[fkColumn.propertyKey]).filter(v => v != null),
    )];
    if (fkValues.length === 0) {
        for (const parent of parents) (parent as Record<string, unknown>)[propertyKey] = null;
        return [];
    }

    const params: Array<unknown> = [];
    const inClause = childState.buildArrayInClause(childPkCol.quotedDatabaseName, fkValues, params);
    const rows = await runner.query<Record<string, unknown>>(
        `SELECT ${childState.selectClause} FROM ${childState.quotedTableName} WHERE ${inClause}`, params,
    );
    const childMap = new Map(rows.map(row => [row[childPk.databaseName], childState.hydrator(row)]));
    for (const parent of parents) {
        const fkVal = (parent as Record<string, unknown>)[fkColumn.propertyKey];
        (parent as Record<string, unknown>)[propertyKey] = fkVal != null ? (childMap.get(fkVal) ?? null) : null;
    }
    return [...childMap.values()];
};

const nestedInverse = async (
    parents:     Array<unknown>,
    parentState: RepositoryState<unknown>,
    childState:  RepositoryState<unknown>,
    relation:    IRelationMetadata,
    propertyKey: string,
    runner:      IQueryRunner,
): Promise<Array<unknown>> => {
    const parentPk = parentState.cachedPrimaryColumn;
    if (!parentPk) return [];
    const parentIds = [...new Set(
        parents.map(p => (p as Record<string, unknown>)[parentPk.propertyKey]).filter(v => v != null),
    )];
    if (parentIds.length === 0) return [];

    const params: Array<unknown> = [];
    const inClause = childState.buildArrayInClause(childState.quoteIdentifier(relation.foreignKey), parentIds, params);
    const rows = await runner.query<Record<string, unknown>>(
        `SELECT ${childState.selectClause} FROM ${childState.quotedTableName} WHERE ${inClause}`, params,
    );
    const loaded: Array<unknown> = [];

    if (relation.type === 'one-to-many') {
        const grouped = new Map<unknown, Array<unknown>>();
        for (const row of rows) {
            const fkVal = row[relation.foreignKey];
            if (!grouped.has(fkVal)) grouped.set(fkVal, []);
            const child = childState.hydrator(row);
            grouped.get(fkVal)!.push(child);
            loaded.push(child);
        }
        for (const parent of parents) {
            const pkVal = (parent as Record<string, unknown>)[parentPk.propertyKey];
            (parent as Record<string, unknown>)[propertyKey] = grouped.get(pkVal) ?? [];
        }
    } else {
        const grouped = new Map<unknown, unknown>();
        for (const row of rows) {
            const child = childState.hydrator(row);
            grouped.set(row[relation.foreignKey], child);
            loaded.push(child);
        }
        for (const parent of parents) {
            const pkVal = (parent as Record<string, unknown>)[parentPk.propertyKey];
            (parent as Record<string, unknown>)[propertyKey] = grouped.get(pkVal) ?? null;
        }
    }
    return loaded;
};

const nestedMtm = async (
    parents:     Array<unknown>,
    parentState: RepositoryState<unknown>,
    childState:  RepositoryState<unknown>,
    relation:    IRelationMetadata,
    propertyKey: string,
    runner:      IQueryRunner,
): Promise<Array<unknown>> => {
    const parentPk = parentState.cachedPrimaryColumn;
    if (!parentPk) return [];
    const parentIds = [...new Set(
        parents.map(p => (p as Record<string, unknown>)[parentPk.propertyKey]).filter(v => v != null),
    )];
    if (parentIds.length === 0) return [];

    const childPkCol   = childState.columnMap.get(childState.cachedPrimaryColumn!.propertyKey)!;
    const qtJoin       = parentState.quoteIdentifier(relation.joinTable!);
    const ownerFkAlias = '_mirror_mtm_fk_';
    const params: Array<unknown> = [];
    const inClause = childState.buildArrayInClause(
        `${qtJoin}.${parentState.quoteIdentifier(relation.foreignKey)}`, parentIds, params,
    );
    const sql = [
        `SELECT ${childState.selectClause},`,
        `${qtJoin}.${parentState.quoteIdentifier(relation.foreignKey)} AS "${ownerFkAlias}"`,
        `FROM ${childState.quotedTableName}`,
        `INNER JOIN ${qtJoin} ON ${qtJoin}.${parentState.quoteIdentifier(relation.inverseFk!)}`,
        `= ${childState.quotedTableName}.${childPkCol.quotedDatabaseName}`,
        `WHERE ${inClause}`,
    ].join(' ');
    const rows = await runner.query<Record<string, unknown>>(sql, params);

    const grouped = new Map<unknown, Array<unknown>>();
    const loaded: Array<unknown> = [];
    for (const row of rows) {
        const ownerFk = row[ownerFkAlias];
        if (!grouped.has(ownerFk)) grouped.set(ownerFk, []);
        const child = childState.hydrator(row);
        grouped.get(ownerFk)!.push(child);
        loaded.push(child);
    }
    for (const parent of parents) {
        const pkVal = (parent as Record<string, unknown>)[parentPk.propertyKey];
        (parent as Record<string, unknown>)[propertyKey] = grouped.get(pkVal) ?? [];
    }
    return loaded;
};
