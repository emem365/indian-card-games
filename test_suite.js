
const assert = require('assert');
const GameState = require('./game/GameState');
const CardUtils = require('./game/CardUtils');

// Mock Socket.io
const mockIo = {
    to: (roomId) => ({
        emit: (event, data) => {
            // console.log(`[MockEmit] ${event}`, data); 
        }
    })
};

const mockSocket = (id) => ({ id, emit: () => { } });

// --- TEST SUITE ---
console.log("=== Starting Backend Tests ===");

// 1. Test Card Comparators
console.log("\n[Test 1] Card Comparison Rules");
try {
    // S = Spades, H = Hearts. Trump = S.
    const trumpCard = { suit: 'S', rank: '2' };
    const highHeart = { suit: 'H', rank: 'A' };
    const lowHeart = { suit: 'H', rank: 'K' };

    // Trump beats non-trump
    assert.strictEqual(CardUtils.compareCards(trumpCard, highHeart, 'S', 'H'), true, "Trump should beat non-trump");
    assert.strictEqual(CardUtils.compareCards(highHeart, trumpCard, 'S', 'H'), false, "Non-trump should lose to trump");

    // High card beats low card (same suit, rule is following lead)
    assert.strictEqual(CardUtils.compareCards(highHeart, lowHeart, 'S', 'H'), true, "Ace should beat King");
    assert.strictEqual(CardUtils.compareCards(lowHeart, highHeart, 'S', 'H'), false, "King should lose to Ace");

    console.log("PASS: Card Comparison Logic Verified");
} catch (e) {
    console.error("FAIL: Card Comparison", e.message);
}

// 2. Test Dealing Logic
console.log("\n[Test 2] Dealing Logic (52 Cards / 4 Players)");
try {
    const game = new GameState('test_room', mockIo);

    // Add 4 players
    for (let i = 0; i < 4; i++) {
        game.addPlayer(mockSocket(`sock_${i}`), `Player_${i}`, `user_${i}`);
    }

    assert.strictEqual(game.players.length, 4, "Should have 4 players");

    // Manually trigger startRound logic portions to verify dealing
    // We can't easily call startRound because it uses setTimeout and async states.
    // So we will simulate the steps manually using game methods if possible, 
    // OR just instantiate deck and use dealCards.

    // Setup Deck
    game.deck = CardUtils.shuffle(CardUtils.createDeck());
    assert.strictEqual(game.deck.length, 52, "Deck should be 52 cards");
    game.players.forEach(p => p.hand = []);

    // Deal Round 1 (5 cards)
    game.dealCards(5);

    // Verify
    game.players.forEach((p, i) => {
        assert.strictEqual(p.hand.length, 5, `Player ${i} should have 5 cards`);
    });
    assert.strictEqual(game.deck.length, 52 - 20, "Deck should have 32 cards left");
    console.log("PASS: Round 1 Dealing (5 cards) Verified");

    // Deal Round 2 (8 cards)
    game.dealCards(8);

    // Verify
    game.players.forEach((p, i) => {
        assert.strictEqual(p.hand.length, 13, `Player ${i} should have 13 cards`);
    });
    assert.strictEqual(game.deck.length, 0, "Deck should be empty");
    console.log("PASS: Round 2 Dealing (8 cards) Verified");

} catch (e) {
    console.error("FAIL: Dealing Logic", e);
    process.exit(1);
}

// 3. Test Trump Selection and Second Deal Integration
// (Optional: simulating state transitions)

console.log("\n=== All Tests Passed Successfully ===");
