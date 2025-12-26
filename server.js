const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const GameState = require('./game/GameState');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for now (fixes potential CORS issues)
        methods: ["GET", "POST"]
    }
});

// Middleware: Log all requests
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Explicit Root Route (Fallback if static fails)
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    console.log(`[ROOT] Serving index.html from: ${indexPath}`);
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('[ROOT] Error serving index.html:', err);
            res.status(500).send('Error loading game');
        }
    });
});

const rooms = new Map(); // roomId -> GameState

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Client sends 'joinRoom' with userId (from localStorage)
    socket.on('joinRoom', ({ roomId, playerName, userId }) => {
        // If no userId provided, generate one? Client should generate one if missing.
        // But better to trust client ID for reconnection.

        let finalUserId = userId || uuidv4();

        let gameState = rooms.get(roomId);

        if (!gameState) {
            // If trying to create or just join non-existent
            // For simplicity 'createRoom' event is merged/or distinct. 
            // Let's keep distinct but robust.
            socket.emit('error', 'Room not found');
            return;
        }

        const result = gameState.addPlayer(socket, playerName, finalUserId);

        if (result.success) {
            socket.join(roomId);
            socket.emit('roomJoined', {
                roomId,
                playerId: finalUserId, // Send back the persistent ID
                playerIndex: result.playerIndex
            });
        } else {
            socket.emit('error', result.message || 'Could not join room');
        }
    });

    socket.on('createRoom', ({ playerName, userId }) => {
        const roomId = uuidv4().slice(0, 6).toUpperCase();
        const gameState = new GameState(roomId, io);
        rooms.set(roomId, gameState);

        let finalUserId = userId || uuidv4();

        const result = gameState.addPlayer(socket, playerName, finalUserId);

        socket.join(roomId);
        socket.emit('roomCreated', {
            roomId,
            playerId: finalUserId
        });
    });

    socket.on('disconnect', () => {
        // Find which room this socket was in
        for (const [roomId, game] of rooms) {
            // We need to map socket.id to a player
            const player = game.getPlayerBySocket(socket.id);
            if (player) {
                game.handleDisconnect(player.id); // Persistent ID
                break;
            }
        }
    });

    socket.on('gameAction', ({ roomId, action, payload }) => {
        const game = rooms.get(roomId);
        if (game) {
            game.handleAction(socket.id, action, payload);
        }
    });
});

const port = process.env.PORT || 8080; // Cloud Run provides the PORT env var
const host = '0.0.0.0'; // MUST be 0.0.0.0

app.listen(port, host, () => {
    console.log(`Server running at http://${host}:${port}/`);
});
