import './style.css';
import './leaderboard.css';
import type { GameState, Card, BattleResult, GameMode } from './engine';
import { newGame, playTurn, peekCard, getPlayerCardCount, getAiCardCount } from './engine';
import { cardImageURL } from './cards';
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

// === IMAGE CACHE ===
const faceCache = new Map<string, string>();
function getFaceURL(card: Card): string {
  if (!faceCache.has(card.id)) faceCache.set(card.id, cardImageURL(card.rank, card.suit));
  return faceCache.get(card.id)!;
}

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

// === CARD ELEMENT ===
function createCardEl(card: Card): HTMLElement {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.cardId = card.id;
  el.innerHTML = `
    <div class="card-face" style="background-image:url('${getFaceURL(card)}');background-size:cover;"></div>`;
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
  } else {
    playBtn.disabled = animating;
    playBtn.textContent = state.mode === 'preview' ? 'Играть!' : 'Класть!';
  }

  updatePeekUI();
}

function updatePeekUI() {
  if (state.mode !== 'preview') {
    peekBtn.style.display = 'none';
    peekInfo.style.display = 'none';
    return;
  }

  peekBtn.style.display = '';
  peekInfo.style.display = '';

  const remaining = state.maxPeeks - state.playerPeekCount;
  peekBtn.disabled = animating || remaining <= 0 || state.status === 'gameover';
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

  // Анимация: показываем подсмотренную карту на столе игрока
  animating = true;
  peekBtn.disabled = true;
  playBtn.disabled = true;

  const lastCard = state.playerPeeked[state.playerPeeked.length - 1];
  const cardEl = createCardEl(lastCard);
  cardEl.classList.add('dealt-player');
  // Не очищаем стол — добавляем рядом
  tablePlayer.appendChild(cardEl);

  await sleep(1500);

  // Убираем карту обратно (уходим в колоду)
  cardEl.style.transition = 'all 0.3s ease';
  cardEl.style.transform = 'translate(0, -180px) scale(0.7) rotate(-10deg)';
  cardEl.style.opacity = '0';

  await sleep(300);
  tablePlayer.innerHTML = '';

  animating = false;
  renderState();
});

// === BATTLE ANIMATION ===
async function animateBattle(result: BattleResult) {
  animating = true;
  playBtn.disabled = true;
  peekBtn.disabled = true;
  clearTable();

  // === Анимация подсмотра ИИ (если был) ===
  if (result.aiPeeked && result.aiPeeked.length > 0) {
    for (let i = 0; i < result.aiPeeked.length; i++) {
      const aiPeekCard = createCardEl(result.aiPeeked[i]);
      aiPeekCard.classList.add('dealt-ai');
      tableAi.innerHTML = '';
      tableAi.appendChild(aiPeekCard);

      // Показываем что бот думает
      const thinkText = document.createElement('div');
      thinkText.className = 'battle-result';
      thinkText.style.color = '#ff7043';
      thinkText.textContent = '🤔 Бот смотрит...';
      tableEl.appendChild(thinkText);

      await sleep(1000);
      thinkText.remove();

      // Убираем карту бота обратно
      aiPeekCard.style.transition = 'all 0.3s ease';
      aiPeekCard.style.transform = 'translate(0, 180px) scale(0.7) rotate(10deg)';
      aiPeekCard.style.opacity = '0';
      await sleep(400);
    }
    tableAi.innerHTML = '';
  }

  // Показываем подсмотренные карты игрока как ставку (если были)
  const playerStakeCount = result.playerPeeked ? result.playerPeeked.length - 1 : 0;
  const aiStakeCount = result.aiPeeked ? result.aiPeeked.length - 1 : 0;

  // Основные карты
  const pCard = createCardEl(result.playerCard);
  const aCard = createCardEl(result.aiCard);
  pCard.classList.add('dealt-player');
  aCard.classList.add('dealt-ai');
  tablePlayer.appendChild(pCard);
  tableAi.appendChild(aCard);
  await sleep(1200);

  // Показ ставки
  if (playerStakeCount > 0 || aiStakeCount > 0) {
    const stakeText = document.createElement('div');
    stakeText.className = 'battle-result';
    stakeText.style.color = '#d4af37';
    stakeText.textContent = `Ставка: ${playerStakeCount + aiStakeCount} карт`;
    tableEl.appendChild(stakeText);
    await sleep(800);
    stakeText.remove();
  }

  // Спор
  if (result.warRounds && result.warRounds.length > 0) {
    for (const war of result.warRounds) {
      showWarBanner();
      await sleep(1000);

      const ph = createCardEl(war.playerHidden);
      const ah = createCardEl(war.aiHidden);
      ph.style.transform = 'translateY(-15px) rotate(5deg)';
      ah.style.transform = 'translateY(15px) rotate(-5deg)';
      tablePlayer.appendChild(ph);
      tableAi.appendChild(ah);
      await sleep(700);

      const pf = createCardEl(war.playerFace);
      const af = createCardEl(war.aiFace);
      pf.classList.add('dealt-player');
      pf.style.transform = 'translateY(-30px) rotate(8deg)';
      af.classList.add('dealt-ai');
      af.style.transform = 'translateY(30px) rotate(-8deg)';
      tablePlayer.appendChild(pf);
      tableAi.appendChild(af);
      await sleep(1200);
    }
  }

  // Результат
  const resultText = document.createElement('div');
  resultText.className = 'battle-result';
  if (result.winner === 'player') {
    resultText.textContent = '+';
    resultText.style.color = '#4fc3f7';
  } else {
    resultText.textContent = '−';
    resultText.style.color = '#ff7043';
  }
  tableEl.appendChild(resultText);
  await sleep(2000);

  // Карты остаются на столе — НЕ убираем
  // Очищаются только при следующем ходе

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

// === EVENTS ===
playBtn.addEventListener('click', async () => {
  if (animating) return;
  // Плавно убираем старые карты
  const oldCards = tableEl.querySelectorAll('.card, .battle-result');
  oldCards.forEach((c) => {
    const el = c as HTMLElement;
    el.style.transition = 'opacity 0.2s ease';
    el.style.opacity = '0';
  });
  await sleep(200);
  clearTable();
  state = playTurn(state);
  if (state.lastResult) await animateBattle(state.lastResult);
});

// === INIT ===
injectScoreboard();
