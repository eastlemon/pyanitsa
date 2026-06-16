import './style.css';
import './leaderboard.css';
import type { GameState, Card, BattleResult, GameMode } from './engine';
import { newGame, playTurn, peekCard, warStep, getPlayerCardCount, getAiCardCount, RANKS, SUITS } from './engine';
import type { WarStepResult } from './engine';
import { cardImageURL, cardBackURL } from './cards';
import { loadScores, saveScore } from './leaderboard';

// === DOM ===
const playerCount = document.getElementById('player-count')!;
const aiCount = document.getElementById('ai-count')!;
const playerDeck = document.getElementById('player-deck')!;
const aiDeck = document.getElementById('ai-deck')!;
const tablePlayer = document.getElementById('table-player')!;
const tableAi = document.getElementById('table-ai')!;
const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
const roundLabel = document.getElementById('round-label')!;
const tableEl = document.getElementById('table')!;
const peekBtn = document.getElementById('peek-btn') as HTMLButtonElement;
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
let state: GameState = newGame();
let animating = false;
let scoreSaved = false;

// === MODE SELECTION ===
document.getElementById('mode-classic')!.addEventListener('click', () => startGame('classic'));
document.getElementById('mode-preview')!.addEventListener('click', () => startGame('preview'));

function startGame(mode: GameMode) {
  state = newGame(mode);
  scoreSaved = false;
  modeScreen.style.display = 'none';
  board.style.display = 'flex';
  clearTable();
  updatePeekUI();
  renderState();
}

// === CARD ELEMENTS ===
function createCardEl(card: Card): HTMLElement {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.cardId = card.id;
  el.innerHTML = `<div class="card-face" style="background-image:url('${getFaceURL(card)}'), url('${cardBackURL()}');background-size:cover;"></div>`;
  return el;
}

function createBackEl(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `<div class="card-face" style="background-image:url('${cardBackURL()}');background-size:cover;"></div>`;
  return el;
}

// === RENDER ===
function renderState() {
  playerCount.textContent = String(getPlayerCardCount(state));
  aiCount.textContent = String(getAiCardCount(state));
  roundLabel.textContent = `Раунд ${state.round}`;

  playerDeck.style.display = getPlayerCardCount(state) > 0 ? 'block' : 'none';
  aiDeck.style.display = getAiCardCount(state) > 0 ? 'block' : 'none';

  if (state.status === 'gameover') {
    showGameOver();
    return;
  }

  playBtn.disabled = animating;

  // Кнопка меняется в зависимости от статуса
  if (state.status === 'war-hidden') {
    playBtn.textContent = '🔒 Положить закрытую';
  } else if (state.status === 'war-face') {
    playBtn.textContent = '⚔️ Открыть!';
  } else if (state.mode === 'preview') {
    playBtn.textContent = 'Играть!';
  } else {
    playBtn.textContent = 'Класть!';
  }

  updatePeekUI();
}

function updatePeekUI() {
  // Подсмотр только в режиме preview и только в статусе peeking
  if (state.mode !== 'preview' || state.status !== 'peeking') {
    peekBtn.style.display = 'none';
    peekInfo.style.display = 'none';
    return;
  }

  peekBtn.style.display = '';
  peekInfo.style.display = '';

  const remaining = state.maxPeeks - state.playerPeekCount;
  peekBtn.disabled = animating || remaining <= 0;
  peekBtn.textContent = `👁 Подсмотреть (${remaining})`;

  if (state.playerPeeked.length > 0) {
    const last = state.playerPeeked[state.playerPeeked.length - 1];
    peekInfo.innerHTML = `Текущая карта: <strong>${last.rank}${last.suit}</strong> · Ставка: ${state.playerPeeked.length} карт${state.playerPeeked.length > 1 ? 'ы' : 'а'}`;
  } else {
    peekInfo.textContent = 'Подсмотри верхнюю карту перед боем';
  }
}

function clearTable() {
  tablePlayer.innerHTML = '';
  tableAi.innerHTML = '';
}

// === PEEK ===
peekBtn.addEventListener('click', async () => {
  if (animating) return;
  const newState = peekCard(state);
  if (!newState) return;
  state = newState;

  animating = true;
  peekBtn.disabled = true;
  playBtn.disabled = true;

  const lastCard = state.playerPeeked[state.playerPeeked.length - 1];
  const cardEl = createCardEl(lastCard);
  cardEl.classList.add('dealt-player');
  tablePlayer.appendChild(cardEl);

  await sleep(1500);

  cardEl.style.transition = 'all 0.3s ease';
  cardEl.style.transform = 'scale(0.5)';
  cardEl.style.opacity = '0';
  await sleep(300);
  tablePlayer.innerHTML = '';

  animating = false;
  renderState();
});

// === PLAY / WAR BUTTON ===
playBtn.addEventListener('click', async () => {
  if (animating) return;

  // === WAR MODE ===
  if (state.status === 'war-hidden' || state.status === 'war-face') {
    await doWarStep();
    return;
  }

  // === NORMAL PLAY ===
  // Убираем старые карты
  const oldCards = tableEl.querySelectorAll('.card, .battle-result');
  oldCards.forEach((c) => {
    const el = c as HTMLElement;
    el.style.transition = 'opacity 0.2s ease';
    el.style.opacity = '0';
  });
  await sleep(200);
  clearTable();

  state = playTurn(state);

  if (state.lastResult) {
    await animateBattle(state.lastResult);
  }

  // Если после боя начался спор — не очищаем карты, они остаются
  if (state.status === 'war-hidden') {
    showWarBanner();
    await sleep(800);
  }

  renderState();
});

