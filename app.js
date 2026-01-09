/**
 * 🏸 Badminton Match Scheduler - Main Application
 * Single-page app with localStorage persistence
 */

// ============================================
// State Management
// ============================================

const state = {
    players: [],
    matches: [],
    currentMatches: [], // Matches currently being played
    matchQueue: [], // Queue of matches waiting to be played
    rounds: [],
    settings: {
        matchType: 'doubles', // 'singles' or 'doubles'
        pairingMode: 'random', // 'random', 'balanced', 'separate'
        courtCount: 2,
        multiCourt: false // Can a player play on multiple courts at once
    },
    currentRound: 0
};

// Level weights for balancing
const LEVEL_WEIGHTS = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
    pro: 4
};

const LEVEL_LABELS = {
    beginner: '🟢 มือใหม่',
    intermediate: '🟡 ปานกลาง',
    advanced: '🟠 ขั้นสูง',
    pro: '🔴 โปร'
};

// ============================================
// LocalStorage Functions
// ============================================

function saveToStorage() {
    localStorage.setItem('badmintonScheduler', JSON.stringify(state));
}

function loadFromStorage() {
    const saved = localStorage.getItem('badmintonScheduler');
    if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(state, parsed);
        return true;
    }
    return false;
}

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadFromStorage();
    initializeUI();
    renderAll();
});

function initializeUI() {
    // Set form values from state
    document.getElementById('courtCount').value = state.settings.courtCount;
    document.getElementById('pairingMode').value = state.settings.pairingMode;
    document.getElementById('multiCourt').checked = state.settings.multiCourt;

    // Set match type buttons
    document.querySelectorAll('.btn-toggle[data-type]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === state.settings.matchType);
    });
}

// ============================================
// Settings Functions
// ============================================

