// Audio Context for sound effects
const AudioCtx = new (window.AudioContext || window.webkitAudioContext)();

const playSfx = (type) => {
    if (AudioCtx.state === 'suspended') AudioCtx.resume();
    
    if (type === 'farkle') {
        const osc = AudioCtx.createOscillator();
        const gain = AudioCtx.createGain();
        osc.connect(gain);
        gain.connect(AudioCtx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, AudioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, AudioCtx.currentTime + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.01, AudioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(AudioCtx.currentTime + 0.4);
        
        const container = document.querySelector('.container');
        container.classList.add('shake');
        setTimeout(() => container.classList.remove('shake'), 200);
    } else if (type === 'submit') {
        // Success sound
        [523, 659, 783].forEach((f, i) => {
            const o = AudioCtx.createOscillator();
            const g = AudioCtx.createGain();
            o.connect(g);
            g.connect(AudioCtx.destination);
            o.frequency.value = f;
            g.gain.setValueAtTime(0, AudioCtx.currentTime + (i * 0.1));
            g.gain.linearRampToValueAtTime(0.1, AudioCtx.currentTime + (i * 0.1) + 0.05);
            g.gain.exponentialRampToValueAtTime(0.01, AudioCtx.currentTime + 0.6);
            o.start(AudioCtx.currentTime + (i * 0.1));
            o.stop(AudioCtx.currentTime + 0.6);
        });
    } else if (type === 'record') {
        // Record breaking sound
        [659, 783, 1047].forEach((f, i) => {
            const o = AudioCtx.createOscillator();
            const g = AudioCtx.createGain();
            o.connect(g);
            g.connect(AudioCtx.destination);
            o.frequency.value = f;
            o.type = 'sine';
            g.gain.setValueAtTime(0, AudioCtx.currentTime + (i * 0.08));
            g.gain.linearRampToValueAtTime(0.15, AudioCtx.currentTime + (i * 0.08) + 0.05);
            g.gain.exponentialRampToValueAtTime(0.01, AudioCtx.currentTime + 0.7);
            o.start(AudioCtx.currentTime + (i * 0.08));
            o.stop(AudioCtx.currentTime + 0.7);
        });
    }
};

// Game State
let players = [];
let currentPlayerIndex = 0;
let finalRound = false;
let finalRoundStartPlayer = -1; // Track who triggered the final round
let gameHistory = [];
let stats = {
    highestTurn: { score: 0, playerName: '' },
    farkleCounts: {}
};
let eliminatedPlayers = new Set(); // Track eliminated players in final round

const turnInput = document.getElementById('turn-score-input');
const STORAGE_KEY = 'farkle_game_state';
const WIN_SCORE = 10000;

// Initialize the app
function init() {
    // Setup screen
    document.getElementById('add-player-btn').onclick = addPlayerInput;
    document.getElementById('start-game-btn').onclick = startGame;
    
    // Game screen
    document.getElementById('submit-score-btn').onclick = submitScore;
    document.getElementById('farkle-btn').onclick = handleFarkle;
    document.getElementById('undo-btn').onclick = undo;
    
    // Modals
    document.getElementById('rematch-btn').onclick = handleRematch;
    document.getElementById('new-game-btn').onclick = () => location.reload();
    document.getElementById('menu-btn').onclick = toggleMenu;
    document.getElementById('close-menu-btn').onclick = toggleMenu;
    document.getElementById('save-game-btn').onclick = saveGameToStorage;
    document.getElementById('reset-game-btn').onclick = confirmReset;
    
    // Input controls
    document.getElementById('clear-input').onclick = () => {
        turnInput.value = '';
        turnInput.focus();
        clearValidation();
    };
    
    // Quick score buttons
    document.querySelectorAll('.btn-quick').forEach(btn => {
        if (btn.id !== 'clear-input') {
            btn.onclick = () => {
                const currentVal = parseInt(turnInput.value) || 0;
                turnInput.value = currentVal + parseInt(btn.dataset.value);
                turnInput.focus();
                validateScore();
            };
        }
    });
    
    // Stats toggle
    document.getElementById('toggle-stats').onclick = toggleStats;
    
    // Keyboard support
    turnInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitScore();
        }
    });
    
    turnInput.addEventListener('input', validateScore);
    
    // Modal backdrop clicks
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.onclick = (e) => {
            if (e.target === backdrop) {
                backdrop.parentElement.classList.add('hidden');
            }
        };
    });
    
    // Initialize with 2 player inputs
    addPlayerInput();
    addPlayerInput();
    
    // Try to load saved game
    loadGameFromStorage();
}

