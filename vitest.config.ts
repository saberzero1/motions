import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/unit/**/*.test.ts'],
        benchmark: {
            include: ['test/bench/**/*.bench.ts'],
        },
        globals: true,
    },
    resolve: {
        alias: {
            obsidian: new URL(
                'test/unit/__mocks__/obsidian.ts',
                import.meta.url,
            ).pathname,
        },
    },
});
