const CardUtils = require('./CardUtils');

class GameState {
    constructor(roomId, io) {
        this.roomId = roomId;
        this.io = io;
        this.players = [];
        this.deck = [];
        this.state = 'WAITING';
        this.dealerIndex = -1;
        this.currentTurnIndex = -1;
        this.bids = {};
        this.currentBidderIndex = -1;
        this.highestBid = { amount: 0, playerIndex: -1 };
        this.trumpSuit = null;
        this.trick = [];
        this.handsWon = { 1: 0, 2: 0 };
        this.leadSuit = null;
        this.runnerScore = 0;
        this.runnerTeam = -1;
        this.dealerTeam = -1;
    }

    addPlayer(socket, name, userId) {
        const existingPlayer = this.players.find(p => p.id === userId);

        if (existingPlayer) {
            existingPlayer.socketId = socket.id;
            existingPlayer.connected = true;
            this.broadcastState();
            return { success: true, playerIndex: this.players.indexOf(existingPlayer) };
        }

        if (this.players.length >= 4) return { success: false, message: 'Room is full' };
        if (this.state !== 'WAITING') return { success: false, message: 'Game already started' };

        const takenSeats = this.players.map(p => p.seat);
        let seat = 0;
        while (takenSeats.includes(seat)) seat++;

        const player = {
            id: userId,
            socketId: socket.id,
            name,
            team: (seat % 2 === 0) ? 1 : 2,
            hand: [],
            avatar: this.generateAvatar(),
            seat,
            connected: true
        };

        this.players.push(player);
        this.players.sort((a, b) => a.seat - b.seat);

        this.broadcastState();
        return { success: true, playerIndex: this.players.indexOf(player) };
    }

    getPlayerBySocket(socketId) {
        return this.players.find(p => p.socketId === socketId);
    }

    handleDisconnect(userId) {
        const player = this.players.find(p => p.id === userId);
        if (player) {
            player.connected = false;
            // Notify others
            this.io.to(this.roomId).emit('playerDisconnected', {
                playerId: userId,
                name: player.name,
                seat: player.seat
            });
            this.broadcastState();
        }
    }

    generateAvatar() {
        const bases = ['🦁', '🐯', '🐼', '🐻', '🐨', '🐷', '🐸', '🐵', '🐔', '🐧'];
        const accessories = [
            { char: '🕶️', type: 'eyes' },
            { char: '👓', type: 'eyes' },
            { char: '🎩', type: 'head' },
            { char: '👑', type: 'head' },
            { char: '🧢', type: 'head' },
            { char: '🎧', type: 'ears' },
            { char: '🧣', type: 'neck' }, // might be tricky
        ];

        const base = bases[Math.floor(Math.random() * bases.length)];
        const acc = accessories[Math.floor(Math.random() * accessories.length)];

        return { base, accessory: acc.char, type: acc.type };
    }

    startGame(socketId) {
        if (this.players.length !== 4) return;
        if (this.state !== 'WAITING') return;

        this.io.to(this.roomId).emit('gameStarting');
        setTimeout(() => this.pickRandomDealer(), 1000);
    }

    pickRandomDealer() {
        this.state = 'DEALER_SELECT'; // Prevent "WAITING" from forcing Lobby UI
        this.broadcastState();

        this.dealerIndex = Math.floor(Math.random() * 4);
        this.dealerTeam = (this.dealerIndex % 2 === 0) ? 1 : 2;
        this.runnerTeam = (this.dealerTeam === 1) ? 2 : 1;

        this.broadcast('dealerSelected', { dealerIndex: this.dealerIndex });
        setTimeout(() => this.startRound(), 4000);
    }

