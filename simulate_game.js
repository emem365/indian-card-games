const io = require('socket.io-client');

const URL = 'http://localhost:3000';
const ROOM_ID = 'SIM_01';

const players = [
    { name: 'Bot_1', socket: null, id: null, hand: [], seat: -1 },
    { name: 'Bot_2', socket: null, id: null, hand: [], seat: -1 },
    { name: 'Bot_3', socket: null, id: null, hand: [], seat: -1 },
    { name: 'Bot_4', socket: null, id: null, hand: [], seat: -1 }
];

let gameState = null;

function connectPlayer(index) {
    const p = players[index];
    p.socket = io(URL);

    p.socket.on('connect', () => {
        console.log(`${p.name} connected`);
        if (index === 0) {
            p.socket.emit('createRoom', { playerName: p.name });
        } else {
            // Slight delay to let room match
            setTimeout(() => {
                p.socket.emit('joinRoom', { roomId: ROOM_ID, playerName: p.name });
            }, 500 * index);
        }
    });

    p.socket.on('roomCreated', (data) => {
        console.log(`${p.name} created room ${data.roomId}`);
        // We forcibly use SIM_01 in this script for simplicity, but server generates random.
        // Actually, for this simulation to work, we need to know the room ID if we want others to join.
        // The server generates a random ID. Player 1 creates it.
        // We need to capture it and use it for others.
        // BUT, my script hardcodes joining 'SIM_01'. 
        // I need to update my server to allow custom room ID or update script to use returned ID.
        // Let's rely on the callback.

        // Wait, socket.io-client 'createRoom' emits back 'roomCreated'.
        // I will restart the others to join THIS roomId.
    });

    // We need to handle the dynamic room ID.
}

// Revised connect flow
const p1 = players[0];
p1.socket = io(URL);

p1.socket.on('connect', () => {
    console.log('Bot_1 connected, creating room...');
    p1.socket.emit('createRoom', { playerName: 'Bot_1' });
});

p1.socket.on('roomCreated', ({ roomId, playerId }) => {
    console.log(`Room created: ${roomId}`);
    players[0].id = playerId;

    // Connect others
    for (let i = 1; i < 4; i++) {
        const p = players[i];
        p.socket = io(URL);
        p.socket.on('connect', () => {
            p.socket.emit('joinRoom', { roomId, playerName: p.name });
        });

        p.socket.on('roomJoined', (data) => {
            p.id = data.playerId;
            console.log(`${p.name} joined ${roomId} (Seat: TBD)`);
        });

        setupSocketListeners(p, i);
    }
});

setupSocketListeners(p1, 0);

function setupSocketListeners(p, index) {
    p.socket.on('gameState', (state) => {
        // console.log(`${p.name} received state: ${state.state}`);
        gameState = state; // Global state tracking (approximate)

        // Update local hand info
        const myData = state.players.find(x => x.id === p.id);
        if (myData) {
            p.hand = myData.hand; // These are objects {suit, rank}
            p.seat = myData.seat;
        }

        handleGameLogic(p, state);
    });

    p.socket.on('gameStarting', () => console.log('Game Starting!'));

    p.socket.on('dealerSelected', ({ dealerIndex }) => {
        console.log(`Dealer is Seat ${dealerIndex}`);
    });

    p.socket.on('trickCollected', ({ winnerIndex }) => {
        console.log(`Trick won by Seat ${winnerIndex}`);
    });
}

function handleGameLogic(p, state) {
    if (state.state === 'WAITING') {
        // If 4 players and I am host (Seat 0 usually, or just check count)
        if (state.players.length === 4 && p.name === 'Bot_1') {
            // Start game
            console.log('Bot_1 starting game...');
            p.socket.emit('gameAction', { roomId: state.roomId, action: 'startGame', payload: {} });
        }
    }

    if (state.state === 'BIDDING') {
        if (state.currentBidderIndex === p.seat) {
            // Simple logic: Bot 1 bids 7, others pass.
            // If Bot 1 passed, someone else must bid?
            // Let's make Bot at (Dealer + 1) bid 7, others pass.

            const isFirstBidder = (p.seat === (state.dealerIndex + 1) % 4);
            const amount = isFirstBidder ? 7 : 0;

            console.log(`${p.name} (Seat ${p.seat}) bidding ${amount}`);
            p.socket.emit('gameAction', { roomId: state.roomId, action: 'bid', payload: { amount } });
        }
    }

    if (state.state === 'TRUMP_SELECT') {
        if (state.highestBid.playerIndex === p.seat && !state.trumpSuit) {
            // Select spades
            console.log(`${p.name} selecting trump: S`);
            p.socket.emit('gameAction', { roomId: state.roomId, action: 'selectTrump', payload: { suit: 'S' } });
        }
    }

    if (state.state === 'PLAYING') {
        if (state.currentTurnIndex === p.seat) {
            // Play a card
            // Logic: 
            // 1. If lead suit exists, must follow.
            // 2. Play random valid card.

            setTimeout(() => { // Simulate think time
                const cardToPlay = pickCard(p, state);
                if (cardToPlay) {
                    console.log(`${p.name} playing ${cardToPlay.rank}${cardToPlay.suit}`);
                    p.socket.emit('gameAction', { roomId: state.roomId, action: 'playCard', payload: { card: cardToPlay } });
                } else {
                    console.error(`${p.name} has no valid cards!`, p.hand);
                }
            }, 500);
        }
    }

    if (state.state === 'GAME_OVER') {
        if (index === 0) {
            console.log('Game Over!');
            console.log('Hands Won:', state.handsWon);
            process.exit(0);
        }
    }
}

function pickCard(p, state) {
    const hand = p.hand;
    if (hand.length === 0) return null;

    // Helper to get card value
    const getRankVal = (r) => "2345678910JQK".indexOf(r);

    if (!state.leadSuit) {
        // Leading: Play highest card? Or random?
        // Let's play random
        return hand[Math.floor(Math.random() * hand.length)];
    } else {
        // Following
        const followCards = hand.filter(c => c.suit === state.leadSuit);
        if (followCards.length > 0) {
            return followCards[Math.floor(Math.random() * followCards.length)];
        } else {
            // Play Trump?
            const trumpCards = hand.filter(c => c.suit === state.trumpSuit);
            if (trumpCards.length > 0) {
                return trumpCards[Math.floor(Math.random() * trumpCards.length)];
            }
            // Garbage
            return hand[Math.floor(Math.random() * hand.length)];
        }
    }
}
