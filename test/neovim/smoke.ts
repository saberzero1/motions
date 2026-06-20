import { NeovimClient } from './client.js';

function log(msg: string) {
    process.stderr.write(msg + '\n');
}

async function main() {
    log('Starting Neovim...');
    const nvim = new NeovimClient();
    await nvim.start();

    const version = await nvim.getVersion();
    log(`Neovim version: ${version}`);

    await nvim.setContent('hello world');
    await nvim.setCursor(0, 0);
    await nvim.input('dw');

    const content = await nvim.getContent();
    const cursor = await nvim.getCursor();
    const mode = await nvim.getMode();

    log(`content: ${JSON.stringify(content)}`);
    log(`cursor: ${JSON.stringify(cursor)}`);
    log(`mode: ${mode}`);

    const pass =
        content === 'world' &&
        cursor.line === 0 &&
        cursor.ch === 0 &&
        mode === 'normal';
    log(`PASS: ${pass}`);

    await nvim.stop();
    process.exit(pass ? 0 : 1);
}

main().catch((err) => {
    log(String(err));
    process.exit(1);
});
