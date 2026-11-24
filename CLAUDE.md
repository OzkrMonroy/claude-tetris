# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JavaScript Tetris on HTML5 Canvas. No dependencies, no `package.json`, no build step, no test suite, no linter. User-facing text (UI strings, README) is in Spanish.

## Running

Open `index.html` directly, or serve the directory statically (preferred):

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

There are no automated tests; verify changes by playing the game in a browser.

## Architecture

Three files: `index.html` (DOM + two canvases + overlay), `style.css` (dark theme), and `game.js` (all logic, loaded as a classic non-module script with `'use strict'`).

Key points in `game.js` that span multiple functions:

- **Global mutable state**: `board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `lastTime`, `dropAccum`, `dropInterval`, `animId` are module-level `let`s, reset in `init()`. `init()` is also the restart handler.
- **Color index = piece type**: `PIECES[type]` matrices store the type number (1–7) in their filled cells, and that same value is written into `board` by `merge()` and used to index `COLORS`. Index 0 is `null` in both arrays (empty cell). Adding a piece means adding an entry to both `PIECES` and `COLORS` and updating the `* 7` in `randomPiece()`.
- **Collision is the single source of truth**: `collide(shape, ox, oy)` is used for movement, rotation wall kicks (`tryRotate` tries x offsets `0, -1, 1, -2, 2`), ghost projection (`ghostY`), gravity, and game-over detection in `spawn()`. Cells above the board (`ny < 0`) are allowed.
- **Piece lifecycle**: gravity in `loop()` / `softDrop()` / `hardDrop()` → `lockPiece()` → `merge()` → `clearLines()` (updates score, level, `dropInterval`) → `spawn()` (promotes `next` to `current`, calls `endGame()` if it collides immediately).
- **Timing**: `loop()` is `requestAnimationFrame`-driven; it accumulates `dt` in `dropAccum` and drops one row when it exceeds `dropInterval` (`intervalFor(level)` = `max(100, 1000 - (level-1)*90)` ms). `level = startLevel + floor(lines/10)`. Pause/game-over stop it via `cancelAnimationFrame(animId)`; `resumeGame()` resets `lastTime` and schedules `loop()` again.
- **Pause menu**: `P`/`Escape` call `pauseGame()`/`resumeGame()`, which show/hide `#pause-menu` (separate from the game-over `#overlay`). It has two views (`menuViews.main`/`controls`, switched by `showMenuView`). While paused no key reaches the game; keys pressed during the menu go into `heldKeys` and are ignored by the game until their `keyup`, so held keys don't move the piece on resume. `startLevel` (select `#start-level`, persisted in `localStorage`) is applied by `init()`.
- **Rendering**: `draw()` redraws everything each frame (grid → locked board → ghost at alpha 0.2 → current piece). The next-piece preview (`drawNext`) is only redrawn on `spawn()`, on a 4×4 grid of 30px cells.

## Coupled constants

`COLS`, `ROWS`, `BLOCK` in `game.js` must match the `<canvas id="board">` `width`/`height` in `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`, currently 300×600). The preview canvas (120×120) is likewise tied to the hard-coded `NB = 30` and 4-cell grid in `drawNext()`.
