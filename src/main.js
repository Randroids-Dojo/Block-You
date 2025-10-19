import { PIECE_DEFINITIONS, getPieceOrientationsById, normalizeShape } from './pieces.js';

const BOARD_SIZE = 20;

const COLORS = [
  { name: 'Blue', corner: { x: 0, y: 0 }, cssVar: 'var(--blue)' },
  { name: 'Yellow', corner: { x: 19, y: 0 }, cssVar: 'var(--yellow)' },
  { name: 'Red', corner: { x: 0, y: 19 }, cssVar: 'var(--red)' },
  { name: 'Green', corner: { x: 19, y: 19 }, cssVar: 'var(--green)' },
];

const playerCountSelect = document.querySelector('#player-count');
const unusedColorRow = document.querySelector('#unused-color-row');
const unusedColorSelect = document.querySelector('#unused-color');
const startButton = document.querySelector('#start-button');
const boardEl = document.querySelector('#board');
const turnIndicator = document.querySelector('#turn-indicator');
const selectedPieceEl = document.querySelector('#selected-piece');
const actionMessageEl = document.querySelector('#action-message');
const inventoryGrid = document.querySelector('#inventory-grid');
const scoreRows = document.querySelector('#score-rows');
const logList = document.querySelector('#game-log');
const rotateLeftBtn = document.querySelector('#rotate-left');
const rotateRightBtn = document.querySelector('#rotate-right');
const flipBtn = document.querySelector('#flip');
const passBtn = document.querySelector('#pass');

const initialState = () => ({
  board: Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null)),
  activeColors: [],
  turnIndex: 0,
  firstMoveCompleted: {},
  usedPieces: {},
  selectedPiece: null,
  selectedOrientation: null,
  selectedOrientationIndex: null,
  passChain: 0,
  log: [],
  gameOver: false,
});

let state = initialState();

function resetState() {
  state = initialState();
}

function createBoard() {
  boardEl.innerHTML = '';
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const cell = document.createElement('div');
      cell.className = 'board-cell';
      cell.dataset.x = x;
      cell.dataset.y = y;
      const button = document.createElement('button');
      button.setAttribute('aria-label', `Cell ${String.fromCharCode(65 + x)}${y + 1}`);
      button.addEventListener('click', () => handleBoardClick(x, y));
      cell.appendChild(button);
      boardEl.appendChild(cell);
    }
  }
}

function setBoardCellColor(x, y, colorName) {
  const index = y * BOARD_SIZE + x;
  const cell = boardEl.children[index];
  if (cell) {
    if (colorName) {
      cell.dataset.color = colorName;
    } else {
      delete cell.dataset.color;
    }
  }
}

function updateBoardUI() {
  state.board.forEach((row, y) => {
    row.forEach((color, x) => {
      setBoardCellColor(x, y, color);
    });
  });
}

function initializeGame() {
  resetState();
  const count = Number(playerCountSelect.value);
  let activeColors;
  if (count === 4) {
    activeColors = COLORS.map((c) => c.name);
  } else if (count === 3) {
    const unused = unusedColorSelect.value;
    activeColors = COLORS.map((c) => c.name).filter((name) => name !== unused);
  } else {
    // 2 player variant: Player1 -> Blue & Red, Player2 -> Yellow & Green
    activeColors = COLORS.map((c) => c.name);
  }
  state.activeColors = activeColors;
  state.turnIndex = 0;
  state.passChain = 0;
  state.gameOver = false;
  state.firstMoveCompleted = Object.fromEntries(activeColors.map((color) => [color, false]));
  state.usedPieces = Object.fromEntries(activeColors.map((color) => [color, new Set()]));
  state.selectedPiece = null;
  state.selectedOrientation = null;
  state.selectedOrientationIndex = null;
  state.log = [];
  createBoard();
  updateBoardUI();
  renderInventory();
  renderScores();
  renderLog();
  updateStatus(`Game ready. ${getCurrentColor()} goes first.`);
  updateTurnIndicator();
  checkAutoPass();
}

function getColorConfig(colorName) {
  return COLORS.find((c) => c.name === colorName);
}

function getCurrentColor() {
  if (!state.activeColors.length) return null;
  return state.activeColors[state.turnIndex % state.activeColors.length];
}