    startRound() {
        this.state = 'DEALING_1';
        this.deck = CardUtils.shuffle(CardUtils.createDeck());
        this.handsWon = { 1: 0, 2: 0 };
        this.bids = {};
        this.highestBid = { amount: 6, playerIndex: -1 };
        this.trumpSuit = null;
        this.trick = [];
        this.leadSuit = null;

        this.players.forEach(p => p.hand = []);
        this.dealCards(5);
        this.broadcastState();

        setTimeout(() => {
            this.state = 'BIDDING';
            this.currentBidderIndex = (this.dealerIndex + 1) % 4;
            this.broadcastState();
        }, 1500);
    }

    dealCards(count) {
        console.log(`[DEAL] Dealing ${count} cards. Deck size before: ${this.deck.length}`);
        for (let i = 0; i < 4; i++) {
            const player = this.players.find(p => p.seat === i);
            if (player) {
                const cards = this.deck.splice(0, count);
                player.hand.push(...cards);
                console.log(`[DEAL] Player Seat ${i} (Name: ${player.name}) received ${cards.length} cards. Total: ${player.hand.length}`);
            } else {
                console.error(`[DEAL] No player found at seat ${i}!`);
            }
        }
        console.log(`[DEAL] Deck size after: ${this.deck.length}`);
    }

    handleAction(socketId, action, payload) {
        const player = this.getPlayerBySocket(socketId);
        if (!player) return;
        const playerSeat = player.seat;

        switch (action) {
            case 'startGame':
                this.startGame(socketId);
                break;
            case 'switchSeat':
                this.handleSwapSeat(player, payload.targetSeat);
                break;
            case 'bid':
                this.handleBid(playerSeat, payload.amount);
                break;
            case 'selectTrump':
                this.handleTrumpSelect(playerSeat, payload.suit);
                break;
            case 'playCard':
                this.handlePlayCard(playerSeat, payload.card);
                break;
            case 'restartGame':
                this.restartGame();
                break;
            case 'nextRound':
                this.nextRound();
                break;
        }
    }

    handleSwapSeat(player, targetSeat) {
        if (this.state !== 'WAITING') return;
        if (targetSeat < 0 || targetSeat > 3) return;
        if (player.seat === targetSeat) return;

        const targetPlayer = this.players.find(p => p.seat === targetSeat);

        if (targetPlayer) {
            const tempSeat = player.seat;
            player.seat = targetPlayer.seat;
            targetPlayer.seat = tempSeat;
            player.team = (player.seat % 2 === 0) ? 1 : 2;
            targetPlayer.team = (targetPlayer.seat % 2 === 0) ? 1 : 2;
        } else {
            player.seat = targetSeat;
            player.team = (player.seat % 2 === 0) ? 1 : 2;
        }

        this.players.sort((a, b) => a.seat - b.seat);
        this.broadcastState();
    }

    handleBid(seatIndex, amount) {
        if (this.state !== 'BIDDING') return;
        if (seatIndex !== this.currentBidderIndex) return;

        const isLastBidder = seatIndex === this.dealerIndex;

        if (isLastBidder && this.highestBid.amount === 6 && amount === 0) {
            amount = 7;
        }

        if (amount > 0) {
            if (amount <= this.highestBid.amount) return;
            this.highestBid = { amount, playerIndex: seatIndex };
        }

        const player = this.players.find(p => p.seat === seatIndex);
        if (player) this.bids[player.id] = amount;

        if (isLastBidder) {
            if (this.highestBid.playerIndex === -1) {
                this.highestBid = { amount: 7, playerIndex: this.dealerIndex };
            }
            this.state = 'TRUMP_SELECT';
            this.currentTurnIndex = this.highestBid.playerIndex;
        } else {
            this.currentBidderIndex = (this.currentBidderIndex + 1) % 4;
        }

        this.broadcastState();
    }

    handleTrumpSelect(seatIndex, suit) {
        if (this.state !== 'TRUMP_SELECT') return;
        if (seatIndex !== this.highestBid.playerIndex) return;

        this.trumpSuit = suit;
        this.state = 'DEALING_2';
        this.broadcastState();

        setTimeout(() => {
            this.dealCards(8);
            this.state = 'PLAYING';
            this.currentTurnIndex = this.highestBid.playerIndex;
            this.broadcastState();
        }, 1500);
    }

