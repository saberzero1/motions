import type { App } from 'obsidian';
import { OilView, OIL_VIEW_TYPE } from './view';
import { getVimApi } from '../vim/vim-api';

interface OilMapping {
    lhs: string;
    actionName: string;
}

const OIL_MAPPINGS: OilMapping[] = [
    { lhs: '<CR>', actionName: 'oilOpenEntry' },
    { lhs: '-', actionName: 'oilParent' },
    { lhs: '~', actionName: 'oilRoot' },
    { lhs: '<C-l>', actionName: 'oilRefresh' },
    { lhs: 'q', actionName: 'oilClose' },
    { lhs: 'g.', actionName: 'oilToggleHidden' },
    { lhs: 'gs', actionName: 'oilCycleSort' },
    { lhs: 'y.', actionName: 'oilYankPath' },
];

function getActiveOilView(app: App): OilView | null {
    const leaf = app.workspace.getMostRecentLeaf();
    if (leaf?.view?.getViewType() === OIL_VIEW_TYPE) {
        return leaf.view as OilView;
    }
    return null;
}

export class OilKeybindingManager {
    private applied = false;
    private actionsRegistered = false;

    constructor(private readonly app: App) {}

    onActiveLeafChange(): void {
        const oilView = getActiveOilView(this.app);
        if (oilView && !this.applied) {
            this.apply();
        } else if (!oilView && this.applied) {
            this.remove();
        }
    }

    private apply(): void {
        this.ensureActionsRegistered();
        const vim = getVimApi();
        if (!vim) return;
        for (const m of OIL_MAPPINGS) {
            vim.mapCommand(m.lhs, 'action', m.actionName, {});
        }
        this.applied = true;
    }

    private remove(): void {
        const vim = getVimApi();
        if (!vim) return;
        for (const m of OIL_MAPPINGS) {
            try {
                vim.unmap(m.lhs, 'normal');
            } catch {
                /* binding may not exist */
            }
        }
        this.applied = false;
    }

    private ensureActionsRegistered(): void {
        if (this.actionsRegistered) return;
        const vim = getVimApi();
        if (!vim) return;
        this.actionsRegistered = true;
        const app = this.app;

        vim.defineAction('oilOpenEntry', () => getActiveOilView(app)?.openEntryUnderCursor());
        vim.defineAction('oilParent', () => getActiveOilView(app)?.navigateToParent());
        vim.defineAction('oilRoot', () => getActiveOilView(app)?.navigateToRoot());
        vim.defineAction('oilRefresh', () => getActiveOilView(app)?.refresh());
        vim.defineAction('oilClose', () => {
            const view = getActiveOilView(app);
            if (view) view.leaf.detach();
        });
        vim.defineAction('oilToggleHidden', () => getActiveOilView(app)?.toggleHidden());
        vim.defineAction('oilCycleSort', () => getActiveOilView(app)?.cycleSortKey());
        vim.defineAction('oilYankPath', () => getActiveOilView(app)?.yankFilePath());
    }

    destroy(): void {
        if (this.applied) this.remove();
    }
}
