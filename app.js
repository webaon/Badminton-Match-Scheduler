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
    currentRound: 0,
    rentalTimer: {
        mode: 'duration', // 'duration' or 'endtime'
        duration: 120, // minutes (default 2 hours)
        endTime: '18:00', // end time for endtime mode
        remainingSeconds: 7200, // 2 hours in seconds
        isRunning: false,
        alertsShown: { min15: false, min10: false, min5: false },
        widgetState: 'closed' // 'closed', 'expanded', 'minimized'
    }
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
    // Set form values from state - safely check for element existence
    const courtCountEl = document.getElementById('courtCount');
    const pairingModeEl = document.getElementById('pairingMode');
    const multiCourtEl = document.getElementById('multiCourt');

    if (courtCountEl) courtCountEl.value = state.settings.courtCount;
    if (pairingModeEl) pairingModeEl.value = state.settings.pairingMode;
    if (multiCourtEl) multiCourtEl.checked = state.settings.multiCourt;

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

function toggleSettingsPanel() {
    const mainContent = document.querySelector('.main-content');
    const panel = document.querySelector('.settings-panel');
    const toggleBtn = document.getElementById('settingsToggleBtn');

    if (mainContent && panel) {
        const isHidden = panel.style.display === 'none';

        if (isHidden) {
            // Show panel
            panel.style.display = 'flex';
            mainContent.classList.remove('settings-collapsed');
            if (toggleBtn) toggleBtn.style.display = 'none';
        } else {
            // Hide panel
            panel.style.display = 'none';
            mainContent.classList.add('settings-collapsed');
            if (toggleBtn) toggleBtn.style.display = 'flex';
        }
    }
}