    handlePlayCard(seatIndex, card) {
        if (this.state !== 'PLAYING') return;
        if (seatIndex !== this.currentTurnIndex) return;

        const player = this.players.find(p => p.seat === seatIndex);
        const cardInHandIndex = player.hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
        if (cardInHandIndex === -1) return;

        if (this.trick.length === 0) {
            this.leadSuit = card.suit;
        } else {
            const hasLeadSuit = player.hand.some(c => c.suit === this.leadSuit);
            if (hasLeadSuit && card.suit !== this.leadSuit) {
                return;
            }
        }

        if (this.trick.length >= 4) return; // Prevent playing if trick is already full

        player.hand.splice(cardInHandIndex, 1);
        this.trick.push({ playerIndex: seatIndex, card });

        if (this.trick.length === 4) {
            this.currentTurnIndex = -1; // Disable turns while evaluating
            this.broadcastState();
            setTimeout(() => this.evaluateTrick(), 2000);
        } else {
            this.currentTurnIndex = (this.currentTurnIndex + 1) % 4;
            this.broadcastState();
        }
    }

    evaluateTrick() {
        let winnerSeat = this.trick[0].playerIndex;
        let highestCard = this.trick[0].card;

        for (let i = 1; i < 4; i++) {
            const pIndex = this.trick[i].playerIndex;
            const card = this.trick[i].card;
            if (!CardUtils.compareCards(highestCard, card, this.trumpSuit, this.leadSuit)) {
                winnerSeat = pIndex;
                highestCard = card;
            }
        }

        const winner = this.players.find(p => p.seat === winnerSeat);
        this.handsWon[winner.team]++;

        this.io.to(this.roomId).emit('trickCollected', { winnerIndex: winnerSeat });

        this.trick = [];
        this.leadSuit = null;
        this.currentTurnIndex = winnerSeat;

        // Check Early Termination
        let gameOver = false;
        if (this.highestBid && this.highestBid.amount > 0) {
            const biddingTeam = (this.highestBid.playerIndex % 2 === 0) ? 1 : 2;
            const opposingTeam = (biddingTeam === 1) ? 2 : 1;
            const bidAmount = this.highestBid.amount;

            if (this.handsWon[biddingTeam] >= bidAmount) {
                gameOver = true; // Bidding team wins
            } else if (this.handsWon[opposingTeam] > (13 - bidAmount)) {
                gameOver = true; // Bidding team loses
            }
        }

        if (gameOver || this.players[0].hand.length === 0) {
            this.endRound();
        } else {
            setTimeout(() => this.broadcastState(), 500);
        }
    }

    endRound() {
        this.state = 'GAME_OVER';

        // Calculate Winner
        const biddingTeam = (this.highestBid.playerIndex % 2 === 0) ? 1 : 2;
        const bidAmount = this.highestBid.amount;
        const tricksWon = this.handsWon[biddingTeam];

        let winningTeam = -1;
        let success = false;

        if (tricksWon >= bidAmount) {
            winningTeam = biddingTeam;
            success = true;
        } else {
            winningTeam = (biddingTeam === 1) ? 2 : 1;
            success = false;
        }

        // Scoring Logic (Single Metric: Runner Score)
        const runnerTeam = this.runnerTeam;
        const dealerTeam = this.dealerTeam;
        let diff = 0;

        if (biddingTeam === runnerTeam) {
            diff = success ? bidAmount : -(2 * bidAmount);
            this.runnerScore += diff;
        } else {
            // Dealer Bidded
            // If Dealer Wins: Runner loses leverage (Score decreases)
            // If Dealer Loses: Runner gains leverage (Score increases)
            diff = success ? -bidAmount : (2 * bidAmount);
            this.runnerScore += diff;
        }

        this.winner = {
            winningTeam,
            biddingTeam,
            bidAmount,
            tricksWon,
            success,
            runnerScore: this.runnerScore, // Broadcast score
            runnerTeam: this.runnerTeam
        };

        this.broadcastState();
    }