function renderInventory() {
  const currentColor = getCurrentColor();
  inventoryGrid.innerHTML = '';
  if (!currentColor) return;

  PIECE_DEFINITIONS.forEach((piece) => {
    const card = document.createElement('button');
    card.className = 'piece-card';
    card.type = 'button';
    card.dataset.pieceId = piece.id;
    const isUsed = state.usedPieces[currentColor]?.has(piece.id);
    card.dataset.owned = (!state.gameOver && !isUsed).toString();
    card.style.color = getColorConfig(currentColor)?.cssVar ?? '#333';
    card.disabled = state.gameOver || isUsed;
    const nameEl = document.createElement('div');
    nameEl.className = 'piece-name';
    nameEl.textContent = piece.name;
    const miniGrid = renderMiniGrid(piece.squares);
    card.appendChild(miniGrid);
    card.appendChild(nameEl);
    if (isUsed) {
      card.classList.add('used');
      card.dataset.owned = 'false';
    }
    card.addEventListener('click', () => selectPiece(piece.id));
    inventoryGrid.appendChild(card);
  });
  updateSelectedPieceLabel();
}

function renderMiniGrid(shape) {
  const normalized = normalizeShape(shape);
  const grid = document.createElement('div');
  grid.className = 'mini-grid';
  const size = 5;
  const filled = new Set(normalized.map(([x, y]) => `${x},${y}`));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cell = document.createElement('div');
      cell.className = 'mini-cell';
      if (filled.has(`${x},${y}`)) {
        cell.classList.add('filled');
      }
      grid.appendChild(cell);
    }
  }
  return grid;
}

function updateTurnIndicator() {
  const color = getCurrentColor();
  turnIndicator.textContent = color ?? '—';
}

function updateSelectedPieceLabel() {
  if (!state.selectedPiece) {
    selectedPieceEl.textContent = 'None';
  } else {
    const piece = PIECE_DEFINITIONS.find((p) => p.id === state.selectedPiece);
    const orientationCount = getPieceOrientationsById(state.selectedPiece).length;
    const orientationIndex = (state.selectedOrientationIndex ?? 0) + 1;
    selectedPieceEl.textContent = `${piece?.name ?? state.selectedPiece} (orientation ${orientationIndex}/${orientationCount})`;
  }
}

function updateStatus(message) {
  actionMessageEl.textContent = message;
}

function handleBoardClick(x, y) {
  if (state.gameOver) return;
  const color = getCurrentColor();
  if (!color) return;
  if (!state.selectedPiece) {
    updateStatus('Select a piece before placing.');
    return;
  }
  const orientation = state.selectedOrientation;
  if (!orientation) {
    updateStatus('Orientation not ready. Please reselect the piece.');
    return;
  }
  const placement = orientation.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
  const validity = validatePlacement(color, state.selectedPiece, placement);
  if (!validity.valid) {
    updateStatus(validity.reason);
    return;
  }
  applyPlacement(color, state.selectedPiece, placement);
}

function validatePlacement(color, pieceId, cells) {
  const colorConfig = getColorConfig(color);
  const firstMove = !state.firstMoveCompleted[color];
  let cornerTouch = false;
  for (const { x, y } of cells) {
    if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) {
      return { valid: false, reason: 'Placement must stay within the 20×20 board.' };
    }
    if (state.board[y][x]) {
      return { valid: false, reason: 'Pieces cannot overlap existing pieces.' };
    }
  }
  if (firstMove) {
    const coversCorner = cells.some(({ x, y }) => x === colorConfig.corner.x && y === colorConfig.corner.y);
    if (!coversCorner) {
      return { valid: false, reason: 'First move must cover your assigned corner.' };
    }
  }
  for (const { x, y } of cells) {
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= BOARD_SIZE || ny >= BOARD_SIZE) continue;
      if (state.board[ny][nx] === color) {
        return { valid: false, reason: 'Pieces cannot edge-touch your own color.' };
      }
    }
    const diagonals = [
      [x - 1, y - 1],
      [x + 1, y - 1],
      [x - 1, y + 1],
      [x + 1, y + 1],
    ];
    for (const [dx, dy] of diagonals) {
      if (dx < 0 || dy < 0 || dx >= BOARD_SIZE || dy >= BOARD_SIZE) continue;
      if (state.board[dy][dx] === color) {
        cornerTouch = true;
      }
    }
  }
  if (!firstMove && !cornerTouch) {
    return { valid: false, reason: 'New pieces must touch your color at a corner.' };
  }
  return { valid: true };
}

