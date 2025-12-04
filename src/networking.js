// Networking module for remote multiplayer using PeerJS
// Uses WebRTC peer-to-peer connections with PeerJS cloud signaling

const PEER_CONFIG = {
  debug: 0, // Set to 2 for more verbose logging
};

// Generate a random room code
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like O, 0, I, 1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

class NetworkManager {
  constructor() {
    this.peer = null;
    this.connections = new Map(); // peerId -> connection
    this.isHost = false;
    this.roomCode = null;
    this.localPlayerId = null;
    this.playerAssignments = {}; // peerId -> array of colors (supports multiple local players)
    this.onStateUpdate = null;
    this.onPlayerJoin = null;
    this.onPlayerLeave = null;
    this.onConnectionReady = null;
    this.onError = null;
    this.onGameStart = null;
  }

  // Load PeerJS library dynamically
  async loadPeerJS() {
    if (window.Peer) return;

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load PeerJS'));
      document.head.appendChild(script);
    });
  }

  // Initialize as host (New Game)
  async createGame(playerCount, localPlayerCount = 1) {
    await this.loadPeerJS();

    this.isHost = true;
    this.roomCode = generateRoomCode();
    const peerId = `blockyou-${this.roomCode}`;

    return new Promise((resolve, reject) => {
      this.peer = new window.Peer(peerId, PEER_CONFIG);

      this.peer.on('open', (id) => {
        this.localPlayerId = id;
        console.log('Host peer opened with ID:', id);

        // Assign colors to local players on host device
        const colors = ['Blue', 'Yellow', 'Red', 'Green'];
        const assignedColors = colors.slice(0, localPlayerCount);
        this.playerAssignments[id] = assignedColors;

        console.log(`Host assigned ${localPlayerCount} local players: ${assignedColors.join(', ')}`);

        // Listen for incoming connections
        this.peer.on('connection', (conn) => this.handleIncomingConnection(conn));

        resolve({
          roomCode: this.roomCode,
          peerId: id,
          assignedColors: assignedColors
        });
      });

      this.peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err.type === 'unavailable-id') {
          // Room code collision, try again
          this.roomCode = generateRoomCode();
          this.peer.destroy();
          this.createGame(playerCount, localPlayerCount).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  }

  // Initialize as client (Join Game)
  async joinGame(roomCode, localPlayerCount = 1) {
    await this.loadPeerJS();

    this.isHost = false;
    this.roomCode = roomCode.toUpperCase();
    const hostPeerId = `blockyou-${this.roomCode}`;

    return new Promise((resolve, reject) => {
      // Generate a unique peer ID for this client
      const clientId = `blockyou-${this.roomCode}-${Date.now().toString(36)}`;
      this.peer = new window.Peer(clientId, PEER_CONFIG);

      this.peer.on('open', (id) => {
        this.localPlayerId = id;
        console.log('Client peer opened with ID:', id);

        // Connect to host
        const conn = this.peer.connect(hostPeerId, {
          reliable: true,
          serialization: 'json'
        });

        conn.on('open', () => {
          console.log('Connected to host');
          this.connections.set(hostPeerId, conn);
          this.setupConnectionHandlers(conn);

          // Send join request with local player count
          conn.send({
            type: 'join-request',
            peerId: id,
            localPlayerCount: localPlayerCount
          });
        });

        conn.on('error', (err) => {
          console.error('Connection error:', err);
          reject(new Error('Failed to connect to game'));
        });
      });

      this.peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err.type === 'peer-unavailable') {
          reject(new Error('Game not found. Check the room code.'));
        } else {
          reject(err);
        }
      });

      // Wait for color assignment from host
      this.pendingJoinResolve = resolve;
      this.pendingJoinReject = reject;

      // Timeout for connection
      setTimeout(() => {
        if (this.pendingJoinResolve) {
          reject(new Error('Connection timed out'));
          this.pendingJoinResolve = null;
          this.pendingJoinReject = null;
        }
      }, 15000);
    });
  }

  handleIncomingConnection(conn) {
    console.log('Incoming connection from:', conn.peer);

    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      this.setupConnectionHandlers(conn);
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
    });
  }

  setupConnectionHandlers(conn) {
    conn.on('data', (data) => this.handleMessage(conn, data));

    conn.on('close', () => {
      console.log('Connection closed:', conn.peer);
      this.connections.delete(conn.peer);

      if (this.onPlayerLeave) {
        const color = this.playerAssignments[conn.peer];
        this.onPlayerLeave(conn.peer, color);
      }
    });
  }

  handleMessage(conn, data) {
    console.log('Received message:', data.type, data);

    switch (data.type) {
      case 'join-request':
        if (this.isHost) {
          this.handleJoinRequest(conn, data);
        }
        break;

      case 'join-accepted':
        // Client received color assignment (can be multiple colors for local multiplayer)
        this.playerAssignments = data.playerAssignments;
        const myColors = this.playerAssignments[this.localPlayerId] || [];
        if (this.pendingJoinResolve) {
          this.pendingJoinResolve({
            roomCode: this.roomCode,
            peerId: this.localPlayerId,
            assignedColors: myColors,
            playerAssignments: data.playerAssignments
          });
          this.pendingJoinResolve = null;
          this.pendingJoinReject = null;
        }
        if (this.onConnectionReady) {
          this.onConnectionReady(myColors);
        }
        break;

      case 'join-rejected':
        if (this.pendingJoinReject) {
          this.pendingJoinReject(new Error(data.reason || 'Join rejected'));
          this.pendingJoinResolve = null;
          this.pendingJoinReject = null;
        }
        break;

      case 'game-start':
        this.playerAssignments = data.playerAssignments;
        if (this.onGameStart) {
          this.onGameStart(data.gameState, data.playerAssignments);
        }
        break;

      case 'state-update':
        if (this.onStateUpdate) {
          this.onStateUpdate(data.state);
        }
        break;

      case 'player-action':
        // Forward to host for validation, or process if we are host
        if (this.isHost && this.onPlayerAction) {
          this.onPlayerAction(data.action, conn.peer);
        }
        break;

      case 'action-result':
        // Client receives result of their action
        if (this.onActionResult) {
          this.onActionResult(data.success, data.state, data.reason);
        }
        break;

      case 'player-assignments-update':
        this.playerAssignments = data.playerAssignments;
        if (this.onPlayerAssignmentsUpdate) {
          this.onPlayerAssignmentsUpdate(data.playerAssignments);
        }
        break;

      default:
        console.warn('Unknown message type:', data.type);
    }
  }

  handleJoinRequest(conn, data) {
    // Get requested local player count (default to 1 for backwards compatibility)
    const requestedLocalPlayers = data.localPlayerCount || 1;

    // Assign colors to new player(s)
    const colors = ['Blue', 'Yellow', 'Red', 'Green'];

    // Get all colors already used (flatten the arrays)
    const usedColors = Object.values(this.playerAssignments).flat();
    const availableColors = colors.filter(c => !usedColors.includes(c));

    if (availableColors.length === 0) {
      conn.send({
        type: 'join-rejected',
        reason: 'Game is full'
      });
      return;
    }

    // Assign as many colors as requested and available
    const colorsToAssign = availableColors.slice(0, requestedLocalPlayers);

    if (colorsToAssign.length < requestedLocalPlayers) {
      // Not enough slots for all requested local players
      if (colorsToAssign.length === 0) {
        conn.send({
          type: 'join-rejected',
          reason: 'Game is full'
        });
        return;
      }
      // Partial assignment - assign what's available
      console.log(`Only ${colorsToAssign.length} of ${requestedLocalPlayers} requested slots available`);
    }

    this.playerAssignments[conn.peer] = colorsToAssign;

    console.log(`Assigned ${colorsToAssign.length} colors to ${conn.peer}: ${colorsToAssign.join(', ')}`);

    // Send acceptance with color assignment
    conn.send({
      type: 'join-accepted',
      assignedColors: colorsToAssign,
      playerAssignments: this.playerAssignments
    });

    // Notify all other clients of new player
    this.broadcastPlayerAssignments();

    if (this.onPlayerJoin) {
      this.onPlayerJoin(conn.peer, colorsToAssign);
    }
  }

  broadcastPlayerAssignments() {
    const message = {
      type: 'player-assignments-update',
      playerAssignments: this.playerAssignments
    };

    this.connections.forEach((conn) => {
      if (conn.open) {
        conn.send(message);
      }
    });
  }

  // Host starts the game
  startGame(gameState) {
    if (!this.isHost) {
      console.error('Only host can start the game');
      return;
    }

    const message = {
      type: 'game-start',
      gameState: gameState,
      playerAssignments: this.playerAssignments
    };

    this.connections.forEach((conn) => {
      if (conn.open) {
        conn.send(message);
      }
    });
  }

  // Host broadcasts state update to all clients
  broadcastState(state) {
    if (!this.isHost) return;

    const message = {
      type: 'state-update',
      state: state
    };

    this.connections.forEach((conn) => {
      if (conn.open) {
        conn.send(message);
      }
    });
  }

  // Client sends action to host
  sendAction(action) {
    if (this.isHost) {
      // Host processes action locally
      if (this.onPlayerAction) {
        this.onPlayerAction(action, this.localPlayerId);
      }
      return;
    }

    // Send to host
    const hostPeerId = `blockyou-${this.roomCode}`;
    const conn = this.connections.get(hostPeerId);
    if (conn && conn.open) {
      conn.send({
        type: 'player-action',
        action: action
      });
    }
  }

  // Host sends action result to specific client
  sendActionResult(peerId, success, state, reason = null) {
    if (peerId === this.localPlayerId) {
      // Host is processing own action
      if (this.onActionResult) {
        this.onActionResult(success, state, reason);
      }
      return;
    }

    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      conn.send({
        type: 'action-result',
        success,
        state,
        reason
      });
    }
  }

  getConnectedPlayerCount() {
    // Count total colors assigned (not peers, since each peer can have multiple colors)
    return Object.values(this.playerAssignments).flat().length;
  }

  getMyColors() {
    return this.playerAssignments[this.localPlayerId] || [];
  }

  // Legacy method for backwards compatibility
  getMyColor() {
    const colors = this.getMyColors();
    return colors[0] || null;
  }

  isMyTurn(currentColor) {
    return this.getMyColors().includes(currentColor);
  }

  // Get the peer ID that owns a specific color
  getPeerForColor(color) {
    for (const [peerId, colors] of Object.entries(this.playerAssignments)) {
      if (colors.includes(color)) {
        return peerId;
      }
    }
    return null;
  }

  disconnect() {
    this.connections.forEach((conn) => conn.close());
    this.connections.clear();
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.isHost = false;
    this.roomCode = null;
    this.localPlayerId = null;
    this.playerAssignments = {};
  }
}

// Singleton instance
export const networkManager = new NetworkManager();
