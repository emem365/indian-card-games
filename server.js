const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const GameState = require('./game/GameState');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Restart Triggered at 2025-12-27T02:17:24
});