// Player Setup Functions
function addPlayerInput() {
    const container = document.getElementById('player-inputs');
    const playerCount = container.children.length;
    
    if (playerCount >= 8) {
        showToast('Maximum 8 players allowed', 'warning');
        return;
    }
    
    const div = document.createElement('div');
    div.className = 'player-input-row';
    div.innerHTML = `
        <input type="text" 
               placeholder="Player ${playerCount + 1}" 
               maxlength="20"
               autocomplete="off">
        <button class="btn-remove" 
                onclick="this.parentElement.remove(); validateStart();"
                aria-label="Remove player">×</button>
    `;
    div.querySelector('input').oninput = validateStart;
    container.appendChild(div);
    div.querySelector('input').focus();
    validateStart();
}

function validateStart() {
    const inputs = document.querySelectorAll('#player-inputs input');
    const validPlayers = Array.from(inputs).filter(i => i.value.trim() !== "");
    const startBtn = document.getElementById('start-game-btn');
    startBtn.disabled = validPlayers.length < 2;
    
    if (validPlayers.length >= 2) {
        startBtn.textContent = `Start Game (${validPlayers.length} players)`;
    } else {
        startBtn.textContent = 'Start Game';
    }
}

function startGame() {
    const inputs = Array.from(document.querySelectorAll('#player-inputs input'));
    const playerNames = inputs
        .map(i => i.value.trim())
        .filter(name => name !== "");
    
    // Check for duplicate names
    const uniqueNames = new Set(playerNames);
    if (uniqueNames.size !== playerNames.length) {
        showToast('Player names must be unique!', 'error');
        return;
    }
    
    players = playerNames.map(name => ({
        name: name,
        score: 0,
        onBoard: false,
        turnScores: [],
        farkleCount: 0
    }));
    
    stats.farkleCounts = {};
    players.forEach(p => {
        stats.farkleCounts[p.name] = 0;
    });
    
    document.getElementById('setup-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    
    updateUI();
    saveGameToStorage();
}

// Score Validation
function validateScore() {
    const val = parseInt(turnInput.value);
    const validationEl = document.getElementById('score-validation');
    const submitBtn = document.getElementById('submit-score-btn');
    
    if (!turnInput.value) {
        clearValidation();
        return;
    }
    
    if (isNaN(val) || val <= 0) {
        showValidation('Please enter a positive number', 'error');
        submitBtn.disabled = true;
        return;
    }
    
    const p = players[currentPlayerIndex];
    if (!p.onBoard && val < 500) {
        showValidation('⚠️ Need 500+ points to get on the board!', 'warning');
        submitBtn.disabled = true;
        return;
    }
    
    if (val % 50 !== 0) {
        showValidation('💡 Scores should be multiples of 50', 'warning');
    }
    
    clearValidation();
    submitBtn.disabled = false;
}

function showValidation(message, type) {
    const validationEl = document.getElementById('score-validation');
    validationEl.textContent = message;
    validationEl.className = `validation-message ${type}`;
}

function clearValidation() {
    const validationEl = document.getElementById('score-validation');
    validationEl.textContent = '';
    validationEl.className = 'validation-message';
    document.getElementById('submit-score-btn').disabled = false;
}

// Game Action Functions
function submitScore() {
    const val = parseInt(turnInput.value);
    
    if (isNaN(val) || val <= 0) {
        showToast('Please enter a valid score', 'error');
        return;
    }
    
    const p = players[currentPlayerIndex];
    
    if (!p.onBoard && val < 500) {
        showToast('Need 500+ points to get on the board!', 'error');
        return;
    }
    
    saveState();
    
    p.score += val;
    p.onBoard = true;
    p.turnScores.push(val);
    
    // Check for record
    if (val > stats.highestTurn.score) {
        stats.highestTurn = { score: val, playerName: p.name };
        showRecordToast(p.name, val);
        playSfx('record');
    } else {
        playSfx('submit');
    }
    
    // Check for win condition
    if (p.score >= WIN_SCORE && !finalRound) {
        finalRound = true;
        finalRoundStartPlayer = currentPlayerIndex;
        createFireworks();
        createConfetti();
        showToast(`🎯 ${p.name} passed ${WIN_SCORE.toLocaleString()}! Final round begins - beat the leader or be eliminated!`, 'success');
    }
    
    // In final round, check if this player beat the current leader
    if (finalRound) {
        const highscore = Math.max(...players.map(pl => pl.score));
        
        // If they didn't beat or tie the high score, they're eliminated
        if (p.score < highscore) {
            eliminatedPlayers.add(currentPlayerIndex);
            showToast(`${p.name} didn't beat the leader - eliminated!`, 'error');
        }
    }
    
    turnInput.value = '';
    clearValidation();
    nextTurn();
}

function handleFarkle() {
    saveState();
    
    const p = players[currentPlayerIndex];
    p.turnScores.push(0);
    p.farkleCount++;
    stats.farkleCounts[p.name] = (stats.farkleCounts[p.name] || 0) + 1;
    
    playSfx('farkle');
    
    // In final round, farkling eliminates you
    if (finalRound) {
        eliminatedPlayers.add(currentPlayerIndex);
        showToast(`${p.name} Farkled - eliminated! 🚫`, 'error');
    } else {
        showToast(`${p.name} Farkled! 🚫`, 'error');
    }
    
    nextTurn();
}

function nextTurn() {
    // Move to next player, skipping eliminated ones in final round
    let attempts = 0;
    do {
        currentPlayerIndex++;
        if (currentPlayerIndex >= players.length) {
            currentPlayerIndex = 0;
        }
        attempts++;
        
        // Safety check to prevent infinite loop
        if (attempts > players.length) {
            break;
        }
    } while (finalRound && eliminatedPlayers.has(currentPlayerIndex) && eliminatedPlayers.size < players.length);
    
    if (finalRound) {
        checkForGameEnd();
        return;
    }
    
    updateUI();
    saveGameToStorage();
    turnInput.focus();
}

// UI Update Functions
function updateUI() {
    updateCurrentPlayer();
    updateScoreboard();
    updateStats();
    updateUndoButton();
}

function updateCurrentPlayer() {
    const p = players[currentPlayerIndex];
    const nameDisplay = document.getElementById('current-player-name');
    nameDisplay.innerHTML = `<strong>${p.name}</strong>`;
    
    const roundIndicator = document.getElementById('round-indicator');
    const highscore = Math.max(...players.map(p => p.score));
    
    if (finalRound) {
        const remainingCount = players.length - eliminatedPlayers.size;
        const leadingPlayers = players.filter(pl => pl.score === highscore);
        
        if (leadingPlayers.length === 1) {
            const leader = leadingPlayers[0];
            if (leader.name === p.name) {
                roundIndicator.innerHTML = `<span class="final-round-badge">⚠️ FINAL ROUND - You're leading! (${remainingCount} players left)</span>`;
            } else {
                roundIndicator.innerHTML = `<span class="final-round-badge">⚠️ FINAL ROUND - Beat ${leader.name}'s ${highscore.toLocaleString()} or be eliminated! (${remainingCount} left)</span>`;
            }
        } else {
            roundIndicator.innerHTML = `<span class="final-round-badge">⚠️ FINAL ROUND - Tied at the top! (${remainingCount} players left)</span>`;
        }
    } else if (highscore > 0 && p.score < highscore) {
        const pointsNeeded = (highscore - p.score) + 50;
        roundIndicator.innerHTML = `<span class="chase-badge">Need ${pointsNeeded.toLocaleString()} to lead</span>`;
    } else if (p.score === highscore && highscore > 0) {
        roundIndicator.innerHTML = '<span class="leader-badge">👑 Leading</span>';
    } else {
        roundIndicator.innerHTML = '';
    }
}

function updateScoreboard() {
    const scoreboard = document.getElementById('scoreboard');
    const highscore = Math.max(...players.map(p => p.score));
    
    let html = `<table class="score-table">
        <thead>
            <tr>
                <th class="row-label">Turn</th>`;
    
    players.forEach((player, idx) => {
        const isCurrent = idx === currentPlayerIndex ? 'current-player-header' : '';
        const isLeader = (player.score === highscore && highscore > 0) ? 'leader-column' : '';
        const isEliminated = eliminatedPlayers.has(idx) ? 'eliminated-column' : '';
        html += `<th class="${isCurrent} ${isLeader} ${isEliminated}">
            <div class="player-header">
                <span class="player-header-name">${player.name}</span>
                ${isLeader && highscore > 0 ? '<span class="crown">👑</span>' : ''}
                ${isEliminated ? '<span class="eliminated-badge">❌</span>' : ''}
            </div>
        </th>`;
    });
    
    html += `</tr></thead><tbody>`;
    
    // Turn scores
    const maxTurns = Math.max(...players.map(p => p.turnScores.length), 1);
    for (let i = 0; i < maxTurns; i++) {
        html += `<tr><td class="row-label">${i + 1}</td>`;
        players.forEach((player, idx) => {
            const score = player.turnScores[i];
            const isCurrent = idx === currentPlayerIndex;
            const isEliminated = eliminatedPlayers.has(idx);
            let cellClass = isEliminated ? 'eliminated-cell' : '';
            let cellContent = '-';
            
            if (score !== undefined) {
                if (score === 0) {
                    cellClass += ' farkle-cell';
                    cellContent = '🚫';
                } else {
                    cellContent = score.toLocaleString();
                    if (score >= 1000) cellClass += ' high-score-cell';
                }
            }
            
            html += `<td class="${cellClass}">${cellContent}</td>`;
        });
        html += `</tr>`;
    }
    
    // Running totals row (shows score after each turn)
    html += `<tr class="running-total-row"><td class="row-label">Running</td>`;
    players.forEach((player, idx) => {
        const isEliminated = eliminatedPlayers.has(idx);
        const runningTotal = player.turnScores.reduce((sum, score) => {
            if (player.onBoard || sum >= 500) {
                return sum + score;
            }
            return sum;
        }, 0);
        const cellClass = isEliminated ? 'eliminated-cell' : '';
        html += `<td class="${cellClass}">${runningTotal > 0 ? runningTotal.toLocaleString() : '-'}</td>`;
    });
    html += `</tr>`;
    
    // Farkles row
    html += `<tr class="farkle-row"><td class="row-label">Farkles</td>`;
    players.forEach((player, idx) => {
        const count = player.farkleCount || 0;
        const isEliminated = eliminatedPlayers.has(idx);
        const style = count > 0 ? 'color: var(--danger); font-weight: bold;' : 'opacity: 0.5;';
        const cellClass = isEliminated ? 'eliminated-cell' : '';
        html += `<td class="${cellClass}" style="${style}">🚫 ${count}</td>`;
    });
    html += `</tr>`;
    
    // Total row
    html += `<tr class="total-row"><td class="row-label">Total</td>`;
    players.forEach((player, idx) => {
        const isLeader = (player.score === highscore && highscore > 0) ? 'leader-column' : '';
        const onBoardClass = player.onBoard ? '' : 'not-on-board';
        const isEliminated = eliminatedPlayers.has(idx);
        const isCurrent = idx === currentPlayerIndex;
        const cellClass = `${isLeader} ${onBoardClass} ${isEliminated ? 'eliminated-cell' : ''} ${isCurrent && !isEliminated ? 'score-pulse' : ''}`;
        html += `<td class="${cellClass}">
            <strong>${player.score.toLocaleString()}</strong>
            ${!player.onBoard ? '<div class="off-board-label">Not on board</div>' : ''}
            ${isEliminated ? '<div class="eliminated-label">Eliminated</div>' : ''}
        </td>`;
    });
    html += `</tr></tbody></table>`;
    
    scoreboard.innerHTML = html;
}

function updateStats() {
    // Highest turn
    if (stats.highestTurn.score > 0) {
        document.getElementById('stat-highest-turn').textContent = 
            `${stats.highestTurn.score.toLocaleString()} (${stats.highestTurn.playerName})`;
    }
    
    // Average score
    const onBoardPlayers = players.filter(p => p.onBoard);
    if (onBoardPlayers.length > 0) {
        const avgScore = Math.round(
            onBoardPlayers.reduce((sum, p) => sum + p.score, 0) / onBoardPlayers.length
        );
        document.getElementById('stat-avg-score').textContent = avgScore.toLocaleString();
    }
    
    // Total farkles
    const totalFarkles = Object.values(stats.farkleCounts).reduce((sum, count) => sum + count, 0);
    document.getElementById('stat-total-farkles').textContent = totalFarkles;
    
    // Turns played
    const totalTurns = players.reduce((sum, p) => sum + p.turnScores.length, 0);
    document.getElementById('stat-turns-played').textContent = totalTurns;
}

function updateUndoButton() {
    document.getElementById('undo-btn').disabled = gameHistory.length === 0;
}

// Stats Panel Toggle
function toggleStats() {
    const panel = document.getElementById('stats-panel');
    const toggle = document.getElementById('toggle-stats');
    const icon = toggle.querySelector('.toggle-icon');
    
    panel.classList.toggle('collapsed');
    icon.textContent = panel.classList.contains('collapsed') ? '▼' : '▲';
}

// History Management
function saveState() {
    gameHistory.push(JSON.stringify({
        players: JSON.parse(JSON.stringify(players)),
        currentPlayerIndex,
        finalRound,
        finalRoundStartPlayer,
        eliminatedPlayers: Array.from(eliminatedPlayers),
        stats: JSON.parse(JSON.stringify(stats))
    }));
}

function undo() {
    if (gameHistory.length === 0) return;
    
    const lastState = JSON.parse(gameHistory.pop());
    players = lastState.players;
    currentPlayerIndex = lastState.currentPlayerIndex;
    finalRound = lastState.finalRound;
    finalRoundStartPlayer = lastState.finalRoundStartPlayer;
    eliminatedPlayers = new Set(lastState.eliminatedPlayers || []);
    stats = lastState.stats;
    
    updateUI();
    saveGameToStorage();
    showToast('Action undone', 'success');
}

// Local Storage Functions
function saveGameToStorage() {
    try {
        const gameState = {
            players,
            currentPlayerIndex,
            finalRound,
            finalRoundStartPlayer,
            eliminatedPlayers: Array.from(eliminatedPlayers),
            stats,
            timestamp: Date.now()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
    } catch (e) {
        console.error('Failed to save game:', e);
    }
}

function loadGameFromStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;
        
        const gameState = JSON.parse(saved);
        
        // Check if save is less than 24 hours old
        const hoursSinceSave = (Date.now() - gameState.timestamp) / (1000 * 60 * 60);
        if (hoursSinceSave > 24) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }
        
        // Restore game state
        players = gameState.players;
        currentPlayerIndex = gameState.currentPlayerIndex;
        finalRound = gameState.finalRound;
        finalRoundStartPlayer = gameState.finalRoundStartPlayer || -1;
        eliminatedPlayers = new Set(gameState.eliminatedPlayers || []);
        stats = gameState.stats;
        
        if (players.length > 0) {
            document.getElementById('setup-screen').classList.remove('active');
            document.getElementById('game-screen').classList.add('active');
            updateUI();
            showToast('Game restored from last session', 'success');
        }
    } catch (e) {
        console.error('Failed to load game:', e);
        localStorage.removeItem(STORAGE_KEY);
    }
}

