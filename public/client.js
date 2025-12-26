const socket = io();

// State
// URL-based session support
const urlParams = new URLSearchParams(window.location.search);
const sessionSuffix = urlParams.get('player') ? `_${urlParams.get('player')}` : '';

// If user provides roomId/userId in URL (e.g. from a share link), use them?
// Actually, let's just stick to the sessionSuffix for isolation for now, 
// as rewriting the deployed URL might be tricky without history API.
// But the user said "session ids can be in the url".
// A common pattern: ?room=ABCD&id=...
// Let's implement robust restoring from URL if present.
const urlRoomId = urlParams.get('roomId');
const urlUserId = urlParams.get('userId');

let myPlayerId = urlUserId || localStorage.getItem('chaugadi_userId' + sessionSuffix) || null;
let currentRoomId = urlRoomId || localStorage.getItem('chaugadi_roomId' + sessionSuffix) || null;

let gameStateLocal = null;
let myLastHandState = [];

// Auto Rejoin Logic
if (currentRoomId) {
    const savedName = localStorage.getItem('chaugadi_name' + sessionSuffix);
    if (savedName) {
        console.log('Attempting auto-reconnect to room', currentRoomId);
        socket.emit('joinRoom', { roomId: currentRoomId, playerName: savedName, userId: myPlayerId });
    }
}

// Update URL with session info (if not present) to allow reloading
function updateURL(roomId, userId) {
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('roomId', roomId);
    if (userId) newUrl.searchParams.set('userId', userId);
    // Preserve player suffix if it was there for testing
    if (sessionSuffix) newUrl.searchParams.set('player', urlParams.get('player'));

    window.history.replaceState({}, '', newUrl);
}

// DOM Elements
const screens = {
    landing: document.getElementById('landing-screen'),
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-screen')
};

const inputs = {
    username: document.getElementById('username-input'),
    roomCode: document.getElementById('room-code-input')
};

// UI Helpers
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

function getSuitSymbol(suit) {
    const map = { 'S': '♠', 'H': '♥', 'D': '♦', 'C': '♣' };
    return map[suit] || suit;
}

function getCardColor(suit) {
    return (suit === 'H' || suit === 'D') ? 'red' : 'black';
}

function saveSession(roomId, playerId, name) {
    localStorage.setItem('chaugadi_roomId' + sessionSuffix, roomId);
    localStorage.setItem('chaugadi_userId' + sessionSuffix, playerId);
    localStorage.setItem('chaugadi_name' + sessionSuffix, name);
    myPlayerId = playerId;

    updateURL(roomId, playerId);
}

function getAvatarHTML(avatar) {
    if (!avatar.base) return `<div>${avatar.emoji || '🐶'}</div>`;

    return `
        <div class="avatar-base">${avatar.base}</div>
        <div class="avatar-accessory" data-type="${avatar.type}">${avatar.accessory}</div>
    `;
}

// Event Listeners
document.getElementById('create-btn').addEventListener('click', () => {
    const name = inputs.username.value.trim();
    if (!name) return alert('Please enter your name');
    saveSession('', '', name);
    socket.emit('createRoom', { playerName: name, userId: myPlayerId });
});

document.getElementById('join-btn').addEventListener('click', () => {
    const name = inputs.username.value.trim();
    const roomId = inputs.roomCode.value.trim().toUpperCase();
    if (!name || !roomId) return alert('Please enter name and room code');
    saveSession(roomId, myPlayerId, name);
    socket.emit('joinRoom', { roomId, playerName: name, userId: myPlayerId });
});

document.getElementById('how-to-play-btn').addEventListener('click', () => {
    document.getElementById('how-to-play-modal').classList.remove('hidden');
});
document.getElementById('close-htp').addEventListener('click', () => {
    document.getElementById('how-to-play-modal').classList.add('hidden');
});

