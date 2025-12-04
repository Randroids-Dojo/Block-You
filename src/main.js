import { PIECE_DEFINITIONS, getPieceOrientationsById, normalizeShape } from './pieces.js';
import { networkManager } from './networking.js';

// ========== PWA Service Worker Registration ==========
let deferredInstallPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Service Worker registered:', registration.scope);

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] New version available');
            }
          });
        });
      })
      .catch((error) => {
        console.warn('[PWA] Service Worker registration failed:', error);
      });
  });
}

// Handle install prompt
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  console.log('[PWA] Install prompt available');

  // Show install button
  const installBtn = document.querySelector('#install-btn');
  if (installBtn) {
    installBtn.hidden = false;
  }
});

// Handle successful install
window.addEventListener('appinstalled', () => {
  console.log('[PWA] App installed successfully');
  deferredInstallPrompt = null;

  // Hide install button
  const installBtn = document.querySelector('#install-btn');
  if (installBtn) {
    installBtn.hidden = true;
  }
});

const BOARD_SIZE = 20;

const COLORS = [
  { name: 'Blue', corner: { x: 0, y: 0 }, cssVar: 'var(--blue)' },
  { name: 'Yellow', corner: { x: 19, y: 0 }, cssVar: 'var(--yellow)' },
  { name: 'Red', corner: { x: 0, y: 19 }, cssVar: 'var(--red)' },
  { name: 'Green', corner: { x: 19, y: 19 }, cssVar: 'var(--green)' },
];

// ========== DOM Elements ==========
// Lobby elements
const lobbyScreen = document.querySelector('#lobby-screen');
const gameScreen = document.querySelector('#game-screen');
const lobbyMenu = document.querySelector('#lobby-menu');
const newGameBtn = document.querySelector('#new-game-btn');
const joinGameBtn = document.querySelector('#join-game-btn');
const newGameSetup = document.querySelector('#new-game-setup');
const createGameBtn = document.querySelector('#create-game-btn');
const backFromNewBtn = document.querySelector('#back-from-new');
const hostWaiting = document.querySelector('#host-waiting');
const roomCodeDisplay = document.querySelector('#room-code-display');
const copyCodeBtn = document.querySelector('#copy-code-btn');
const playersList = document.querySelector('#players-list');
const waitingText = document.querySelector('#waiting-text');
const startMultiplayerBtn = document.querySelector('#start-multiplayer-btn');
const cancelHostBtn = document.querySelector('#cancel-host-btn');
const joinGameSetup = document.querySelector('#join-game-setup');
const roomCodeInput = document.querySelector('#room-code-input');
const joinBtn = document.querySelector('#join-btn');
const backFromJoinBtn = document.querySelector('#back-from-join');
const clientWaiting = document.querySelector('#client-waiting');
const yourColorBadge = document.querySelector('#your-color-badge');
const clientPlayersList = document.querySelector('#client-players-list');
const leaveGameBtn = document.querySelector('#leave-game-btn');
const connectionStatus = document.querySelector('#connection-status');
const connectionMessage = document.querySelector('#connection-message');
const lobbyError = document.querySelector('#lobby-error');
const errorMessage = document.querySelector('#error-message');
const errorDismissBtn = document.querySelector('#error-dismiss-btn');

// Game elements
const playerCountSelect = document.querySelector('#player-count');
const localPlayerCountSelect = document.querySelector('#local-player-count');
const joinLocalPlayerCountSelect = document.querySelector('#join-local-player-count');
const localHintEl = document.querySelector('#local-hint');
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
const confirmBtn = document.querySelector('#confirm');
const passBtn = document.querySelector('#pass');
const yourColorIndicator = document.querySelector('#your-color-indicator');
const roomCodeSmall = document.querySelector('#room-code-small');
const leaveGameFooterBtn = document.querySelector('#leave-game-footer-btn');
const debugLog = document.querySelector('#debug-log');

// ========== Debug Logging ==========
function debug(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.className = `debug-${type}`;
  line.textContent = `[${timestamp}] ${message}`;
  if (debugLog) {
    debugLog.appendChild(line);
    debugLog.scrollTop = debugLog.scrollHeight;
  }
  console.log(`[${type.toUpperCase()}]`, message);
}

// ========== Game State ==========
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
let isMultiplayer = false;
let myColors = new Set(); // Set of colors controlled by local players on this device
let expectedPlayerCount = 4;
let localPlayerCount = 1; // Number of players on this device

let previewCells = [];
let activePointerId = null;
let activePreviewAnchor = null;
let suppressClickUntil = 0;
let statusBeforePreview = null;

// Board ghost preview state
let boardGhostEl = null;
let ghostAnchor = null;
let isDraggingGhost = false;
let ghostPointerId = null;

// ========== Lobby Functions ==========
function showLobbySection(sectionId) {
  // Hide all sections
  lobbyMenu.hidden = true;
  newGameSetup.hidden = true;
  hostWaiting.hidden = true;
  joinGameSetup.hidden = true;
  clientWaiting.hidden = true;
  connectionStatus.hidden = true;
  lobbyError.hidden = true;

  // Show the requested section
  const section = document.querySelector(`#${sectionId}`);
  if (section) {
    section.hidden = false;
  }
}

function showError(message) {
  errorMessage.textContent = message;
  lobbyError.hidden = false;
}

function showConnecting(message = 'Connecting...') {
  connectionMessage.textContent = message;
  connectionStatus.hidden = false;
}

function hideConnecting() {
  connectionStatus.hidden = true;
}

