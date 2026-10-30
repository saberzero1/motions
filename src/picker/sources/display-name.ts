/**
 * A file's name as the picker lists it: a note without `.md`, anything else
 * with its extension. Obsidian's quick switcher lists files the same way
 * (measured: `Enh171`, `Img171.png`, `Doc171.pdf`), which keeps a PDF and a
 * note of the same name apart (#171).
 */
export function pickerFileName(path: string): string {
    const name = path.split('/').pop() ?? path;
    return name.endsWith('.md') ? name.slice(0, -'.md'.length) : name;
}
