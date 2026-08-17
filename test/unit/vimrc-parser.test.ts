import { describe, expect, it } from 'vitest';
import { parseLine, parseVimrc } from '../../src/vimrc/parser';

describe('Vimrc parser — parseLine', () => {
    describe('map commands', () => {
        it('parses nmap', () => {
            const result = parseLine('nmap j gj');
            expect(result).toMatchObject({
                type: 'map',
                mapType: 'nmap',
                context: 'normal',
                noremap: false,
                lhs: 'j',
                rhs: 'gj',
            });
        });

        it('parses nnoremap', () => {
            const result = parseLine('nnoremap j gj');
            expect(result).toMatchObject({
                type: 'map',
                noremap: true,
                context: 'normal',
                lhs: 'j',
                rhs: 'gj',
            });
        });

        it('parses imap', () => {
            const result = parseLine('imap jk <Esc>');
            expect(result).toMatchObject({
                type: 'map',
                context: 'insert',
                lhs: 'jk',
                rhs: '<Esc>',
            });
        });

        it('parses vmap', () => {
            const result = parseLine('vmap < <gv');
            expect(result).toMatchObject({
                type: 'map',
                context: 'visual',
                lhs: '<',
                rhs: '<gv',
            });
        });

        it('parses generic map (no prefix)', () => {
            const result = parseLine('map H ^');
            expect(result).toMatchObject({
                type: 'map',
                context: undefined,
                lhs: 'H',
                rhs: '^',
            });
        });

        it('parses noremap', () => {
            const result = parseLine('noremap L $');
            expect(result).toMatchObject({
                type: 'map',
                noremap: true,
                context: 'normal',
            });
        });

        it('returns null for map without rhs', () => {
            expect(parseLine('nmap j')).toBeNull();
        });

        it('preserves multi-word rhs', () => {
            const result = parseLine('nmap <leader>w :w<CR>');
            expect(result?.rhs).toBe(':w<CR>');
        });
    });

    describe('unmap commands', () => {
        it('parses unmap', () => {
            const result = parseLine('unmap j');
            expect(result).toMatchObject({ type: 'unmap', lhs: 'j' });
        });

        it('parses nunmap', () => {
            const result = parseLine('nunmap <Space>');
            expect(result).toMatchObject({
                type: 'unmap',
                context: 'normal',
                lhs: '<Space>',
            });
        });

        it('returns null for unmap without lhs', () => {
            expect(parseLine('unmap')).toBeNull();
        });
    });

    describe('gmap/gunmap commands', () => {
        it('parses gmap', () => {
            const result = parseLine('gmap H workspace:previous-tab');
            expect(result).toMatchObject({
                type: 'gmap',
                noremap: false,
                lhs: 'H',
                rhs: 'workspace:previous-tab',
            });
        });

        it('parses gnoremap', () => {
            const result = parseLine('gnoremap L workspace:next-tab');
            expect(result).toMatchObject({
                type: 'gmap',
                noremap: true,
                lhs: 'L',
            });
        });

        it('parses gunmap', () => {
            const result = parseLine('gunmap H');
            expect(result).toMatchObject({ type: 'gunmap', lhs: 'H' });
        });
    });

    describe('set command', () => {
        it('parses set with key=value', () => {
            const result = parseLine('set textwidth=80');
            expect(result).toMatchObject({
                type: 'set',
                key: 'textwidth',
                value: '80',
            });
        });

        it('parses set with boolean key (no value)', () => {
            const result = parseLine('set expandtab');
            expect(result).toMatchObject({
                type: 'set',
                key: 'expandtab',
                value: '',
            });
        });

        it('returns null for bare set', () => {
            expect(parseLine('set')).toBeNull();
        });
    });

    describe('let command', () => {
        it('parses let with quoted value', () => {
            const result = parseLine('let mapleader = "\\\\"');
            expect(result).toMatchObject({ type: 'let', key: 'mapleader' });
        });

        it('parses let with single-quoted value', () => {
            const result = parseLine("let mapleader = ' '");
            expect(result).toMatchObject({
                type: 'let',
                key: 'mapleader',
                value: ' ',
            });
        });
    });

    describe('exmap and obcommand', () => {
        it('parses exmap', () => {
            const result = parseLine(
                'exmap saveFile obcommand editor:save-file',
            );
            expect(result).toMatchObject({
                type: 'exmap',
                name: 'saveFile',
                args: 'obcommand editor:save-file',
            });
        });

        it('parses obcommand', () => {
            const result = parseLine('obcommand editor:save-file');
            expect(result).toMatchObject({
                type: 'obcommand',
                args: 'editor:save-file',
            });
        });

        it('returns null for exmap without body', () => {
            expect(parseLine('exmap saveFile')).toBeNull();
        });
    });

    describe('surroundmap/surroundunmap', () => {
        it('parses surroundmap', () => {
            const result = parseLine('surroundmap ~ <del> </del>');
            expect(result).toMatchObject({ type: 'surroundmap', lhs: '~' });
            expect(result?.rhs).toContain('<del>');
        });

        it('parses surroundunmap', () => {
            const result = parseLine('surroundunmap ~');
            expect(result).toMatchObject({ type: 'surroundunmap', lhs: '~' });
        });
    });

    describe('gwhichkeylabel/gwhichkeygroup', () => {
        it('parses gwhichkeylabel', () => {
            const result = parseLine('gwhichkeylabel <leader>w Save file');
            expect(result).toMatchObject({
                type: 'gwhichkeylabel',
                lhs: '<leader>w',
                rhs: 'Save file',
            });
        });

        it('parses gwhichkeygroup with icon and color', () => {
            const result = parseLine(
                'gwhichkeygroup <leader>t Table icon=table color=blue',
            );
            expect(result).toMatchObject({
                type: 'gwhichkeygroup',
                lhs: '<leader>t',
                rhs: 'Table',
                icon: 'table',
                color: 'blue',
            });
        });

        it('parses gwhichkeygroup with icon only', () => {
            const result = parseLine(
                'gwhichkeygroup <leader>g Git icon=git-branch',
            );
            expect(result).toMatchObject({
                rhs: 'Git',
                icon: 'git-branch',
                color: undefined,
            });
        });
    });

    describe('source', () => {
        it('parses source with path', () => {
            const result = parseLine('source .obsidian/extra.vimrc');
            expect(result).toMatchObject({
                type: 'source',
                path: '.obsidian/extra.vimrc',
            });
        });

        it('parses source with path containing spaces', () => {
            const result = parseLine('source my configs/extra.vimrc');
            expect(result?.path).toBe('my configs/extra.vimrc');
        });
    });

    describe('comments and blank lines', () => {
        it('returns null for comment lines', () => {
            expect(parseLine('" This is a comment')).toBeNull();
        });

        it('returns null for empty string', () => {
            expect(parseLine('')).toBeNull();
        });

        it('returns null for whitespace-only', () => {
            expect(parseLine('   ')).toBeNull();
        });
    });

    describe('unknown commands', () => {
        it('returns unknown for unrecognized commands', () => {
            const result = parseLine('foobar something');
            expect(result).toMatchObject({
                type: 'unknown',
                raw: 'foobar something',
            });
        });
    });
});

describe('Vimrc parser — parseVimrc', () => {
    it('parses a multi-line vimrc', () => {
        const vimrc = [
            '" Leader key',
            'let mapleader = " "',
            '',
            'nmap j gj',
            'nmap k gk',
            'set textwidth=80',
            'exmap save obcommand editor:save-file',
            'nmap <leader>w :save',
        ].join('\n');

        const commands = parseVimrc(vimrc);
        expect(commands).toHaveLength(6);
        expect(commands[0]?.type).toBe('let');
        expect(commands[1]?.type).toBe('map');
        expect(commands[2]?.type).toBe('map');
        expect(commands[3]?.type).toBe('set');
        expect(commands[4]?.type).toBe('exmap');
        expect(commands[5]?.type).toBe('map');
    });

    it('skips comments and empty lines', () => {
        const vimrc = '" comment\n\nnmap j gj\n" another comment';
        const commands = parseVimrc(vimrc);
        expect(commands).toHaveLength(1);
    });
});
