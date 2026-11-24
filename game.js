'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');
const pauseMenu = document.getElementById('pause-menu');
const menuViews = {
  main: document.getElementById('menu-main'),
  controls: document.getElementById('menu-controls'),
};
const startLevelSel = document.getElementById('start-level');

const START_LEVEL_KEY = 'tetris-start-level';
const MAX_START_LEVEL = 15;
let startLevel = 1;
let menuView = 'main';
// teclas pulsadas/mantenidas con el menú abierto: se ignoran en el juego
// hasta soltarlas, para que no muevan la pieza al reanudar
const heldKeys = new Set();

const THEME_KEY = 'tetris-theme';
const GRID_COLORS = { dark: '#22222e', light: '#e1e4ec' };
let theme = 'dark';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c] && current.y + r >= 0)
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = intervalFor(level);
    updateHUD();
  }
}

function intervalFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = GRID_COLORS[theme];
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // en game over la pieza nueva no cabe: no superponerla al tablero
  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  draw();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function showMenuView(view) {
  menuView = view;
  for (const [name, el] of Object.entries(menuViews))
    el.classList.toggle('hidden', name !== view);
  const first = menuViews[view].querySelector('button, select');
  if (first) first.focus();
}

function pauseGame() {
  if (paused || gameOver) return;
  paused = true;
  cancelAnimationFrame(animId);
  pauseMenu.classList.remove('hidden');
  showMenuView('main');
}

function resumeGame() {
  if (!paused || gameOver) return;
  paused = false;
  pauseMenu.classList.add('hidden');
  if (document.activeElement) document.activeElement.blur();
  lastTime = performance.now();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// navegación con flechas entre los controles de la vista activa del menú
function moveMenuFocus(dir) {
  const items = [...menuViews[menuView].querySelectorAll('button, select')];
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  const nextIdx = i === -1 ? 0 : (i + dir + items.length) % items.length;
  items[nextIdx].focus();
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  // lockPiece() puede haber terminado la partida: no reprogramar el bucle
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = intervalFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  if (document.activeElement) document.activeElement.blur();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (e.repeat || gameOver) return;
    if (!paused) pauseGame();
    else if (e.code === 'Escape' && menuView !== 'main') showMenuView('main');
    else resumeGame();
    return;
  }

  if (paused) {
    // menú abierto: ninguna tecla llega al juego
    heldKeys.add(e.code);
    if ((e.code === 'ArrowUp' || e.code === 'ArrowDown') && e.target.tagName !== 'SELECT') {
      e.preventDefault();
      moveMenuFocus(e.code === 'ArrowDown' ? 1 : -1);
    }
    return;
  }
  if (gameOver) return;
  if (heldKeys.has(e.code)) { e.preventDefault(); return; }
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

document.addEventListener('keyup', e => heldKeys.delete(e.code));
window.addEventListener('blur', () => heldKeys.clear());

restartBtn.addEventListener('click', init);

pauseMenu.addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  switch (btn.dataset.action) {
    case 'resume':   resumeGame(); break;
    case 'restart':  init(); break;
    case 'controls': showMenuView('controls'); break;
    case 'back':     showMenuView('main'); break;
  }
});

for (let l = 1; l <= MAX_START_LEVEL; l++) {
  const opt = document.createElement('option');
  opt.value = String(l);
  opt.textContent = String(l);
  startLevelSel.appendChild(opt);
}

function setStartLevel(l) {
  const n = parseInt(l, 10);
  startLevel = Number.isInteger(n) ? Math.min(MAX_START_LEVEL, Math.max(1, n)) : 1;
  startLevelSel.value = String(startLevel);
  try { localStorage.setItem(START_LEVEL_KEY, String(startLevel)); } catch (e) {}
}

startLevelSel.addEventListener('change', () => setStartLevel(startLevelSel.value));

let savedStartLevel = 1;
try { savedStartLevel = localStorage.getItem(START_LEVEL_KEY) || 1; } catch (e) {}
setStartLevel(savedStartLevel);

function setTheme(t) {
  theme = t === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  themeBtn.setAttribute('aria-pressed', String(theme === 'light'));
  themeBtn.textContent = theme === 'light' ? '🌙 Oscuro' : '☀️ Claro';
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  // redibujar (el bucle no corre en pausa / game over)
  if (current) draw();
  if (next) drawNext();
}

themeBtn.addEventListener('click', () => {
  setTheme(theme === 'dark' ? 'light' : 'dark');
  themeBtn.blur(); // evita que Space/Enter vuelvan a activar el botón
});

let savedTheme = 'dark';
try { savedTheme = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
setTheme(savedTheme);

init();
