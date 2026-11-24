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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
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
  const linesBefore = lines;
  merge();
  clearLines();
  trackCombo(lines - linesBefore);
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
  showGameOverRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
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
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  resetRecordsState();
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (shouldIgnoreKey(e)) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
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

restartBtn.addEventListener('click', init);

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

// ---- Records ----
// Top 5 en localStorage + mejor combo y líneas máximas históricas.
// La partida no arranca hasta pulsar "Jugar" en #start-screen.

const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;
const startScreen = document.getElementById('start-screen');
const playBtn = document.getElementById('play-btn');
const gameOverRecords = document.getElementById('gameover-records');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const newRecordMsg = document.getElementById('new-record-msg');

let combo = 0, maxCombo = 0;
let pendingRecord = null; // { score, lines, level, date } aún sin nombre
let highlightIndex = -1;  // fila a resaltar en la tabla de game over

function emptyRecords() {
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function isCount(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function loadRecords() {
  let data;
  try {
    data = JSON.parse(localStorage.getItem(RECORDS_KEY));
  } catch (e) {
    return emptyRecords();
  }
  if (!data || typeof data !== 'object') return emptyRecords();
  const scores = Array.isArray(data.scores)
    ? data.scores
        .filter(r => r && typeof r === 'object' && typeof r.name === 'string' &&
          isCount(r.score) && isCount(r.lines) && isCount(r.level))
        .map(r => ({
          name: r.name.slice(0, 12),
          score: r.score,
          lines: r.lines,
          level: r.level,
          date: typeof r.date === 'string' ? r.date : '',
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RECORDS)
    : [];
  return {
    scores,
    bestCombo: isCount(data.bestCombo) ? data.bestCombo : 0,
    maxLines: isCount(data.maxLines) ? data.maxLines : 0,
  };
}

function saveRecords(data) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(data)); } catch (e) {}
}

function qualifies(s, data) {
  if (s <= 0) return false;
  return data.scores.length < MAX_RECORDS || s > data.scores[data.scores.length - 1].score;
}

// Posición que ocuparía `s` (los empates quedan por debajo de los existentes)
function insertIndex(s, scores) {
  let i = 0;
  while (i < scores.length && scores[i].score >= s) i++;
  return i;
}

function trackCombo(cleared) {
  if (cleared > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
  } else {
    combo = 0;
  }
}

function resetRecordsState() {
  // reiniciar sin pulsar "Guardar" no debe perder el récord
  if (pendingRecord) commitPendingRecord();
  combo = 0;
  maxCombo = 0;
  pendingRecord = null;
  highlightIndex = -1;
  gameOverRecords.classList.add('hidden');
  nameForm.classList.add('hidden');
  newRecordMsg.classList.add('hidden');
  nameInput.blur();
}

function renderRecords() {
  const data = loadRecords();
  const rows = data.scores.map(r => ({ ...r }));
  if (pendingRecord) {
    rows.splice(insertIndex(pendingRecord.score, rows), 0, { ...pendingRecord, name: '(tú)' });
    rows.length = Math.min(rows.length, MAX_RECORDS);
  }
  document.querySelectorAll('.records-table tbody').forEach(tbody => {
    const inGameOver = gameOverRecords.contains(tbody);
    tbody.replaceChildren();
    if (!rows.length) {
      const tr = document.createElement('tr');
      tr.className = 'empty';
      const td = document.createElement('td');
      td.colSpan = 5;
      td.textContent = 'Sin records todavía';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      if (inGameOver && i === highlightIndex) tr.className = 'highlight';
      [i + 1, r.name, r.score.toLocaleString(), r.lines, r.level].forEach(v => {
        const td = document.createElement('td');
        td.textContent = String(v); // nunca innerHTML con datos del usuario
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  });
  document.querySelectorAll('.records-stats').forEach(p => {
    p.textContent = `Mejor combo: ${data.bestCombo} · Líneas máximas: ${data.maxLines}`;
  });
}

function showGameOverRecords() {
  const data = loadRecords();
  // combo y líneas históricas se actualizan siempre, entre o no en el top
  data.bestCombo = Math.max(data.bestCombo, maxCombo);
  data.maxLines = Math.max(data.maxLines, lines);
  saveRecords(data);

  if (qualifies(score, data)) {
    pendingRecord = { score, lines, level, date: new Date().toISOString() };
    highlightIndex = insertIndex(score, data.scores);
    newRecordMsg.textContent = `¡Nuevo récord! Puesto #${highlightIndex + 1}`;
    newRecordMsg.classList.remove('hidden');
    nameForm.classList.remove('hidden');
    nameInput.value = '';
  }
  renderRecords();
  gameOverRecords.classList.remove('hidden');
  if (pendingRecord) nameInput.focus();
}

function commitPendingRecord() {
  const data = loadRecords();
  const entry = { ...pendingRecord, name: nameInput.value.trim().slice(0, 12) || 'Anónimo' };
  pendingRecord = null;
  // otra pestaña pudo llenar el top 5 mientras tanto
  if (!qualifies(entry.score, data)) {
    highlightIndex = -1;
    return false;
  }
  highlightIndex = insertIndex(entry.score, data.scores);
  data.scores.splice(highlightIndex, 0, entry);
  data.scores.length = Math.min(data.scores.length, MAX_RECORDS);
  saveRecords(data);
  return true;
}

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!pendingRecord) return;
  if (!commitPendingRecord()) newRecordMsg.textContent = 'La puntuación ya no entra en el top 5';
  nameForm.classList.add('hidden');
  nameInput.blur();
  renderRecords();
});

// mantener Space pulsado al perder no debe llenar el campo de espacios
nameInput.addEventListener('keydown', e => {
  if (e.repeat && e.code === 'Space') e.preventDefault();
});

document.querySelectorAll('.clear-records-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.blur();
    if (!confirm('¿Borrar todos los records? Esta acción no se puede deshacer.')) return;
    saveRecords(emptyRecords());
    // con la tabla vacía, un récord pendiente pasa a ser el #1
    highlightIndex = pendingRecord ? 0 : -1;
    if (pendingRecord) newRecordMsg.textContent = '¡Nuevo récord! Puesto #1';
    renderRecords();
  });
});

// Ignora teclas mientras se escribe o antes de empezar la partida
function shouldIgnoreKey(e) {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return true;
  return !startScreen.classList.contains('hidden');
}

playBtn.addEventListener('click', () => {
  playBtn.blur();
  startScreen.classList.add('hidden');
  init();
});

renderRecords();
