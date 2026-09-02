import { defineConfig } from 'vitest/config';
import { wasmBinaryPlugin } from './test/helpers';

export default defineConfig({
    plugins: [wasmBinaryPlugin()],
    define: {
        __DEV__: 'true',
    },
    test: {
        include: ['test/unit/**/*.test.ts'],
        benchmark: {
            include: ['test/bench/**/*.bench.ts'],
        },
        globals: true,
        setupFiles: ['test/unit/setup.ts'],
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
