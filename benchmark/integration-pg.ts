// Mirror ORM vs raw pg — integration benchmark (requires live Postgres)
import pg from 'pg';
import { Column, Connection, Entity, PrimaryColumn } from '../src/index.js';

@Entity('bench_integ_pg')
class BenchUser {
    @PrimaryColumn({ strategy: 'identity' }) id!: number;
    @Column() name!: string;
    @Column({ type: 'number' }) score!: number;
}
void BenchUser;

const ROWS   = 1_000;
const WARMUP = 5;
const ROUNDS = 50;

const cfg = {
    host:     process.env.MIRROR_TEST_PG_HOST     ?? 'localhost',
    port:     +(process.env.MIRROR_TEST_PG_PORT   ?? '5432'),
    database: process.env.MIRROR_TEST_PG_DATABASE ?? 'mirror_test',
    user:     process.env.MIRROR_TEST_PG_USER     ?? 'mirror',
    password: process.env.MIRROR_TEST_PG_PASSWORD ?? 'mirror',
};

const conn = await Connection.postgres(cfg);
const repo = conn.getRepository(BenchUser);
const pool = new pg.Pool({ ...cfg, max: 5 });

await conn.query('DROP TABLE IF EXISTS bench_integ_pg');
await conn.query('CREATE TABLE bench_integ_pg (id SERIAL PRIMARY KEY, name TEXT NOT NULL, score FLOAT NOT NULL)');
await conn.query(
    `INSERT INTO bench_integ_pg (name, score) VALUES ${Array.from({ length: ROWS }, (_, i) => `('User ${i}', ${i * 1.5})`).join(',')}`,
);

const median = (arr: number[]) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

for (let i = 0; i < WARMUP; i++) {
    await repo.findAll();
    await pool.query('SELECT id, name, score FROM bench_integ_pg');
}

const mirrorMs: number[] = [];
const rawMs: number[]    = [];

for (let r = 0; r < ROUNDS; r++) {
    if (r % 2 === 0) {
        const t0 = performance.now(); await repo.findAll(); mirrorMs.push(performance.now() - t0);
        const t1 = performance.now(); await pool.query('SELECT id, name, score FROM bench_integ_pg'); rawMs.push(performance.now() - t1);
    } else {
        const t0 = performance.now(); await pool.query('SELECT id, name, score FROM bench_integ_pg'); rawMs.push(performance.now() - t0);
        const t1 = performance.now(); await repo.findAll(); mirrorMs.push(performance.now() - t1);
    }
}

await conn.query('DROP TABLE IF EXISTS bench_integ_pg');
await pool.end();
await conn.disconnect();

const mp50 = median(mirrorMs);
const rp50 = median(rawMs);

console.log(`\n[Integration — PostgreSQL — ${ROWS} rows · ${ROUNDS} rounds]`);
console.log(`  Mirror ORM   p50 ${mp50.toFixed(3)}ms`);
console.log(`  Raw pg       p50 ${rp50.toFixed(3)}ms`);
console.log(`mirror_pg_p50=${mp50.toFixed(3)}`);
console.log(`raw_pg_p50=${rp50.toFixed(3)}`);
