// Benchmarks Mirror ORM's core hydration overhead (no database, no build required).
// Replicates the same new Function() hydrator that RepositoryState.buildHydrator() generates.

class BenchUser {}

const COLUMNS = [
    { propertyKey: 'id',    databaseName: 'id' },
    { propertyKey: 'name',  databaseName: 'name' },
    { propertyKey: 'email', databaseName: 'email' },
    { propertyKey: 'age',   databaseName: 'age' },
    { propertyKey: 'score', databaseName: 'score' },
];

const assignments = COLUMNS
    .map(c => `if(r["${c.databaseName}"]!==undefined)i["${c.propertyKey}"]=r["${c.databaseName}"];`)
    .join('');

type HydrateFn = (row: Record<string, unknown>) => BenchUser;

const hydrate = new Function(
    'C',
    `return function hydrate(r){var i=Object.create(C.prototype);${assignments}return i;}`,
)(BenchUser) as HydrateFn;

const ROWS   = 10_000;
const ROUNDS = 100;

const fakeRows = Array.from({ length: ROWS }, (_, i): Record<string, unknown> => ({
    id:    i,
    name:  `User ${i}`,
    email: `user${i}@example.com`,
    age:   25 + (i % 50),
    score: (i % 100) * 1.5,
}));

// Warmup — let V8 JIT stabilise
for (let i = 0; i < 5; i++) for (const row of fakeRows) hydrate(row);

// Bench
const start = performance.now();
for (let r = 0; r < ROUNDS; r++) for (const row of fakeRows) hydrate(row);
const elapsed = performance.now() - start;

const nsPerRow = (elapsed * 1e6) / (ROWS * ROUNDS);
console.log(`mirror_ns_per_row=${nsPerRow.toFixed(2)}`);
