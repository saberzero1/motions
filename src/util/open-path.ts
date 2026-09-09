import type { App } from 'obsidian';
import { isAbsolutePath, openExternalPath } from './external-fs';

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
