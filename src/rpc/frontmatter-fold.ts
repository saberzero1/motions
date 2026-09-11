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
_G.vim_motions_rpc_foldexpr = function()
    local lnum = vim.v.lnum
    local lines = vim.api.nvim_buf_get_lines(0, 0, -1, false)
    local function heading_level(line)
        local hashes = line:match("^(#+)%s")
        return hashes and #hashes or nil
    end
    if rendered and lines[1] and lines[1]:match(delimiter) then
        local closing = nil
        for index = 2, #lines do
            if lines[index]:match(delimiter) then
                closing = index
                break
            end
        end
        if closing and lnum <= closing then
            if lnum == 1 then return ">100" end
            if lnum == closing then return "<100" end
            return 100
        end
    end
    local line = lines[lnum] or ""
    local level = heading_level(line)
    if level then return ">" .. level end
    local parent_level = 0
    for index = lnum - 1, 1, -1 do
        local candidate = heading_level(lines[index] or "")
        if candidate then
            parent_level = candidate
            break
        end
    end
    local callout_start = line:match("^%s*>%s*%[!.+%]") ~= nil
    local quoted = line:match("^%s*>") ~= nil
    if callout_start then return ">" .. (parent_level + 1) end
    if quoted then return parent_level + 1 end
    if line:match("^%s*$") then
        for index = lnum + 1, #lines do
            local next_line = lines[index] or ""
            if not next_line:match("^%s*$") then
                local next_level = heading_level(next_line)
                if next_level and next_level <= parent_level then return 0 end
                break
            end
        end
    end
    return parent_level
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
