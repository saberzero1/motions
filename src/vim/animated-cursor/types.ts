/** Pixel-space rectangle for cursor position. */
export interface CursorRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** Cursor shape types matching the plugin's CursorShape type. */
export type CursorShape = 'block' | 'bar' | 'underline' | 'hollow';

/** Per-corner spring state for smear physics. */
export interface SpringCorner {
    x: number;
    y: number;
    vx: number;
    vy: number;
}

/** 4-corner quad for smear rendering. */
export interface SmearQuad {
    tl: SpringCorner;
    tr: SpringCorner;
    br: SpringCorner;
    bl: SpringCorner;
}

/** Configuration for the animated cursor read from settings. */
export interface AnimatedCursorConfig {
    enabled: boolean;
    smoothCursor: boolean;
    smoothness: number;
    smearTrail: boolean;
    stiffness: number;
    trailingStiffness: number;
    damping: number;
    maxLength: number;
}

/** Position cache entry from coordsAtPos. */
export interface CachedPosition {
    rect: CursorRect;
    scrollTop: number;
    scrollLeft: number;
    timestamp: number;
    docPos: number;
}