// Menu Functions
function toggleMenu() {
    document.getElementById('menu-modal').classList.toggle('hidden');
}

function confirmReset() {
    if (confirm('Are you sure you want to reset the game? This cannot be undone.')) {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
    }
}

// End Game Functions
function checkForGameEnd() {
    // Game ends when only one player is left (not eliminated)
    const remainingPlayers = players.length - eliminatedPlayers.size;
    
    if (remainingPlayers === 1) {
        // Find the winner (the one player not eliminated)
        for (let i = 0; i < players.length; i++) {
            if (!eliminatedPlayers.has(i)) {
                currentPlayerIndex = i; // Set to winner for display
                endGame();
                return;
            }
        }
    }
    
    // Continue playing
    updateUI();
    saveGameToStorage();
    turnInput.focus();
}

function endGame() {
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    const winner = sortedPlayers[0];
    
    // Big celebration!
    createConfetti();
    setTimeout(() => createConfetti(), 300);
    setTimeout(() => createConfetti(), 600);
    
    document.getElementById('win-modal').classList.remove('hidden');
    document.getElementById('winner-text').innerHTML = `
        <h3>🏆 ${winner.name} Wins!</h3>
        <p class="winner-score">Final Score: ${winner.score.toLocaleString()}</p>
    `;
    
    // Final standings
    let standingsHTML = '<div class="final-standings"><h4>Final Standings</h4><ol>';
    sortedPlayers.forEach((player, idx) => {
        standingsHTML += `<li>
            ${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : ''}
            <strong>${player.name}</strong>: ${player.score.toLocaleString()} points
            ${player.farkleCount > 0 ? ` (${player.farkleCount} farkles)` : ''}
        </li>`;
    });
    standingsHTML += '</ol></div>';
    
    document.getElementById('final-stats').innerHTML = standingsHTML;
    
    playSfx('record');
}

