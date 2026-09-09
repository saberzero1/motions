import type { App } from 'obsidian';
import {
    isAbsolutePath,
    openExternalPath,
    revealExternalPath,
} from './external-fs';

/**
 * Open a file in the OS default application, whether it lives inside the
 * vault or outside it.
 *
 * `App.openWithDefaultApp()` resolves its argument through the vault adapter,
 * which joins it onto the vault base path. That is correct for a vault file
 * and silently wrong for an absolute one — `/home/u/init.lua` becomes
 * `<vault>/home/u/init.lua` — so out-of-vault paths take the Electron route.
 *
 * Returns `false` when the path could not be opened, which on an absolute
 * path includes mobile, where there is no way to reach outside the vault.
 */
export async function openPathInDefaultApp(
    app: App,
    filePath: string,
): Promise<boolean> {
    if (!isAbsolutePath(filePath)) {
        app.openWithDefaultApp(filePath);
        return true;
    }
    return await openExternalPath(filePath);
}

/**
 * Reveal a file in the OS file manager, opening the folder that contains it
 * with the file itself selected.
 *
 * Takes the file rather than its directory deliberately: both routes end at
 * Electron's `showItemInFolder`, which selects the item inside its parent, so
 * passing the file gives the containing folder *and* highlights which file is
 * the active one. Deriving the parent directory first would lose that.
 *
 * Returns `false` when the path could not be revealed, which on an absolute
 * path includes mobile.
 */
/**
 * The directory portion of a path, or `''` for a bare vault-root filename.
 *
 * Separator-based rather than `path.dirname`, because vault-relative paths use
 * `/` on every platform while an external Windows path uses `\`.
 */
export function parentDirOf(filePath: string): string {
    const cut = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return cut === -1 ? '' : filePath.slice(0, cut);
}

export function revealPathInSystemExplorer(
    app: App,
    filePath: string,
): boolean {
    if (!isAbsolutePath(filePath)) {
        app.showInFolder(filePath);
        return true;
    }
    return revealExternalPath(filePath);
}