function updatePlayersList(assignments, listEl, localPeerId) {
  listEl.innerHTML = '';
  const allColors = ['Blue', 'Yellow', 'Red', 'Green'];

  debug(`updatePlayersList: assignments=${JSON.stringify(assignments)}, localPeerId=${localPeerId}`, 'info');

  allColors.forEach(color => {
    // Find the peer that has this color assigned
    const peerId = Object.keys(assignments).find(id => {
      const peerColors = assignments[id];
      return Array.isArray(peerColors) ? peerColors.includes(color) : peerColors === color;
    });

    debug(`Color ${color}: peerId=${peerId}`, 'info');

    if (peerId) {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'player-color-dot';
      dot.dataset.color = color;

      const name = document.createElement('span');
      name.className = 'player-name';
      name.textContent = color;

      li.appendChild(dot);
      li.appendChild(name);

      if (peerId === localPeerId) {
        const localColors = Array.isArray(assignments[localPeerId])
          ? assignments[localPeerId]
          : [assignments[localPeerId]];
        const youBadge = document.createElement('span');
        youBadge.className = 'player-you';
        youBadge.textContent = localColors.length > 1 ? 'Local' : 'You';
        li.appendChild(youBadge);
      }

      listEl.appendChild(li);
    }
  });
}

function updateHostWaitingRoom() {
  const assignments = networkManager.playerAssignments;
  // Count total assigned colors (not peers)
  const playerCount = Object.values(assignments).flat().length;
  const neededPlayers = expectedPlayerCount;

  debug(`Updating host waiting room: ${playerCount}/${neededPlayers} players`, 'info');
  debug(`Assignments: ${JSON.stringify(assignments)}`, 'info');

  updatePlayersList(assignments, playersList, networkManager.localPlayerId);

  // Always allow starting if at least 1 player (host) is connected
  if (playerCount >= 1) {
    startMultiplayerBtn.disabled = false;
    debug('Start button ENABLED', 'success');
    if (playerCount >= neededPlayers) {
      waitingText.textContent = 'All players connected! Ready to start.';
      startMultiplayerBtn.textContent = 'Start Game';
    } else {
      waitingText.textContent = `Waiting for ${neededPlayers - playerCount} more player(s)... (or start now)`;
      startMultiplayerBtn.textContent = `Start with ${playerCount} Player${playerCount > 1 ? 's' : ''}`;
    }
  } else {
    waitingText.textContent = 'Setting up...';
    startMultiplayerBtn.disabled = true;
    debug('Start button DISABLED (no players)', 'error');
  }
}

function updateClientWaitingRoom() {
  const assignments = networkManager.playerAssignments;
  updatePlayersList(assignments, clientPlayersList, networkManager.localPlayerId);
}

// ========== Network Event Handlers ==========
function setupNetworkHandlers() {
  debug('Setting up network handlers', 'info');

  networkManager.onPlayerJoin = (peerId, color) => {
    debug(`Player joined: ${peerId} as ${color}`, 'success');
    updateHostWaitingRoom();
  };

  networkManager.onPlayerLeave = (peerId, color) => {
    debug(`Player left: ${peerId} (${color})`, 'error');
    if (isMultiplayer && !state.gameOver) {
      updateStatus(`${color} disconnected from the game.`);
    }
    updateHostWaitingRoom();
  };

  networkManager.onPlayerAssignmentsUpdate = (assignments) => {
    debug(`Assignments updated: ${JSON.stringify(assignments)}`, 'info');
    updateClientWaitingRoom();
  };

  networkManager.onGameStart = (gameState, playerAssignments) => {
    debug('onGameStart received!', 'success');
    debug(`playerAssignments: ${JSON.stringify(playerAssignments)}`, 'info');
    myColors = new Set(networkManager.getMyColors());
    debug(`My colors set to: ${[...myColors].join(', ')}`, 'info');
    startGameWithState(gameState);
  };

  networkManager.onStateUpdate = (newState) => {
    debug('State update received', 'info');
    applyNetworkState(newState);
  };

  networkManager.onPlayerAction = (action, peerId) => {
    debug(`Player action from ${peerId}: ${action.type}`, 'info');
    handlePlayerAction(action, peerId);
  };

  networkManager.onActionResult = (success, newState, reason) => {
    debug(`Action result: ${success ? 'success' : 'failed'} - ${reason || 'ok'}`, success ? 'success' : 'error');
    if (success) {
      applyNetworkState(newState);
    } else {
      updateStatus(reason || 'Action failed.');
    }
  };
}

// ========== Lobby Event Listeners ==========
newGameBtn.addEventListener('click', () => {
  showLobbySection('new-game-setup');
});

joinGameBtn.addEventListener('click', () => {
  showLobbySection('join-game-setup');
  roomCodeInput.value = '';
  roomCodeInput.focus();
});

backFromNewBtn.addEventListener('click', () => {
  showLobbySection('lobby-menu');
});

// Update local player count options when total player count changes
function updateLocalPlayerOptions() {
  if (!localPlayerCountSelect || !playerCountSelect) return;

  const totalPlayers = Number(playerCountSelect.value);
  const currentLocal = Number(localPlayerCountSelect.value);

  // Update options in local player dropdown
  localPlayerCountSelect.innerHTML = '';
  for (let i = 1; i <= totalPlayers; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `${i} Player${i > 1 ? 's' : ''}`;
    localPlayerCountSelect.appendChild(option);
  }

  // Restore selection if valid, otherwise default to 1
  localPlayerCountSelect.value = Math.min(currentLocal, totalPlayers);

  // Update hint text
  updateLocalHint();
}