function applyPlacement(color, pieceId, cells) {
  cells.forEach(({ x, y }) => {
    state.board[y][x] = color;
  });
  state.usedPieces[color].add(pieceId);
  state.firstMoveCompleted[color] = true;
  state.log.push(`${color} placed ${pieceId} at ${cells.map(({ x, y }) => `${String.fromCharCode(65 + x)}${y + 1}`).join(', ')}`);
  updateBoardUI();
  renderInventory();
  renderScores();
  renderLog();
  updateStatus(`${color} placed ${pieceId}.`);
  state.selectedPiece = null;
  state.selectedOrientation = null;
  state.selectedOrientationIndex = null;
  state.passChain = 0;
  advanceTurn();
}

function advanceTurn() {
  if (state.gameOver) return;
  state.turnIndex = (state.turnIndex + 1) % state.activeColors.length;
  updateTurnIndicator();
  renderInventory();
  checkAutoPass();
}

function checkAutoPass() {
  const color = getCurrentColor();
  if (!color) return;
  if (!hasLegalMove(color)) {
    updateStatus(`${color} has no legal moves. Passing is required.`);
  } else {
    updateStatus(`${color}'s turn. Select a piece.`);
  }
}

function selectPiece(pieceId) {
  const color = getCurrentColor();
  if (!color) return;
  if (state.gameOver) return;
  if (state.usedPieces[color].has(pieceId)) {
    updateStatus('Piece already used.');
    return;
  }
  state.selectedPiece = pieceId;
  const orientations = getPieceOrientationsById(pieceId);
  state.selectedOrientationIndex = 0;
  state.selectedOrientation = orientations[state.selectedOrientationIndex];
  updateSelectedPieceLabel();
  updateStatus(`Selected ${pieceId}. Tap a board cell to place.`);
}

function rotateSelectedPiece(direction) {
  if (!state.selectedPiece) {
    updateStatus('Select a piece before rotating.');
    return;
  }
  const orientations = getPieceOrientationsById(state.selectedPiece);
  if (!orientations.length) return;
  const count = orientations.length;
  if (direction === 'left') {
    state.selectedOrientationIndex = (state.selectedOrientationIndex - 1 + count) % count;
  } else {
    state.selectedOrientationIndex = (state.selectedOrientationIndex + 1) % count;
  }
  state.selectedOrientation = orientations[state.selectedOrientationIndex];
  updateSelectedPieceLabel();
}

function flipSelectedPiece() {
  if (!state.selectedPiece) {
    updateStatus('Select a piece before flipping.');
    return;
  }
  const orientations = getPieceOrientationsById(state.selectedPiece);
  if (!orientations.length) return;
  // Flip by moving halfway across orientation list: find mirrored orientation by matching reversed coordinates
  const current = state.selectedOrientation;
  const targetKey = JSON.stringify(normalizeShape(current.map(([x, y]) => [-x, y])));
  const index = orientations.findIndex((orient) => JSON.stringify(orient) === targetKey);
  if (index >= 0) {
    state.selectedOrientationIndex = index;
    state.selectedOrientation = orientations[index];
  } else {
    state.selectedOrientationIndex = (state.selectedOrientationIndex + 1) % orientations.length;
    state.selectedOrientation = orientations[state.selectedOrientationIndex];
  }
  updateSelectedPieceLabel();
}

function handlePass() {
  if (state.gameOver) return;
  const color = getCurrentColor();
  if (!color) return;
  if (hasLegalMove(color)) {
    updateStatus('Passing is illegal while a legal move exists.');
    return;
  }
  state.selectedPiece = null;
  state.selectedOrientation = null;
  state.selectedOrientationIndex = null;
  updateSelectedPieceLabel();
  state.log.push(`${color} passed.`);
  state.passChain += 1;
  updateStatus(`${color} passes.`);
  renderLog();
  if (state.passChain >= state.activeColors.length) {
    endGame();
  } else {
    advanceTurn();
  }
}

