const SUITS = ['S', 'H', 'D', 'C']; // Spades, Hearts, Diamonds, Clubs
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

class CardUtils {
    static createDeck() {
        const deck = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                deck.push({ suit, rank });
            }
        }
        return deck;
    }

    static shuffle(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    static getRankValue(rank) {
        return RANKS.indexOf(rank);
    }

    static compareCards(card1, card2, trumpSuit, leadSuit) {
        // Returns true if card1 beats card2

        // If card2 is not played (e.g. comparing against null winner initially), card1 wins
        if (!card2) return true;

        const val1 = this.getRankValue(card1.rank);
        const val2 = this.getRankValue(card2.rank);

        // If card1 is trump
        if (card1.suit === trumpSuit) {
            if (card2.suit !== trumpSuit) return true; // Trump beats non-trump
            return val1 > val2; // Both trump, higher wins
        }

        // If card2 is trump (and card1 isn't, covered above)
        if (card2.suit === trumpSuit) return false;

        // Neither is trump
        if (card1.suit === leadSuit) {
            if (card2.suit !== leadSuit) return true; // Lead suit beats non-lead (garbage)
            return val1 > val2; // Both lead, higher wins
        }

        // Card1 is garbage (neither trump nor lead)
        if (card2.suit === leadSuit) return false; // Lead beats garbage

        // Both garbage (shouldn't really happen in winning logic comparison if following rules, 
        // but if we compare two random cards, higher rank wins? No, lead suit rules apply contextually.
        // In the context of a trick, this case implies both played off-suit non-trump. 
        // Usually the first player's suit is the 'lead' suit.
        // If we are comparing two off-suit cards that are NOT the lead suit, they assume no power.
        // But the winner is determined by who played the highest trump, or highest lead suit.
        return val1 > val2;
    }
}

module.exports = CardUtils;