function updateLocalHint() {
  if (!localHintEl || !playerCountSelect || !localPlayerCountSelect) return;

  const totalPlayers = Number(playerCountSelect.value);
  const localPlayers = Number(localPlayerCountSelect.value);
  const remotePlayers = totalPlayers - localPlayers;

  if (remotePlayers === 0) {
    localHintEl.textContent = 'All players on this device (local only game)';
  } else if (remotePlayers === 1) {
    localHintEl.textContent = '1 player can join remotely with a room code';
  } else {
    localHintEl.textContent = `${remotePlayers} players can join remotely with a room code`;
  }
}

if (playerCountSelect) {
  playerCountSelect.addEventListener('change', updateLocalPlayerOptions);
}

if (localPlayerCountSelect) {
  localPlayerCountSelect.addEventListener('change', updateLocalHint);
}

// Initialize on page load
updateLocalPlayerOptions();

backFromJoinBtn.addEventListener('click', () => {
  showLobbySection('lobby-menu');
});

createGameBtn.addEventListener('click', async () => {
  expectedPlayerCount = Number(playerCountSelect.value);
  const localSelectValue = localPlayerCountSelect?.value;
  // Clamp local players to not exceed total players
  localPlayerCount = Math.min(Number(localSelectValue ?? 1), expectedPlayerCount);
  debug(`localPlayerCountSelect value: "${localSelectValue}", parsed: ${localPlayerCount}`, 'info');
  debug(`Creating game for ${expectedPlayerCount} players, ${localPlayerCount} local...`, 'info');
  showConnecting('Creating game...');

  try {
    setupNetworkHandlers();
    debug('Network handlers set up', 'info');

    const result = await networkManager.createGame(expectedPlayerCount, localPlayerCount);
    debug(`Game created! Room: ${result.roomCode}, Colors: ${result.assignedColors.join(', ')}`, 'success');
    hideConnecting();

    roomCodeDisplay.textContent = result.roomCode;
    myColors = new Set(result.assignedColors);
    isMultiplayer = true;

    debug(`isHost after create: ${networkManager.isHost}`, 'info');
    debug(`localPlayerId: ${networkManager.localPlayerId}`, 'info');

    updateHostWaitingRoom();
    showLobbySection('host-waiting');
  } catch (err) {
    debug(`Create game error: ${err.message}`, 'error');
    hideConnecting();
    showError(err.message || 'Failed to create game');
  }
});

copyCodeBtn.addEventListener('click', async () => {
  const code = roomCodeDisplay.textContent;
  try {
    await navigator.clipboard.writeText(code);
    copyCodeBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyCodeBtn.textContent = 'Copy Code';
    }, 2000);
  } catch (err) {
    // Fallback for browsers without clipboard API
    const input = document.createElement('input');
    input.value = code;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    copyCodeBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyCodeBtn.textContent = 'Copy Code';
    }, 2000);
  }
});

cancelHostBtn.addEventListener('click', () => {
  networkManager.disconnect();
  isMultiplayer = false;
  myColors.clear();
  showLobbySection('lobby-menu');
});

joinBtn.addEventListener('click', async () => {
  const code = roomCodeInput.value.trim().toUpperCase();
  if (code.length !== 6) {
    showError('Please enter a 6-character room code');
    return;
  }

  const requestedLocalPlayers = Number(joinLocalPlayerCountSelect?.value ?? 1);
  localPlayerCount = requestedLocalPlayers;
  showConnecting('Joining game...');

  try {
    setupNetworkHandlers();
    const result = await networkManager.joinGame(code, requestedLocalPlayers);
    hideConnecting();

    const assignedCount = result.assignedColors.length;
    myColors = new Set(result.assignedColors);
    isMultiplayer = true;
    expectedPlayerCount = 4; // Will be updated when game starts

    // Update UI to show assigned colors
    const colorsList = result.assignedColors.join(', ');
    yourColorBadge.textContent = colorsList;
    yourColorBadge.dataset.color = result.assignedColors[0]; // Use first color for styling

    // Show message if fewer players assigned than requested
    if (assignedCount < requestedLocalPlayers) {
      debug(`Only ${assignedCount} of ${requestedLocalPlayers} requested local players assigned`, 'info');
    }

    updateClientWaitingRoom();
    showLobbySection('client-waiting');
  } catch (err) {
    hideConnecting();
    showError(err.message || 'Failed to join game');
  }
});

leaveGameBtn.addEventListener('click', () => {
  networkManager.disconnect();
  isMultiplayer = false;
  myColors.clear();
  showLobbySection('lobby-menu');
});

errorDismissBtn.addEventListener('click', () => {
  lobbyError.hidden = true;
});

function handleStartGame() {
  debug('Start button clicked', 'info');
  debug(`isHost: ${networkManager.isHost}`, 'info');
  debug(`Button disabled: ${startMultiplayerBtn.disabled}`, 'info');
  debug(`Player assignments: ${JSON.stringify(networkManager.playerAssignments)}`, 'info');

  if (!networkManager.isHost) {
    debug('ERROR: Not host, cannot start', 'error');
    return;
  }

  if (startMultiplayerBtn.disabled) {
    debug('ERROR: Button is disabled', 'error');
    return;
  }

  try {
    // Initialize game state - count colors, not peers
    const allAssignedColors = Object.values(networkManager.playerAssignments).flat();
    const playerCount = allAssignedColors.length;
    debug(`Starting game with ${playerCount} players`, 'success');

    debug(`Assigned colors: ${allAssignedColors.join(', ')}`, 'info');

    // Sort colors to maintain Blue -> Yellow -> Red -> Green turn order
    const colorOrder = ['Blue', 'Yellow', 'Red', 'Green'];
    const activeColors = colorOrder.filter(c => allAssignedColors.includes(c));
    debug(`Active colors: ${activeColors.join(', ')}`, 'info');

    state = initialState();
    state.activeColors = activeColors;
    state.turnIndex = 0;
    state.firstMoveCompleted = Object.fromEntries(activeColors.map(color => [color, false]));
    state.usedPieces = Object.fromEntries(activeColors.map(color => [color, new Set()]));

    debug('Game state initialized', 'success');

    // Broadcast game start to all clients
    const serialized = serializeState();
    debug('Broadcasting game start...', 'info');
    networkManager.startGame(serialized);

    // Start locally as host
    debug('Starting game locally...', 'info');
    startGameWithState(serialized);
    debug('Game started successfully!', 'success');
  } catch (err) {
    debug(`ERROR: ${err.message}`, 'error');
    debug(`Stack: ${err.stack}`, 'error');
  }
}