function handleRematch() {
    players.forEach(p => {
        p.score = 0;
        p.turnScores = [];
        p.onBoard = false;
        p.farkleCount = 0;
    });
    
    currentPlayerIndex = 0;
    finalRound = false;
    finalRoundStartPlayer = -1;
    eliminatedPlayers = new Set();
    gameHistory = [];
    stats = {
        highestTurn: { score: 0, playerName: '' },
        farkleCounts: {}
    };
    
    players.forEach(p => {
        stats.farkleCounts[p.name] = 0;
    });
    
    document.getElementById('win-modal').classList.add('hidden');
    updateUI();
    saveGameToStorage();
    showToast('New game started with same players!', 'success');
}

// Toast Notifications
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showRecordToast(name, score) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-record';
    toast.innerHTML = `🔥 <strong>NEW RECORD!</strong><br>${name} scored ${score.toLocaleString()}!`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Confetti animation for special moments
function createConfetti() {
    const colors = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];
    const confettiCount = 50;
    
    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = Math.random() * 0.5 + 's';
        confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
        document.body.appendChild(confetti);
        
        setTimeout(() => confetti.remove(), 4000);
    }
}

// Fireworks effect for reaching 10k
function createFireworks() {
    const fireworksContainer = document.createElement('div');
    fireworksContainer.className = 'fireworks-container';
    document.body.appendChild(fireworksContainer);
    
    for (let i = 0; i < 3; i++) {
        setTimeout(() => {
            const firework = document.createElement('div');
            firework.className = 'firework';
            firework.style.left = (20 + Math.random() * 60) + '%';
            firework.style.top = (20 + Math.random() * 40) + '%';
            fireworksContainer.appendChild(firework);
            
            setTimeout(() => firework.remove(), 1000);
        }, i * 400);
    }
    
    setTimeout(() => fireworksContainer.remove(), 2000);
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