function setMatchType(type) {
    state.settings.matchType = type;
    document.querySelectorAll('.btn-toggle[data-type]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
    saveToStorage();
    showToast(`เปลี่ยนเป็นประเภท${type === 'doubles' ? 'คู่' : 'เดี่ยว'}`, 'success');
}

function saveSetting(key, value) {
    state.settings[key] = value;
    saveToStorage();

    if (key === 'courtCount') {
        renderCourts();
    }
}

function adjustCourts(delta) {
    const input = document.getElementById('courtCount');
    const newValue = Math.max(1, Math.min(10, parseInt(input.value) + delta));
    input.value = newValue;
    saveSetting('courtCount', newValue);
}

// ============================================
// Player Management
// ============================================

function addPlayer() {
    const nameInput = document.getElementById('playerName');
    const levelSelect = document.getElementById('playerLevel');

    const name = nameInput.value.trim();
    const level = levelSelect.value;

    if (!name) {
        showToast('กรุณาใส่ชื่อผู้เล่น', 'error');
        nameInput.focus();
        return;
    }

    // Check for duplicate names
    if (state.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        showToast('มีผู้เล่นชื่อนี้แล้ว', 'error');
        return;
    }

    const player = {
        id: generateId(),
        name: name,
        level: level,
        matchCount: 0,
        isPlaying: false,
        createdAt: new Date().toISOString()
    };

    state.players.push(player);
    saveToStorage();

    nameInput.value = '';
    nameInput.focus();

    renderPlayers();
    updateStats();
    showToast(`เพิ่ม ${name} เรียบร้อย`, 'success');
}

function handlePlayerKeypress(event) {
    if (event.key === 'Enter') {
        addPlayer();
    }
}

function removePlayer(id) {
    const player = state.players.find(p => p.id === id);
    if (!player) return;

    if (player.isPlaying) {
        showToast('ไม่สามารถลบผู้เล่นที่กำลังแข่งอยู่', 'error');
        return;
    }

    if (confirm(`ลบผู้เล่น "${player.name}" ?`)) {
        state.players = state.players.filter(p => p.id !== id);
        saveToStorage();
        renderPlayers();
        updateStats();
        showToast(`ลบ ${player.name} แล้ว`, 'info');
    }
}

function editPlayer(id) {
    const player = state.players.find(p => p.id === id);
    if (!player) return;

    const newName = prompt('แก้ไขชื่อผู้เล่น:', player.name);
    if (newName && newName.trim()) {
        player.name = newName.trim();
        saveToStorage();
        renderPlayers();
        renderCourts();
        renderSchedule();
        showToast('แก้ไขเรียบร้อย', 'success');
    }
}

function changePlayerLevel(id, newLevel) {
    const player = state.players.find(p => p.id === id);
    if (player) {
        player.level = newLevel;
        saveToStorage();
        renderPlayers();
        showToast(`เปลี่ยนระดับเป็น ${LEVEL_LABELS[newLevel]}`, 'success');
    }
}

// ============================================
// Match Generation
// ============================================

function generateRound() {
    const playersNeeded = state.settings.matchType === 'doubles' ? 4 : 2;
    const availablePlayers = state.players.filter(p => !p.isPlaying);

    if (availablePlayers.length < playersNeeded) {
        showToast(`ต้องการผู้เล่นอย่างน้อย ${playersNeeded} คน`, 'error');
        return;
    }

    state.currentRound++;

    const round = {
        id: generateId(),
        roundNumber: state.currentRound,
        matches: [],
        createdAt: new Date().toISOString()
    };

    // Generate matches based on pairing mode
    const matches = generateMatches(availablePlayers);

    matches.forEach(match => {
        match.roundId = round.id;
        match.roundNumber = state.currentRound;
        state.matches.push(match);
        round.matches.push(match.id);
        state.matchQueue.push(match);
    });

    state.rounds.push(round);
    saveToStorage();

    renderAll();
    showToast(`สร้างรอบที่ ${state.currentRound} เรียบร้อย (${matches.length} แมตช์)`, 'success');
}

function generateMatches(availablePlayers) {
    const matches = [];
    const isDoubles = state.settings.matchType === 'doubles';
    const playersPerMatch = isDoubles ? 4 : 2;
    const playersPerTeam = isDoubles ? 2 : 1;

    // Sort/shuffle players based on pairing mode
    let shuffledPlayers = [...availablePlayers];

    switch (state.settings.pairingMode) {
        case 'random':
            shuffledPlayers = shuffleArray(shuffledPlayers);
            break;
        case 'balanced':
            shuffledPlayers = balancePlayers(shuffledPlayers);
            break;
        case 'separate':
            shuffledPlayers = separateByLevel(shuffledPlayers);
            break;
    }

    // Prioritize players with fewer matches
    shuffledPlayers.sort((a, b) => a.matchCount - b.matchCount);

    // Create matches
    const courtsToFill = state.settings.courtCount;
    let matchesCreated = 0;
    let usedPlayers = new Set();

    while (matchesCreated < courtsToFill) {
        const available = shuffledPlayers.filter(p => !usedPlayers.has(p.id));

        if (available.length < playersPerMatch) break;

        const selectedPlayers = available.slice(0, playersPerMatch);

        const match = {
            id: generateId(),
            type: state.settings.matchType,
            team1: selectedPlayers.slice(0, playersPerTeam).map(p => p.id),
            team2: selectedPlayers.slice(playersPerTeam).map(p => p.id),
            status: 'pending', // pending, playing, completed
            court: null,
            createdAt: new Date().toISOString()
        };

        matches.push(match);
        selectedPlayers.forEach(p => usedPlayers.add(p.id));
        matchesCreated++;
    }

    return matches;
}

function balancePlayers(players) {
    if (state.settings.matchType === 'singles') {
        // For singles, pair similar levels
        return [...players].sort((a, b) => LEVEL_WEIGHTS[a.level] - LEVEL_WEIGHTS[b.level]);
    }

    // For doubles, create balanced teams
    // Sort by level weight
    const sorted = [...players].sort((a, b) => LEVEL_WEIGHTS[b.level] - LEVEL_WEIGHTS[a.level]);
    const result = [];

    // Pair strongest with weakest for each team
    while (sorted.length >= 4) {
        const strongest = sorted.shift();
        const weakest = sorted.pop();
        const secondStrongest = sorted.shift();
        const secondWeakest = sorted.pop();

        // Create two balanced teams
        result.push(strongest, secondWeakest, secondStrongest, weakest);
    }

    // Add remaining players
    result.push(...sorted);

    return result;
}

function separateByLevel(players) {
    // Group by level
    const groups = {
        pro: [],
        advanced: [],
        intermediate: [],
        beginner: []
    };

    players.forEach(p => groups[p.level].push(p));

    // Return shuffled within each group
    const result = [];
    ['pro', 'advanced', 'intermediate', 'beginner'].forEach(level => {
        result.push(...shuffleArray(groups[level]));
    });

    return result;
}

// ============================================
// Match Control
// ============================================

function startNextMatch() {
    if (state.matchQueue.length === 0) {
        showToast('ไม่มีแมตช์ในคิว', 'info');
        return;
    }

    const availableCourts = getAvailableCourts();

    if (availableCourts.length === 0) {
        showToast('คอร์ทเต็มหมดแล้ว', 'error');
        return;
    }

    // Find matches that can be played
    let matchesStarted = 0;

    for (const courtNum of availableCourts) {
        const matchIndex = state.matchQueue.findIndex(match => {
            const players = [...match.team1, ...match.team2];
            return players.every(playerId => {
                const player = state.players.find(p => p.id === playerId);
                return player && (!player.isPlaying || state.settings.multiCourt);
            });
        });

        if (matchIndex === -1) break;

        const match = state.matchQueue.splice(matchIndex, 1)[0];
        match.status = 'playing';
        match.court = courtNum;
        match.startedAt = new Date().toISOString();

        state.currentMatches.push(match);

        // Mark players as playing
        [...match.team1, ...match.team2].forEach(playerId => {
            const player = state.players.find(p => p.id === playerId);
            if (player) {
                player.isPlaying = true;
                player.matchCount++;
            }
        });

        matchesStarted++;
    }

    if (matchesStarted === 0) {
        showToast('ไม่สามารถเริ่มแมตช์ได้ (ผู้เล่นกำลังแข่งอยู่)', 'error');
        return;
    }

    saveToStorage();
    renderAll();
    showToast(`เริ่ม ${matchesStarted} แมตช์`, 'success');
}

function getAvailableCourts() {
    const usedCourts = new Set(state.currentMatches.map(m => m.court));
    const available = [];

    for (let i = 1; i <= state.settings.courtCount; i++) {
        if (!usedCourts.has(i)) {
            available.push(i);
        }
    }

    return available;
}

function completeCurrentMatches() {
    if (state.currentMatches.length === 0) {
        showToast('ไม่มีแมตช์ที่กำลังแข่งอยู่', 'info');
        return;
    }

    state.currentMatches.forEach(match => {
        match.status = 'completed';
        match.completedAt = new Date().toISOString();

        // Mark players as not playing
        [...match.team1, ...match.team2].forEach(playerId => {
            const player = state.players.find(p => p.id === playerId);
            if (player) {
                player.isPlaying = false;
            }
        });
    });

    state.currentMatches = [];
    saveToStorage();
    renderAll();
    showToast('จบแมตช์เรียบร้อย', 'success');
}

function completeMatch(matchId) {
    const matchIndex = state.currentMatches.findIndex(m => m.id === matchId);
    if (matchIndex === -1) return;

    const match = state.currentMatches.splice(matchIndex, 1)[0];
    match.status = 'completed';
    match.completedAt = new Date().toISOString();

    [...match.team1, ...match.team2].forEach(playerId => {
        const player = state.players.find(p => p.id === playerId);
        if (player) {
            player.isPlaying = false;
        }
    });

    saveToStorage();
    renderAll();
    showToast('จบแมตช์เรียบร้อย', 'success');
}

// ============================================
// Rendering Functions
// ============================================

function renderAll() {
    renderPlayers();
    renderCourts();
    renderQueue();
    renderSchedule();
    updateStats();
}

function renderPlayers() {
    const container = document.getElementById('playerList');
    const countEl = document.getElementById('playerCount');
    const statsEl = document.getElementById('playerStats');

    countEl.textContent = state.players.length;

    // Calculate level stats
    const levelCounts = { beginner: 0, intermediate: 0, advanced: 0, pro: 0 };
    state.players.forEach(p => levelCounts[p.level]++);

    statsEl.innerHTML = Object.entries(levelCounts)
        .filter(([_, count]) => count > 0)
        .map(([level, count]) => `
            <span class="stat-badge" style="border-left: 3px solid var(--level-${level})">${count}</span>
        `).join('');

    if (state.players.length === 0) {
        container.innerHTML = '<div class="empty-state">ยังไม่มีผู้เล่น</div>';
        return;
    }

    // Sort by level and name
    const sortedPlayers = [...state.players].sort((a, b) => {
        const levelDiff = LEVEL_WEIGHTS[b.level] - LEVEL_WEIGHTS[a.level];
        if (levelDiff !== 0) return levelDiff;
        return a.name.localeCompare(b.name);
    });

    container.innerHTML = sortedPlayers.map(player => `
        <div class="player-card ${player.isPlaying ? 'playing' : ''}">
            <div class="player-info">
                <div class="player-avatar" style="background: var(--level-${player.level})">${player.name.charAt(0).toUpperCase()}</div>
                <div class="player-details">
                    <span class="player-name">${escapeHtml(player.name)}</span>
                    <span class="player-level ${player.level}">${LEVEL_LABELS[player.level]}</span>
                </div>
            </div>
            <div class="player-actions">
                <span class="player-match-count" title="จำนวนแมตช์">${player.matchCount} 🎮</span>
                <button class="player-action-btn" onclick="editPlayer('${player.id}')" title="แก้ไข">✏️</button>
                <button class="player-action-btn delete" onclick="removePlayer('${player.id}')" title="ลบ">🗑️</button>
            </div>
        </div>
    `).join('');
}

function renderCourts() {
    const container = document.getElementById('courtsGrid');
    const courts = [];

    for (let i = 1; i <= state.settings.courtCount; i++) {
        const currentMatch = state.currentMatches.find(m => m.court === i);
        courts.push({ number: i, match: currentMatch });
    }

    container.innerHTML = courts.map(court => {
        if (court.match) {
            const team1Names = court.match.team1.map(id => {
                const p = state.players.find(pl => pl.id === id);
                return p ? escapeHtml(p.name) : 'Unknown';
            });
            const team2Names = court.match.team2.map(id => {
                const p = state.players.find(pl => pl.id === id);
                return p ? escapeHtml(p.name) : 'Unknown';
            });

            return `
                <div class="court-card playing">
                    <div class="court-header">
                        <span class="court-number">🏟️ Court ${court.number}</span>
                        <span class="court-status playing">กำลังแข่ง</span>
                    </div>
                    <div class="court-players">
                        <div class="court-team">
                            <span class="court-team-label">ทีม A</span>
                            <div class="court-team-players">
                                ${team1Names.map(name => `<span class="court-player">${name}</span>`).join('')}
                            </div>
                        </div>
                        <div class="court-vs">VS</div>
                        <div class="court-team">
                            <span class="court-team-label">ทีม B</span>
                            <div class="court-team-players">
                                ${team2Names.map(name => `<span class="court-player">${name}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                    <button class="btn btn-outline" style="width: 100%; margin-top: 1rem;" onclick="completeMatch('${court.match.id}')">
                        ✅ จบแมตช์นี้
                    </button>
                </div>
            `;
        } else {
            return `
                <div class="court-card empty">
                    <div class="court-header">
                        <span class="court-number">🏟️ Court ${court.number}</span>
                        <span class="court-status empty">ว่าง</span>
                    </div>
                    <div class="court-empty-message">รอผู้เล่น...</div>
                </div>
            `;
        }
    }).join('');
}

function renderQueue() {
    const container = document.getElementById('queueList');

    if (state.matchQueue.length === 0) {
        container.innerHTML = '<div class="empty-state">ยังไม่มีคิว</div>';
        return;
    }

    container.innerHTML = state.matchQueue.map((match, index) => {
        const team1Names = match.team1.map(id => {
            const p = state.players.find(pl => pl.id === id);
            return p ? escapeHtml(p.name) : 'Unknown';
        }).join(' & ');

        const team2Names = match.team2.map(id => {
            const p = state.players.find(pl => pl.id === id);
            return p ? escapeHtml(p.name) : 'Unknown';
        }).join(' & ');

        return `
            <div class="queue-item">
                <span class="queue-position">${index + 1}</span>
                <div class="queue-match-info">
                    <div class="queue-teams">${team1Names} <span style="color: var(--text-muted)">vs</span> ${team2Names}</div>
                    <div class="queue-type">${match.type === 'doubles' ? 'คู่' : 'เดี่ยว'} | รอบที่ ${match.roundNumber}</div>
                </div>
            </div>
        `;
    }).join('');
}

function renderSchedule() {
    const container = document.getElementById('scheduleList');
    const filter = document.getElementById('scheduleFilter').value;

    if (state.rounds.length === 0) {
        container.innerHTML = '<div class="empty-state">ยังไม่มีตารางแข่ง</div>';
        return;
    }

    container.innerHTML = state.rounds.map(round => {
        const roundMatches = state.matches.filter(m => m.roundId === round.id);
        const filteredMatches = roundMatches.filter(m => filter === 'all' || m.status === filter);

        if (filteredMatches.length === 0) return '';

        return `
            <div class="schedule-round" onclick="toggleRound(this)">
                <div class="schedule-round-header">
                    <span class="schedule-round-title">
                        📅 รอบที่ ${round.roundNumber}
                        <span style="color: var(--text-muted); font-weight: normal; font-size: 0.85rem;">
                            (${roundMatches.filter(m => m.status === 'completed').length}/${roundMatches.length} แมตช์)
                        </span>
                    </span>
                    <span class="schedule-round-toggle">▼</span>
                </div>
                <div class="schedule-round-matches">
                    ${filteredMatches.map(match => {
            const team1Names = match.team1.map(id => {
                const p = state.players.find(pl => pl.id === id);
                return p ? escapeHtml(p.name) : 'Unknown';
            }).join(' & ');

            const team2Names = match.team2.map(id => {
                const p = state.players.find(pl => pl.id === id);
                return p ? escapeHtml(p.name) : 'Unknown';
            }).join(' & ');

            return `
                            <div class="schedule-match">
                                <span class="schedule-match-status ${match.status}"></span>
                                <div class="schedule-match-teams">
                                    <span class="schedule-match-team">${team1Names}</span>
                                    <span class="schedule-match-team">${team2Names}</span>
                                </div>
                                ${match.court ? `<span class="schedule-match-court">Court ${match.court}</span>` : ''}
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function toggleRound(element) {
    element.classList.toggle('collapsed');
}

function filterSchedule(value) {
    renderSchedule();
}

function updateStats() {
    document.getElementById('currentRound').textContent = state.currentRound;
    document.getElementById('totalRounds').textContent = state.rounds.length;

    const totalMatches = state.matches.length;
    const completedMatches = state.matches.filter(m => m.status === 'completed').length;
    const pendingMatches = state.matchQueue.length + state.currentMatches.length;
    const restingPlayers = state.players.filter(p => !p.isPlaying).length;

    document.getElementById('totalMatches').textContent = totalMatches;
    document.getElementById('completedMatches').textContent = completedMatches;
    document.getElementById('pendingMatches').textContent = pendingMatches;
    document.getElementById('restingPlayers').textContent = restingPlayers;
}

// ============================================
// Data Management
// ============================================

function exportData() {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `badminton-schedule-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showToast('ส่งออกข้อมูลเรียบร้อย', 'success');
}

function importData() {
    document.getElementById('importModal').classList.add('show');
}

function doImport() {
    const textarea = document.getElementById('importData');
    const data = textarea.value.trim();

    if (!data) {
        showToast('กรุณาใส่ข้อมูล', 'error');
        return;
    }

    try {
        const parsed = JSON.parse(data);

        if (!parsed.players || !Array.isArray(parsed.players)) {
            throw new Error('Invalid data format');
        }

        Object.assign(state, parsed);
        saveToStorage();
        closeModal('importModal');
        textarea.value = '';

        initializeUI();
        renderAll();
        showToast('นำเข้าข้อมูลเรียบร้อย', 'success');
    } catch (e) {
        showToast('รูปแบบข้อมูลไม่ถูกต้อง', 'error');
    }
}

function resetAll() {
    if (!confirm('ต้องการล้างข้อมูลทั้งหมด? การดำเนินการนี้ไม่สามารถย้อนกลับได้')) {
        return;
    }

    state.players = [];
    state.matches = [];
    state.currentMatches = [];
    state.matchQueue = [];
    state.rounds = [];
    state.currentRound = 0;
    state.settings = {
        matchType: 'doubles',
        pairingMode: 'random',
        courtCount: 2,
        multiCourt: false
    };

    saveToStorage();
    initializeUI();
    renderAll();
    showToast('ล้างข้อมูลเรียบร้อย', 'info');
}

// ============================================
// Modal Functions
// ============================================

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

function showPlayerStats() {
    const modal = document.getElementById('playerStatsModal');
    const content = document.getElementById('playerStatsContent');

    const sortedPlayers = [...state.players].sort((a, b) => b.matchCount - a.matchCount);

    content.innerHTML = `
        <table class="player-stats-table">
            <thead>
                <tr>
                    <th>อันดับ</th>
                    <th>ผู้เล่น</th>
                    <th>ระดับ</th>
                    <th>จำนวนแมตช์</th>
                </tr>
            </thead>
            <tbody>
                ${sortedPlayers.map((player, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${escapeHtml(player.name)}</td>
                        <td>${LEVEL_LABELS[player.level]}</td>
                        <td>${player.matchCount}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    modal.classList.add('show');
}

function showPairingInfo() {
    document.getElementById('pairingInfoModal').classList.add('show');
}

function showMultiCourtInfo() {
    document.getElementById('multiCourtInfoModal').classList.add('show');
}

// ============================================
// Score & Timer Functions
// ============================================

let timerInterval = null;

function startTimers() {
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        state.currentMatches.forEach(match => {
            const timerEl = document.getElementById(`timer-${match.id}`);
            if (timerEl && match.startedAt) {
                const elapsed = Math.floor((Date.now() - new Date(match.startedAt).getTime()) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        });
    }, 1000);
}

function openScoreModal(matchId) {
    const match = state.currentMatches.find(m => m.id === matchId) ||
        state.matches.find(m => m.id === matchId);
    if (!match) return;

    const team1Names = match.team1.map(id => {
        const p = state.players.find(pl => pl.id === id);
        return p ? p.name : 'Unknown';
    }).join(' & ');

    const team2Names = match.team2.map(id => {
        const p = state.players.find(pl => pl.id === id);
        return p ? p.name : 'Unknown';
    }).join(' & ');

    document.getElementById('scoreTeam1Label').textContent = team1Names;
    document.getElementById('scoreTeam2Label').textContent = team2Names;
    document.getElementById('scoreMatchId').value = matchId;

    // Reset score inputs
    ['score1Set1', 'score1Set2', 'score1Set3', 'score2Set1', 'score2Set2', 'score2Set3'].forEach(id => {
        document.getElementById(id).value = match.scores?.[id] || 0;
    });

    document.getElementById('scoreModal').classList.add('show');
}

function saveScore() {
    const matchId = document.getElementById('scoreMatchId').value;
    const matchIndex = state.currentMatches.findIndex(m => m.id === matchId);

    if (matchIndex === -1) {
        showToast('ไม่พบแมตช์นี้', 'error');
        return;
    }

    const scores = {
        score1Set1: parseInt(document.getElementById('score1Set1').value) || 0,
        score1Set2: parseInt(document.getElementById('score1Set2').value) || 0,
        score1Set3: parseInt(document.getElementById('score1Set3').value) || 0,
        score2Set1: parseInt(document.getElementById('score2Set1').value) || 0,
        score2Set2: parseInt(document.getElementById('score2Set2').value) || 0,
        score2Set3: parseInt(document.getElementById('score2Set3').value) || 0
    };

    // Calculate winner
    let team1Wins = 0;
    let team2Wins = 0;

    if (scores.score1Set1 > scores.score2Set1) team1Wins++;
    else if (scores.score2Set1 > scores.score1Set1) team2Wins++;

    if (scores.score1Set2 > scores.score2Set2) team1Wins++;
    else if (scores.score2Set2 > scores.score1Set2) team2Wins++;

    if (scores.score1Set3 > scores.score2Set3) team1Wins++;
    else if (scores.score2Set3 > scores.score1Set3) team2Wins++;

    const match = state.currentMatches.splice(matchIndex, 1)[0];
    match.status = 'completed';
    match.completedAt = new Date().toISOString();
    match.scores = scores;
    match.winner = team1Wins > team2Wins ? 'team1' : (team2Wins > team1Wins ? 'team2' : 'draw');

    // Update player stats
    [...match.team1, ...match.team2].forEach(playerId => {
        const player = state.players.find(p => p.id === playerId);
        if (player) {
            player.isPlaying = false;

            // Initialize win/loss stats if not exist
            if (player.wins === undefined) player.wins = 0;
            if (player.losses === undefined) player.losses = 0;

            if (match.winner === 'team1' && match.team1.includes(playerId)) {
                player.wins++;
            } else if (match.winner === 'team2' && match.team2.includes(playerId)) {
                player.wins++;
            } else if (match.winner !== 'draw') {
                player.losses++;
            }
        }
    });

    // Update the match in the main matches array
    const mainMatchIndex = state.matches.findIndex(m => m.id === matchId);
    if (mainMatchIndex !== -1) {
        state.matches[mainMatchIndex] = match;
    }

    closeModal('scoreModal');
    saveToStorage();
    renderAll();
    showToast('บันทึกคะแนนเรียบร้อย! 🏆', 'success');
}

// ============================================
// Player Rest Mode
// ============================================

function togglePlayerRest(id) {
    const player = state.players.find(p => p.id === id);
    if (!player) return;

    if (player.isPlaying) {
        showToast('ไม่สามารถพักผู้เล่นที่กำลังแข่งอยู่', 'error');
        return;
    }

    player.isResting = !player.isResting;
    saveToStorage();
    renderPlayers();
    updateStats();

    if (player.isResting) {
        showToast(`${player.name} พักผ่อน 😴`, 'info');
    } else {
        showToast(`${player.name} พร้อมแข่ง! 💪`, 'success');
    }
}

// ============================================
// Enhanced Rendering with Timer & Rest
// ============================================

// Override renderPlayers to include rest button
const originalRenderPlayers = renderPlayers;
renderPlayers = function () {
    const container = document.getElementById('playerList');
    const countEl = document.getElementById('playerCount');
    const statsEl = document.getElementById('playerStats');

    countEl.textContent = state.players.length;

    // Calculate level stats
    const levelCounts = { beginner: 0, intermediate: 0, advanced: 0, pro: 0 };
    state.players.forEach(p => levelCounts[p.level]++);

    statsEl.innerHTML = Object.entries(levelCounts)
        .filter(([_, count]) => count > 0)
        .map(([level, count]) => `
            <span class="stat-badge" style="border-left: 3px solid var(--level-${level})">${count}</span>
        `).join('');

    if (state.players.length === 0) {
        container.innerHTML = '<div class="empty-state">ยังไม่มีผู้เล่น</div>';
        return;
    }

    // Sort: playing first, then by level and name
    const sortedPlayers = [...state.players].sort((a, b) => {
        // Playing players first
        if (a.isPlaying !== b.isPlaying) return a.isPlaying ? -1 : 1;
        // Resting players last
        if (a.isResting !== b.isResting) return a.isResting ? 1 : -1;
        // Then by level
        const levelDiff = LEVEL_WEIGHTS[b.level] - LEVEL_WEIGHTS[a.level];
        if (levelDiff !== 0) return levelDiff;
        return a.name.localeCompare(b.name);
    });

    container.innerHTML = sortedPlayers.map(player => `
        <div class="player-card ${player.isPlaying ? 'playing' : ''} ${player.isResting ? 'resting' : ''}">
            <div class="player-info">
                <div class="player-avatar" style="background: var(--level-${player.level})">${player.name.charAt(0).toUpperCase()}</div>
                <div class="player-details">
                    <span class="player-name">${escapeHtml(player.name)} ${player.isResting ? '😴' : ''}</span>
                    <span class="player-level ${player.level}">${LEVEL_LABELS[player.level]}</span>
                </div>
            </div>
            <div class="player-actions">
                <span class="player-match-count" title="ชนะ/แพ้">${player.wins || 0}W ${player.losses || 0}L</span>
                <span class="player-match-count" title="จำนวนแมตช์">${player.matchCount} 🎮</span>
                <button class="player-action-btn rest ${player.isResting ? 'resting' : ''}" 
                        onclick="togglePlayerRest('${player.id}')" 
                        title="${player.isResting ? 'กลับมาแข่ง' : 'พักผ่อน'}">
                    ${player.isResting ? '💪' : '😴'}
                </button>
                <button class="player-action-btn" onclick="editPlayer('${player.id}')" title="แก้ไข">✏️</button>
                <button class="player-action-btn delete" onclick="removePlayer('${player.id}')" title="ลบ">🗑️</button>
            </div>
        </div>
    `).join('');
};

// Override renderCourts to include timer and score button
const originalRenderCourts = renderCourts;
renderCourts = function () {
    const container = document.getElementById('courtsGrid');
    const courts = [];

    for (let i = 1; i <= state.settings.courtCount; i++) {
        const currentMatch = state.currentMatches.find(m => m.court === i);
        courts.push({ number: i, match: currentMatch });
    }

    container.innerHTML = courts.map(court => {
        if (court.match) {
            const team1Names = court.match.team1.map(id => {
                const p = state.players.find(pl => pl.id === id);
                return p ? escapeHtml(p.name) : 'Unknown';
            });
            const team2Names = court.match.team2.map(id => {
                const p = state.players.find(pl => pl.id === id);
                return p ? escapeHtml(p.name) : 'Unknown';
            });

            // Calculate elapsed time
            let timerDisplay = '00:00';
            if (court.match.startedAt) {
                const elapsed = Math.floor((Date.now() - new Date(court.match.startedAt).getTime()) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                timerDisplay = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }

            return `
                <div class="court-card playing">
                    <div class="court-header">
                        <span class="court-number">🏟️ Court ${court.number}</span>
                        <span class="court-status playing">กำลังแข่ง</span>
                    </div>
                    <div class="court-players">
                        <div class="court-team">
                            <span class="court-team-label">ทีม A</span>
                            <div class="court-team-players">
                                ${team1Names.map(name => `<span class="court-player">${name}</span>`).join('')}
                            </div>
                        </div>
                        <div class="court-vs">VS</div>
                        <div class="court-team">
                            <span class="court-team-label">ทีม B</span>
                            <div class="court-team-players">
                                ${team2Names.map(name => `<span class="court-player">${name}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                    <div class="court-timer">
                        <span class="timer-icon">⏱️</span>
                        <span class="timer-value" id="timer-${court.match.id}">${timerDisplay}</span>
                    </div>
                    <div class="court-actions">
                        <button class="btn btn-primary" onclick="openScoreModal('${court.match.id}')">
                            🏆 บันทึกคะแนน
                        </button>
                        <button class="btn btn-outline" onclick="completeMatch('${court.match.id}')">
                            ✅ จบเลย
                        </button>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="court-card empty">
                    <div class="court-header">
                        <span class="court-number">🏟️ Court ${court.number}</span>
                        <span class="court-status empty">ว่าง</span>
                    </div>
                    <div class="court-empty-message">รอผู้เล่น...</div>
                </div>
            `;
        }
    }).join('');

    // Start timers if there are matches playing
    if (state.currentMatches.length > 0) {
        startTimers();
    } else if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
};

// Override generateMatches to exclude resting players
const originalGenerateMatches = generateMatches;
generateMatches = function (availablePlayers) {
    // Filter out resting players
    const activePlayers = availablePlayers.filter(p => !p.isResting);
    return originalGenerateMatches.call(this, activePlayers);
};

// Override updateStats to show resting players
const originalUpdateStats = updateStats;
updateStats = function () {
    document.getElementById('currentRound').textContent = state.currentRound;
    document.getElementById('totalRounds').textContent = state.rounds.length;

    const totalMatches = state.matches.length;
    const completedMatches = state.matches.filter(m => m.status === 'completed').length;
    const pendingMatches = state.matchQueue.length + state.currentMatches.length;
    const restingPlayers = state.players.filter(p => p.isResting || (!p.isPlaying && !p.isResting)).length;

    document.getElementById('totalMatches').textContent = totalMatches;
    document.getElementById('completedMatches').textContent = completedMatches;
    document.getElementById('pendingMatches').textContent = pendingMatches;
    document.getElementById('restingPlayers').textContent = state.players.filter(p => p.isResting).length;
};

// Enhanced showPlayerStats with win/loss
const originalShowPlayerStats = showPlayerStats;
showPlayerStats = function () {
    const modal = document.getElementById('playerStatsModal');
    const content = document.getElementById('playerStatsContent');

    const sortedPlayers = [...state.players].sort((a, b) => (b.wins || 0) - (a.wins || 0));

    const totalMatches = state.matches.filter(m => m.status === 'completed').length;
    const totalPlayers = state.players.length;
    const avgMatchesPerPlayer = totalPlayers > 0 ?
        (state.players.reduce((sum, p) => sum + p.matchCount, 0) / totalPlayers).toFixed(1) : 0;

    content.innerHTML = `
        <div class="player-stats-summary">
            <div class="stat-box">
                <div class="value">${totalMatches}</div>
                <div class="label">แมตช์ที่เสร็จ</div>
            </div>
            <div class="stat-box">
                <div class="value">${totalPlayers}</div>
                <div class="label">ผู้เล่นทั้งหมด</div>
            </div>
            <div class="stat-box">
                <div class="value">${avgMatchesPerPlayer}</div>
                <div class="label">เฉลี่ย/คน</div>
            </div>
        </div>
        <table class="player-stats-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>ผู้เล่น</th>
                    <th>ระดับ</th>
                    <th>แมตช์</th>
                    <th>ชนะ</th>
                    <th>แพ้</th>
                    <th>%</th>
                </tr>
            </thead>
            <tbody>
                ${sortedPlayers.map((player, index) => {
        const wins = player.wins || 0;
        const losses = player.losses || 0;
        const total = wins + losses;
        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

        return `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${escapeHtml(player.name)}</td>
                            <td>${LEVEL_LABELS[player.level]}</td>
                            <td>${player.matchCount}</td>
                            <td class="win">${wins}</td>
                            <td class="loss">${losses}</td>
                            <td>${winRate}%</td>
                        </tr>
                    `;
    }).join('')}
            </tbody>
        </table>
    `;

    modal.classList.add('show');
};

// ============================================
// Utility Functions
// ============================================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastSlide 0.3s ease reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================
// Bulk Add Players
// ============================================

function openBulkAddModal() {
    document.getElementById('bulkPlayerNames').value = '';
    document.getElementById('bulkAddModal').classList.add('show');
}

function bulkAddPlayers() {
    const textarea = document.getElementById('bulkPlayerNames');
    const level = document.getElementById('bulkPlayerLevel').value;
    const names = textarea.value.split('\n').map(n => n.trim()).filter(n => n.length > 0);

    if (names.length === 0) {
        showToast('กรุณาใส่ชื่อผู้เล่น', 'error');
        return;
    }

    let addedCount = 0;
    let skippedCount = 0;

    names.forEach(name => {
        // Check for duplicates
        if (state.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
            skippedCount++;
            return;
        }

        const player = {
            id: generateId(),
            name: name,
            level: level,
            matchCount: 0,
            wins: 0,
            losses: 0,
            isPlaying: false,
            isResting: false,
            createdAt: new Date().toISOString()
        };

        state.players.push(player);
        addedCount++;
    });

    saveToStorage();
    closeModal('bulkAddModal');
    renderPlayers();
    updateStats();

    let msg = `เพิ่ม ${addedCount} คนเรียบร้อย`;
    if (skippedCount > 0) {
        msg += ` (ข้าม ${skippedCount} ชื่อซ้ำ)`;
    }
    showToast(msg, 'success');
}

// ============================================
// Print Schedule
// ============================================

function printSchedule() {
    // Prepare a print-friendly view
    const printContent = generatePrintContent();

    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>ตารางแข่งแบดมินตัน</title>
            <link href="https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600&display=swap" rel="stylesheet">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Prompt', sans-serif; 
                    padding: 20px;
                    background: white;
                }
                h1 { text-align: center; margin-bottom: 20px; }
                h2 { margin: 20px 0 10px; border-bottom: 2px solid #333; padding-bottom: 5px; }
                .info { margin-bottom: 20px; padding: 10px; background: #f5f5f5; border-radius: 8px; }
                .match { 
                    display: flex; 
                    padding: 10px; 
                    margin: 5px 0;
                    background: #fafafa;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                }
                .match-num { width: 30px; font-weight: bold; }
                .match-teams { flex: 1; }
                .match-status { width: 80px; text-align: right; }
                .player-list { columns: 3; column-gap: 20px; }
                .player { padding: 5px 0; border-bottom: 1px solid #eee; }
                .level-badge { 
                    display: inline-block;
                    width: 12px; height: 12px;
                    border-radius: 50%;
                    margin-right: 5px;
                }
                .level-beginner { background: #00b894; }
                .level-intermediate { background: #fdcb6e; }
                .level-advanced { background: #e17055; }
                .level-pro { background: #d63031; }
                @media print {
                    body { padding: 0; }
                    button { display: none; }
                }
            </style>
        </head>
        <body>
            <h1>🏸 ตารางแข่งแบดมินตัน</h1>
            <div class="info">
                <strong>วันที่:</strong> ${new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}<br>
                <strong>ประเภท:</strong> ${state.settings.matchType === 'doubles' ? 'คู่' : 'เดี่ยว'} | 
                <strong>คอร์ท:</strong> ${state.settings.courtCount} | 
                <strong>ผู้เล่น:</strong> ${state.players.length} คน |
                <strong>แมทช์:</strong> ${state.matches.length}
            </div>
            ${printContent}
            <button onclick="window.print()" style="position:fixed;bottom:20px;right:20px;padding:10px 20px;font-size:16px;cursor:pointer;">🖨️ Print</button>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function generatePrintContent() {
    let html = '';

    // Players list
    html += '<h2>👥 รายชื่อผู้เล่น</h2><div class="player-list">';
    state.players.forEach((p, i) => {
        html += `<div class="player"><span class="level-badge level-${p.level}"></span>${i + 1}. ${escapeHtml(p.name)}</div>`;
    });
    html += '</div>';

    // Schedule by round
    html += '<h2>📅 ตารางการแข่ง</h2>';
    state.rounds.forEach(round => {
        html += `<h3 style="margin-top:15px;">รอบที่ ${round.roundNumber}</h3>`;
        const roundMatches = state.matches.filter(m => m.roundId === round.id);
        roundMatches.forEach((match, i) => {
            const team1 = match.team1.map(id => {
                const p = state.players.find(pl => pl.id === id);
                return p ? p.name : '?';
            }).join(' & ');
            const team2 = match.team2.map(id => {
                const p = state.players.find(pl => pl.id === id);
                return p ? p.name : '?';
            }).join(' & ');
            const status = match.status === 'completed' ? '✅' : (match.status === 'playing' ? '▶️' : '⏳');

            html += `<div class="match">
                <span class="match-num">${i + 1}</span>
                <span class="match-teams">${team1} vs ${team2}</span>
                <span class="match-status">${status}</span>
            </div>`;
        });
    });

    return html;
}

// ============================================
// Player History
// ============================================

function showPlayerHistory(playerId) {
    const player = state.players.find(p => p.id === playerId);
    if (!player) return;

    const playerMatches = state.matches.filter(m =>
        m.status === 'completed' &&
        (m.team1.includes(playerId) || m.team2.includes(playerId))
    );

    const modal = document.getElementById('playerHistoryModal');
    const content = document.getElementById('playerHistoryContent');

    content.innerHTML = `
        <div class="history-player-header">
            <div class="history-player-avatar" style="background: var(--level-${player.level})">${player.name.charAt(0).toUpperCase()}</div>
            <div class="history-player-info">
                <h3>${escapeHtml(player.name)}</h3>
                <p>${LEVEL_LABELS[player.level]} | ${player.matchCount} แมทช์ | ${player.wins || 0}W ${player.losses || 0}L</p>
            </div>
        </div>
        <div class="history-match-list">
            ${playerMatches.length === 0 ? '<div class="empty-state">ยังไม่มีประวัติการแข่ง</div>' :
            playerMatches.map(match => {
                const isTeam1 = match.team1.includes(playerId);
                const playerTeam = isTeam1 ? match.team1 : match.team2;
                const opponentTeam = isTeam1 ? match.team2 : match.team1;
                const isWinner = (match.winner === 'team1' && isTeam1) || (match.winner === 'team2' && !isTeam1);

                const teammates = playerTeam.filter(id => id !== playerId).map(id => {
                    const p = state.players.find(pl => pl.id === id);
                    return p ? p.name : '?';
                });

                const opponents = opponentTeam.map(id => {
                    const p = state.players.find(pl => pl.id === id);
                    return p ? p.name : '?';
                });

                return `
                    <div class="history-match ${isWinner ? 'win' : 'loss'}">
                        <div class="history-match-teams">
                            ${teammates.length > 0 ? `คู่: ${teammates.join(', ')} | ` : ''}
                            vs ${opponents.join(' & ')}
                        </div>
                        <span class="history-match-result ${isWinner ? 'win' : 'loss'}">
                            ${isWinner ? '🏆 ชนะ' : '❌ แพ้'}
                        </span>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    modal.classList.add('show');
}

// ============================================
// Shuffle Queue
// ============================================

function shuffleQueue() {
    if (state.matchQueue.length < 2) {
        showToast('ต้องมีอย่างน้อย 2 แมทช์ในคิวเพื่อสับเปลี่ยน', 'info');
        return;
    }

    state.matchQueue = shuffleArray(state.matchQueue);
    saveToStorage();
    renderQueue();
    showToast('สับเปลี่ยนคิวเรียบร้อย', 'success');
}

// Close modals when clicking outside
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('show');
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    }
});
