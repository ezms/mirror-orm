import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.spec.ts'],
        setupFiles: ['./src/polyfills.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/__tests__/**', 'src/index.ts', 'src/polyfills.ts'],
            reporter: ['text', 'json-summary'],
            reportsDirectory: './coverage',
        },
    },
});