startMultiplayerBtn.addEventListener('click', (e) => {
  debug('Click event on start button', 'info');
  handleStartGame();
});

// Also handle touch for mobile
startMultiplayerBtn.addEventListener('touchstart', (e) => {
  debug('Touchstart on start button', 'info');
});

startMultiplayerBtn.addEventListener('touchend', (e) => {
  debug('Touchend on start button', 'info');
  e.preventDefault();
  e.stopPropagation();
  handleStartGame();
});

leaveGameFooterBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to leave the game?')) {
    leaveGame();
  }
});

function leaveGame() {
  networkManager.disconnect();
  isMultiplayer = false;
  myColors.clear();
  gameScreen.hidden = true;
  lobbyScreen.hidden = false;
  showLobbySection('lobby-menu');
}

// ========== Room code input handling ==========
roomCodeInput.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

roomCodeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    joinBtn.click();
  }
});

// ========== Game Functions ==========
function serializeState() {
  // Convert Sets to arrays for JSON serialization
  const serialized = { ...state };
  serialized.usedPieces = {};
  for (const color in state.usedPieces) {
    serialized.usedPieces[color] = Array.from(state.usedPieces[color]);
  }
  // Don't send selection state
  serialized.selectedPiece = null;
  serialized.selectedOrientation = null;
  serialized.selectedOrientationIndex = null;
  return serialized;
}

function deserializeState(serialized) {
  const deserialized = { ...serialized };
  deserialized.usedPieces = {};
  for (const color in serialized.usedPieces) {
    deserialized.usedPieces[color] = new Set(serialized.usedPieces[color]);
  }
  return deserialized;
}

function applyNetworkState(networkState) {
  const newState = deserializeState(networkState);
  state.board = newState.board;
  state.activeColors = newState.activeColors;
  state.turnIndex = newState.turnIndex;
  state.firstMoveCompleted = newState.firstMoveCompleted;
  state.usedPieces = newState.usedPieces;
  state.passChain = newState.passChain;
  state.log = newState.log;
  state.gameOver = newState.gameOver;

  // Clear local selection when state updates
  state.selectedPiece = null;
  state.selectedOrientation = null;
  state.selectedOrientationIndex = null;
  removeBoardGhost();
  ghostAnchor = null;

  // Update UI
  updateBoardUI();
  renderInventory();
  renderScores();
  renderLog();
  updateTurnIndicator();

  if (state.gameOver) {
    const scores = computeScores();
    const topScore = scores[0];
    const winners = scores.filter(s => s.total === topScore.total).map(s => s.color);
    if (winners.length === 1) {
      updateStatus(`Game over! Winner: ${winners[0]} with ${topScore.total} points.`);
    } else {
      updateStatus(`Game over! Tie between ${winners.join(', ')} at ${topScore.total} points.`);
    }
  } else {
    checkAutoPass();
  }
}

function handlePlayerAction(action, peerId) {
  // Host validates and processes actions
  const playerColors = networkManager.playerAssignments[peerId];

  if (!playerColors || playerColors.length === 0) {
    networkManager.sendActionResult(peerId, false, null, 'Unknown player');
    return;
  }

  const currentColor = getCurrentColor();
  if (!playerColors.includes(currentColor)) {
    networkManager.sendActionResult(peerId, false, null, 'Not your turn');
    return;
  }

  if (action.type === 'place') {
    const placement = action.cells;
    const validity = validatePlacement(currentColor, action.pieceId, placement);

    if (!validity.valid) {
      networkManager.sendActionResult(peerId, false, null, validity.reason);
      return;
    }

    // Apply placement
    applyPlacementInternal(currentColor, action.pieceId, placement);

    // Broadcast new state to all
    networkManager.broadcastState(serializeState());
    networkManager.sendActionResult(peerId, true, serializeState());

  } else if (action.type === 'pass') {
    if (hasLegalMove(currentColor)) {
      networkManager.sendActionResult(peerId, false, null, 'You have legal moves available');
      return;
    }

    state.log.push(`${currentColor} passed.`);
    state.passChain += 1;

    if (state.passChain >= state.activeColors.length) {
      endGame();
    } else {
      advanceTurnInternal();
    }

    networkManager.broadcastState(serializeState());
    networkManager.sendActionResult(peerId, true, serializeState());
  }
}

