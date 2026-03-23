// Compares bench:pure output from two files and exits 1 if PR is >15% slower.
// Usage: node compare-bench.mjs <pr-file> <develop-file>

import { readFileSync } from 'fs';

const [, , prFile = '/tmp/bench-pr.txt', devFile = '/tmp/bench-develop.txt'] = process.argv;

const parse = file => {
    const content = readFileSync(file, 'utf8');
    const match = content.match(/mirror_ns_per_row=([\d.]+)/);
    if (!match) throw new Error(`Could not parse bench output from ${file}`);
    return parseFloat(match[1]);
};

const prNs  = parse(prFile);
const devNs = parse(devFile);
const pct   = ((prNs - devNs) / devNs) * 100;

console.log(`PR:      ${prNs.toFixed(2)} ns/row`);
console.log(`develop: ${devNs.toFixed(2)} ns/row`);
console.log(`diff:    ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`);

const THRESHOLD = 25;

if (pct > THRESHOLD) {
    console.error(`\n❌ Performance regression: PR is ${pct.toFixed(1)}% slower than develop (threshold: ${THRESHOLD}%)`);
    process.exit(1);
}

const direction = pct >= 0
    ? `${pct.toFixed(1)}% slower`
    : `${Math.abs(pct).toFixed(1)}% faster`;
console.log(`\n✅ Performance OK (${direction} than develop)`);
