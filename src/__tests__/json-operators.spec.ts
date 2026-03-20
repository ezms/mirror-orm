import { describe, expect, it } from 'vitest';
import { Column } from '../decorators/column';
import { Entity } from '../decorators/entity';
import { PrimaryColumn } from '../decorators/primary-column';
import {
    type IDialect,
    MySQLDialect,
    PostgresDialect,
    SQLiteDialect,
} from '../dialects';
import {
    JsonContains,
    JsonHasAllKeys,
    JsonHasAnyKey,
    JsonHasKey,
} from '../operators';
import { registry } from '../metadata/registry';
import { Repository, RepositoryState } from '../repository/repository';
import { SqlAssembler } from '../repository/sql-assembler';
@Entity('json_docs')
class JsonDoc {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    meta!: string;
}

void JsonDoc;

function makeAssembler(dialect: IDialect = new PostgresDialect()) {
    const meta = registry.getEntity('JsonDoc')!;
    const state = new RepositoryState(JsonDoc, meta, dialect);
    return new SqlAssembler(state);
}

// ─── Unit: SQL generation ────────────────────────────────────────────────────

describe('JsonContains', () => {
    it('emits @> ::jsonb clause', () => {
        const op = JsonContains({ role: 'admin' });
        const { sql, params } = op.buildClause('"meta"', 1);
        expect(sql).toBe('"meta" @> $1::jsonb');
        expect(params[0]).toBe('{"role":"admin"}');
    });
});

describe('JsonHasKey', () => {
    it('emits ? clause', () => {
        const { sql, params } = JsonHasKey('role').buildClause('"meta"', 1);
        expect(sql).toBe('"meta" ? $1');
        expect(params[0]).toBe('role');
    });
});

describe('JsonHasAllKeys', () => {
    it('emits ?& clause', () => {
        const { sql, params } = JsonHasAllKeys(['a', 'b']).buildClause(
            '"meta"',
            1,
        );
        expect(sql).toBe('"meta" ?& $1');
        expect(params[0]).toEqual(['a', 'b']);
    });
});

describe('JsonHasAnyKey', () => {
    it('emits ?| clause', () => {
        const { sql, params } = JsonHasAnyKey(['a', 'b']).buildClause(
            '"meta"',
            1,
        );
        expect(sql).toBe('"meta" ?| $1');
        expect(params[0]).toEqual(['a', 'b']);
    });
});

// ─── Unit: fail-fast on non-Postgres dialects ────────────────────────────────

describe('fail-fast on non-Postgres dialects', () => {
    it('throws when JsonContains is used with MySQLDialect', () => {
        const assembler = makeAssembler(new MySQLDialect());
        expect(() =>
            assembler.buildFind({ where: { meta: JsonContains({ x: 1 }) } }),
        ).toThrow(/PostgreSQL/);
    });

    it('throws when JsonHasKey is used with SQLiteDialect', () => {
        const assembler = makeAssembler(new SQLiteDialect());
        expect(() =>
            assembler.buildFind({ where: { meta: JsonHasKey('x') } }),
        ).toThrow(/PostgreSQL/);
    });

    it('does not throw when used with PostgresDialect', () => {
        const assembler = makeAssembler(new PostgresDialect());
        expect(() =>
            assembler.buildFind({ where: { meta: JsonContains({ x: 1 }) } }),
        ).not.toThrow();
    });
});

// ─── Integration: Postgres ───────────────────────────────────────────────────

import { afterAll, beforeAll } from 'vitest';
import { Connection } from '../connection/connection';

const DB_CONFIG = {
    host: '127.0.0.1',
    port: 5432,
    database: 'mirror_test',
    user: 'postgres',
    password: 'postgres',
};

describe('JSON operators — Postgres integration', () => {
    let conn: Connection;
    let repo: Repository<JsonDoc>;

    beforeAll(async () => {
        conn = await Connection.postgres(DB_CONFIG);
        await conn.query(`DROP TABLE IF EXISTS json_docs`);
        await conn.query(
            `CREATE TABLE json_docs (id VARCHAR(36) PRIMARY KEY, meta JSONB NOT NULL)`,
        );
        repo = conn.getRepository(JsonDoc);
        await repo.save(
            Object.assign(new JsonDoc(), {
                meta: JSON.stringify({ role: 'admin', active: true }),
            }),
        );
        await repo.save(
            Object.assign(new JsonDoc(), {
                meta: JSON.stringify({ role: 'user', active: true }),
            }),
        );
        await repo.save(
            Object.assign(new JsonDoc(), {
                meta: JSON.stringify({ role: 'guest' }),
            }),
        );
    });

    afterAll(async () => {
        await conn.query(`DROP TABLE IF EXISTS json_docs`);
        await conn.disconnect();
    });

    it('JsonContains filters by nested value', async () => {
        const rows = await repo.find({
            where: { meta: JsonContains({ role: 'admin' }) },
        });
        expect(rows).toHaveLength(1);
        const meta = rows[0].meta as unknown as { role: string };
        expect(meta.role).toBe('admin');
    });

    it('JsonHasKey filters docs that have a given key', async () => {
        const rows = await repo.find({ where: { meta: JsonHasKey('active') } });
        expect(rows).toHaveLength(2);
    });

    it('JsonHasAllKeys filters docs that have all given keys', async () => {
        const rows = await repo.find({
            where: { meta: JsonHasAllKeys(['role', 'active']) },
        });
        expect(rows).toHaveLength(2);
    });

    it('JsonHasAnyKey filters docs that have any of the given keys', async () => {
        const rows = await repo.find({
            where: { meta: JsonHasAnyKey(['active', 'nonexistent']) },
        });
        expect(rows).toHaveLength(2);
    });
});