// === WAR STEP ANIMATION ===
async function doWarStep() {
  animating = true;
  playBtn.disabled = true;

  if (state.status === 'war-hidden') {
    // Игрок кладёт закрытую карту (рубашкой) — первым
    const pBack = createBackEl();
    pBack.classList.add('dealt-player');
    tablePlayer.appendChild(pBack);
    await sleep(400);

    const aBack = createBackEl();
    aBack.classList.add('dealt-ai');
    tableAi.appendChild(aBack);

    state = warStep(state).state; // переходим в war-face

    await sleep(500);
    animating = false;
    renderState();
    return;
  }

  // war-face: кладём рубашки, потом переворачиваем
  const pBack = createBackEl();
  pBack.classList.add('dealt-player');
  tablePlayer.appendChild(pBack);
  await sleep(400);

  const aBack = createBackEl();
  aBack.classList.add('dealt-ai');
  tableAi.appendChild(aBack);

  await sleep(300);

  const wr: WarStepResult = warStep(state);
  state = wr.state;

  // Переворот — меняем рубашки на открытые карты
  pBack.style.transition = 'transform 0.15s ease';
  aBack.style.transition = 'transform 0.15s ease';
  pBack.style.transform = 'scaleX(0)';
  aBack.style.transform = 'scaleX(0)';
  await sleep(150);

  if (wr.revealedCards) {
    pBack.innerHTML = `<div class="card-face" style="background-image:url('${getFaceURL(wr.revealedCards.player)}'), url('${cardBackURL()}');background-size:cover;"></div>`;
    aBack.innerHTML = `<div class="card-face" style="background-image:url('${getFaceURL(wr.revealedCards.ai)}'), url('${cardBackURL()}');background-size:cover;"></div>`;
    pBack.style.transform = 'scaleX(1)';
    aBack.style.transform = 'scaleX(1)';
  }

  await sleep(800);

  if (wr.outcome === 'war-continues') {
    showWarBanner();
    await sleep(800);
    animating = false;
    renderState();
    return;
  }

  if (wr.outcome === 'war-won' || wr.outcome === 'gameover') {
    const resultText = document.createElement('div');
    resultText.className = 'battle-result';
    resultText.textContent = wr.winner === 'player' ? '+' : '−';
    resultText.style.color = wr.winner === 'player' ? '#4fc3f7' : '#ff7043';
    tableEl.appendChild(resultText);
    await sleep(1000);

    tableEl.querySelectorAll('.card').forEach((c) => c.classList.add('fading'));
    await sleep(300);
    clearTable();
  }

  animating = false;
  renderState();
}

// === BATTLE ANIMATION (normal, non-war) ===
async function animateBattle(result: BattleResult) {
  animating = true;
  playBtn.disabled = true;
  peekBtn.disabled = true;

  // AI peek animation (if any)
  if (result.aiPeeked && result.aiPeeked.length > 0) {
    for (let i = 0; i < result.aiPeeked.length; i++) {
      const aiPeekCard = createCardEl(result.aiPeeked[i]);
      aiPeekCard.classList.add('dealt-ai');
      tableAi.innerHTML = '';
      tableAi.appendChild(aiPeekCard);

      const thinkText = document.createElement('div');
      thinkText.className = 'battle-result';
      thinkText.style.color = '#ff7043';
      thinkText.textContent = '🤔 Бот смотрит...';
      tableEl.appendChild(thinkText);
      await sleep(900);
      thinkText.remove();

      aiPeekCard.style.transition = 'all 0.3s ease';
      aiPeekCard.style.transform = 'scale(0.5)';
      aiPeekCard.style.opacity = '0';
      await sleep(300);
    }
    tableAi.innerHTML = '';
  }

  const playerStakeCount = result.playerPeeked ? result.playerPeeked.length - 1 : 0;
  const aiStakeCount = result.aiPeeked ? result.aiPeeked.length - 1 : 0;

  // Main cards — player first, then AI
  const pCard = createCardEl(result.playerCard);
  pCard.classList.add('dealt-player');
  tablePlayer.appendChild(pCard);
  await sleep(500);

  const aCard = createCardEl(result.aiCard);
  aCard.classList.add('dealt-ai');
  tableAi.appendChild(aCard);
  await sleep(800);

  if (playerStakeCount > 0 || aiStakeCount > 0) {
    const stakeText = document.createElement('div');
    stakeText.className = 'battle-result';
    stakeText.style.color = '#d4af37';
    stakeText.textContent = `Ставка: ${playerStakeCount + aiStakeCount} карт`;
    tableEl.appendChild(stakeText);
    await sleep(700);
    stakeText.remove();
  }

  // Если начался спор — карты остаются на столе, не убираем
  if (result.winner === 'war') {
    // Спор — оставляем карты для визуала
    animating = false;
    return;
  }

  // Результат
  const resultText = document.createElement('div');
  resultText.className = 'battle-result';
  if (result.winner === 'player') {
    resultText.textContent = result.pile.length > 2 ? `+${result.pile.length}` : '+';
    resultText.style.color = '#4fc3f7';
  } else {
    resultText.textContent = result.pile.length > 2 ? `−${result.pile.length}` : '−';
    resultText.style.color = '#ff7043';
  }
  tableEl.appendChild(resultText);
  await sleep(1000);

  tableEl.querySelectorAll('.card').forEach((c) => c.classList.add('fading'));
  await sleep(300);
  clearTable();

  animating = false;
  renderState();
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
  peekBtn.style.display = 'none';

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
    state = newGame(state.mode);
    scoreSaved = false;
    clearTable();
    renderState();
  });

  document.getElementById('menu-btn')!.addEventListener('click', () => {
    overlay.remove();
    playBtn.style.display = '';
    board.style.display = 'none';
    modeScreen.style.display = 'flex';
    state = newGame(state.mode);
    scoreSaved = false;
    clearTable();
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
