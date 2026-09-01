import { defineConfig, type Plugin } from 'vitest/config';
import { readFileSync } from 'fs';

function wasmBinaryPlugin(): Plugin {
    return {
        name: 'wasm-binary',
        enforce: 'pre',
        load(id: string) {
            if (!id.endsWith('.wasm')) return;
            const bytes = readFileSync(id);
            const base64 = bytes.toString('base64');
            return `
                const b = atob(${JSON.stringify(base64)});
                const u = new Uint8Array(b.length);
                for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
                export default u;
            `;
        },
    };
}

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
