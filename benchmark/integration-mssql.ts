// Mirror ORM vs raw mssql — integration benchmark (requires live SQL Server)
import mssql from 'mssql';
import { Column, Connection, Entity, PrimaryColumn } from '../src/index.js';

@Entity('bench_integ_mssql')
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
    host:     process.env.MIRROR_TEST_MSSQL_SERVER   ?? 'localhost',
    port:     +(process.env.MIRROR_TEST_MSSQL_PORT   ?? '1433'),
    database: process.env.MIRROR_TEST_MSSQL_DATABASE ?? 'mirror_test',
    user:     process.env.MIRROR_TEST_MSSQL_USER     ?? 'SA',
    password: process.env.MIRROR_TEST_MSSQL_PASSWORD ?? 'Mirror@12345',
};

const conn = await Connection.sqlServer(cfg);
const repo = conn.getRepository(BenchUser);
const rawPool = await new mssql.ConnectionPool({
    server: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    options: { trustServerCertificate: true },
}).connect();

await conn.query('DROP TABLE IF EXISTS bench_integ_mssql');
await conn.query('CREATE TABLE bench_integ_mssql (id INT IDENTITY(1,1) PRIMARY KEY, name NVARCHAR(100) NOT NULL, score FLOAT NOT NULL)');

// SQL Server: batch inserts in chunks to avoid parameter limits
const CHUNK = 100;
for (let i = 0; i < ROWS; i += CHUNK) {
    const values = Array.from({ length: Math.min(CHUNK, ROWS - i) }, (_, j) => `('User ${i + j}', ${(i + j) * 1.5})`).join(',');
    await conn.query(`INSERT INTO bench_integ_mssql (name, score) VALUES ${values}`);
}

const median = (arr: number[]) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

for (let i = 0; i < WARMUP; i++) {
    await repo.findAll();
    await rawPool.request().query('SELECT id, name, score FROM bench_integ_mssql');
}

const mirrorMs: number[] = [];
const rawMs: number[]    = [];

for (let r = 0; r < ROUNDS; r++) {
    if (r % 2 === 0) {
        const t0 = performance.now(); await repo.findAll(); mirrorMs.push(performance.now() - t0);
        const t1 = performance.now(); await rawPool.request().query('SELECT id, name, score FROM bench_integ_mssql'); rawMs.push(performance.now() - t1);
    } else {
        const t0 = performance.now(); await rawPool.request().query('SELECT id, name, score FROM bench_integ_mssql'); rawMs.push(performance.now() - t0);
        const t1 = performance.now(); await repo.findAll(); mirrorMs.push(performance.now() - t1);
    }
}

await conn.query('DROP TABLE IF EXISTS bench_integ_mssql');
await rawPool.close();
await conn.disconnect();

const mp50 = median(mirrorMs);
const rp50 = median(rawMs);

console.log(`\n[Integration — SQL Server — ${ROWS} rows · ${ROUNDS} rounds]`);
console.log(`  Mirror ORM   p50 ${mp50.toFixed(3)}ms`);
console.log(`  Raw mssql    p50 ${rp50.toFixed(3)}ms`);
console.log(`mirror_mssql_p50=${mp50.toFixed(3)}`);
console.log(`raw_mssql_p50=${rp50.toFixed(3)}`);