function showSettingsPanel() {
    const mainContent = document.querySelector('.main-content');
    const panel = document.querySelector('.settings-panel');
    const toggleBtn = document.getElementById('settingsToggleBtn');

    if (mainContent && panel) {
        panel.style.display = 'flex';
        mainContent.classList.remove('settings-collapsed');
        if (toggleBtn) toggleBtn.style.display = 'none';
    }
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

function showAddPlayerModal() {
    document.getElementById('addPlayerModal').classList.add('show');
    document.getElementById('playerName').focus();
}

function switchAddPlayerTab(mode) {
    const tabSingle = document.getElementById('tabSingle');
    const tabBulk = document.getElementById('tabBulk');
    const singleContent = document.getElementById('singleAddContent');
    const bulkContent = document.getElementById('bulkAddContent');

    if (mode === 'single') {
        tabSingle.classList.add('active');
        tabBulk.classList.remove('active');
        singleContent.style.display = 'block';
        bulkContent.style.display = 'none';
        document.getElementById('playerName').focus();
    } else {
        tabSingle.classList.remove('active');
        tabBulk.classList.add('active');
        singleContent.style.display = 'none';
        bulkContent.style.display = 'block';
        document.getElementById('bulkPlayerNames').focus();
    }
}

function addBulkPlayers() {
    const namesText = document.getElementById('bulkPlayerNames').value.trim();
    const level = document.getElementById('bulkPlayerLevel').value;

    if (!namesText) {
        showToast('กรุณากรอกรายชื่อผู้เล่น', 'error');
        return;
    }

    const names = namesText.split('\n')
        .map(name => name.trim())
        .filter(name => name.length > 0);

    if (names.length === 0) {
        showToast('กรุณากรอกรายชื่อผู้เล่น', 'error');
        return;
    }

    let addedCount = 0;
    let skippedCount = 0;

    names.forEach(name => {
        // Check for duplicate
        if (state.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
            skippedCount++;
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
        addedCount++;
    });

    if (addedCount > 0) {
        saveToStorage();
        renderPlayers();
        updateStats();
        document.getElementById('bulkPlayerNames').value = '';
    }

    if (addedCount > 0 && skippedCount > 0) {
        showToast(`เพิ่ม ${addedCount} คน, ข้าม ${skippedCount} คน (ชื่อซ้ำ)`, 'info');
    } else if (addedCount > 0) {
        showToast(`เพิ่ม ${addedCount} คนเรียบร้อย`, 'success');
    } else {
        showToast('ไม่สามารถเพิ่มได้ (ชื่อซ้ำทั้งหมด)', 'error');
    }
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

    // Set modal values
    document.getElementById('editPlayerId').value = player.id;
    document.getElementById('editPlayerName').value = player.name;
    document.getElementById('editPlayerLevel').value = player.level;

    // Show modal
    document.getElementById('editPlayerModal').classList.add('show');
}

function saveEditPlayer() {
    const id = document.getElementById('editPlayerId').value;
    const newName = document.getElementById('editPlayerName').value.trim();
    const newLevel = document.getElementById('editPlayerLevel').value;

    if (!newName) {
        showToast('กรุณากรอกชื่อผู้เล่น', 'error');
        return;
    }

    const player = state.players.find(p => p.id === id);
    if (!player) return;

    player.name = newName;
    player.level = newLevel;

    saveToStorage();
    renderPlayers();
    renderCourts();
    renderSchedule();

    closeModal('editPlayerModal');
    showToast('แก้ไขข้อมูลผู้เล่นเรียบร้อย', 'success');
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
    const countModalEl = document.getElementById('playerCountModal');
    const statsEl = document.getElementById('playerStats');
    const statsModalEl = document.getElementById('playerStatsModal');

    // Update counts in both places
    if (countEl) countEl.textContent = state.players.length;
    if (countModalEl) countModalEl.textContent = state.players.length;

    // Calculate level stats
    const levelCounts = { beginner: 0, intermediate: 0, advanced: 0, pro: 0 };
    state.players.forEach(p => levelCounts[p.level]++);

    const statsHtml = Object.entries(levelCounts)
        .filter(([_, count]) => count > 0)
        .map(([level, count]) => `
            <span class="stat-badge" style="border-left: 3px solid var(--level-${level})">${count}</span>
        `).join('');

    if (statsEl) statsEl.innerHTML = statsHtml;
    if (statsModalEl) statsModalEl.innerHTML = statsHtml;

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
            const team1Players = court.match.team1.map(id => {
                const p = state.players.find(pl => pl.id === id);
                return p ? { name: escapeHtml(p.name), level: p.level } : { name: 'Unknown', level: 'beginner' };
            });
            const team2Players = court.match.team2.map(id => {
                const p = state.players.find(pl => pl.id === id);
                return p ? { name: escapeHtml(p.name), level: p.level } : { name: 'Unknown', level: 'beginner' };
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
                                ${team1Players.map(p => `<span class="court-player level-${p.level}">${p.name}</span>`).join('')}
                            </div>
                        </div>
                        <div class="court-vs">VS</div>
                        <div class="court-team">
                            <span class="court-team-label">ทีม B</span>
                            <div class="court-team-players">
                                ${team2Players.map(p => `<span class="court-player level-${p.level}">${p.name}</span>`).join('')}
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

    // Clear interval if running
    if (rentalTimerInterval) {
        clearInterval(rentalTimerInterval);
        rentalTimerInterval = null;
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
    state.rentalTimer = {
        mode: 'duration',
        duration: 120,
        endTime: '18:00',
        remainingSeconds: 7200,
        isRunning: false,
        alertsShown: { min15: false, min10: false, min5: false },
        widgetState: 'closed'
    };

    // Clear localStorage completely
    localStorage.removeItem('badmintonScheduler');

    // Re-save fresh state
    saveToStorage();

    // Re-initialize UI
    initializeUI();
    renderAll();

    // Reset rental timer display
    if (typeof updateDurationInputs === 'function') {
        updateDurationInputs();
    }
    if (typeof updateRentalTimerDisplay === 'function') {
        updateRentalTimerDisplay();
    }
    if (typeof updateRentalTimerButtons === 'function') {
        updateRentalTimerButtons();
    }

    // Close rental timer widget
    if (typeof closeRentalTimer === 'function') {
        closeRentalTimer();
    }

    showToast('ล้างข้อมูลเรียบร้อย', 'info');
}

// ============================================
// Modal Functions
// ============================================

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

function showPlayerListModal() {
    document.getElementById('playerListModal').classList.add('show');
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

// ============================================
// Rental Timer Functions
// ============================================

let rentalTimerInterval = null;

function setRentalDuration(minutes) {
    const duration = parseInt(minutes) || 120;
    state.rentalTimer.duration = duration;
    state.rentalTimer.remainingSeconds = duration * 60;
    state.rentalTimer.alertsShown = { min15: false, min10: false, min5: false };
    updateRentalTimerDisplay();
    updateDurationInputs();
    saveToStorage();
}

function updateDurationFromInputs() {
    const hoursInput = document.getElementById('rentalDurationHours');
    const minutesInput = document.getElementById('rentalDurationMinutes');

    const hours = parseInt(hoursInput?.value) || 0;
    const minutes = parseInt(minutesInput?.value) || 0;

    const totalMinutes = (hours * 60) + minutes;
    if (totalMinutes > 0) {
        state.rentalTimer.duration = totalMinutes;
        state.rentalTimer.remainingSeconds = totalMinutes * 60;
        state.rentalTimer.alertsShown = { min15: false, min10: false, min5: false };
        updateRentalTimerDisplay();
        saveToStorage();
    }
}

function updateDurationInputs() {
    const hoursInput = document.getElementById('rentalDurationHours');
    const minutesInput = document.getElementById('rentalDurationMinutes');

    if (hoursInput && minutesInput) {
        const totalMinutes = state.rentalTimer.duration;
        hoursInput.value = Math.floor(totalMinutes / 60);
        minutesInput.value = totalMinutes % 60;
    }
}

function setRentalMode(mode) {
    state.rentalTimer.mode = mode;

    const durationBtn = document.getElementById('modeDurationBtn');
    const endTimeBtn = document.getElementById('modeEndTimeBtn');
    const durationRow = document.getElementById('durationInputRow');
    const endTimeRow = document.getElementById('endTimeInputRow');
    const endTimeLabel = document.getElementById('rentalEndTimeLabel');
    const endTimeValue = document.getElementById('rentalEndTimeValue');

    if (mode === 'duration') {
        if (durationBtn) durationBtn.classList.add('active');
        if (endTimeBtn) endTimeBtn.classList.remove('active');
        if (durationRow) durationRow.style.display = 'flex';
        if (endTimeRow) endTimeRow.style.display = 'none';
        if (endTimeLabel) endTimeLabel.style.display = 'none';
        // Recalculate from duration
        setRentalDuration(state.rentalTimer.duration);
    } else {
        if (durationBtn) durationBtn.classList.remove('active');
        if (endTimeBtn) endTimeBtn.classList.add('active');
        if (durationRow) durationRow.style.display = 'none';
        if (endTimeRow) endTimeRow.style.display = 'flex';
        if (endTimeLabel) endTimeLabel.style.display = 'block';
        if (endTimeValue) endTimeValue.textContent = state.rentalTimer.endTime;
        // Calculate from end time
        setRentalEndTime(state.rentalTimer.endTime);
    }

    saveToStorage();
}

function setRentalEndTime(timeStr) {
    state.rentalTimer.endTime = timeStr;

    const now = new Date();
    const [hours, minutes] = timeStr.split(':').map(Number);
    const endTime = new Date();
    endTime.setHours(hours, minutes, 0, 0);

    // If end time is before now, assume next day
    if (endTime <= now) {
        endTime.setDate(endTime.getDate() + 1);
    }

    const diffSeconds = Math.floor((endTime - now) / 1000);
    state.rentalTimer.remainingSeconds = Math.max(0, diffSeconds);
    state.rentalTimer.duration = Math.ceil(diffSeconds / 60);
    state.rentalTimer.alertsShown = { min15: false, min10: false, min5: false };

    updateRentalTimerDisplay();
    saveToStorage();
}

function startRentalTimer() {
    if (state.rentalTimer.isRunning) return;

    // For end time mode, recalculate remaining time before starting
    if (state.rentalTimer.mode === 'endtime') {
        recalculateEndTimeRemaining();
    }

    state.rentalTimer.isRunning = true;
    saveToStorage();
    updateRentalTimerButtons();

    rentalTimerInterval = setInterval(() => {
        // For end time mode, sync with real time every tick
        if (state.rentalTimer.mode === 'endtime') {
            recalculateEndTimeRemaining();
        } else {
            state.rentalTimer.remainingSeconds--;
        }

        if (state.rentalTimer.remainingSeconds > 0) {
            updateRentalTimerDisplay();
            checkRentalTimeAlerts();

            // Save every 30 seconds
            if (state.rentalTimer.remainingSeconds % 30 === 0) {
                saveToStorage();
            }
        } else {
            stopRentalTimer();
            onRentalTimeExpired();
        }
    }, 1000);

    showToast('เริ่มจับเวลาเช่าคอร์ท', 'success');
}

function recalculateEndTimeRemaining() {
    const now = new Date();
    const [hours, minutes] = state.rentalTimer.endTime.split(':').map(Number);
    const endTime = new Date();
    endTime.setHours(hours, minutes, 0, 0);

    // If end time is before now, assume next day
    if (endTime <= now) {
        endTime.setDate(endTime.getDate() + 1);
    }

    const diffSeconds = Math.floor((endTime - now) / 1000);
    state.rentalTimer.remainingSeconds = Math.max(0, diffSeconds);
}

function pauseRentalTimer() {
    if (!state.rentalTimer.isRunning) return;

    state.rentalTimer.isRunning = false;
    clearInterval(rentalTimerInterval);
    rentalTimerInterval = null;
    saveToStorage();
    updateRentalTimerButtons();
    showToast('หยุดจับเวลาชั่วคราว', 'info');
}

function stopRentalTimer() {
    state.rentalTimer.isRunning = false;
    clearInterval(rentalTimerInterval);
    rentalTimerInterval = null;
    updateRentalTimerButtons();
}

function resetRentalTimer() {
    stopRentalTimer();

    if (state.rentalTimer.mode === 'endtime') {
        recalculateEndTimeRemaining();
    } else {
        // In duration mode, ensure we reset to the current input values
        const hoursInput = document.getElementById('rentalDurationHours');
        const minutesInput = document.getElementById('rentalDurationMinutes');

        if (hoursInput && minutesInput) {
            const hours = parseInt(hoursInput.value) || 0;
            const minutes = parseInt(minutesInput.value) || 0;
            const totalMinutes = (hours * 60) + minutes;

            if (totalMinutes > 0) {
                state.rentalTimer.duration = totalMinutes;
            }
        }

        state.rentalTimer.remainingSeconds = state.rentalTimer.duration * 60;
    }

    state.rentalTimer.alertsShown = { min15: false, min10: false, min5: false };
    saveToStorage();
    updateRentalTimerDisplay();
    showToast('รีเซ็ตเวลาเรียบร้อย', 'info');
}

function updateRentalTimerDisplay() {
    const remaining = state.rentalTimer.remainingSeconds;
    const total = state.rentalTimer.duration * 60;

    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;

    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    const displayEl = document.getElementById('rentalTimerDisplay');
    const progressEl = document.getElementById('rentalTimerProgress');
    const containerEl = document.getElementById('rentalTimerContainer');

    if (displayEl) {
        displayEl.textContent = timeString;
    }

    if (progressEl) {
        const progressPercent = ((total - remaining) / total) * 100;
        progressEl.style.width = `${progressPercent}%`;
    }

    if (containerEl) {
        containerEl.classList.remove('warning', 'danger', 'expired');
        if (remaining === 0) {
            containerEl.classList.add('expired');
        } else if (remaining <= 300) { // 5 minutes
            containerEl.classList.add('danger');
        } else if (remaining <= 900) { // 15 minutes
            containerEl.classList.add('warning');
        }
    }
}

function updateRentalTimerButtons() {
    const startBtn = document.getElementById('rentalStartBtn');
    const pauseBtn = document.getElementById('rentalPauseBtn');

    if (startBtn && pauseBtn) {
        if (state.rentalTimer.isRunning) {
            startBtn.style.display = 'none';
            pauseBtn.style.display = 'inline-flex';
        } else {
            startBtn.style.display = 'inline-flex';
            pauseBtn.style.display = 'none';
        }
    }
}

function checkRentalTimeAlerts() {
    const remaining = state.rentalTimer.remainingSeconds;
    const alerts = state.rentalTimer.alertsShown;

    if (remaining === 900 && !alerts.min15) {
        alerts.min15 = true;
        showToast('⚠️ เหลือเวลาเช่าคอร์ท 15 นาที', 'warning');
    } else if (remaining === 600 && !alerts.min10) {
        alerts.min10 = true;
        showToast('⚠️ เหลือเวลาเช่าคอร์ท 10 นาที', 'warning');
    } else if (remaining === 300 && !alerts.min5) {
        alerts.min5 = true;
        showToast('🚨 เหลือเวลาเช่าคอร์ท 5 นาที!', 'error');
    }
}

function onRentalTimeExpired() {
    showToast('⏰ หมดเวลาเช่าคอร์ทแล้ว!', 'error');

    // Play alert sound - beep 3 times
    playAlertSound(3);
}

function playAlertSound(times = 1) {
    let count = 0;
    const playBeep = () => {
        if (count >= times) return;
        count++;

        try {
            // Create audio context for better sound
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 880; // A5 note
            oscillator.type = 'sine';
            gainNode.gain.value = 0.3;

            oscillator.start();

            // Stop after 200ms
            setTimeout(() => {
                oscillator.stop();
                audioContext.close();

                // Play next beep after 300ms pause
                if (count < times) {
                    setTimeout(playBeep, 300);
                }
            }, 200);
        } catch (e) {
            console.log('Audio not supported');
        }
    };

    playBeep();
}

function initRentalTimer() {
    // Set input values from state
    updateDurationInputs();

    const endTimeInput = document.getElementById('rentalEndTime');

    if (endTimeInput && state.rentalTimer.endTime) {
        endTimeInput.value = state.rentalTimer.endTime;
    }

    // Set mode UI
    setRentalMode(state.rentalTimer.mode || 'duration');

    // For end time mode, recalculate remaining time
    if (state.rentalTimer.mode === 'endtime' && !state.rentalTimer.isRunning) {
        recalculateEndTimeRemaining();
    }

    updateRentalTimerDisplay();
    updateRentalTimerButtons();

    // Restore widget state
    if (state.rentalTimer.widgetState === 'expanded') {
        openRentalTimer();
    } else if (state.rentalTimer.widgetState === 'minimized') {
        openRentalTimer();
        minimizeRentalTimer();
    }

    // Resume timer if it was running
    if (state.rentalTimer.isRunning) {
        state.rentalTimer.isRunning = false; // Reset so startRentalTimer works
        startRentalTimer();
    }
}

// Widget visibility functions
function openRentalTimer() {
    const widget = document.getElementById('rentalTimerWidget');
    const toggle = document.getElementById('rentalTimerToggle');
    const expanded = document.getElementById('rentalTimerExpanded');
    const mini = document.getElementById('rentalTimerMini');

    if (widget && toggle) {
        widget.classList.add('show');
        widget.classList.remove('minimized');
        toggle.classList.add('hidden');
        if (expanded) expanded.style.display = 'block';
        if (mini) mini.style.display = 'none';

        // Save widget state
        state.rentalTimer.widgetState = 'expanded';
        saveToStorage();
    }
}

function closeRentalTimer() {
    const widget = document.getElementById('rentalTimerWidget');
    const toggle = document.getElementById('rentalTimerToggle');

    if (widget && toggle) {
        widget.classList.remove('show', 'minimized');
        toggle.classList.remove('hidden');

        // Save widget state
        state.rentalTimer.widgetState = 'closed';
        saveToStorage();
    }
}

function minimizeRentalTimer() {
    const widget = document.getElementById('rentalTimerWidget');
    const expanded = document.getElementById('rentalTimerExpanded');
    const mini = document.getElementById('rentalTimerMini');

    if (widget) {
        widget.classList.add('minimized');
        if (expanded) expanded.style.display = 'none';
        if (mini) mini.style.display = 'flex';

        // Save widget state
        state.rentalTimer.widgetState = 'minimized';
        saveToStorage();
    }
}

function expandRentalTimer() {
    const widget = document.getElementById('rentalTimerWidget');
    const expanded = document.getElementById('rentalTimerExpanded');
    const mini = document.getElementById('rentalTimerMini');

    if (widget) {
        widget.classList.remove('minimized');
        if (expanded) expanded.style.display = 'block';
        if (mini) mini.style.display = 'none';

        // Save widget state
        state.rentalTimer.widgetState = 'expanded';
        saveToStorage();
    }
}

// Override updateRentalTimerDisplay to also update mini display
const originalUpdateRentalTimerDisplay = updateRentalTimerDisplay;
updateRentalTimerDisplay = function () {
    const remaining = state.rentalTimer.remainingSeconds;
    const total = state.rentalTimer.duration * 60;

    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;

    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    const displayEl = document.getElementById('rentalTimerDisplay');
    const miniDisplayEl = document.getElementById('rentalTimerMiniDisplay');
    const progressEl = document.getElementById('rentalTimerProgress');
    const containerEl = document.getElementById('rentalTimerContainer');
    const widgetEl = document.getElementById('rentalTimerWidget');
    const miniEl = document.getElementById('rentalTimerMini');

    if (displayEl) displayEl.textContent = timeString;
    if (miniDisplayEl) miniDisplayEl.textContent = timeString;

    if (progressEl) {
        const progressPercent = ((total - remaining) / total) * 100;
        progressEl.style.width = `${progressPercent}%`;
    }

    // Update status classes
    const statusClass = remaining === 0 ? 'expired' :
        remaining <= 300 ? 'danger' :
            remaining <= 900 ? 'warning' : '';

    [containerEl, widgetEl, miniEl].forEach(el => {
        if (el) {
            el.classList.remove('warning', 'danger', 'expired');
            if (statusClass) el.classList.add(statusClass);
        }
    });
};

// Initialize rental timer on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initRentalTimer, 100);
});
