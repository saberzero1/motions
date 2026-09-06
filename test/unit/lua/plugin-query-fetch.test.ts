import { describe, expect, it } from 'vitest';
import { gzipSync } from 'fflate';
import { fetchPluginTarball } from '../../../src/lua/plugin-fetch';

describe('plugin query extraction', () => {
    it('keeps regular queries alongside Lua but excludes traversal and unrelated files', async () => {
        const paths = [
            'lua/plugin/init.lua',
            'queries/markdown/textobjects.scm',
            'queries/html/textobjects.scm',
            'queries/../../escape.scm',
            'queries/markdown/../escape.scm',
            'queries/markdown/README.md',
            'README.md',
        ];
        const encoder = new TextEncoder();
        const tar = new Uint8Array((paths.length + 1) * 1024);
        paths.forEach((path, i) => {
            const offset = i * 1024;
            tar.set(encoder.encode(`plugin-main/${path}`), offset);
            tar.set(encoder.encode('00000000001\0'), offset + 124);
            tar[offset + 156] = 0x30;
            tar[offset + 512] = 0x78;
        });
        const compressed = gzipSync(tar);
        const buffer = new ArrayBuffer(compressed.length);
        new Uint8Array(buffer).set(compressed);
        const files = await fetchPluginTarball(
            'https://example.com/plugin.tar.gz',
            async () => ({ arrayBuffer: buffer }),
        );
        expect(files.map((file) => file.path)).toEqual(paths.slice(0, 3));
    });
});