function startGameWithState(networkState) {
  debug('startGameWithState called', 'info');

  try {
    state = deserializeState(networkState);
    debug('State deserialized', 'success');

    // Show game screen
    debug(`lobbyScreen element: ${lobbyScreen ? 'found' : 'NOT FOUND'}`, lobbyScreen ? 'info' : 'error');
    debug(`gameScreen element: ${gameScreen ? 'found' : 'NOT FOUND'}`, gameScreen ? 'info' : 'error');

    if (lobbyScreen) {
      lobbyScreen.hidden = true;
      lobbyScreen.style.display = 'none';
      debug('Lobby screen hidden', 'success');
    }

    if (gameScreen) {
      gameScreen.hidden = false;
      gameScreen.style.display = 'flex';
      debug('Game screen shown', 'success');
    }

    // Set up game UI
    const myColorsList = [...myColors];
    debug(`myColors: ${myColorsList.join(', ')}`, 'info');
    if (yourColorIndicator) {
      if (myColorsList.length > 1) {
        yourColorIndicator.textContent = `You: ${myColorsList.join(', ')}`;
      } else {
        yourColorIndicator.textContent = `You: ${myColorsList[0] || 'N/A'}`;
      }
      yourColorIndicator.dataset.color = myColorsList[0] || '';
    }
    if (roomCodeSmall) {
      roomCodeSmall.textContent = `Room: ${networkManager.roomCode}`;
    }

    debug('Creating board...', 'info');
    createBoard();
    debug('Board created', 'success');

    updateBoardUI();
    renderInventory();
    renderScores();
    renderLog();
    updateTurnIndicator();
    checkAutoPass();

    debug('Game UI fully initialized', 'success');
  } catch (err) {
    debug(`startGameWithState ERROR: ${err.message}`, 'error');
    debug(`Stack: ${err.stack}`, 'error');
  }
}

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
    delete cell.dataset.preview;
    cell.style.removeProperty('--preview-color');
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

function getBoardCell(x, y) {
  const index = y * BOARD_SIZE + x;
  return boardEl.children[index] ?? null;
}

function clearPreview(restoreStatus = true) {
  if (previewCells.length) {
    previewCells.forEach(({ x, y }) => {
      const cell = getBoardCell(x, y);
      if (cell) {
        delete cell.dataset.preview;
        cell.style.removeProperty('--preview-color');
      }
    });
    previewCells = [];
  }
  if (restoreStatus && statusBeforePreview !== null) {
    updateStatus(statusBeforePreview);
    statusBeforePreview = null;
  }
}

function showPlacementPreview(x, y) {
  if (!state.selectedPiece || !state.selectedOrientation) return;
  if (statusBeforePreview === null) {
    statusBeforePreview = actionMessageEl.textContent;
  }
  clearPreview(false);
  const color = getCurrentColor();
  if (!color) return;
  const placement = state.selectedOrientation.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
  const validity = validatePlacement(color, state.selectedPiece, placement);
  const colorConfig = getColorConfig(color);
  previewCells = placement;
  placement.forEach(({ x: cellX, y: cellY }) => {
    const cell = getBoardCell(cellX, cellY);
    if (cell) {
      cell.dataset.preview = validity.valid ? 'valid' : 'invalid';
      if (colorConfig) {
        cell.style.setProperty('--preview-color', colorConfig.cssVar);
      }
    }
  });
  if (validity.valid) {
    updateStatus(`Release to place ${state.selectedPiece}.`);
  } else {
    updateStatus(validity.reason);
  }
}

function resetPreviewState() {
  activePointerId = null;
  activePreviewAnchor = null;
}

