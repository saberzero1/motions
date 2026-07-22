---
title: Animated cursor
description: Canvas-based smooth cursor movement and smear trail effect.
tags:
    - features
---

# Animated cursor

Canvas-based cursor rendering with smooth movement and spring-damper smear trail. The cursor glides between positions and stretches into a smear shape during movement, matching the visual style of [smear-cursor.nvim](https://github.com/sphamba/smear-cursor.nvim).

> [!info] Fork mode recommended
> The animated cursor works best with the bundled codemirror-vim fork (Obsidian's built-in vim disabled). See [[recommended-setup]].

## Enable

**Settings → Vim Motions → Animated cursor → Enable animated cursor**

The animated cursor is disabled by default. When enabled, the plugin renders its own cursor on a `<canvas>` overlay and suppresses the native cursor.

## Smooth movement

When **Smooth cursor movement** is enabled, the cursor interpolates between positions using exponential decay instead of teleporting. The **Cursor smoothness** slider (0–1) controls how responsive the movement feels:

- `0.0` — near-instant (83ms convergence)
- `0.5` — smooth (167ms convergence, default)
- `0.9` — dreamy (783ms convergence)

## Smear trail

When **Enable smear trail** is enabled, the cursor shape deforms during movement using spring-damper physics on 4 corners. The leading corners arrive at the destination first while trailing corners lag behind, creating a stretching effect.

### Configuration

| Setting                  | Default | Description                                       |
| ------------------------ | ------- | ------------------------------------------------- |
| Trail stiffness          | 0.6     | Head corner spring strength. Higher = snappier    |
| Trail trailing stiffness | 0.3     | Tail corner spring strength. Lower = longer trail |
| Trail damping            | 0.85    | Velocity decay. Lower = bouncier                  |
| Trail max length         | 400px   | Maximum trail length in pixels                    |

## Cursor shapes

The animated cursor respects per-mode cursor shapes from **Settings → Cursor shapes**:

- **Normal mode** — block (filled rectangle with character overlay)
- **Insert mode** — bar (2px vertical line)
- **Visual mode** — block
- **Replace mode** — underline (2px horizontal line at bottom)
- **Operator-pending** — underline

Shape changes (e.g., entering insert mode) are instant — only position changes animate.

## Cursor blinking

The animated cursor blinks matching CM6's default behavior:

- **1200ms cycle** — 600ms visible, 600ms hidden (hard on/off, no fade)
- **600ms reset delay** — after any cursor movement, the cursor stays solid for 600ms before resuming blink
- **Focus-aware** — blink only runs when the editor has focus; unfocused editors show a solid cursor
- **Suppressed during animation** — while the smear trail or smooth movement is active, the cursor does not blink

## Accessibility

The animated cursor respects the `prefers-reduced-motion` media query. When reduced motion is preferred, the cursor snaps instantly to its target position without animation.

## Incompatibilities

The animated cursor is incompatible with other cursor animation plugins:

- [ninja-cursor](https://github.com/vrtmrz/ninja-cursor) — does not detect the canvas cursor
- [cursor-smith](https://github.com/sadsnake1/cursor-smith) — both plugins try to render cursors

Disable these plugins when using the built-in animated cursor.

## Known limitations

See [[known-limitations#Animated cursor (smear + smooth movement)]].
