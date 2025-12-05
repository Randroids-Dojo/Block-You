// Networking module for remote multiplayer using PeerJS
// Uses WebRTC peer-to-peer connections with PeerJS cloud signaling

const PEER_CONFIG = {
  debug: 0, // Set to 2 for more verbose logging
};

const SESSION_STORAGE_KEY = 'blockyou-session';

// Generate a random room code
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like O, 0, I, 1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Session persistence for rejoining after disconnect
function saveSession(roomCode, hostPeerId, knownPeers) {
  try {
    const session = {
      roomCode,
      hostPeerId,
      knownPeers: knownPeers || [],
      timestamp: Date.now()
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn('Failed to save session:', e);
  }
}

function loadSession(roomCode) {
  try {
    const data = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!data) return null;
    const session = JSON.parse(data);
    // Only return if it's for the same room and not too old (1 hour)
    if (session.roomCode === roomCode && Date.now() - session.timestamp < 3600000) {
      return session;
    }
    return null;
  } catch (e) {
    console.warn('Failed to load session:', e);
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear session:', e);
  }
}

class NetworkManager {
  constructor() {
    this.peer = null;
    this.connections = new Map(); // peerId -> connection
    this.isHost = false;
    this.roomCode = null;
    this.localPlayerId = null;
    this.hostPeerId = null; // Track current host's peer ID
    this.originalHostPeerId = null; // Track the original host's peer ID for reclaim
    this.playerAssignments = {}; // peerId -> array of colors (supports multiple local players)
    this.gameInProgress = false; // Track if game has started
    this.lastKnownGameState = null; // For host migration
    this.onStateUpdate = null;
    this.onPlayerJoin = null;
    this.onPlayerLeave = null;
    this.onConnectionReady = null;
    this.onError = null;
    this.onGameStart = null;
    this.onBecomeHost = null; // Called when this peer becomes the new host
    this.onHostDisconnect = null; // Called when host disconnects (before migration)
    this.onHostReclaimed = null; // Called when original host reclaims hosting
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
        this.hostPeerId = id; // Host is itself
        this.originalHostPeerId = id; // Track original host for potential reclaim
        console.log('Host peer opened with ID:', id);

        // Assign colors to local players on host device
        const colors = ['Blue', 'Yellow', 'Red', 'Green'];
        const assignedColors = colors.slice(0, localPlayerCount);
        this.playerAssignments[id] = assignedColors;

        console.log(`Host assigned ${localPlayerCount} local players: ${assignedColors.join(', ')}`);

        // Listen for incoming connections
        this.peer.on('connection', (conn) => this.handleIncomingConnection(conn));

        // Save session info for potential rejoin
        this.updateSessionInfo();

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
    const originalHostPeerId = `blockyou-${this.roomCode}`;
    this.originalHostPeerId = originalHostPeerId;

    // Load previous session to get known peers for fallback
    const previousSession = loadSession(this.roomCode);
    const fallbackHosts = previousSession ? previousSession.knownPeers.filter(p => p !== originalHostPeerId) : [];

    return new Promise((resolve, reject) => {
      // Generate a unique peer ID for this client
      const clientId = `blockyou-${this.roomCode}-${Date.now().toString(36)}`;
      this.peer = new window.Peer(clientId, PEER_CONFIG);

      this.peer.on('open', (id) => {
        this.localPlayerId = id;
        console.log('Client peer opened with ID:', id);

        // Try to connect to original host first, then fallbacks
        this.tryConnectToHosts([originalHostPeerId, ...fallbackHosts], localPlayerCount, resolve, reject);
      });

      this.peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err.type === 'peer-unavailable') {
          // Try fallback hosts if available
          if (fallbackHosts.length > 0 && !this.triedFallbacks) {
            console.log('Original host unavailable, trying fallback hosts...');
            this.triedFallbacks = true;
            this.tryConnectToHosts(fallbackHosts, localPlayerCount, resolve, reject);
          } else {
            reject(new Error('Game not found. The host may have left.'));
          }
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
          reject(new Error('Connection timed out. No available host found.'));
          this.pendingJoinResolve = null;
          this.pendingJoinReject = null;
        }
      }, 20000); // Increased timeout for fallback attempts
    });
  }

  // Try connecting to a list of potential hosts in order
  tryConnectToHosts(hostList, localPlayerCount, resolve, reject) {
    if (hostList.length === 0) {
      reject(new Error('No hosts available to connect to.'));
      return;
    }

    const tryNext = (index) => {
      if (index >= hostList.length) {
        reject(new Error('Could not connect to any host. Game may have ended.'));
        return;
      }

      const hostPeerId = hostList[index];
      console.log(`Trying to connect to host: ${hostPeerId} (${index + 1}/${hostList.length})`);

      const conn = this.peer.connect(hostPeerId, {
        reliable: true,
        serialization: 'json'
      });

      const connectionTimeout = setTimeout(() => {
        console.log(`Connection to ${hostPeerId} timed out, trying next...`);
        conn.close();
        tryNext(index + 1);
      }, 5000);

      conn.on('open', () => {
        clearTimeout(connectionTimeout);
        console.log('Connected to host:', hostPeerId);
        this.hostPeerId = hostPeerId;
        this.connections.set(hostPeerId, conn);
        this.setupConnectionHandlers(conn);

        // Send join request with local player count
        conn.send({
          type: 'join-request',
          peerId: this.localPlayerId,
          localPlayerCount: localPlayerCount
        });
      });

      conn.on('error', (err) => {
        clearTimeout(connectionTimeout);
        console.log(`Failed to connect to ${hostPeerId}:`, err.message);
        tryNext(index + 1);
      });
    };

    tryNext(0);
  }

  // Original host rejoins and reclaims hosting duties
  async rejoinAsHost(roomCode, localPlayerCount = 1) {
    await this.loadPeerJS();

    this.roomCode = roomCode.toUpperCase();
    const originalHostId = `blockyou-${this.roomCode}`;
    this.originalHostPeerId = originalHostId;

    return new Promise((resolve, reject) => {
      // Try to reclaim the original host peer ID
      this.peer = new window.Peer(originalHostId, PEER_CONFIG);

      this.peer.on('open', (id) => {
        this.localPlayerId = id;
        console.log('Original host rejoining with ID:', id);

        // We got our original ID back, now we need to find the current host
        // The current host will be one of the clients (has the room code prefix but with suffix)
        // We'll listen for connections and also try to connect to any known peers

        this.isHost = true;
        this.hostPeerId = id;

        // Listen for incoming connections from current players
        this.peer.on('connection', (conn) => {
          console.log('Incoming connection while rejoining:', conn.peer);
          this.handleIncomingConnection(conn);

          // Once connected, request the current game state
          conn.on('open', () => {
            conn.send({
              type: 'host-reclaim',
              originalHostPeerId: id,
              localPlayerCount: localPlayerCount
            });
          });
        });

        // Assign colors to local players
        const colors = ['Blue', 'Yellow', 'Red', 'Green'];
        const assignedColors = colors.slice(0, localPlayerCount);
        this.playerAssignments[id] = assignedColors;

        resolve({
          roomCode: this.roomCode,
          peerId: id,
          assignedColors: assignedColors,
          isReclaim: true
        });
      });

      this.peer.on('error', (err) => {
        console.error('Peer error during rejoin:', err);
        if (err.type === 'unavailable-id') {
          // Original ID is still in use or unavailable, try as regular client
          console.log('Original host ID unavailable, falling back to regular join');
          this.peer.destroy();
          this.joinGame(roomCode, localPlayerCount).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });

      // Timeout for rejoin
      setTimeout(() => {
        if (!this.gameInProgress && Object.keys(this.playerAssignments).length <= 1) {
          console.log('No other players found, game may have ended');
        }
      }, 10000);
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

      const wasHost = conn.peer === this.hostPeerId;

      if (this.onPlayerLeave) {
        const colors = this.playerAssignments[conn.peer];
        this.onPlayerLeave(conn.peer, colors);
      }

      // Remove the player's color assignments so new players can join
      if (this.playerAssignments[conn.peer]) {
        delete this.playerAssignments[conn.peer];
        // Broadcast updated assignments so other clients know slots are available
        if (this.isHost) {
          this.broadcastPlayerAssignments();
        }
      }

      // Handle host disconnection - trigger host migration
      if (wasHost && !this.isHost) {
        console.log('Host disconnected, initiating host migration...');
        if (this.onHostDisconnect) {
          this.onHostDisconnect();
        }
        this.initiateHostMigration();
      }
    });
  }

  // Determine if this peer should become the new host and perform migration
  initiateHostMigration() {
    // Get all remaining peer IDs (including ourselves)
    const remainingPeers = Object.keys(this.playerAssignments);

    if (remainingPeers.length === 0) {
      console.log('No remaining players, cannot migrate host');
      return;
    }

    // Sort peer IDs to deterministically elect the new host (lexicographically smallest)
    remainingPeers.sort();
    const newHostPeerId = remainingPeers[0];

    console.log(`Remaining peers: ${remainingPeers.join(', ')}`);
    console.log(`New host will be: ${newHostPeerId}`);
    console.log(`I am: ${this.localPlayerId}`);

    if (newHostPeerId === this.localPlayerId) {
      // This peer becomes the new host
      this.becomeHost(remainingPeers);
    } else {
      // Wait for the new host to connect to us
      this.hostPeerId = newHostPeerId;
      console.log(`Waiting for new host ${newHostPeerId} to connect...`);
    }
  }

  // Promote this peer to host
  becomeHost(allPeerIds) {
    console.log('Becoming the new host!');
    this.isHost = true;
    this.hostPeerId = this.localPlayerId;

    // Start listening for incoming connections
    this.peer.on('connection', (conn) => this.handleIncomingConnection(conn));

    // Connect to all other peers
    const otherPeers = allPeerIds.filter(id => id !== this.localPlayerId);
    console.log(`Connecting to ${otherPeers.length} other peers...`);

    otherPeers.forEach(peerId => {
      if (!this.connections.has(peerId)) {
        console.log(`Connecting to peer: ${peerId}`);
        const conn = this.peer.connect(peerId, {
          reliable: true,
          serialization: 'json'
        });

        conn.on('open', () => {
          console.log(`Connected to peer: ${peerId}`);
          this.connections.set(peerId, conn);
          this.setupConnectionHandlers(conn);

          // Notify this client that we are the new host
          conn.send({
            type: 'host-migration',
            newHostPeerId: this.localPlayerId,
            playerAssignments: this.playerAssignments,
            gameState: this.lastKnownGameState,
            gameInProgress: this.gameInProgress
          });
        });

        conn.on('error', (err) => {
          console.error(`Failed to connect to peer ${peerId}:`, err);
        });
      }
    });

    // Notify the application layer that we are now the host
    if (this.onBecomeHost) {
      this.onBecomeHost(this.lastKnownGameState);
    }

    // Start checking if the original host comes back online
    this.startOriginalHostCheck();
  }

  // Periodically check if original host has come back online
  startOriginalHostCheck() {
    if (this.originalHostCheckInterval) {
      clearInterval(this.originalHostCheckInterval);
    }

    // Only check if we're not the original host
    if (this.localPlayerId === this.originalHostPeerId) {
      return;
    }

    console.log('Starting periodic check for original host:', this.originalHostPeerId);

    this.originalHostCheckInterval = setInterval(() => {
      if (!this.isHost || this.localPlayerId === this.originalHostPeerId) {
        // We're no longer host or we are the original host, stop checking
        clearInterval(this.originalHostCheckInterval);
        this.originalHostCheckInterval = null;
        return;
      }

      // Try to connect to original host
      console.log('Checking if original host is back online...');
      const conn = this.peer.connect(this.originalHostPeerId, {
        reliable: true,
        serialization: 'json'
      });

      const timeout = setTimeout(() => {
        conn.close();
      }, 5000);

      conn.on('open', () => {
        clearTimeout(timeout);
        console.log('Original host is back online!');
        this.connections.set(this.originalHostPeerId, conn);
        this.setupConnectionHandlers(conn);

        // Stop checking
        clearInterval(this.originalHostCheckInterval);
        this.originalHostCheckInterval = null;
      });

      conn.on('error', () => {
        clearTimeout(timeout);
        // Original host not available yet, will try again
      });
    }, 10000); // Check every 10 seconds
  }

  // Handle original host reclaiming their position
  handleHostReclaim(conn, data) {
    console.log('Transferring host duties back to original host');

    // Update player assignments to include original host's colors
    const colors = ['Blue', 'Yellow', 'Red', 'Green'];
    const usedColors = Object.values(this.playerAssignments).flat();
    const availableColors = colors.filter(c => !usedColors.includes(c));
    const colorsToAssign = availableColors.slice(0, data.localPlayerCount || 1);

    // Assign colors to the returning original host
    this.playerAssignments[conn.peer] = colorsToAssign;

    // Send acknowledgment with current game state
    conn.send({
      type: 'host-reclaim-ack',
      playerAssignments: this.playerAssignments,
      gameState: this.lastKnownGameState,
      gameInProgress: this.gameInProgress
    });

    // We're no longer the host
    this.isHost = false;
    this.hostPeerId = conn.peer;

    console.log('Host duties transferred to:', conn.peer);
  }

  // Broadcast to all clients that original host has reclaimed
  broadcastHostReclaimed() {
    const message = {
      type: 'host-reclaimed',
      originalHostPeerId: this.localPlayerId,
      playerAssignments: this.playerAssignments,
      gameState: this.lastKnownGameState
    };

    this.connections.forEach((conn) => {
      if (conn.open) {
        conn.send(message);
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
        // Save session for potential rejoin
        this.updateSessionInfo();
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
        this.gameInProgress = true;
        this.lastKnownGameState = data.gameState;
        if (this.onGameStart) {
          this.onGameStart(data.gameState, data.playerAssignments);
        }
        break;

      case 'state-update':
        this.lastKnownGameState = data.state;
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
        // Update session with current peer list
        this.updateSessionInfo();
        if (this.onPlayerAssignmentsUpdate) {
          this.onPlayerAssignmentsUpdate(data.playerAssignments);
        }
        break;

      case 'request-state':
        // Client is requesting current state (for resync after reconnection)
        if (this.isHost) {
          conn.send({
            type: 'state-resync',
            playerAssignments: this.playerAssignments,
            gameState: this.lastKnownGameState,
            gameInProgress: this.gameInProgress
          });
        }
        break;

      case 'state-resync':
        // Received state resync from host
        console.log('Received state resync from host');
        this.playerAssignments = data.playerAssignments;
        this.lastKnownGameState = data.gameState;
        this.gameInProgress = data.gameInProgress;
        this.updateSessionInfo();
        if (this.onStateUpdate && data.gameState) {
          this.onStateUpdate(data.gameState);
        }
        if (this.onPlayerAssignmentsUpdate) {
          this.onPlayerAssignmentsUpdate(data.playerAssignments);
        }
        break;

      case 'host-migration':
        // A new host has taken over
        console.log(`Host migration: new host is ${data.newHostPeerId}`);
        this.hostPeerId = data.newHostPeerId;
        this.playerAssignments = data.playerAssignments;
        if (data.gameState) {
          this.lastKnownGameState = data.gameState;
        }
        this.gameInProgress = data.gameInProgress;
        // Update the connection map to use the new host's connection
        this.connections.set(data.newHostPeerId, conn);
        // Update session with new host info
        this.updateSessionInfo();
        if (this.onPlayerAssignmentsUpdate) {
          this.onPlayerAssignmentsUpdate(data.playerAssignments);
        }
        console.log('Host migration complete, connected to new host');
        break;

      case 'host-reclaim':
        // Original host is reclaiming - only respond if we're currently host
        if (this.isHost && conn.peer === this.originalHostPeerId) {
          console.log('Original host is reclaiming hosting duties');
          this.handleHostReclaim(conn, data);
        }
        break;

      case 'host-reclaim-ack':
        // We're the original host and received acknowledgment with game state
        console.log('Received host reclaim acknowledgment');
        this.playerAssignments = data.playerAssignments;
        this.lastKnownGameState = data.gameState;
        this.gameInProgress = data.gameInProgress;
        // Broadcast to all connected clients that we're the host again
        this.broadcastHostReclaimed();
        if (this.onHostReclaimed) {
          this.onHostReclaimed(data.gameState, data.playerAssignments);
        }
        break;

      case 'host-reclaimed':
        // Original host has reclaimed, update our records
        console.log('Original host has reclaimed hosting');
        this.hostPeerId = data.originalHostPeerId;
        this.playerAssignments = data.playerAssignments;
        if (data.gameState) {
          this.lastKnownGameState = data.gameState;
        }
        this.connections.set(data.originalHostPeerId, conn);
        // Update session with original host back
        this.updateSessionInfo();
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

    this.gameInProgress = true;
    this.lastKnownGameState = gameState;

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

    this.lastKnownGameState = state;

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

    // Send to current host (may have changed due to host migration)
    const conn = this.connections.get(this.hostPeerId);
    if (conn && conn.open) {
      conn.send({
        type: 'player-action',
        action: action
      });
    } else {
      console.warn('Cannot send action: not connected to host');
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

  // Update session info in localStorage for rejoining
  updateSessionInfo() {
    const knownPeers = Object.keys(this.playerAssignments);
    saveSession(this.roomCode, this.hostPeerId, knownPeers);
  }

  // Request state resync from host (useful after reconnection)
  requestStateResync() {
    if (this.isHost) {
      // We are the host, no need to request
      return;
    }

    const conn = this.connections.get(this.hostPeerId);
    if (conn && conn.open) {
      console.log('Requesting state resync from host');
      conn.send({ type: 'request-state' });
    } else {
      console.warn('Cannot request state resync: not connected to host');
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
    if (this.originalHostCheckInterval) {
      clearInterval(this.originalHostCheckInterval);
      this.originalHostCheckInterval = null;
    }
    this.connections.forEach((conn) => conn.close());
    this.connections.clear();
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    // Clear session data
    clearSession();
    this.isHost = false;
    this.roomCode = null;
    this.localPlayerId = null;
    this.hostPeerId = null;
    this.originalHostPeerId = null;
    this.playerAssignments = {};
    this.gameInProgress = false;
    this.lastKnownGameState = null;
    this.triedFallbacks = false;
  }
}

// Singleton instance
export const networkManager = new NetworkManager();
