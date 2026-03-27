// Mirror ORM vs raw mysql2 — integration benchmark (requires live MySQL)
import mysql from 'mysql2/promise';
import { Column, Connection, Entity, PrimaryColumn } from '../src/index.js';

@Entity('bench_integ_mysql')
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
    host:     process.env.MIRROR_TEST_MYSQL_HOST     ?? 'localhost',
    port:     +(process.env.MIRROR_TEST_MYSQL_PORT   ?? '3306'),
    database: process.env.MIRROR_TEST_MYSQL_DATABASE ?? 'mirror_test',
    user:     process.env.MIRROR_TEST_MYSQL_USER     ?? 'root',
    password: process.env.MIRROR_TEST_MYSQL_PASSWORD ?? 'mirror',
};

const conn = await Connection.mysql(cfg);
const repo = conn.getRepository(BenchUser);
const pool = await mysql.createPool({ ...cfg, waitForConnections: true, connectionLimit: 5 });

await conn.query('DROP TABLE IF EXISTS bench_integ_mysql');
await conn.query('CREATE TABLE bench_integ_mysql (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, score DOUBLE NOT NULL)');
await conn.query(
    `INSERT INTO bench_integ_mysql (name, score) VALUES ${Array.from({ length: ROWS }, (_, i) => `('User ${i}', ${i * 1.5})`).join(',')}`,
);

const median = (arr: number[]) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

for (let i = 0; i < WARMUP; i++) {
    await repo.findAll();
    await pool.execute('SELECT id, name, score FROM bench_integ_mysql');
}

const mirrorMs: number[] = [];
const rawMs: number[]    = [];

for (let r = 0; r < ROUNDS; r++) {
    if (r % 2 === 0) {
        const t0 = performance.now(); await repo.findAll(); mirrorMs.push(performance.now() - t0);
        const t1 = performance.now(); await pool.execute('SELECT id, name, score FROM bench_integ_mysql'); rawMs.push(performance.now() - t1);
    } else {
        const t0 = performance.now(); await pool.execute('SELECT id, name, score FROM bench_integ_mysql'); rawMs.push(performance.now() - t0);
        const t1 = performance.now(); await repo.findAll(); mirrorMs.push(performance.now() - t1);
    }
}

await conn.query('DROP TABLE IF EXISTS bench_integ_mysql');
await pool.end();
await conn.disconnect();

const mp50 = median(mirrorMs);
const rp50 = median(rawMs);

console.log(`\n[Integration — MySQL — ${ROWS} rows · ${ROUNDS} rounds]`);
console.log(`  Mirror ORM   p50 ${mp50.toFixed(3)}ms`);
console.log(`  Raw mysql2   p50 ${rp50.toFixed(3)}ms`);
console.log(`mirror_mysql_p50=${mp50.toFixed(3)}`);
console.log(`raw_mysql_p50=${rp50.toFixed(3)}`);
