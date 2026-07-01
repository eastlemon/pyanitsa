import './style.css';
import './leaderboard.css';
import type { GameState, Card, BattleResult } from './engine';
import { newGame, playTurn, peekCard, warStep, getPlayerCardCount, getAiCardCount, RANKS, SUITS } from './engine';
import type { WarStepResult } from './engine';
import { cardImageURL, cardBackURL } from './cards';
import { loadScores, saveScore } from './leaderboard';

// === DOM ===
const playerCount = document.getElementById('player-count')!;
const aiCount = document.getElementById('ai-count')!;
const playerDeckEl = document.getElementById('player-deck')!;
const aiDeckEl = document.getElementById('ai-deck')!;
const tablePlayer = document.getElementById('table-player')!;
const tableAi = document.getElementById('table-ai')!;
const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
const roundLabel = document.getElementById('round-label')!;
const deckBadge = document.getElementById('deck-badge')!;
const peekInfo = document.getElementById('peek-info')!;
const board = document.getElementById('board')!;
const modeScreen = document.getElementById('mode-screen')!;

// === IMAGE CACHE + PRELOAD ===
const faceCache = new Map<string, string>();
const preloaded = new Set<string>();

function getFaceURL(card: Card): string {
  if (!faceCache.has(card.id)) faceCache.set(card.id, cardImageURL(card.rank, card.suit));
  return faceCache.get(card.id)!;
}

function preloadAllCards(): Promise<void> {
  const urls = new Set<string>();
  urls.add(cardBackURL());
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      urls.add(cardImageURL(rank, suit));
    }
  }
  return Promise.all([...urls].map(url => {
    if (preloaded.has(url)) return Promise.resolve();
    preloaded.add(url);
    return new Promise<void>(resolve => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
    });
  })).then(() => undefined);
}

preloadAllCards();

// === STATE ===
let state: GameState = newGame('preview');
let animating = false;
let scoreSaved = false;

// === START IMMEDIATELY IN PREVIEW MODE ===
modeScreen.style.display = 'none';
board.style.display = 'flex';
clearTable();
renderState();

// === CARD ELEMENTS ===
function createCardEl(card: Card): HTMLElement {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.cardId = card.id;
  el.innerHTML = `<div class="card-face" style="background-image:url('${getFaceURL(card)}'), url('${cardBackURL()}');background-size:cover;"></div>`;
  return el;
}

// === RENDER ===
function renderState() {
  playerCount.textContent = String(getPlayerCardCount(state));
  aiCount.textContent = String(getAiCardCount(state));
  roundLabel.textContent = `Раунд ${state.round}`;

  playerDeckEl.style.display = getPlayerCardCount(state) > 0 ? 'block' : 'none';
  aiDeckEl.style.display = getAiCardCount(state) > 0 ? 'block' : 'none';

  if (state.status === 'gameover') {
    showGameOver();
    return;
  }

  playBtn.disabled = animating;

  if (state.status === 'war') {
    playBtn.textContent = '⚔️ Ещё!';
  } else if (state.mode === 'preview') {
    playBtn.textContent = 'Играть!';
  } else {
    playBtn.textContent = 'Класть!';
  }

  const canPeek = state.mode === 'preview' && state.status === 'peeking'
    && state.playerPeekCount < state.maxPeeks && !animating;
  playerDeckEl.classList.toggle('deck-active', canPeek);

  if (state.mode === 'preview' && state.status === 'peeking') {
    const remaining = state.maxPeeks - state.playerPeekCount;
    deckBadge.textContent = remaining > 0 ? String(remaining) : '';
    deckBadge.style.display = remaining > 0 ? 'flex' : 'none';
  } else {
    deckBadge.style.display = 'none';
  }

  if (state.mode === 'preview' && state.status === 'peeking' && state.playerPeeked.length > 0) {
    const last = state.playerPeeked[state.playerPeeked.length - 1];
    peekInfo.innerHTML = `Карта: <strong>${last.rank}${last.suit}</strong> · Ставка: ${state.playerPeeked.length}`;
    peekInfo.style.display = '';
  } else if (state.mode === 'preview' && state.status === 'peeking') {
    peekInfo.textContent = 'Тапни по колоде — подсмотри карту';
    peekInfo.style.display = '';
  } else {
    peekInfo.style.display = 'none';
  }
}