    broadcastState() {
        this.players.forEach(p => {
            if (p.connected) {
                const view = this.getPlayerView(p.id);
                this.io.to(p.socketId).emit('gameState', view);
            }
        });
    }

    broadcast(event, data) {
        this.io.to(this.roomId).emit(event, data);
    }

    getPlayerView(userId) {
        const requestingPlayer = this.players.find(p => p.id === userId);
        if (!requestingPlayer) return null;

        const playersView = this.players.map(p => {
            if (p.id === userId) {
                return p;
            } else {
                return {
                    ...p,
                    hand: p.hand.length,
                    socketId: undefined
                };
            }
        });

        return {
            roomId: this.roomId,
            state: this.state,
            players: playersView,
            dealerIndex: this.dealerIndex,
            currentTurnIndex: this.currentTurnIndex,
            currentBidderIndex: this.currentBidderIndex,
            highestBid: this.highestBid,
            trumpSuit: (this.state === 'BIDDING' || this.state === 'WAITING' || this.state === 'DEALING_1') ? null : this.trumpSuit,
            trick: this.trick,
            handsWon: this.handsWon,
            mySeat: requestingPlayer.seat,
            leadSuit: this.leadSuit,
            winner: this.winner, // Send winner info if Game Over
            runnerScore: this.runnerScore, // Persistent Score
            runnerTeam: this.runnerTeam
        };
    }

    restartGame() {
        if (this.state !== 'GAME_OVER') return;

        console.log(`[GAME] Restarting Game ${this.roomId}`);
        // Reset Game Variables
        this.state = 'WAITING'; // Process will pick dealer shortly
        this.deck = [];
        this.bids = {};
        this.highestBid = { amount: 6, playerIndex: -1 };
        this.trumpSuit = null;
        this.trick = [];
        this.handsWon = { 1: 0, 2: 0 };
        this.leadSuit = null;
        this.winner = null;
        this.runnerScore = 0; // Reset Score
        this.players.forEach(p => p.hand = []);

        this.broadcastState();

        // Start after brief delay
        setTimeout(() => this.pickRandomDealer(), 1000);
    }

    nextRound() {
        if (this.state !== 'GAME_OVER') return;

        console.log(`[GAME] Starting Next Round ${this.roomId}`);

        let newDealerIndex = this.dealerIndex;

        if (this.runnerScore < 0) {
            // Rotate Dealer
            newDealerIndex = (this.dealerIndex + 1) % 4;

            // Flip Score
            this.runnerScore = Math.abs(this.runnerScore);

            // Update Roles
            this.dealerTeam = (newDealerIndex % 2 === 0) ? 1 : 2;
            this.runnerTeam = (this.dealerTeam === 1) ? 2 : 1;

            console.log(`[GAME] Rotation! New Dealer: ${newDealerIndex}, New Runner Score: ${this.runnerScore}`);
        } else {
            console.log(`[GAME] No Rotation. Dealer: ${this.dealerIndex}, Runner Score: ${this.runnerScore}`);
        }

        // Reset Round State but keep Scores
        this.state = 'DEALING_1';
        this.deck = CardUtils.shuffle(CardUtils.createDeck());
        this.handsWon = { 1: 0, 2: 0 };
        this.bids = {};
        this.highestBid = { amount: 6, playerIndex: -1 };
        this.trumpSuit = null;
        this.trick = [];
        this.leadSuit = null;
        this.winner = null;

        this.dealerIndex = newDealerIndex; // Apply logic

        this.players.forEach(p => p.hand = []);
        this.dealCards(5);
        this.broadcastState();

        setTimeout(() => {
            this.state = 'BIDDING';
            this.currentBidderIndex = (this.dealerIndex + 1) % 4;
            this.broadcastState();
        }, 1500);
    }
}


module.exports = GameState;