// Copy Room Code
const roomCodeContainer = document.getElementById('room-code-container');
if (roomCodeContainer) {
    roomCodeContainer.addEventListener('click', () => {
        if (!currentRoomId) return;
        navigator.clipboard.writeText(currentRoomId).then(() => {
            showToast('Room Code Copied!');
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    });
}

function showToast(msg) {
    let toast = document.getElementById('toast-msg');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-msg';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2000);
}

// Bidding
document.getElementById('place-bid-btn').addEventListener('click', () => {
    const amount = parseInt(document.getElementById('bid-amount').value);
    socket.emit('gameAction', { roomId: currentRoomId, action: 'bid', payload: { amount } });
    document.getElementById('bidding-modal').classList.add('hidden');
});

document.getElementById('pass-bid-btn').addEventListener('click', () => {
    socket.emit('gameAction', { roomId: currentRoomId, action: 'bid', payload: { amount: 0 } });
    document.getElementById('bidding-modal').classList.add('hidden');
});

// Trump Selection
document.querySelectorAll('.suit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const suit = e.target.dataset.suit;
        socket.emit('gameAction', { roomId: currentRoomId, action: 'selectTrump', payload: { suit } });
        document.getElementById('trump-modal').classList.add('hidden');
    });
});

// Exit Logic
function exitRoom() {
    if (confirm('Are you sure you want to leave the room?')) {
        // Clear all session data
        localStorage.removeItem('chaugadi_roomId' + sessionSuffix);
        // KEEP Name? Maybe. Let's keep name for convenience. 
        // localStorage.removeItem('chaugadi_userId' + sessionSuffix); // Keep ID for re-login

        // Remove room param from URL
        const newUrl = new URL(window.location);
        newUrl.searchParams.delete('roomId');
        window.history.pushState({}, '', newUrl);

        window.location.reload();
    }
}

document.getElementById('lobby-exit-btn').addEventListener('click', exitRoom);
document.getElementById('game-exit-btn').addEventListener('click', exitRoom);


// Socket Events
// Listen for disconnects
socket.on('playerDisconnected', (data) => {
    showToast(`${data.name} has disconnected`, 'error');
});

socket.on('roomCreated', ({ roomId, playerId }) => {
    currentRoomId = roomId;
    myPlayerId = playerId;
    const name = localStorage.getItem('chaugadi_name' + sessionSuffix);
    saveSession(roomId, playerId, name);
    document.getElementById('room-code-display').innerText = roomId;
    // showScreen('lobby'); // Removed: Let gameState handle screen
});

socket.on('roomJoined', ({ roomId, playerId }) => {
    currentRoomId = roomId;
    myPlayerId = playerId;
    const name = localStorage.getItem('chaugadi_name' + sessionSuffix);
    saveSession(roomId, playerId, name);
    document.getElementById('room-code-display').innerText = roomId;
    // showScreen('lobby'); // Removed: Let gameState handle screen
});

socket.on('error', (msg) => {
    if (msg === 'Room not found') {
        localStorage.removeItem('chaugadi_roomId' + sessionSuffix);
        showScreen('landing');
    }
    alert(msg);
});

socket.on('gameState', (state) => {
    gameStateLocal = state;
    renderGameState(state);
});

socket.on('dealerSelected', ({ dealerIndex }) => {
    showScreen('game');
    const myPlayer = gameStateLocal.players.find(p => p.id === myPlayerId);
    if (!myPlayer) return;
    Animations.spinDealer(dealerIndex, myPlayer.seat);
});

socket.on('trickCollected', ({ winnerIndex }) => {
    const myPlayer = gameStateLocal.players.find(p => p.id === myPlayerId);
    if (!myPlayer) return;
    const cardEls = document.querySelectorAll('.trick-card');
    Animations.collectTrick(cardEls, winnerIndex, myPlayer.seat);
});

// Rendering Logic
function renderGameState(state) {
    if (state.state === 'WAITING') {
        if (!screens.lobby.classList.contains('active')) showScreen('lobby');
        renderLobby(state.players);
    } else { // PLAYING, DEALING, BIDDING, TRUMP_SELECT
        if (!screens.game.classList.contains('active')) showScreen('game');
        renderGameTable(state);
    }
}

