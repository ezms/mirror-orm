import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.spec.ts'],
        setupFiles: ['./src/polyfills.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: [
                'src/__tests__/**',
                'src/index.ts',
                'src/polyfills.ts',
                'src/adapters/mssql/**',
                'src/dialects/mssql.dialect.ts',
            ],
            thresholds: {
                branches: 80,
                statements: 80,
            },
            reporter: ['text', 'json-summary'],
            reportsDirectory: './coverage',
        },
    },
});
