export interface TableNavActions {
    navigate(direction: 'h' | 'j' | 'k' | 'l'): void;
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

export function resetPendingState(): void {
    pendingD = false;
}

export function createTableNavKeyHandler(
    actions: TableNavActions,
): (e: KeyboardEvent) => boolean {
    return (e: KeyboardEvent): boolean => {
        if (e.ctrlKey || e.altKey || e.metaKey) return false;
        if (document.querySelector('.modal-container')) return false;

        if (pendingD) {
            pendingD = false;
            switch (e.key) {
                case 'd':
                    actions.deleteRow();
                    return true;
                case 'c':
                    actions.deleteCol();
                    return true;
                case 'Escape':
                    return true;
                default:
                    return false;
            }
        }

        switch (e.key) {
            case 'h':
            case 'ArrowLeft':
                actions.navigate('h');
                return true;
            case 'j':
            case 'ArrowDown':
                actions.navigate('j');
                return true;
            case 'k':
            case 'ArrowUp':
                actions.navigate('k');
                return true;
            case 'l':
            case 'ArrowRight':
                actions.navigate('l');
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
                actions.addRowAfter();
                return true;
            case 'O':
                actions.addRowBefore();
                return true;
            case 'J':
                actions.moveRowDown();
                return true;
            case 'K':
                actions.moveRowUp();
                return true;
            case 'H':
                actions.moveColLeft();
                return true;
            case 'L':
                actions.moveColRight();
                return true;
            case 'I':
                actions.addColBefore();
                return true;
            case 'A':
                actions.addColAfter();
                return true;
            case '=':
                actions.realign();
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
