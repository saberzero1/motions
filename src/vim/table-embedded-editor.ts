import {
    setTableNavControllerEnabled,
    setTableNavWhichKeyConfig,
    tableNavControllerField,
} from './table-nav-controller';
import { setTableEmbeddedMode } from './table-render-widget';

export { setTableEmbeddedMode, setTableNavWhichKeyConfig };
export const setEmbeddedModeEnabled = setTableNavControllerEnabled;
export const tableEmbeddedField = tableNavControllerField;