function hasLegalMove(color) {
  const pieces = PIECE_DEFINITIONS.filter((piece) => !state.usedPieces[color].has(piece.id));
  for (const piece of pieces) {
    const orientations = getPieceOrientationsById(piece.id);
    for (const orient of orientations) {
      for (let y = 0; y < BOARD_SIZE; y += 1) {
        for (let x = 0; x < BOARD_SIZE; x += 1) {
          const cells = orient.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
          const result = validatePlacement(color, piece.id, cells);
          if (result.valid) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function getLastPlacedPieceId(color) {
  const lastLogEntry = [...state.log].reverse().find((entry) => entry.startsWith(`${color} placed`));
  if (!lastLogEntry) return null;
  const match = lastLogEntry.match(/placed\s+(P\d+)/);
  return match ? match[1] : null;
}

function computeScores() {
  const scores = state.activeColors.map((color) => {
    const unusedPieces = PIECE_DEFINITIONS.filter((piece) => !state.usedPieces[color].has(piece.id));
    const remainingSquares = unusedPieces.reduce((sum, piece) => sum + piece.squares.length, 0);
    const allPlaced = remainingSquares === 0;
    let bonus = 0;
    if (allPlaced) {
      const lastPieceId = getLastPlacedPieceId(color);
      if (lastPieceId === 'P1') {
        bonus = 20;
      } else {
        bonus = 15;
      }
    }
    const total = -remainingSquares + bonus;
    return { color, remainingSquares, bonus, total };
  });
  scores.sort((a, b) => b.total - a.total);
  return scores;
}

function renderScores() {
  scoreRows.innerHTML = '';
  if (!state.activeColors.length) return;
  const scores = state.activeColors.map((color) => {
    const unusedPieces = PIECE_DEFINITIONS.filter((piece) => !state.usedPieces[color].has(piece.id));
    const remainingSquares = unusedPieces.reduce((sum, piece) => sum + piece.squares.length, 0);
    let bonus = 0;
    const allPlaced = remainingSquares === 0;
    if (allPlaced) {
      const lastPieceId = getLastPlacedPieceId(color);
      if (lastPieceId === 'P1') {
        bonus = 20;
      } else {
        bonus = 15;
      }
    }
    const total = -remainingSquares + bonus;
    const row = document.createElement('tr');
    const colorCell = document.createElement('td');
    colorCell.textContent = color;
    const remainingCell = document.createElement('td');
    remainingCell.textContent = remainingSquares.toString();
    const bonusCell = document.createElement('td');
    bonusCell.textContent = bonus.toString();
    const totalCell = document.createElement('td');
    totalCell.textContent = total.toString();
    row.append(colorCell, remainingCell, bonusCell, totalCell);
    scoreRows.appendChild(row);
    return { color, remainingSquares, bonus, total };
  });
  return scores;
}

function renderLog() {
  logList.innerHTML = '';
  state.log.forEach((entry) => {
    const item = document.createElement('li');
    item.textContent = entry;
    logList.appendChild(item);
  });
}

function endGame() {
  state.gameOver = true;
  const scores = computeScores();
  const topScore = scores[0];
  const winners = scores.filter((score) => score.total === topScore.total).map((score) => score.color);
  if (winners.length === 1) {
    updateStatus(`Game over! Winner: ${winners[0]} with ${topScore.total} points.`);
  } else {
    updateStatus(`Game over! Tie between ${winners.join(', ')} at ${topScore.total} points.`);
  }
  renderScores();
}

rotateLeftBtn.addEventListener('click', () => rotateSelectedPiece('left'));
rotateRightBtn.addEventListener('click', () => rotateSelectedPiece('right'));
flipBtn.addEventListener('click', () => flipSelectedPiece());
passBtn.addEventListener('click', handlePass);

startButton.addEventListener('click', initializeGame);
playerCountSelect.addEventListener('change', () => {
  const count = Number(playerCountSelect.value);
  unusedColorRow.hidden = count !== 3;
});

initializeGame();
