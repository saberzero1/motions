export interface DemandSite {
    name: string;
    line: number;
    expression: string;
}

interface Token {
    text: string;
    line: number;
    kind: 'name' | 'string' | 'symbol';
}

/** Comments (including documentation examples) and string contents are not
 * executable references. Preserve line numbers for the reviewed checklist.
 */
function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let offset = 0;
    let line = 1;
    while (offset < source.length) {
        const rest = source.slice(offset);
        const comment = rest.startsWith('--');
        const long = /^(?:--)?\[(=*)\[/.exec(rest);
        let text: string;
        let kind: Token['kind'] = 'symbol';
        if (long) {
            const delimiter = `]${long[1]}]`;
            const end = source.indexOf(delimiter, offset + long[0].length);
            if (end < 0) throw new Error(`Unterminated long string at ${line}`);
            text = source.slice(offset, end + delimiter.length);
            kind = 'string';
        } else if (comment) {
            text = rest.split('\n', 1)[0]!;
        } else {
            const match =
                /^(\s+|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|[A-Za-z_][A-Za-z_0-9]*|\.\.|.)/.exec(
                    rest,
                );
            if (!match) throw new Error(`Unrecognized token at ${line}`);
            text = match[0];
            if (/^["']/.test(text)) kind = 'string';
            else if (/^[A-Za-z_]/.test(text)) kind = 'name';
        }
        if (!comment && !/^\s+$/.test(text)) tokens.push({ text, line, kind });
        line += text.split('\n').length - 1;
        offset += text.length;
    }
    return tokens;
}

/** Deliberately conservative static discovery, not a claim to infer arbitrary
 * Lua control flow. A source digest pins the manually reviewed reachability.
 * Unknown computed access/require remains unresolved and blocks the gate.
 */
export function scanPluginDemand(source: string) {
    const tokens = tokenize(source);
    const aliases = new Map<string, string>([['vim', 'vim']]);
    const constants = new Map<string, string>();
    const requireAliases = new Set(['require']);
    const sites: DemandSite[] = [];
    const unresolved: DemandSite[] = [];
    const requires = new Set<string>();
    const lines = source.split('\n');
    const literal = (token: Token | undefined): string | undefined => {
        if (token?.kind === 'string' && /^["']/.test(token.text)) {
            // Escaped computed keys need explicit review, not a guessed decode.
            if (token.text.includes('\\')) return undefined;
            return token.text.slice(1, -1);
        }
        return constants.get(token?.text ?? '');
    };
    const constantAt = (
        start: number,
    ): { value: string | undefined; end: number } => {
        let value = literal(tokens[start]);
        let end = start + 1;
        while (tokens[end]?.text === '..') {
            const suffix = literal(tokens[end + 1]);
            value =
                value === undefined || suffix === undefined
                    ? undefined
                    : value + suffix;
            end += 2;
        }
        return { value, end };
    };
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]!;
        const site = (name: string): DemandSite => ({
            name,
            line: token.line,
            expression: lines[token.line - 1]!.trim(),
        });
        if (
            token.kind === 'name' &&
            tokens[i - 1]?.text === 'local' &&
            tokens[i + 1]?.text === '='
        ) {
            if (tokens[i + 2]?.text === 'require')
                requireAliases.add(token.text);
            else if (requireAliases.has(token.text))
                requireAliases.delete(token.text);
            if (
                aliases.has(token.text) &&
                !aliases.has(tokens[i + 2]?.text ?? '')
            ) {
                unresolved.push(site(`${aliases.get(token.text)}[shadowed]`));
                aliases.delete(token.text);
            }
        }
        const directRequireCall =
            requireAliases.has(token.text) &&
            !['.', ':', 'local'].includes(tokens[i - 1]?.text ?? '') &&
            (tokens[i + 1]?.text === '(' ||
                tokens[i + 1]?.kind === 'string' ||
                (tokens[i - 2]?.text === 'pcall' &&
                    tokens[i - 1]?.text === '(' &&
                    tokens[i + 1]?.text === ','));
        if (directRequireCall) {
            const argument =
                tokens[i + 1]?.text === '(' || tokens[i + 1]?.text === ','
                    ? i + 2
                    : i + 1;
            const { value } = constantAt(argument);
            if (value === undefined) unresolved.push(site('require[?]'));
            else requires.add(value);
        }
        if (
            token.kind === 'name' &&
            tokens[i - 1]?.text === 'local' &&
            tokens[i + 1]?.text === '='
        ) {
            const { value } = constantAt(i + 2);
            if (value !== undefined) constants.set(token.text, value);
        }
        let name = aliases.get(token.text);
        if (!name || tokens[i - 1]?.text === '.' || tokens[i - 1]?.text === ':')
            continue;
        let j = i + 1;
        let unknown = false;
        while (tokens[j]?.text === '.' || tokens[j]?.text === '[') {
            if (tokens[j]!.text === '.') {
                if (tokens[j + 1]?.kind !== 'name')
                    throw new Error(`Invalid member at ${token.line}`);
                name += `.${tokens[j + 1]!.text}`;
                j += 2;
            } else {
                const member = constantAt(j + 1);
                if (
                    member.value === undefined ||
                    tokens[member.end]?.text !== ']'
                ) {
                    unknown = true;
                    name += '[?]';
                    break;
                }
                name += `.${member.value}`;
                j = member.end + 1;
            }
        }
        const aliasAssignment =
            tokens[i - 1]?.text === '=' &&
            tokens[i - 2]?.kind === 'name' &&
            tokens[i - 3]?.text === 'local' &&
            (!tokens[j] ||
                tokens[j]!.line > token.line ||
                [';', 'end'].includes(tokens[j]!.text));
        if (aliasAssignment && !unknown) aliases.set(tokens[i - 2]!.text, name);
        if (unknown) unresolved.push(site(name));
        else if (
            name !== 'vim' &&
            !(aliasAssignment && ['vim.api', 'vim.fn'].includes(name))
        )
            sites.push(site(name));
        i = Math.max(i, j - 1);
    }
    return { sites, unresolved, requires: [...requires].sort() };
}

export function compareDemandToInventory(sites: DemandSite[], names: string[]) {
    return [...new Set(sites.map((site) => site.name))]
        .filter((name) => !names.includes(name))
        .sort();
}

/** Follow the installed module closure, recording missing dependency edges
 * explicitly. Callers decide whether an absent edge is guarded/optional; this
 * scanner never silently promotes absence to "not used". Cycles terminate.
 */
export function scanPluginClosure(
    entry: string,
    root: string,
    read: (path: string) => string | null,
) {
    const files: Record<string, ReturnType<typeof scanPluginDemand>> = {};
    const missing: Array<{ from: string; module: string }> = [];
    const scan = (path: string): void => {
        if (files[path]) return;
        const source = read(path);
        if (source === null) throw new Error(`Missing closure entry: ${path}`);
        const result = scanPluginDemand(source);
        files[path] = result;
        for (const name of result.requires) {
            const relative = name.replaceAll('.', '/');
            const candidates = [
                `${root}/${relative}.lua`,
                `${root}/${relative}/init.lua`,
            ];
            const resolved = candidates.find(
                (candidate) => read(candidate) !== null,
            );
            if (resolved) scan(resolved);
            else missing.push({ from: path, module: name });
        }
    };
    scan(entry);
    return { files, missing };
}