function isMyTurn() {
  if (!isMultiplayer) return true;
  return myColors.has(getCurrentColor());
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

  // Show whose turn it is
  const canInteract = isMyTurn() && !state.gameOver;

  // Add visual indicator for non-turn
  if (isMultiplayer) {
    inventoryGrid.parentElement.classList.toggle('not-your-turn', !canInteract);
  }

  PIECE_DEFINITIONS.forEach((piece) => {
    const card = document.createElement('button');
    card.className = 'piece-card';
    if (state.selectedPiece === piece.id) {
      card.classList.add('selected');
    }
    card.type = 'button';
    card.dataset.pieceId = piece.id;
    const isUsed = state.usedPieces[currentColor]?.has(piece.id);
    card.dataset.owned = (!state.gameOver && !isUsed).toString();
    card.style.color = getColorConfig(currentColor)?.cssVar ?? '#333';
    card.disabled = state.gameOver || isUsed || !canInteract;
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
    card.addEventListener('click', () => {
      if (canInteract) selectPiece(piece.id);
    });
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
  let text = color ?? '—';

  if (isMultiplayer && color) {
    if (myColors.has(color)) {
      if (myColors.size > 1) {
        text = `${color} (Your Turn - Local Player)`;
      } else {
        text = `${color} (Your Turn)`;
      }
    } else {
      text = `${color} (Waiting...)`;
    }
  }

  turnIndicator.textContent = text;
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
  if (!isMyTurn()) {
    updateStatus("Wait for your turn.");
    return;
  }
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
  // If ghost exists, move ghost to clicked position instead of placing
  if (boardGhostEl) {
    ghostAnchor = { x, y };
    updateBoardGhost();
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

function getCellFromPoint(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  return element ? element.closest('.board-cell') : null;
}

function parseCellCoordinates(cellEl) {
  return {
    x: Number(cellEl?.dataset.x ?? NaN),
    y: Number(cellEl?.dataset.y ?? NaN),
  };
}

function handleBoardPointerDown(event) {
  if (event.pointerType === 'mouse') return;
  if (state.gameOver) return;
  if (!isMyTurn()) return;
  const cell = event.target.closest('.board-cell');
  if (!cell) return;
  if (!state.selectedPiece) {
    updateStatus('Select a piece before placing.');
    return;
  }
  if (!state.selectedOrientation) {
    updateStatus('Orientation not ready. Please reselect the piece.');
    return;
  }
  const coords = parseCellCoordinates(cell);
  if (Number.isNaN(coords.x) || Number.isNaN(coords.y)) return;
  activePointerId = event.pointerId;
  activePreviewAnchor = coords;
  event.preventDefault();
  if (typeof boardEl.setPointerCapture === 'function') {
    try {
      boardEl.setPointerCapture(event.pointerId);
    } catch (err) {
      // noop
    }
  }
  showPlacementPreview(coords.x, coords.y);
}

function handleBoardPointerMove(event) {
  if (event.pointerType === 'mouse') return;
  if (activePointerId !== event.pointerId) return;
  event.preventDefault();
  const cell = getCellFromPoint(event.clientX, event.clientY);
  if (!cell) {
    clearPreview(false);
    activePreviewAnchor = null;
    if (statusBeforePreview !== null) {
      updateStatus(statusBeforePreview);
    }
    return;
  }
  const coords = parseCellCoordinates(cell);
  if (Number.isNaN(coords.x) || Number.isNaN(coords.y)) return;
  if (!activePreviewAnchor || activePreviewAnchor.x !== coords.x || activePreviewAnchor.y !== coords.y) {
    activePreviewAnchor = coords;
    showPlacementPreview(coords.x, coords.y);
  }
}

function handleBoardPointerUp(event) {
  if (event.pointerType === 'mouse') return;
  if (activePointerId !== event.pointerId) return;
  if (typeof boardEl.releasePointerCapture === 'function') {
    try {
      boardEl.releasePointerCapture(event.pointerId);
    } catch (err) {
      // ignore
    }
  }
  const cell = getCellFromPoint(event.clientX, event.clientY);
  if (cell && state.selectedOrientation) {
    const coords = parseCellCoordinates(cell);
    if (!Number.isNaN(coords.x) && !Number.isNaN(coords.y)) {
      suppressClickUntil = Date.now() + 400;
      statusBeforePreview = null;
      clearPreview(false);
      resetPreviewState();
      event.preventDefault();
      if (boardGhostEl) {
        ghostAnchor = coords;
        updateBoardGhost();
        return;
      }
      handleBoardClick(coords.x, coords.y);
      return;
    }
  }
  resetPreviewState();
  clearPreview();
}

function handleBoardPointerCancel(event) {
  if (event.pointerType === 'mouse') return;
  if (activePointerId !== event.pointerId) return;
  resetPreviewState();
  clearPreview();
  if (typeof boardEl.releasePointerCapture === 'function') {
    try {
      boardEl.releasePointerCapture(event.pointerId);
    } catch (err) {
      // ignore
    }
  }
}

function handleBoardClickSuppression(event) {
  if (Date.now() < suppressClickUntil) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
}

// --- Board ghost preview system ---
function findValidStartingPosition(orientation, corner) {
  for (const [dx, dy] of orientation) {
    const anchorX = corner.x - dx;
    const anchorY = corner.y - dy;
    let allInBounds = true;
    for (const [pdx, pdy] of orientation) {
      const cellX = anchorX + pdx;
      const cellY = anchorY + pdy;
      if (cellX < 0 || cellX >= BOARD_SIZE || cellY < 0 || cellY >= BOARD_SIZE) {
        allInBounds = false;
        break;
      }
    }
    if (allInBounds) {
      return { x: anchorX, y: anchorY };
    }
  }
  return null;
}

function getStartingPositionAndOrientation() {
  const color = getCurrentColor();
  const colorConfig = getColorConfig(color);
  if (!colorConfig) return { position: { x: 10, y: 10 }, orientationChanged: false };

  if (!state.firstMoveCompleted[color]) {
    const corner = colorConfig.corner;
    const currentOrientation = state.selectedOrientation;
    if (currentOrientation) {
      const pos = findValidStartingPosition(currentOrientation, corner);
      if (pos) {
        return { position: pos, orientationChanged: false };
      }
    }

    if (state.selectedPiece) {
      const allOrientations = getPieceOrientationsById(state.selectedPiece);
      for (let i = 0; i < allOrientations.length; i++) {
        const orientation = allOrientations[i];
        const pos = findValidStartingPosition(orientation, corner);
        if (pos) {
          state.selectedOrientationIndex = i;
          state.selectedOrientation = orientation;
          updateSelectedPieceLabel();
          return { position: pos, orientationChanged: true };
        }
      }
    }
    return { position: corner, orientationChanged: false };
  }
  return { position: { x: 10, y: 10 }, orientationChanged: false };
}

function createBoardGhost() {
  if (!state.selectedPiece || !state.selectedOrientation) return;
  removeBoardGhost();
  const ghost = document.createElement('div');
  ghost.className = 'board-ghost';
  ghost.id = 'board-ghost';
  boardEl.appendChild(ghost);
  boardGhostEl = ghost;
  ghost.addEventListener('pointerdown', handleGhostPointerDown);
  const { position } = getStartingPositionAndOrientation();
  ghostAnchor = position;
  updateBoardGhost();
}

function updateBoardGhost() {
  if (!boardGhostEl || !state.selectedOrientation || !ghostAnchor) return;
  const color = getCurrentColor();
  const colorConfig = getColorConfig(color);
  const orientation = state.selectedOrientation;
  boardGhostEl.innerHTML = '';
  const placement = orientation.map(([dx, dy]) => ({ x: ghostAnchor.x + dx, y: ghostAnchor.y + dy }));
  const validity = validatePlacement(color, state.selectedPiece, placement);
  const boardRect = boardEl.getBoundingClientRect();

  orientation.forEach(([dx, dy]) => {
    const cellX = ghostAnchor.x + dx;
    const cellY = ghostAnchor.y + dy;
    if (cellX < 0 || cellX >= BOARD_SIZE || cellY < 0 || cellY >= BOARD_SIZE) return;
    const targetCell = getBoardCell(cellX, cellY);
    if (!targetCell) return;
    const cellRect = targetCell.getBoundingClientRect();
    const ghostCell = document.createElement('div');
    ghostCell.className = 'ghost-piece-cell';
    ghostCell.style.width = `${cellRect.width}px`;
    ghostCell.style.height = `${cellRect.height}px`;
    ghostCell.style.left = `${cellRect.left - boardRect.left}px`;
    ghostCell.style.top = `${cellRect.top - boardRect.top}px`;
    ghostCell.style.setProperty('--ghost-color', colorConfig?.cssVar ?? '#666');
    ghostCell.dataset.valid = validity.valid ? 'true' : 'false';
    boardGhostEl.appendChild(ghostCell);
  });
  updateGhostStatusMessage(validity);
}

function updateGhostStatusMessage(validity) {
  if (isDraggingGhost) {
    if (validity.valid) {
      updateStatus('Release to position here.');
    } else {
      updateStatus(validity.reason);
    }
  } else {
    if (validity.valid) {
      updateStatus('Tap cell or drag to reposition. Tap Confirm to place.');
    } else {
      updateStatus(`${validity.reason} Tap or drag to a valid position.`);
    }
  }
}

function removeBoardGhost() {
  if (boardGhostEl) {
    boardGhostEl.remove();
    boardGhostEl = null;
  }
}

function handleGhostPointerDown(event) {
  if (state.gameOver) return;
  if (!state.selectedPiece) return;
  if (!isMyTurn()) return;
  event.preventDefault();
  event.stopPropagation();
  ghostPointerId = event.pointerId;
  isDraggingGhost = true;
  if (boardGhostEl) {
    boardGhostEl.setPointerCapture(event.pointerId);
    boardGhostEl.classList.add('dragging');
  }
}

function handleGhostPointerMove(event) {
  if (!isDraggingGhost || ghostPointerId !== event.pointerId) return;
  event.preventDefault();
  const cell = getCellFromPoint(event.clientX, event.clientY);
  if (cell) {
    const coords = parseCellCoordinates(cell);
    if (!Number.isNaN(coords.x) && !Number.isNaN(coords.y)) {
      if (!ghostAnchor || ghostAnchor.x !== coords.x || ghostAnchor.y !== coords.y) {
        ghostAnchor = coords;
        updateBoardGhost();
      }
    }
  }
}

function handleGhostPointerUp(event) {
  if (!isDraggingGhost || ghostPointerId !== event.pointerId) return;
  event.preventDefault();
  if (boardGhostEl) {
    boardGhostEl.releasePointerCapture(event.pointerId);
    boardGhostEl.classList.remove('dragging');
  }
  isDraggingGhost = false;
  ghostPointerId = null;
  if (ghostAnchor && state.selectedPiece && state.selectedOrientation) {
    const color = getCurrentColor();
    const placement = state.selectedOrientation.map(([dx, dy]) => ({
      x: ghostAnchor.x + dx,
      y: ghostAnchor.y + dy
    }));
    const validity = validatePlacement(color, state.selectedPiece, placement);
    updateGhostStatusMessage(validity);
  }
}

function confirmPlacement() {
  if (!isMyTurn()) {
    updateStatus("Wait for your turn.");
    return;
  }
  if (!ghostAnchor || !state.selectedPiece || !state.selectedOrientation) {
    updateStatus('Select a piece first.');
    return;
  }
  const color = getCurrentColor();
  const placement = state.selectedOrientation.map(([dx, dy]) => ({
    x: ghostAnchor.x + dx,
    y: ghostAnchor.y + dy
  }));
  const validity = validatePlacement(color, state.selectedPiece, placement);

  if (validity.valid) {
    removeBoardGhost();
    applyPlacement(color, state.selectedPiece, placement);
    suppressClickUntil = Date.now() + 400;
  } else {
    updateStatus(validity.reason);
  }
}

function handleGhostPointerCancel(event) {
  if (ghostPointerId !== event.pointerId) return;
  if (boardGhostEl) {
    boardGhostEl.classList.remove('dragging');
  }
  isDraggingGhost = false;
  ghostPointerId = null;
}

function validatePlacement(color, pieceId, cells) {
  const colorConfig = getColorConfig(color);
  const firstMove = !state.firstMoveCompleted[color];
  let cornerTouch = false;
  for (const { x, y } of cells) {
    if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) {
      return { valid: false, reason: 'Placement must stay within the 20x20 board.' };
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
  if (isMultiplayer) {
    // Send action to host
    networkManager.sendAction({
      type: 'place',
      pieceId,
      cells
    });
  } else {
    applyPlacementInternal(color, pieceId, cells);
  }
}

function applyPlacementInternal(color, pieceId, cells) {
  cells.forEach(({ x, y }) => {
    state.board[y][x] = color;
  });
  state.usedPieces[color].add(pieceId);
  state.firstMoveCompleted[color] = true;
  state.log.push(`${color} placed ${pieceId} at ${cells.map(({ x, y }) => `${String.fromCharCode(65 + x)}${y + 1}`).join(', ')}`);
  updateBoardUI();
  renderScores();
  renderLog();
  updateStatus(`${color} placed ${pieceId}.`);
  state.selectedPiece = null;
  state.selectedOrientation = null;
  state.selectedOrientationIndex = null;
  removeBoardGhost();
  ghostAnchor = null;
  state.passChain = 0;
  renderInventory();
  advanceTurnInternal();
}

function advanceTurnInternal() {
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
    if (isMyTurn()) {
      updateStatus(`No legal moves available. You must pass.`);
    } else {
      updateStatus(`${color} has no legal moves. Waiting for pass.`);
    }
  } else {
    if (isMyTurn()) {
      updateStatus(`Your turn! Select a piece.`);
    } else {
      updateStatus(`Waiting for ${color} to play...`);
    }
  }
}

function selectPiece(pieceId) {
  const color = getCurrentColor();
  if (!color) return;
  if (state.gameOver) return;
  if (!isMyTurn()) {
    updateStatus("Wait for your turn.");
    return;
  }
  if (state.usedPieces[color].has(pieceId)) {
    updateStatus('Piece already used.');
    return;
  }
  state.selectedPiece = pieceId;
  const orientations = getPieceOrientationsById(pieceId);
  state.selectedOrientationIndex = 0;
  state.selectedOrientation = orientations[state.selectedOrientationIndex];
  updateSelectedPieceLabel();
  inventoryGrid.querySelectorAll('.piece-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.pieceId === pieceId);
  });
  createBoardGhost();
}

function rotateSelectedPiece(direction) {
  if (!isMyTurn()) return;
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
  if (boardGhostEl) {
    updateBoardGhost();
  }
}

function flipSelectedPiece() {
  if (!isMyTurn()) return;
  if (!state.selectedPiece) {
    updateStatus('Select a piece before flipping.');
    return;
  }
  const orientations = getPieceOrientationsById(state.selectedPiece);
  if (!orientations.length) return;
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
  if (boardGhostEl) {
    updateBoardGhost();
  }
}

function handlePass() {
  if (state.gameOver) return;
  if (!isMyTurn()) {
    updateStatus("Wait for your turn.");
    return;
  }
  const color = getCurrentColor();
  if (!color) return;
  if (hasLegalMove(color)) {
    updateStatus('Passing is illegal while a legal move exists.');
    return;
  }

  if (isMultiplayer) {
    networkManager.sendAction({ type: 'pass' });
  } else {
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
      advanceTurnInternal();
    }
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
  state.activeColors.forEach((color) => {
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
    if (isMultiplayer && myColors.has(color)) {
      const label = myColors.size > 1 ? '(Local)' : '(You)';
      colorCell.innerHTML = `${color} <span style="font-size:0.75rem;color:var(--muted)">${label}</span>`;
    }
    const remainingCell = document.createElement('td');
    remainingCell.textContent = remainingSquares.toString();
    const bonusCell = document.createElement('td');
    bonusCell.textContent = bonus.toString();
    const totalCell = document.createElement('td');
    totalCell.textContent = total.toString();
    row.append(colorCell, remainingCell, bonusCell, totalCell);
    scoreRows.appendChild(row);
  });
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
  renderInventory();
}

// ========== Event Listeners ==========
rotateLeftBtn.addEventListener('click', () => rotateSelectedPiece('left'));
rotateRightBtn.addEventListener('click', () => rotateSelectedPiece('right'));
flipBtn.addEventListener('click', () => flipSelectedPiece());
confirmBtn.addEventListener('click', confirmPlacement);
passBtn.addEventListener('click', handlePass);

boardEl.addEventListener('pointerdown', handleBoardPointerDown);
boardEl.addEventListener('pointermove', handleBoardPointerMove);
boardEl.addEventListener('pointerup', handleBoardPointerUp);
boardEl.addEventListener('pointercancel', handleBoardPointerCancel);
boardEl.addEventListener('click', handleBoardClickSuppression, true);

document.addEventListener('pointermove', handleGhostPointerMove);
document.addEventListener('pointerup', handleGhostPointerUp);
document.addEventListener('pointercancel', handleGhostPointerCancel);

// Initialize with lobby visible
showLobbySection('lobby-menu');

// ========== PWA Install Button Handler ==========
const installBtn = document.querySelector('#install-btn');
if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      debug('Install prompt not available', 'error');
      return;
    }

    debug('Showing install prompt', 'info');
    deferredInstallPrompt.prompt();

    const { outcome } = await deferredInstallPrompt.userChoice;
    debug(`Install prompt outcome: ${outcome}`, outcome === 'accepted' ? 'success' : 'info');

    if (outcome === 'accepted') {
      installBtn.hidden = true;
    }

    deferredInstallPrompt = null;
  });
}