function clearTable() {
  tablePlayer.innerHTML = '';
  tableAi.innerHTML = '';
}

// === DECK CLICK = PEEK ===
playerDeckEl.addEventListener('click', async () => {
  if (animating) return;
  if (state.mode !== 'preview' || state.status !== 'peeking') return;
  if (state.playerPeekCount >= state.maxPeeks) return;

  const newState = peekCard(state);
  if (!newState) return;
  state = newState;

  animating = true;

  const lastCard = state.playerPeeked[state.playerPeeked.length - 1];
  const cardEl = createCardEl(lastCard);
  cardEl.classList.add('dealt-player');
  tablePlayer.appendChild(cardEl);

  await sleep(400);

  animating = false;
  renderState();
});

// === PLAY BUTTON ===
playBtn.addEventListener('click', async () => {
  if (animating) return;

  // === WAR ===
  if (state.status === 'war') {
    await doWarStep();
    return;
  }

  // === NORMAL PLAY ===
  clearTable();

  state = playTurn(state);

  if (state.lastResult) {
    await animateBattle(state.lastResult);
  }

  if (state.status === 'war') {
    showWarBanner();
    await sleep(800);
    animating = false;
    renderState();
    return;
  }

  // Карты исчезают через 2 секунды — блокируем ввод
  await sleep(2000);
  clearTable();
  animating = false;
  renderState();
});

// === WAR STEP — по одной карте каждому ===
async function doWarStep() {
  animating = true;
  playBtn.disabled = true;

  const wr: WarStepResult = warStep(state);
  state = wr.state;

  if (wr.outcome === 'gameover') {
    animating = false;
    renderState();
    return;
  }

  if (wr.revealedCards) {
    const pCard = createCardEl(wr.revealedCards.player);
    pCard.classList.add('dealt-player');
    tablePlayer.appendChild(pCard);
    await sleep(400);

    const aCard = createCardEl(wr.revealedCards.ai);
    aCard.classList.add('dealt-ai');
    tableAi.appendChild(aCard);
    await sleep(600);
  }

  if (wr.outcome === 'war-continues') {
    showWarBanner();
    await sleep(800);
    animating = false;
    renderState();
    return;
  }

  // Спор разрешён — ждём 2 сек, чистим стол
  await sleep(2000);
  clearTable();
  animating = false;
  renderState();
}

// === BATTLE ANIMATION ===
async function animateBattle(result: BattleResult) {
  // Ставки игрока
  if (result.playerPeeked && result.playerPeeked.length > 1) {
    for (let i = 0; i < result.playerPeeked.length - 1; i++) {
      const stakeCard = createCardEl(result.playerPeeked[i]);
      stakeCard.classList.add('dealt-player');
      tablePlayer.appendChild(stakeCard);
    }
    await sleep(300);
  }

  // Основная карта игрока
  const pCard = createCardEl(result.playerCard);
  pCard.classList.add('dealt-player');
  tablePlayer.appendChild(pCard);
  await sleep(500);

  // Бот
  if (result.aiPeeked && result.aiPeeked.length > 0) {
    for (let i = 0; i < result.aiPeeked.length; i++) {
      const aiPeekCard = createCardEl(result.aiPeeked[i]);
      aiPeekCard.classList.add('dealt-ai');
      tableAi.appendChild(aiPeekCard);
      await sleep(500);
    }
  } else {
    const aCard = createCardEl(result.aiCard);
    aCard.classList.add('dealt-ai');
    tableAi.appendChild(aCard);
    await sleep(500);
  }
}

function showWarBanner() {
  const banner = document.createElement('div');
  banner.className = 'war-banner';
  banner.textContent = 'СПОР!';
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 800);
}