function renderLobby(players) {
    const list = document.getElementById('lobby-players');
    list.innerHTML = `
        <div class="lobby-table-container">
            <div class="lobby-table-bg"></div>
            ${[0, 1, 2, 3].map(i => `<div class="lobby-seat" id="lobby-seat-${i}" data-seat="${i}"></div>`).join('')}
        </div>
        <div style="text-align:center; color: #94a3b8; margin-bottom: 20px;">
            Click any seat to move or swap
        </div>
    `;

    [0, 1, 2, 3].forEach(seatIndex => {
        const player = players.find(p => p.seat === seatIndex);
        const seatEl = document.getElementById(`lobby-seat-${seatIndex}`);

        seatEl.onclick = () => {
            socket.emit('gameAction', { roomId: currentRoomId, action: 'switchSeat', payload: { targetSeat: seatIndex } });
        };

        if (player) {
            seatEl.classList.add('taken');
            if (player.team === 2) seatEl.classList.add('team2');
            else seatEl.classList.remove('team2');

            seatEl.innerHTML = `
                <div class="lobby-avatar">
                    ${getAvatarHTML(player.avatar)}
                </div>
                <div class="lobby-name">${player.name}</div>
                ${player.id === myPlayerId ? '<div style="font-size:0.7rem; color:var(--primary);">(You)</div>' : ''}
            `;
        } else {
            seatEl.classList.remove('taken');
            seatEl.innerHTML = `
                <div class="lobby-avatar" style="font-size:2rem;">+</div>
                <div class="lobby-name" style="color:var(--text-muted); font-weight:normal;">Empty</div>
            `;
        }
    });

    document.getElementById('player-count').innerText = players.length;

    const existingStartBtn = document.querySelector('.start-btn-container');
    if (existingStartBtn) existingStartBtn.remove();

    if (players.length === 4) {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'start-btn-container';
        btnContainer.innerHTML = `<button id="start-game-btn" class="btn primary">Start Game</button>`;
        document.getElementById('lobby-screen').appendChild(btnContainer);

        btnContainer.querySelector('button').addEventListener('click', () => {
            socket.emit('gameAction', { roomId: currentRoomId, action: 'startGame', payload: {} });
        });
    }
}

