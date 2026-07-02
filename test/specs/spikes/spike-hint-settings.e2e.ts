import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import { PAUSE } from '../../helpers';

async function openSettings(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        (
            app as unknown as {
                commands: { executeCommandById: (id: string) => void };
            }
        ).commands.executeCommandById('app:open-settings');
    });
    await browser.pause(PAUSE.OBSIDIAN_LOAD);
}

async function closeSettings(): Promise<void> {
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function navigateToPluginSettings(): Promise<void> {
    await browser.executeObsidian(() => {
        const items = activeDocument.querySelectorAll('.vertical-tab-nav-item');
        for (const item of Array.from(items)) {
            if (item.textContent?.includes('Vim Motions')) {
                (item as HTMLElement).click();
                return;
            }
        }
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Spike: Hint mode settings interaction', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    afterEach(async function () {
        await browser.executeObsidian(() => {
            activeDocument
                .querySelectorAll('.vim-motions-hint-overlay')
                .forEach((el) => el.remove());
        });
        await closeSettings();
    });

    describe('Diag 1: DOM structure of settings controls', function () {
        it('should inspect toggle DOM structure', async function () {
            await openSettings();
            await navigateToPluginSettings();

            const toggleInfo = (await browser.executeObsidian(() => {
                const toggles = activeDocument.querySelectorAll(
                    '.checkbox-container',
                );
                if (toggles.length === 0) return { found: 0 };

                const first = toggles[0] as HTMLElement;
                const parent = first.parentElement;
                return {
                    found: toggles.length,
                    tagName: first.tagName,
                    className: first.className,
                    parentTag: parent?.tagName,
                    parentClass: parent?.className,
                    innerHTML: first.innerHTML.slice(0, 200),
                    children: Array.from(first.children).map((c) => ({
                        tag: c.tagName,
                        type: c.getAttribute('type'),
                        cls: c.className,
                    })),
                    hasInput: !!first.querySelector('input'),
                    isEnabled: first.classList.contains('is-enabled'),
                    insideSettingControl: !!first.closest(
                        '.setting-item-control',
                    ),
                    insideModal: !!first.closest('.modal-container'),
                };
            })) as Record<string, unknown>;

            console.log('TOGGLE DOM:', JSON.stringify(toggleInfo, null, 2));
            expect(toggleInfo.found).toBeGreaterThan(0);
        });

        it('should inspect select/dropdown DOM structure', async function () {
            await openSettings();
            await navigateToPluginSettings();

            const selectInfo = (await browser.executeObsidian(() => {
                const selects = activeDocument.querySelectorAll(
                    '.modal-container select',
                );
                if (selects.length === 0) return { found: 0 };

                const first = selects[0] as HTMLSelectElement;
                const parent = first.parentElement;
                return {
                    found: selects.length,
                    tagName: first.tagName,
                    className: first.className,
                    parentTag: parent?.tagName,
                    parentClass: parent?.className,
                    optionCount: first.options.length,
                    options: Array.from(first.options).map((o) => ({
                        value: o.value,
                        text: o.text,
                        selected: o.selected,
                    })),
                    currentValue: first.value,
                    insideSettingControl: !!first.closest(
                        '.setting-item-control',
                    ),
                    insideModal: !!first.closest('.modal-container'),
                    disabled: first.disabled,
                };
            })) as Record<string, unknown>;

            console.log('SELECT DOM:', JSON.stringify(selectInfo, null, 2));
            expect(selectInfo.found).toBeGreaterThan(0);
        });
    });

    describe('Diag 2: Click mechanisms on toggle', function () {
        it('should test el.click() on checkbox-container', async function () {
            await openSettings();
            await navigateToPluginSettings();

            const result = (await browser.executeObsidian(() => {
                const toggle = activeDocument.querySelector(
                    '.modal-container .checkbox-container',
                ) as HTMLElement | null;
                if (!toggle) return { error: 'no toggle found' };

                const wasBefore = toggle.classList.contains('is-enabled');
                toggle.click();
                const isAfter = toggle.classList.contains('is-enabled');

                return {
                    wasBefore,
                    isAfter,
                    toggled: wasBefore !== isAfter,
                    method: 'el.click()',
                };
            })) as Record<string, unknown>;

            console.log('CLICK TEST:', JSON.stringify(result, null, 2));
        });

        it('should test dispatchEvent pointer+click on checkbox-container', async function () {
            await openSettings();
            await navigateToPluginSettings();

            const result = (await browser.executeObsidian(() => {
                const toggle = activeDocument.querySelector(
                    '.modal-container .checkbox-container',
                ) as HTMLElement | null;
                if (!toggle) return { error: 'no toggle found' };

                const wasBefore = toggle.classList.contains('is-enabled');
                toggle.dispatchEvent(
                    new PointerEvent('pointerdown', {
                        bubbles: true,
                        cancelable: true,
                    }),
                );
                toggle.dispatchEvent(
                    new PointerEvent('pointerup', {
                        bubbles: true,
                        cancelable: true,
                    }),
                );
                toggle.dispatchEvent(
                    new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                    }),
                );
                const isAfter = toggle.classList.contains('is-enabled');

                return {
                    wasBefore,
                    isAfter,
                    toggled: wasBefore !== isAfter,
                    method: 'pointer+click dispatch',
                };
            })) as Record<string, unknown>;

            console.log('POINTER+CLICK TEST:', JSON.stringify(result, null, 2));
        });

        it('should test clicking inner input if exists', async function () {
            await openSettings();
            await navigateToPluginSettings();

            const result = (await browser.executeObsidian(() => {
                const toggle = activeDocument.querySelector(
                    '.modal-container .checkbox-container',
                ) as HTMLElement | null;
                if (!toggle) return { error: 'no toggle found' };

                const input = toggle.querySelector('input');
                if (!input)
                    return {
                        error: 'no inner input',
                        toggleHTML: toggle.innerHTML.slice(0, 200),
                    };

                const wasBefore = toggle.classList.contains('is-enabled');
                input.click();
                const isAfter = toggle.classList.contains('is-enabled');

                return {
                    wasBefore,
                    isAfter,
                    toggled: wasBefore !== isAfter,
                    method: 'inner input.click()',
                    inputType: input.type,
                    inputCheckedBefore: !wasBefore,
                    inputCheckedAfter: input.checked,
                };
            })) as Record<string, unknown>;

            console.log('INNER INPUT TEST:', JSON.stringify(result, null, 2));
        });
    });

    describe('Diag 3: Click mechanisms on dropdown', function () {
        it('should test focus on select', async function () {
            await openSettings();
            await navigateToPluginSettings();

            const result = (await browser.executeObsidian(() => {
                const select = activeDocument.querySelector(
                    '.modal-container select',
                ) as HTMLSelectElement | null;
                if (!select) return { error: 'no select found' };

                select.focus();
                const isFocused = activeDocument.activeElement === select;

                return {
                    isFocused,
                    value: select.value,
                    optionCount: select.options.length,
                    method: 'focus()',
                };
            })) as Record<string, unknown>;

            console.log('SELECT FOCUS TEST:', JSON.stringify(result, null, 2));
        });

        it('should test focus+click on select', async function () {
            await openSettings();
            await navigateToPluginSettings();

            const result = (await browser.executeObsidian(() => {
                const select = activeDocument.querySelector(
                    '.modal-container select',
                ) as HTMLSelectElement | null;
                if (!select) return { error: 'no select found' };

                select.focus();
                select.click();
                const isFocused = activeDocument.activeElement === select;

                return {
                    isFocused,
                    value: select.value,
                    optionCount: select.options.length,
                    method: 'focus()+click()',
                };
            })) as Record<string, unknown>;

            console.log(
                'SELECT FOCUS+CLICK TEST:',
                JSON.stringify(result, null, 2),
            );
        });

        it('should test showPicker on select', async function () {
            await openSettings();
            await navigateToPluginSettings();

            const result = (await browser.executeObsidian(() => {
                const select = activeDocument.querySelector(
                    '.modal-container select',
                ) as HTMLSelectElement | null;
                if (!select) return { error: 'no select found' };

                select.focus();
                let pickerResult = 'not attempted';
                try {
                    select.showPicker();
                    pickerResult = 'success';
                } catch (e) {
                    pickerResult = `error: ${(e as Error).message}`;
                }

                return {
                    isFocused: activeDocument.activeElement === select,
                    value: select.value,
                    pickerResult,
                    method: 'showPicker()',
                };
            })) as Record<string, unknown>;

            console.log(
                'SELECT SHOWPICKER TEST:',
                JSON.stringify(result, null, 2),
            );
        });

        it('should test mousedown on select', async function () {
            await openSettings();
            await navigateToPluginSettings();

            const result = (await browser.executeObsidian(() => {
                const select = activeDocument.querySelector(
                    '.modal-container select',
                ) as HTMLSelectElement | null;
                if (!select) return { error: 'no select found' };

                select.focus();
                select.dispatchEvent(
                    new MouseEvent('mousedown', {
                        bubbles: true,
                        cancelable: true,
                    }),
                );
                const isFocused = activeDocument.activeElement === select;

                return {
                    isFocused,
                    value: select.value,
                    method: 'mousedown dispatch',
                };
            })) as Record<string, unknown>;

            console.log(
                'SELECT MOUSEDOWN TEST:',
                JSON.stringify(result, null, 2),
            );
        });

        it('should test changing value programmatically', async function () {
            await openSettings();
            await navigateToPluginSettings();

            const result = (await browser.executeObsidian(() => {
                const select = activeDocument.querySelector(
                    '.modal-container select',
                ) as HTMLSelectElement | null;
                if (!select) return { error: 'no select found' };

                const originalValue = select.value;
                const options = Array.from(select.options);
                const otherOption = options.find(
                    (o) => o.value !== originalValue,
                );
                if (!otherOption)
                    return { error: 'no other option', originalValue };

                select.value = otherOption.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));

                return {
                    originalValue,
                    newValue: select.value,
                    changed: select.value !== originalValue,
                    method: 'set value + dispatch change',
                };
            })) as Record<string, unknown>;

            console.log(
                'SELECT VALUE CHANGE TEST:',
                JSON.stringify(result, null, 2),
            );
        });
    });

    describe('Diag 5: Full hint flow on toggle', function () {
        it('should toggle a setting via hint label selection', async function () {
            await openSettings();
            await navigateToPluginSettings();

            const before = (await browser.executeObsidian(() => {
                const toggle = activeDocument.querySelector(
                    '.modal-container .checkbox-container',
                ) as HTMLElement | null;
                return toggle?.classList.contains('is-enabled') ?? null;
            })) as boolean | null;

            console.log('TOGGLE STATE BEFORE:', before);

            await browser.executeObsidian(({ app }) => {
                (
                    app as unknown as {
                        commands: {
                            executeCommandById: (id: string) => boolean;
                        };
                    }
                ).commands.executeCommandById('vim-motions:show-hint-labels');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const overlayInfo = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                if (!overlay) return { error: 'no overlay' };
                const labels = overlay.querySelectorAll(
                    '.vim-motions-hint-label',
                );

                const firstToggle = activeDocument.querySelector(
                    '.modal-container .checkbox-container',
                ) as HTMLElement | null;
                if (!firstToggle) return { error: 'no toggle' };

                const toggleRect = firstToggle.getBoundingClientRect();
                const toggleLeft = toggleRect.left + activeWindow.scrollX;
                const toggleTop = toggleRect.top + activeWindow.scrollY;

                let closestLabel = '';
                let closestDist = Infinity;
                for (const labelEl of Array.from(labels) as HTMLElement[]) {
                    const left = Number.parseFloat(
                        labelEl.style.getPropertyValue(
                            '--vim-motions-hint-left',
                        ),
                    );
                    const top = Number.parseFloat(
                        labelEl.style.getPropertyValue(
                            '--vim-motions-hint-top',
                        ),
                    );
                    if (Number.isNaN(left) || Number.isNaN(top)) continue;
                    const dist = Math.hypot(left - toggleLeft, top - toggleTop);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestLabel = labelEl.textContent ?? '';
                    }
                }

                return {
                    labelCount: labels.length,
                    closestLabel,
                    closestDist,
                    toggleRect: {
                        left: toggleRect.left,
                        top: toggleRect.top,
                        width: toggleRect.width,
                        height: toggleRect.height,
                    },
                };
            })) as Record<string, unknown>;

            console.log('OVERLAY INFO:', JSON.stringify(overlayInfo, null, 2));

            const label = overlayInfo.closestLabel as string;
            expect(label.length).toBeGreaterThan(0);

            for (const ch of label) {
                await browser.keys([ch]);
                await browser.pause(PAUSE.KEY_GAP);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                const toggle = activeDocument.querySelector(
                    '.modal-container .checkbox-container',
                ) as HTMLElement | null;
                return {
                    overlayGone: !overlay,
                    isEnabled: toggle?.classList.contains('is-enabled') ?? null,
                };
            })) as { overlayGone: boolean; isEnabled: boolean | null };

            console.log('AFTER HINT:', JSON.stringify(after, null, 2));
            console.log(
                'TOGGLED:',
                before !== null &&
                    after.isEnabled !== null &&
                    before !== after.isEnabled,
            );
            expect(after.overlayGone).toBe(true);
        });

        it('should focus a dropdown via hint label selection', async function () {
            await openSettings();
            await navigateToPluginSettings();

            await browser.executeObsidian(({ app }) => {
                (
                    app as unknown as {
                        commands: {
                            executeCommandById: (id: string) => boolean;
                        };
                    }
                ).commands.executeCommandById('vim-motions:show-hint-labels');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const overlayInfo = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                if (!overlay) return { error: 'no overlay' };

                const firstSelect = activeDocument.querySelector(
                    '.modal-container select',
                ) as HTMLElement | null;
                if (!firstSelect) return { error: 'no select' };

                const selectRect = firstSelect.getBoundingClientRect();
                const selectLeft = selectRect.left + activeWindow.scrollX;
                const selectTop = selectRect.top + activeWindow.scrollY;

                const labels = Array.from(
                    overlay.querySelectorAll('.vim-motions-hint-label'),
                ) as HTMLElement[];
                let closestLabel = '';
                let closestDist = Infinity;
                for (const labelEl of labels) {
                    const left = Number.parseFloat(
                        labelEl.style.getPropertyValue(
                            '--vim-motions-hint-left',
                        ),
                    );
                    const top = Number.parseFloat(
                        labelEl.style.getPropertyValue(
                            '--vim-motions-hint-top',
                        ),
                    );
                    if (Number.isNaN(left) || Number.isNaN(top)) continue;
                    const dist = Math.hypot(left - selectLeft, top - selectTop);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestLabel = labelEl.textContent ?? '';
                    }
                }

                return { closestLabel, closestDist };
            })) as Record<string, unknown>;

            console.log(
                'DROPDOWN OVERLAY:',
                JSON.stringify(overlayInfo, null, 2),
            );

            const label = overlayInfo.closestLabel as string;
            expect(label.length).toBeGreaterThan(0);

            for (const ch of label) {
                await browser.keys([ch]);
                await browser.pause(PAUSE.KEY_GAP);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                const select = activeDocument.querySelector(
                    '.modal-container select',
                ) as HTMLSelectElement | null;
                return {
                    overlayGone: !overlay,
                    isFocused: activeDocument.activeElement === select,
                    activeElementTag:
                        activeDocument.activeElement?.tagName ?? 'none',
                    activeElementClass:
                        activeDocument.activeElement?.className ?? 'none',
                    selectValue: select?.value ?? 'none',
                };
            })) as Record<string, unknown>;

            console.log('AFTER DROPDOWN HINT:', JSON.stringify(after, null, 2));
        });
    });

    describe('Diag 6: Real keyboard flow on dropdown', function () {
        it('should check what element hint label actually targets for a select', async function () {
            await openSettings();
            await navigateToPluginSettings();

            await browser.executeObsidian(({ app }) => {
                (
                    app as unknown as {
                        commands: {
                            executeCommandById: (id: string) => boolean;
                        };
                    }
                ).commands.executeCommandById('vim-motions:show-hint-labels');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const targetInfo = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                if (!overlay) return { error: 'no overlay' };

                const firstSelect = activeDocument.querySelector(
                    '.modal-container select',
                ) as HTMLElement | null;
                if (!firstSelect) return { error: 'no select' };

                const selectRect = firstSelect.getBoundingClientRect();
                const selectLeft = selectRect.left + activeWindow.scrollX;
                const selectTop = selectRect.top + activeWindow.scrollY;

                const labels = Array.from(
                    overlay.querySelectorAll('.vim-motions-hint-label'),
                ) as HTMLElement[];

                let closestLabel = '';
                let closestDist = Infinity;
                let closestLeft = 0;
                let closestTop = 0;
                for (const labelEl of labels) {
                    const left = Number.parseFloat(
                        labelEl.style.getPropertyValue(
                            '--vim-motions-hint-left',
                        ),
                    );
                    const top = Number.parseFloat(
                        labelEl.style.getPropertyValue(
                            '--vim-motions-hint-top',
                        ),
                    );
                    if (Number.isNaN(left) || Number.isNaN(top)) continue;
                    const dist = Math.hypot(left - selectLeft, top - selectTop);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestLabel = labelEl.textContent ?? '';
                        closestLeft = left;
                        closestTop = top;
                    }
                }

                const allTargets = activeDocument.querySelectorAll(
                    Array.from(
                        new Set([
                            'a[href]',
                            'button:not([disabled])',
                            'input:not([type="hidden"]):not([disabled])',
                            'textarea:not([disabled])',
                            'select:not([disabled])',
                            '[role="button"]',
                            '[role="tab"]',
                            '[data-href]',
                            '.clickable-icon',
                            '.nav-file-title',
                            '.nav-folder-title',
                            '.nav-action-button',
                            '.workspace-tab-header',
                            '.workspace-tab-header-inner-close-button',
                            '.workspace-leaf-content',
                            '.tree-item-self',
                            '.tree-item-icon',
                            '.side-dock-ribbon-action',
                            '.callout-fold',
                            '.cm-underline',
                            '.menu-item',
                            '.modal-close-button',
                            '.vertical-tab-nav-item',
                            '.checkbox-container',
                            '.modal-header-button',
                        ]),
                    ).join(', '),
                );

                const nearSelectTargets: Array<{
                    tag: string;
                    cls: string;
                    dist: number;
                    text: string;
                }> = [];
                for (const target of Array.from(allTargets)) {
                    const rect = target.getBoundingClientRect();
                    if (rect.width <= 0 || rect.height <= 0) continue;
                    const tLeft = rect.left + activeWindow.scrollX;
                    const tTop = rect.top + activeWindow.scrollY;
                    const dist = Math.hypot(
                        tLeft - selectLeft,
                        tTop - selectTop,
                    );
                    if (dist < 50) {
                        nearSelectTargets.push({
                            tag: target.tagName,
                            cls: target.className.slice(0, 60),
                            dist: Math.round(dist),
                            text: (target.textContent ?? '').slice(0, 30),
                        });
                    }
                }

                return {
                    closestLabel,
                    closestDist: Math.round(closestDist),
                    closestLabelPos: { left: closestLeft, top: closestTop },
                    selectPos: { left: selectLeft, top: selectTop },
                    nearSelectTargets,
                    totalLabels: labels.length,
                };
            })) as Record<string, unknown>;

            console.log('TARGET INFO:', JSON.stringify(targetInfo, null, 2));
        });

        it('should check what classifyTarget returns for a select element', async function () {
            await openSettings();
            await navigateToPluginSettings();

            const classifyInfo = (await browser.executeObsidian(() => {
                const select = activeDocument.querySelector(
                    '.modal-container select',
                ) as HTMLElement | null;
                if (!select) return { error: 'no select' };

                return {
                    tagName: select.tagName,
                    isSelect: select instanceof HTMLSelectElement,
                    instanceOfSelect:
                        select.instanceOf?.(HTMLSelectElement) ??
                        'no instanceOf',
                    className: select.className,
                    closestCheckbox: !!select.closest('.checkbox-container'),
                    parentTag: select.parentElement?.tagName,
                    parentClass: select.parentElement?.className,
                };
            })) as Record<string, unknown>;

            console.log(
                'CLASSIFY INFO:',
                JSON.stringify(classifyInfo, null, 2),
            );
        });

        it('should check if select survives the checkbox-container filter', async function () {
            await openSettings();
            await navigateToPluginSettings();

            const filterInfo = (await browser.executeObsidian(() => {
                const selects = activeDocument.querySelectorAll(
                    '.modal-container select',
                );
                let survivedFilter = 0;
                let filteredOut = 0;
                for (const el of Array.from(selects)) {
                    const inCheckbox = el.closest('.checkbox-container');
                    const isCheckbox =
                        el.classList.contains('checkbox-container');
                    if (!inCheckbox || isCheckbox) {
                        survivedFilter++;
                    } else {
                        filteredOut++;
                    }
                }
                return { total: selects.length, survivedFilter, filteredOut };
            })) as Record<string, unknown>;

            console.log('FILTER INFO:', JSON.stringify(filterInfo, null, 2));
        });

        it('should directly test what hintActivate does with a select target', async function () {
            await openSettings();
            await navigateToPluginSettings();

            const result = (await browser.executeObsidian(() => {
                const select = activeDocument.querySelector(
                    '.modal-container select',
                ) as HTMLSelectElement | null;
                if (!select) return { error: 'no select' };

                const valueBefore = select.value;
                const indexBefore = select.selectedIndex;

                select.focus();
                const focusedAfterFocus =
                    activeDocument.activeElement === select;

                if (select.instanceOf(HTMLSelectElement)) {
                    const next =
                        (select.selectedIndex + 1) % select.options.length;
                    select.selectedIndex = next;
                    select.dispatchEvent(
                        new Event('change', { bubbles: true }),
                    );
                }

                return {
                    valueBefore,
                    valueAfter: select.value,
                    indexBefore,
                    indexAfter: select.selectedIndex,
                    changed: select.value !== valueBefore,
                    focusedAfterFocus,
                    focusedAfterAll: activeDocument.activeElement === select,
                    instanceOfWorks: select.instanceOf(HTMLSelectElement),
                };
            })) as Record<string, unknown>;

            console.log('DIRECT SELECT TEST:', JSON.stringify(result, null, 2));
        });
    });

    describe('Diag 7: Trace actual hint activation on dropdown', function () {
        it('should trace what hintActivate does on the dropdown element', async function () {
            await openSettings();
            await navigateToPluginSettings();

            const setupResult = (await browser.executeObsidian(() => {
                const storage = activeWindow as unknown as Record<
                    string,
                    unknown
                >;
                storage._hintTrace = [] as string[];

                const origCreateHintActions = (
                    window as unknown as Record<string, unknown>
                )._origCreateHintActions;

                const selects = activeDocument.querySelectorAll(
                    '.modal-container select',
                );
                const selectValues: string[] = [];
                for (const s of Array.from(selects) as HTMLSelectElement[]) {
                    selectValues.push(
                        `${s.className}=${s.value}(${s.options.length} opts)`,
                    );
                }

                return {
                    selectCount: selects.length,
                    selectValues,
                };
            })) as Record<string, unknown>;

            console.log('SETUP:', JSON.stringify(setupResult, null, 2));

            await browser.executeObsidian(({ app }) => {
                (
                    app as unknown as {
                        commands: {
                            executeCommandById: (id: string) => boolean;
                        };
                    }
                ).commands.executeCommandById('vim-motions:show-hint-labels');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const labelForSelect = (await browser.executeObsidian(() => {
                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                if (!overlay) return { error: 'no overlay' };

                const firstSelect = activeDocument.querySelector(
                    '.modal-container select',
                ) as HTMLElement | null;
                if (!firstSelect) return { error: 'no select' };

                const selectRect = firstSelect.getBoundingClientRect();
                const labels = Array.from(
                    overlay.querySelectorAll('.vim-motions-hint-label'),
                ) as HTMLElement[];

                let closestLabel = '';
                let closestDist = Infinity;
                for (const labelEl of labels) {
                    const left = Number.parseFloat(
                        labelEl.style.getPropertyValue(
                            '--vim-motions-hint-left',
                        ),
                    );
                    const top = Number.parseFloat(
                        labelEl.style.getPropertyValue(
                            '--vim-motions-hint-top',
                        ),
                    );
                    if (Number.isNaN(left) || Number.isNaN(top)) continue;
                    const dist = Math.hypot(
                        left - (selectRect.left + activeWindow.scrollX),
                        top - (selectRect.top + activeWindow.scrollY),
                    );
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestLabel = labelEl.textContent ?? '';
                    }
                }

                return {
                    closestLabel,
                    closestDist: Math.round(closestDist),
                    selectTag: firstSelect.tagName,
                    selectClass: firstSelect.className,
                    selectIsHTMLSelect:
                        firstSelect instanceof HTMLSelectElement,
                };
            })) as Record<string, unknown>;

            console.log(
                'LABEL FOR SELECT:',
                JSON.stringify(labelForSelect, null, 2),
            );

            const label = labelForSelect.closestLabel as string;
            if (!label) throw new Error('No label found');

            for (const ch of label) {
                await browser.keys([ch]);
                await browser.pause(PAUSE.KEY_GAP);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const afterResult = (await browser.executeObsidian(({ app }) => {
                const select = activeDocument.querySelector(
                    '.modal-container select',
                ) as HTMLSelectElement | null;
                if (!select) return { error: 'no select' };

                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { settings: Record<string, unknown> }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                const pluginSettings = plugin?.settings ?? {};

                return {
                    domValue: select.value,
                    domSelectedIndex: select.selectedIndex,
                    isFocused: activeDocument.activeElement === select,
                    activeTag: activeDocument.activeElement?.tagName,
                    activeClass: activeDocument.activeElement?.className,
                    overlayGone: !activeDocument.querySelector(
                        '.vim-motions-hint-overlay',
                    ),
                    pluginTableWidget: pluginSettings['tableWidgetMode'],
                    pluginEnableTextObjects:
                        pluginSettings['enableTextObjects'],
                };
            })) as Record<string, unknown>;

            console.log(
                'AFTER ACTIVATION:',
                JSON.stringify(afterResult, null, 2),
            );
        });
    });

    describe('Diag 4: Hint mode label targeting in settings', function () {
        it('should check which elements get hint labels in settings', async function () {
            await openSettings();
            await navigateToPluginSettings();

            const result = (await browser.executeObsidian(({ app }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;

                const commands = (
                    app as unknown as {
                        commands: {
                            executeCommandById: (id: string) => boolean;
                        };
                    }
                ).commands;
                commands.executeCommandById('vim-motions:show-hint-labels');

                const overlay = activeDocument.querySelector(
                    '.vim-motions-hint-overlay',
                );
                if (!overlay) return { error: 'no overlay' };

                const labels = Array.from(
                    overlay.querySelectorAll('.vim-motions-hint-label'),
                ) as HTMLElement[];

                const settingsContent = activeDocument.querySelector(
                    '.modal-container .vertical-tab-content',
                );
                if (!settingsContent)
                    return {
                        error: 'no settings content',
                        labelCount: labels.length,
                    };

                const toggles = settingsContent.querySelectorAll(
                    '.checkbox-container',
                );
                const selects = settingsContent.querySelectorAll('select');
                const inputs = settingsContent.querySelectorAll(
                    'input:not([type="hidden"])',
                );
                const buttons = settingsContent.querySelectorAll('button');

                return {
                    totalLabels: labels.length,
                    toggleCount: toggles.length,
                    selectCount: selects.length,
                    inputCount: inputs.length,
                    buttonCount: buttons.length,
                    firstFewLabels: labels
                        .slice(0, 5)
                        .map((l) => l.textContent),
                };
            })) as Record<string, unknown>;

            console.log(
                'HINT LABEL TARGETING:',
                JSON.stringify(result, null, 2),
            );
        });
    });
});
