export interface TableNavActions {
    navigate(direction: 'h' | 'j' | 'k' | 'l', count?: number): void;
    enterCellEdit(
        mode: 'insert' | 'insert-append' | 'change' | 'substitute' | 'normal',
    ): void;
    exitTableNav(placement: 'before' | 'after'): void;
    addRowAfter(): void;
    addRowBefore(): void;
    deleteRow(): void;
    deleteCol(): void;
    moveRowDown(): void;
    moveRowUp(): void;
    moveColLeft(): void;
    moveColRight(): void;
    addColBefore(): void;
    addColAfter(): void;
    realign(): void;
}

let pendingD = false;
let countBuffer = '';
let lastStructuralAction: (() => void) | null = null;

export function resetPendingState(): void {
    pendingD = false;
    countBuffer = '';
}

export function clearLastStructuralAction(): void {
    lastStructuralAction = null;
}

function consumeCount(): number {
    if (!countBuffer) return 1;
    const n = parseInt(countBuffer, 10);
    countBuffer = '';
    return Number.isNaN(n) || n < 1 ? 1 : n;
}

export function createTableNavKeyHandler(
    actions: TableNavActions,
): (e: KeyboardEvent) => boolean {
    return (e: KeyboardEvent): boolean => {
        if (e.ctrlKey || e.altKey || e.metaKey) return false;
        if (document.querySelector('.modal-container')) return false;

        if (pendingD) {
            pendingD = false;
            countBuffer = '';
            switch (e.key) {
                case 'd':
                    lastStructuralAction = () => actions.deleteRow();
                    actions.deleteRow();
                    return true;
                case 'c':
                    lastStructuralAction = () => actions.deleteCol();
                    actions.deleteCol();
                    return true;
                case 'Escape':
                    return true;
                default:
                    return false;
            }
        }

        if (/^[1-9]$/.test(e.key) || (countBuffer && e.key === '0')) {
            countBuffer += e.key;
            return true;
        }

        const count = consumeCount();

        switch (e.key) {
            case 'h':
            case 'ArrowLeft':
                actions.navigate('h', count);
                return true;
            case 'j':
            case 'ArrowDown':
                actions.navigate('j', count);
                return true;
            case 'k':
            case 'ArrowUp':
                actions.navigate('k', count);
                return true;
            case 'l':
            case 'ArrowRight':
                actions.navigate('l', count);
                return true;
            case 'i':
                actions.enterCellEdit('insert');
                return true;
            case 'a':
                actions.enterCellEdit('insert-append');
                return true;
            case 'c':
                actions.enterCellEdit('change');
                return true;
            case 's':
                actions.enterCellEdit('substitute');
                return true;
            case 'Enter':
                actions.enterCellEdit('normal');
                return true;
            case 'o':
                lastStructuralAction = () => actions.addRowAfter();
                actions.addRowAfter();
                return true;
            case 'O':
                lastStructuralAction = () => actions.addRowBefore();
                actions.addRowBefore();
                return true;
            case 'J':
                lastStructuralAction = () => actions.moveRowDown();
                actions.moveRowDown();
                return true;
            case 'K':
                lastStructuralAction = () => actions.moveRowUp();
                actions.moveRowUp();
                return true;
            case 'H':
                lastStructuralAction = () => actions.moveColLeft();
                actions.moveColLeft();
                return true;
            case 'L':
                lastStructuralAction = () => actions.moveColRight();
                actions.moveColRight();
                return true;
            case 'I':
                lastStructuralAction = () => actions.addColBefore();
                actions.addColBefore();
                return true;
            case 'A':
                lastStructuralAction = () => actions.addColAfter();
                actions.addColAfter();
                return true;
            case '=':
                actions.realign();
                return true;
            case '.':
                if (lastStructuralAction) {
                    for (let i = 0; i < count; i++) {
                        lastStructuralAction();
                    }
                }
                return true;
            case 'Tab':
                if (e.shiftKey) {
                    actions.navigate('h', count);
                } else {
                    actions.navigate('l', count);
                }
                return true;
            case 'd':
                pendingD = true;
                return true;
            case 'Escape':
                actions.exitTableNav('before');
                return true;
            default:
                return true;
        }
    };
}
