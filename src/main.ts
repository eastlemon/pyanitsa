import type { GameState, Card, BattleResult } from './engine';
import { newGame, playTurn, getPlayerCardCount, getAiCardCount } from './engine';

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

// === GAME STATE ===
let state: GameState = newGame();
let animating = false;

// === RENDER ===
function suitColor(suit: string): 'red' | 'black' {
  return suit === '♥' || suit === '♦' ? 'red' : 'black';
}

function rankDisplay(rank: string): string {
  const map: Record<string, string> = { 'J': 'В', 'Q': 'Д', 'K': 'К', 'A': 'Т' };
  return map[rank] || rank;
}

function createCardEl(card: Card, faceUp: boolean = false): HTMLElement {
  const el = document.createElement('div');
  el.className = `card ${faceUp ? 'flipped' : ''}`;
  el.dataset.cardId = card.id;

  el.innerHTML = `
    <div class="card-inner">
      <div class="card-back"></div>
      <div class="card-face ${suitColor(card.suit)}">
        <div class="card-corner top-left">
          <span class="card-rank">${rankDisplay(card.rank)}</span>
          <span class="card-suit">${card.suit}</span>
        </div>
        <div class="card-suit">${card.suit}</div>
        <div class="card-corner bottom-right">
          <span class="card-rank">${rankDisplay(card.rank)}</span>
          <span class="card-suit">${card.suit}</span>
        </div>
      </div>
    </div>
  `;

  return el;
}

function renderState() {
  playerCount.textContent = String(getPlayerCardCount(state));
  aiCount.textContent = String(getAiCardCount(state));
  roundLabel.textContent = `Раунд ${state.round}`;

  // Видимость колод
  playerDeck.style.display = getPlayerCardCount(state) > 0 ? 'block' : 'none';
  aiDeck.style.display = getAiCardCount(state) > 0 ? 'block' : 'none';

  // Кнопка
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

  // Выкладываем основные карты
  const pCard = createCardEl(result.playerCard);
  const aCard = createCardEl(result.aiCard);

  pCard.classList.add('dealt-player');
  aCard.classList.add('dealt-ai');

  tablePlayer.appendChild(pCard);
  tableAi.appendChild(aCard);

  await sleep(600);

  // Спор
  if (result.warRounds && result.warRounds.length > 0) {
    for (const war of result.warRounds) {
      showWarBanner();
      await sleep(700);

      // Рубашкой
      const ph = createCardEl(war.playerHidden);
      const ah = createCardEl(war.aiHidden);
      ph.style.transform = 'translateY(-15px) rotate(5deg)';
      ah.style.transform = 'translateY(15px) rotate(-5deg)';
      tablePlayer.appendChild(ph);
      tableAi.appendChild(ah);

      await sleep(400);

      // Лицом
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

  // Показываем результат
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

  // Убираем карты со стола
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
  const isWin = state.winner === 'player';

  // Прячем кнопку
  playBtn.style.display = 'none';

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'gameover-overlay';
  overlay.innerHTML = `
    <div class="overlay-content">
      <div class="overlay-title ${isWin ? 'win' : 'lose'}">${isWin ? 'ПОБЕДА!' : 'Поражение'}</div>
      <p style="opacity:0.7; font-size:1.1rem;">Раундов сыграно: ${state.round}</p>
      <button class="btn-play" id="new-game-btn">Ещё раз!</button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('new-game-btn')!.addEventListener('click', () => {
    overlay.remove();
    playBtn.style.display = '';
    state = newGame();
    clearTable();
    renderState();
  });
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
renderState();