function renderGameTable(state) {
    const mySeatIndex = state.mySeat;

    const positions = ['left', 'top', 'right'];
    positions.forEach((pos, i) => {
        const targetSeatIndex = (mySeatIndex + (i + 1)) % 4;
        const player = state.players.find(p => p.seat === targetSeatIndex);
        const el = document.getElementById(`opponent-${pos}`);

        if (player) {
            el.querySelector('.name').innerText = player.name + (state.dealerIndex === player.seat ? ' (D)' : '');
            el.querySelector('.card-count').innerText = `${player.hand} cards`;
            el.querySelector('.avatar').innerHTML = getAvatarHTML(player.avatar);

            if (state.currentTurnIndex === player.seat) el.classList.add('seat-active');
            else el.classList.remove('seat-active');
        }
    });

    const myPlayer = state.players.find(p => p.id === myPlayerId);
    if (myPlayer) {
        const mySeatEl = document.getElementById('my-seat');
        mySeatEl.querySelector('.name').innerHTML = `You ${state.dealerIndex === mySeatIndex ? '(D)' : ''}`;

        let avatarEl = mySeatEl.querySelector('.avatar');
        if (!avatarEl) {
            const div = document.createElement('div');
            div.className = 'avatar';
            mySeatEl.prepend(div);
            avatarEl = div;
        }
        avatarEl.innerHTML = getAvatarHTML(myPlayer.avatar);

        if (state.currentTurnIndex === mySeatIndex) mySeatEl.classList.add('seat-active');
        else mySeatEl.classList.remove('seat-active');

        renderMyHand(myPlayer.hand, state, mySeatIndex);
    }

    const trickContainer = document.getElementById('trick-pile');

    state.trick.forEach(play => {
        const existing = document.getElementById(`card-${play.card.suit}-${play.card.rank}`);
        if (!existing) {
            const cardEl = createCardElement(play.card);
            cardEl.id = `card-${play.card.suit}-${play.card.rank}`;
            cardEl.classList.add('trick-card');

            const pIndex = parseInt(play.playerIndex);
            const mIndex = parseInt(mySeatIndex);
            const offset = (pIndex - mIndex + 4) % 4;

            // Debug offset
            console.log(`Rendering Trick Card: Player ${pIndex}, MySeat ${mIndex}, Offset ${offset}`);
            cardEl.dataset.pos = offset;

            // Apply inline positioning (Absolute Pixels for 300x300 Container)
            // Center X = 150, Center Y = 150.
            // Card dims: 90x130 (half: 45x65).
            // Base Center Pos: Left = 105px, Top = 85px.

            // Adjustments (Spacing: H=100, V=80)
            if (offset === 0) { // Bottom (Me)
                cardEl.style.left = '105px';
                cardEl.style.top = '165px'; // 85 + 80
                cardEl.style.zIndex = 4;
            } else if (offset === 1) { // Left
                cardEl.style.left = '5px';   // 105 - 100
                cardEl.style.top = '85px';
                cardEl.style.zIndex = 3;
            } else if (offset === 2) { // Top
                cardEl.style.left = '105px';
                cardEl.style.top = '5px';   // 85 - 80
                cardEl.style.zIndex = 2;
            } else if (offset === 3) { // Right
                cardEl.style.left = '205px'; // 105 + 100
                cardEl.style.top = '85px';
                cardEl.style.zIndex = 3;
            }

            trickContainer.appendChild(cardEl);

            let fromRect;
            if (offset === 0) {
                const handEl = document.getElementById('my-hand');
                fromRect = handEl.getBoundingClientRect();
            } else {
                const selectors = ['#my-seat', '#opponent-left', '#opponent-top', '#opponent-right'];
                const seatEl = document.querySelector(selectors[offset]);
                fromRect = seatEl.getBoundingClientRect();
            }

            Animations.playCard(cardEl, fromRect);
        }
    });

    if (state.trick.length === 0) {
        // Cleanup
    }

    // Determine My Team (0/2 = Team 1, 1/3 = Team 2) - Assuming standard partner seats
    // Actually, let's just assume T1=Seats 0/2, T2=Seats 1/3 for now.
    // Ideally GameState should send team info, but this is standard.
    const myTeam = (mySeatIndex % 2 === 0) ? 1 : 2;
    const t1Label = myTeam === 1 ? 'Team 1 (You)' : 'Team 1';
    const t2Label = myTeam === 2 ? 'Team 2 (You)' : 'Team 2';

    const t1El = document.getElementById('team1-score');
    const t2El = document.getElementById('team2-score');

    t1El.innerText = `${t1Label}: ${state.handsWon[1]}`;
    t2El.innerText = `${t2Label}: ${state.handsWon[2]}`;

    // reset classes
    t1El.classList.remove('my-team-score');
    t2El.classList.remove('my-team-score');

    if (myTeam === 1) t1El.classList.add('my-team-score');
    else t2El.classList.add('my-team-score');

    document.getElementById('trump-suit').innerText = state.trumpSuit ? getSuitSymbol(state.trumpSuit) : '?';

    handlePhaseUI(state, mySeatIndex);
}

function createCardElement(card) {
    const el = document.createElement('div');
    el.className = `card ${getCardColor(card.suit)}`;
    el.innerHTML = `
        <div class="card-content">
            <span class="rank">${card.rank}</span>
            <span class="suit">${getSuitSymbol(card.suit)}</span>
        </div>
    `;
    return el;
}

