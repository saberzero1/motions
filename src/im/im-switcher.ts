import { Notice } from 'obsidian';
import {
    executeImGet,
    executeImSet,
    ImProcessConfig,
    isValidImIdentifier,
} from './im-process';

export interface ImSwitcherConfig {
    enabled: boolean;
    autoWire: boolean;
    defaultNormalIm: string;
    restoreBehavior: 'restore' | 'default';
    defaultInsertIm: string;
    obtainConfig: ImProcessConfig;
    switchConfig: ImProcessConfig;
}

export class ImSwitcher {
    public readonly config: ImSwitcherConfig;
    public lastKnownIm: string | null = null;

    private savedImByLeaf: Map<string, string>;
    private isComposing = false;
    private pendingSwitch: (() => void) | null = null;
    private switchTimer: number | null = null;
    private currentEditorElement: HTMLElement | null = null;
    private destroyed = false;
    private compositionStartHandler: () => void;
    private compositionEndHandler: () => void;

    constructor(config: ImSwitcherConfig) {
        this.config = config;
        this.savedImByLeaf = new Map();
        this.compositionStartHandler = this.onCompositionStart;
        this.compositionEndHandler = this.onCompositionEnd;
    }

    primeCache(): void {
        executeImGet(this.config.obtainConfig)
            .then((imId) => {
                if (this.destroyed) return;
                this.lastKnownIm = imId;
            })
            .catch((error) => {
                if (this.destroyed) return;
                console.warn('Failed to obtain input method.', error);
            });
    }

    async get(): Promise<string | null> {
        const imId = await executeImGet(this.config.obtainConfig);
        this.lastKnownIm = imId;
        return imId;
    }

    async set(imId: string): Promise<void> {
        if (!isValidImIdentifier(imId)) {
            new Notice('Invalid input method identifier.');
            return;
        }

        const switched = await executeImSet(this.config.switchConfig, imId);
        if (!switched) {
            console.warn('Failed to switch input method.');
            return;
        }

        this.lastKnownIm = imId;
    }

    save(leafId: string): void {
        if (this.lastKnownIm !== null) {
            this.savedImByLeaf.set(leafId, this.lastKnownIm);
        }

        executeImGet(this.config.obtainConfig)
            .then((imId) => {
                if (this.destroyed) return;
                this.lastKnownIm = imId;
            })
            .catch((error) => {
                if (this.destroyed) return;
                console.warn('Failed to refresh input method cache.', error);
            });
    }

    restore(leafId: string): void {
        const savedIm = this.savedImByLeaf.get(leafId);
        if (this.config.restoreBehavior === 'restore' && savedIm) {
            void this.set(savedIm);
            return;
        }

        if (
            this.config.restoreBehavior === 'default' &&
            this.config.defaultInsertIm
        ) {
            void this.set(this.config.defaultInsertIm);
        }
    }

    onInsertLeave(leafId: string): void {
        this.debouncedSwitch(() => {
            this.save(leafId);

            const defaultIm = this.config.defaultNormalIm;
            if (!defaultIm) return;
            if (this.lastKnownIm === defaultIm) return;
            void this.set(defaultIm);
        });
    }

    onInsertEnter(leafId: string): void {
        this.debouncedSwitch(() => {
            this.restore(leafId);
        });
    }

    onCmdlineLeave(_leafId: string): void {
        this.debouncedSwitch(() => {
            const defaultIm = this.config.defaultNormalIm;
            if (!defaultIm) return;
            if (this.lastKnownIm === defaultIm) return;
            void this.set(defaultIm);
        });
    }

    onLeafChange(_leafId: string): void {
        return;
    }

    reattachCompositionListeners(el: HTMLElement | null): void {
        if (this.currentEditorElement) {
            this.currentEditorElement.removeEventListener(
                'compositionstart',
                this.compositionStartHandler,
            );
            this.currentEditorElement.removeEventListener(
                'compositionend',
                this.compositionEndHandler,
            );
        }

        this.currentEditorElement = el;
        this.isComposing = false;
        this.pendingSwitch = null;

        if (this.currentEditorElement) {
            this.currentEditorElement.addEventListener(
                'compositionstart',
                this.compositionStartHandler,
            );
            this.currentEditorElement.addEventListener(
                'compositionend',
                this.compositionEndHandler,
            );
        }
    }

    setAutoWire(value: boolean): void {
        this.config.autoWire = value;
    }

    destroy(): void {
        this.destroyed = true;
        if (this.switchTimer !== null) {
            window.clearTimeout(this.switchTimer);
            this.switchTimer = null;
        }

        if (this.currentEditorElement) {
            this.currentEditorElement.removeEventListener(
                'compositionstart',
                this.compositionStartHandler,
            );
            this.currentEditorElement.removeEventListener(
                'compositionend',
                this.compositionEndHandler,
            );
            this.currentEditorElement = null;
        }

        this.savedImByLeaf.clear();
        this.pendingSwitch = null;
        this.isComposing = false;
    }

    private debouncedSwitch(fn: () => void): void {
        if (this.destroyed) return;
        if (this.isComposing) {
            this.pendingSwitch = fn;
            return;
        }

        if (this.switchTimer !== null) {
            window.clearTimeout(this.switchTimer);
        }

        this.switchTimer = window.setTimeout(() => {
            this.switchTimer = null;
            if (this.destroyed) return;
            fn();
        }, 50);
    }

    private onCompositionStart = (): void => {
        this.isComposing = true;
    };

    private onCompositionEnd = (): void => {
        this.isComposing = false;
        if (!this.pendingSwitch) return;
        const pending = this.pendingSwitch;
        this.pendingSwitch = null;
        void Promise.resolve().then(() => {
            if (this.destroyed) return;
            pending();
        });
    };
}
