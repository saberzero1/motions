import { attach, type NeovimClient as NvimAPI } from 'neovim';
import { spawn, type ChildProcess } from 'child_process';

export class NeovimClient {
    private process!: ChildProcess;
    private nvim!: NvimAPI;

    async start(): Promise<void> {
        this.process = spawn(
            'nvim',
            ['--embed', '--headless', '-u', 'NONE', '--noplugin'],
            { stdio: ['pipe', 'pipe', 'ignore'] },
        );
        this.nvim = attach({
            reader: this.process.stdout!,
            writer: this.process.stdin!,
        });
        await this.nvim.command('set columns=80 lines=24');
        await this.nvim.command('set noswapfile nobackup');
        await this.nvim.command('set iskeyword=@,48-57,_,192-255');
    }

    async setContent(text: string): Promise<void> {
        const buf = await this.nvim.buffer;
        const lines = text.split('\n');
        await buf.setLines(lines, {
            start: 0,
            end: -1,
            strictIndexing: false,
        });
    }

    async setCursor(line: number, ch: number): Promise<void> {
        const win = await this.nvim.window;
        win.cursor = [line + 1, ch];
        await this.nvim.command('redraw');
    }

    async input(keys: string): Promise<void> {
        await this.nvim.input(keys);
        await this.nvim.command('redraw');
    }

    async getContent(): Promise<string> {
        const buf = await this.nvim.buffer;
        const lines = await buf.getLines({
            start: 0,
            end: -1,
            strictIndexing: false,
        });
        return lines.join('\n');
    }

    async getCursor(): Promise<{ line: number; ch: number }> {
        const win = await this.nvim.window;
        const [line, col] = await win.cursor;
        return { line: line - 1, ch: col };
    }

    async getMode(): Promise<string> {
        const mode = await this.nvim.mode;
        if (mode.mode === 'n') return 'normal';
        if (mode.mode === 'i') return 'insert';
        if (
            mode.mode.startsWith('v') ||
            mode.mode === 'V' ||
            mode.mode === '\x16'
        )
            return 'visual';
        return mode.mode;
    }

    async getRegister(name: string): Promise<string> {
        return (await this.nvim.call('getreg', [name])) as string;
    }

    async getVersion(): Promise<string> {
        const info = (await this.nvim.call('api_info', [])) as {
            version: { major: number; minor: number; patch: number };
        };
        const v = info.version;
        return `${v.major}.${v.minor}.${v.patch}`;
    }

    async stop(): Promise<void> {
        try {
            await this.nvim.command('qa!');
        } catch {
            // Expected — process exits
        }
        this.process.kill();
    }
}