// Fixed Click Validtion Helper
function isCardValid(card, state, mySeatIndex) {
    const isMyTurn = state.currentTurnIndex === mySeatIndex && state.state === 'PLAYING';
    if (!isMyTurn) return false;

    const leadSuit = state.leadSuit;
    const me = state.players.find(p => p.seat === mySeatIndex);
    if (!me) return false;

    const hasLeadSuit = leadSuit ? me.hand.some(c => c.suit === leadSuit) : false;
    if (leadSuit && hasLeadSuit && card.suit !== leadSuit) return false;

    return true;
}

function renderMyHand(hand, state, mySeatIndex) {
    if (!Array.isArray(hand)) {
        console.error('renderMyHand: Hand is not an array!', hand);
        return;
    }

    const container = document.getElementById('my-hand');
    const newHandStr = JSON.stringify(hand);

    if (JSON.stringify(myLastHandState) === newHandStr && container.children.length === hand.length) {
        updateHandClasses(hand, state, mySeatIndex);
        return;
    }
    myLastHandState = hand;

    container.innerHTML = '';

    // Debug: Ensure container is visible
    container.style.display = 'flex';

    // First: Create and Append ALL cards to establish final layout
    const cardElements = [];
    hand.forEach((card) => {
        const cardEl = createCardElement(card);
        const isValid = isCardValid(card, state, mySeatIndex);

        if (!isValid) cardEl.classList.add('disabled');

        cardEl.onclick = () => {
            if (isCardValid(card, gameStateLocal, mySeatIndex)) {
                socket.emit('gameAction', { roomId: currentRoomId, action: 'playCard', payload: { card } });
            }
        };

        container.appendChild(cardEl);
        cardElements.push(cardEl);
    });

    // Second: Animate (now that layout is calculated)
    if (state.state.includes('DEALING')) {
        cardElements.forEach((cardEl, index) => {
            Animations.dealCard(cardEl, 0, 0, index * 0.1);
        });
    }
}

function updateHandClasses(hand, state, mySeatIndex) {
    const cards = document.getElementById('my-hand').children;
    Array.from(cards).forEach((cardEl, i) => {
        const card = hand[i];
        const isValid = isCardValid(card, state, mySeatIndex);

        if (!isValid) cardEl.classList.add('disabled');
        else cardEl.classList.remove('disabled');
    });
}

// DEBUG: Render Dummy Trick for Layout Verification
if (urlParams.get('debug')) {
    setTimeout(() => {
        showScreen('game');
        const container = document.getElementById('trick-pile');
        container.innerHTML = '';

        const dummyCards = [
            { pos: 0, suit: 'S', rank: 'A' },
            { pos: 1, suit: 'H', rank: 'K' },
            { pos: 2, suit: 'D', rank: 'Q' },
            { pos: 3, suit: 'C', rank: 'J' }
        ];

        dummyCards.forEach(c => {
            const el = createCardElement({ suit: c.suit, rank: c.rank });
            el.classList.add('trick-card');
            el.dataset.pos = c.pos;
            container.appendChild(el);
        });

        console.log('DEBUG: Dummy trick rendered');
    }, 500);
}

function handlePhaseUI(state, mySeatIndex) {
    const bidModal = document.getElementById('bidding-modal');
    const trumpModal = document.getElementById('trump-modal');
    bidModal.classList.add('hidden');
    trumpModal.classList.add('hidden');

    if (state.state === 'BIDDING' && state.currentBidderIndex === mySeatIndex) {
        bidModal.classList.remove('hidden');
        const minBid = state.highestBid.amount > 0 ? state.highestBid.amount + 1 : 7;
        document.getElementById('min-bid-val').innerText = minBid;
        document.getElementById('bid-amount').min = minBid;
        document.getElementById('bid-amount').value = minBid;
    } else if (state.state === 'TRUMP_SELECT' && state.highestBid.playerIndex === mySeatIndex && !state.trumpSuit) {
        trumpModal.classList.remove('hidden');
    }
}
