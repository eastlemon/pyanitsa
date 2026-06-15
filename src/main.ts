import './style.css';
import './leaderboard.css';
import type { GameState, Card, BattleResult } from './engine';
import { newGame, playTurn, getPlayerCardCount, getAiCardCount } from './engine';
import { cardDataURL, cardBackDataURL } from './cards';
import { loadScores, saveScore, type ScoreEntry } from './leaderboard';

// === DOM ELEMENTS ===
const playerCount = document.getElementById('player-count')!;
const aiCount = document.getElementById('ai-count')!;
const playerDeck = document.getElementById('player-deck')!;
const aiDeck = document.getElementById('ai-deck')!;
const tablePlayer = document.getElementById('table-player')!;
const tableAi = document.getElementById('table-ai')!;
const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
const roundLabel = document.getElementById('round-label')!;
const tableEl = document.getElementById('table')!;

// === CACHE SVG ===
const backURL = cardBackDataURL();
const faceCache = new Map<string, string>();

function getFaceURL(card: Card): string {
  if (!faceCache.has(card.id)) {
    faceCache.set(card.id, cardDataURL(card.rank, card.suit));
  }
  return faceCache.get(card.id)!;
}

// === GAME STATE ===
let state: GameState = newGame();
let animating = false;
let scoreSaved = false;

// === LEADERBOARD ===
function getPlayerName(): string {
  return localStorage.getItem('pyanitsa_player') || '';
}

function setPlayerName(name: string) {
  localStorage.setItem('pyanitsa_player', name);
}

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
        </div>
      `).join('');

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
    </div>
  `;
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
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById('player-name-input') as HTMLInputElement;
  input.focus();
  input.select();

  const save = () => {
    const name = input.value.trim() || 'Аноним';
    setPlayerName(name);
    const entry: ScoreEntry = {
      name,
      rounds,
      result: isWin ? 'win' : 'lose',
      date: new Date().toISOString(),
    };
    saveScore(entry);
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

// === RENDER ===
function createCardEl(card: Card, faceUp: boolean = false): HTMLElement {
  const el = document.createElement('div');
  el.className = `card ${faceUp ? 'flipped' : ''}`;
  el.dataset.cardId = card.id;

  el.innerHTML = `
    <div class="card-inner">
      <div class="card-back" style="background-image:url('${backURL}');background-size:cover;"></div>
      <div class="card-face" style="background-image:url('${getFaceURL(card)}');background-size:cover;"></div>
    </div>
  `;

  return el;
}

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
    playBtn.textContent = 'Класть!';
  }
}

function clearTable() {
  tablePlayer.innerHTML = '';
  tableAi.innerHTML = '';
}

async function animateBattle(result: BattleResult) {
  animating = true;
  playBtn.disabled = true;
  clearTable();

  const pCard = createCardEl(result.playerCard);
  const aCard = createCardEl(result.aiCard);

  pCard.classList.add('dealt-player');
  aCard.classList.add('dealt-ai');

  tablePlayer.appendChild(pCard);
  tableAi.appendChild(aCard);

  await sleep(600);

  if (result.warRounds && result.warRounds.length > 0) {
    for (const war of result.warRounds) {
      showWarBanner();
      await sleep(700);

      const ph = createCardEl(war.playerHidden);
      const ah = createCardEl(war.aiHidden);
      ph.style.transform = 'translateY(-15px) rotate(5deg)';
      ah.style.transform = 'translateY(15px) rotate(-5deg)';
      tablePlayer.appendChild(ph);
      tableAi.appendChild(ah);

      await sleep(400);

      const pf = createCardEl(war.playerFace, true);
      const af = createCardEl(war.aiFace, true);
      pf.classList.add('dealt-player');
      pf.style.transform = 'translateY(-30px) rotate(8deg)';
      af.classList.add('dealt-ai');
      af.style.transform = 'translateY(30px) rotate(-8deg)';

      tablePlayer.appendChild(pf);
      tableAi.appendChild(af);

      await sleep(600);
    }
  }

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

  await sleep(1000);

  const cards = tableEl.querySelectorAll('.card');
  cards.forEach((c, i) => {
    setTimeout(() => {
      const el = c as HTMLElement;
      el.style.transition = 'all 0.4s ease';
      const isPlayerWinner = result.winner === 'player';
      el.style.transform = isPlayerWinner
        ? 'translate(-200px, -200px) scale(0.5) rotate(-15deg)'
        : 'translate(200px, 200px) scale(0.5) rotate(15deg)';
      el.style.opacity = '0';
    }, i * 50);
  });

  await sleep(600);
  clearTable();
  resultText.remove();

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

function showGameOver() {
  if (scoreSaved) return; // не показываем дважды
  scoreSaved = true;

  const isWin = state.winner === 'player';

  playBtn.style.display = 'none';

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'gameover-overlay';
  overlay.innerHTML = `
    <div class="overlay-content">
      <div class="overlay-title ${isWin ? 'win' : 'lose'}">${isWin ? 'ПОБЕДА!' : 'Поражение'}</div>
      <p style="opacity:0.7; font-size:1.1rem;">Раундов сыграно: ${state.round}</p>
      <div style="display:flex; gap:0.6rem;">
        <button class="btn-play" id="new-game-btn">Ещё раз!</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('new-game-btn')!.addEventListener('click', () => {
    overlay.remove();
    playBtn.style.display = '';
    state = newGame();
    scoreSaved = false;
    clearTable();
    renderState();
  });

  // Сохраняем результат
  setTimeout(() => {
    promptNameAndSave(state.round, isWin);
  }, 800);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// === EVENT ===
playBtn.addEventListener('click', async () => {
  if (animating) return;

  state = playTurn(state);

  if (state.lastResult) {
    await animateBattle(state.lastResult);
  }
});

// === INIT ===
injectScoreboard();
renderState();