// === GAME OVER ===
function showGameOver() {
  if (scoreSaved) return;
  scoreSaved = true;

  const isWin = state.winner === 'player';
  playBtn.style.display = 'none';

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'gameover-overlay';
  overlay.innerHTML = `
    <div class="overlay-content">
      <div class="overlay-title ${isWin ? 'win' : 'lose'}">${isWin ? 'ПОБЕДА!' : 'Поражение'}</div>
      <p style="opacity:0.7; font-size:1.1rem;">Раундов: ${state.round}</p>
      <button class="btn-play" id="new-game-btn">Ещё раз!</button>
      <button class="btn-play" id="menu-btn" style="background:rgba(255,255,255,0.1);color:#f0f0f0;margin-top:0.5rem;">Меню</button>
    </div>`;

  document.body.appendChild(overlay);

  document.getElementById('new-game-btn')!.addEventListener('click', () => {
    overlay.remove();
    playBtn.style.display = '';
    state = newGame('preview');
    scoreSaved = false;
    clearTable();
    renderState();
  });

  document.getElementById('menu-btn')!.addEventListener('click', () => {
    overlay.remove();
    playBtn.style.display = '';
    state = newGame('preview');
    scoreSaved = false;
    clearTable();
    renderState();
  });

  setTimeout(() => promptNameAndSave(state.round, isWin), 800);
}

// === LEADERBOARD ===
function getPlayerName(): string { return localStorage.getItem('pyanitsa_player') || ''; }
function setPlayerName(name: string) { localStorage.setItem('pyanitsa_player', name); }

function injectScoreboard() {
  const sbBtn = document.createElement('button');
  sbBtn.className = 'sb-btn';
  sbBtn.textContent = '🏆';
  sbBtn.title = 'Топ игроков';
  sbBtn.addEventListener('click', () => showScoreboardModal());
  document.body.appendChild(sbBtn);
}

function showScoreboardModal() {
  const existing = document.getElementById('sb-modal');
  if (existing) existing.remove();

  const scores = loadScores();
  const rows = scores.length === 0
    ? '<div class="sb-empty">Пока нет записей. Сыграй партию!</div>'
    : scores.map((s, i) => `
        <div class="sb-row ${s.result}">
          <span class="sb-rank">${i + 1}</span>
          <span class="sb-name">${escapeHtml(s.name)}</span>
          <span class="sb-rounds">${s.rounds}</span>
          <span class="sb-badge">${s.result === 'win' ? '🏆' : '💀'}</span>
        </div>`).join('');

  const modal = document.createElement('div');
  modal.className = 'scoreboard';
  modal.id = 'sb-modal';
  modal.innerHTML = `
    <div class="sb-inner">
      <div class="sb-header">
        <h2>🏆 Топ игроков</h2>
        <button class="sb-close" id="sb-close-btn">✕</button>
      </div>
      <div class="sb-list">${rows}</div>
    </div>`;
  document.body.appendChild(modal);

  document.getElementById('sb-close-btn')!.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function promptNameAndSave(rounds: number, isWin: boolean) {
  const existing = document.getElementById('name-overlay');
  if (existing) existing.remove();

  const savedName = getPlayerName();
  const overlay = document.createElement('div');
  overlay.className = 'name-input-overlay';
  overlay.id = 'name-overlay';
  overlay.innerHTML = `
    <div class="name-input-box">
      <h3>${isWin ? '🎉 Победа!' : 'Игра окончена'}</h3>
      <p>Раундов: ${rounds}. Записать результат?</p>
      <input type="text" class="name-input" id="player-name-input" placeholder="Твоё имя" value="${escapeHtml(savedName)}" maxlength="20" />
      <div class="name-input-actions">
        <button class="btn-skip" id="skip-save-btn">Не сейчас</button>
        <button class="btn-save" id="save-score-btn">Сохранить</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const input = document.getElementById('player-name-input') as HTMLInputElement;
  input.focus(); input.select();

  const save = () => {
    const name = input.value.trim() || 'Аноним';
    setPlayerName(name);
    saveScore({ name, rounds, result: isWin ? 'win' : 'lose', date: new Date().toISOString() });
    overlay.remove();
    showScoreboardModal();
  };

  document.getElementById('save-score-btn')!.addEventListener('click', save);
  document.getElementById('skip-save-btn')!.addEventListener('click', () => overlay.remove());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

// === INIT ===
injectScoreboard();