// ========== Debug Panel Toggle (7-tap secret) ==========
const debugPanel = document.querySelector('#debug-panel');
const lobbyTitle = document.querySelector('.lobby-header h1');
let debugTapCount = 0;
let debugTapTimeout = null;

// Check if debug mode was previously enabled
if (localStorage.getItem('blockYouDebugMode') === 'true' && debugPanel) {
  debugPanel.classList.add('visible');
}

if (lobbyTitle) {
  lobbyTitle.style.cursor = 'default'; // Prevent text selection cursor hint
  lobbyTitle.addEventListener('click', () => {
    debugTapCount++;

    // Reset timeout on each tap
    if (debugTapTimeout) {
      clearTimeout(debugTapTimeout);
    }

    // Reset counter if taps are too slow (2 second window)
    debugTapTimeout = setTimeout(() => {
      debugTapCount = 0;
    }, 2000);

    // Toggle debug panel after 7 taps
    if (debugTapCount >= 7) {
      debugTapCount = 0;
      if (debugPanel) {
        const isVisible = debugPanel.classList.toggle('visible');
        localStorage.setItem('blockYouDebugMode', isVisible ? 'true' : 'false');
        debug(isVisible ? 'Debug mode enabled' : 'Debug mode disabled', 'success');
      }
    }
  });
}

// Initialization debug
debug('Block-You initialized', 'success');
debug(`Start button element: ${startMultiplayerBtn ? 'found' : 'NOT FOUND'}`, startMultiplayerBtn ? 'info' : 'error');
debug(`User agent: ${navigator.userAgent.substring(0, 50)}...`, 'info');
