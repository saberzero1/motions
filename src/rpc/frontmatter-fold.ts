import type { App } from 'obsidian';
import { FRONTMATTER_DELIMITER_PATTERN } from '../fold/frontmatter';
import { getVaultConfig } from '../util/vault';
import type { MsgpackRpcClient } from './msgpack-rpc';

const foldExpression = 'v:lua.vim_motions_rpc_foldexpr()';
const luaFrontmatterPattern = FRONTMATTER_DELIMITER_PATTERN.replace(
    String.raw`\s`,
    '%s',
);
const foldExpressionSource = `local rendered = ...
local delimiter = ${JSON.stringify(luaFrontmatterPattern)}
local cached_tick = -1
local cached_levels = {}
_G.vim_motions_rpc_foldexpr = function()
    local lnum = vim.v.lnum
    local tick = vim.api.nvim_buf_get_changedtick(0)
    if tick == cached_tick then return cached_levels[lnum] or 0 end
    local lines = vim.api.nvim_buf_get_lines(0, 0, -1, false)
    local function heading_level(line)
        local hashes = line:match("^(#+)%s")
        return hashes and #hashes or nil
    end
    local closing = nil
    if rendered and lines[1] and lines[1]:match(delimiter) then
        for index = 2, #lines do
            if lines[index]:match(delimiter) then
                closing = index
                break
            end
        end
    end
    local next_heading = {}
    local following = nil
    for index = #lines, 1, -1 do
        local line = lines[index] or ""
        if not line:match("^%s*$") then
            following = heading_level(line)
        end
        next_heading[index] = following
    end
    local parent_level = 0
    local levels = {}
    for index, line in ipairs(lines) do
        if closing and index <= closing then
            if index == 1 then
                levels[index] = ">100"
            elseif index == closing then
                levels[index] = "<100"
            else
                levels[index] = 100
            end
        else
            local level = heading_level(line)
            if level then
                levels[index] = ">" .. level
                parent_level = level
            elseif line:match("^%s*>%s*%[!.+%]") then
                levels[index] = ">" .. (parent_level + 1)
            elseif line:match("^%s*>") then
                levels[index] = parent_level + 1
            elseif line:match("^%s*$") and next_heading[index] and next_heading[index] <= parent_level then
                levels[index] = 0
            else
                levels[index] = parent_level
            end
        end
    end
    cached_tick = tick
    cached_levels = levels
    return cached_levels[lnum] or 0
end`;

export class NeovimFrontmatterFold {
    private enabled: boolean | null = null;

    constructor(
        private readonly app: App,
        private readonly rpc: MsgpackRpcClient,
    ) {}

    async sync(): Promise<void> {
        const enabled =
            getVaultConfig(this.app, 'propertiesInDocument') !== 'source';
        if (enabled === this.enabled) return;
        await this.rpc.request('nvim_exec_lua', [
            foldExpressionSource,
            [enabled],
        ]);
        await this.setWindowOption('foldmethod', 'expr');
        await this.setWindowOption('foldexpr', foldExpression);
        await this.setWindowOption('foldlevel', enabled ? 0 : 99);
        await this.setWindowOption('foldenable', true);
        this.enabled = enabled;
    }

    private async setWindowOption(name: string, value: unknown): Promise<void> {
        await this.rpc.request('nvim_set_option_value', [
            name,
            value,
            { win: 0 },
        ]);
    }
}
