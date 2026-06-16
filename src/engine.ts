// Пьяница — игровой движок
// Чистая логика, без UI
// Две закольцованные колоды, карты добавляются LIFO (unshift)

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
  power: number;
  id: string;
}

export const RANKS: Rank[] = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];

const RANK_POWER: Record<Rank, number> = {
  '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

export type GameMode = 'classic' | 'preview';

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, power: RANK_POWER[rank], id: `${rank}${suit}` });
    }
  }
  return deck;
}

export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function compareCards(a: Card, b: Card): number {
  const aBeatsAce = a.rank === '6' && b.rank === 'A';
  const bBeatsAce = b.rank === '6' && a.rank === 'A';
  if (aBeatsAce) return 1;
  if (bBeatsAce) return -1;
  if (a.power > b.power) return 1;
  if (a.power < b.power) return -1;
  return 0;
}

// === War ===
export type WarPhase = 'hidden' | 'face';

export interface WarStepResult {
  state: GameState;
  revealedCards: { player: Card; ai: Card } | null;
  outcome: 'hidden-placed' | 'face-revealed' | 'war-won' | 'war-continues' | 'gameover';
  winner: 'player' | 'ai' | null;
}

export interface BattleResult {
  playerCard: Card;
  aiCard: Card;
  winner: 'player' | 'ai' | 'war';
  pile: Card[];
  playerPeeked?: Card[];
  aiPeeked?: Card[];
}

export interface GameState {
  mode: GameMode;
  /** Колода игрока — top = index 0 */
  playerDeck: Card[];
  /** Колода бота — top = index 0 */
  aiDeck: Card[];
  /** Карты на столе (в текущем бою/споре) */
  tablePile: Card[];
  status: 'idle' | 'peeking' | 'war-hidden' | 'war-face' | 'gameover';
  warPhase: WarPhase | null;
  winner: 'player' | 'ai' | null;
  round: number;
  lastResult: BattleResult | null;
  history: BattleResult[];
  // Preview mode
  playerPeeked: Card[];
  playerPeekCount: number;
  aiPeeked: Card[];
  aiPeekCount: number;
  maxPeeks: number;
}

export function newGame(mode: GameMode = 'classic'): GameState {
  const deck = shuffle(createDeck());
  const half = Math.floor(deck.length / 2);
  return {
    mode,
    playerDeck: deck.slice(0, half),
    aiDeck: deck.slice(half),
    tablePile: [],
    status: mode === 'preview' ? 'peeking' : 'idle',
    warPhase: null,
    winner: null,
    round: 0,
    lastResult: null,
    history: [],
    playerPeeked: [],
    playerPeekCount: 0,
    aiPeeked: [],
    aiPeekCount: 0,
    maxPeeks: 3,
  };
}

/** Взять верхнюю карту (index 0). Колода закольцована — если пусто, это конец. */
function drawFromTop(deck: Card[]): { card: Card | null; deck: Card[] } {
  if (deck.length === 0) return { card: null, deck };
  return { card: deck[0], deck: deck.slice(1) };
}

/** Добавить выигранные карты LIFO — наверх (начало массива) */
function addToTop(deck: Card[], cards: Card[]): Card[] {
  return [...cards, ...deck];
}

// === PREVIEW MODE: peek ===
export function peekCard(state: GameState): GameState | null {
  if (state.mode !== 'preview' || state.status !== 'peeking') return null;
  if (state.playerPeekCount >= state.maxPeeks) return null;

  const playerDeck = [...state.playerDeck];
  if (playerDeck.length === 0) return null;

  const card = playerDeck[0];
  return {
    ...state,
    playerDeck: playerDeck.slice(1),
    playerPeeked: [...state.playerPeeked, card],
    playerPeekCount: state.playerPeekCount + 1,
  };
}

// === AI PEEK LOGIC ===
export function aiPeekDecision(deck: Card[], maxPeeks: number): { peeked: Card[]; deck: Card[] } {
  let d = [...deck];
  const peeked: Card[] = [];

  for (let i = 0; i < maxPeeks; i++) {
    if (d.length === 0) break;
    peeked.push(d[0]);
    d = d.slice(1);
    if (peeked[peeked.length - 1].power >= 10 || Math.random() < 0.3) break;
  }
  return { peeked, deck: d };
}

// === PLAY TURN (initial play, no auto-war) ===
export function playTurn(state: GameState): GameState {
  if (state.status === 'gameover') return state;

  let playerDeck = [...state.playerDeck];
  let aiDeck = [...state.aiDeck];
  const tablePile: Card[] = [];

  let playerPeeked = [...state.playerPeeked];
  let aiPeeked: Card[] = [];

  // === Player card ===
  let playerCard: Card;
  if (state.mode === 'preview' && playerPeeked.length > 0) {
    playerCard = playerPeeked[playerPeeked.length - 1];
    // Остальные подсмотренные — ставка (на стол)
    tablePile.push(...playerPeeked.slice(0, -1));
  } else {
    const r = drawFromTop(playerDeck);
    if (!r.card) return { ...state, status: 'gameover', winner: 'ai' };
    playerCard = r.card; playerDeck = r.deck;
  }

  // === AI card ===
  let aiCard: Card;
  if (state.mode === 'preview') {
    const aiResult = aiPeekDecision(aiDeck, state.maxPeeks);
    aiPeeked = aiResult.peeked;
    aiDeck = aiResult.deck;
    if (aiPeeked.length > 0) {
      aiCard = aiPeeked[aiPeeked.length - 1];
      tablePile.push(...aiPeeked.slice(0, -1));
    } else {
      const r = drawFromTop(aiDeck);
      if (!r.card) return { ...state, status: 'gameover', winner: 'player' };
      aiCard = r.card; aiDeck = r.deck;
    }
  } else {
    const r = drawFromTop(aiDeck);
    if (!r.card) return { ...state, status: 'gameover', winner: 'player' };
    aiCard = r.card; aiDeck = r.deck;
  }

  tablePile.push(playerCard, aiCard);

  const result = compareCards(playerCard, aiCard);

  if (result === 0) {
    // === WAR — не решаем автоматически ===
    return {
      ...state,
      playerDeck, aiDeck,
      tablePile,
      status: 'war-hidden',
      warPhase: 'hidden',
      round: state.round + 1,
      playerPeeked: [],
      playerPeekCount: 0,
      aiPeeked: [],
      aiPeekCount: 0,
      lastResult: {
        playerCard, aiCard, winner: 'war', pile: [...tablePile],
        playerPeeked: state.mode === 'preview' ? [...playerPeeked] : undefined,
        aiPeeked: state.mode === 'preview' ? [...aiPeeked] : undefined,
      },
    };
  }

  // === Обычный результат ===
  const winner = result > 0 ? 'player' : 'ai';
  // LIFO: выигранные карты наверх
  if (winner === 'player') {
    playerDeck = addToTop(playerDeck, tablePile);
  } else {
    aiDeck = addToTop(aiDeck, tablePile);
  }

  const battleResult: BattleResult = {
    playerCard, aiCard, winner, pile: [...tablePile],
    playerPeeked: state.mode === 'preview' ? [...playerPeeked] : undefined,
    aiPeeked: state.mode === 'preview' ? [...aiPeeked] : undefined,
  };

  const newState: GameState = {
    ...state,
    playerDeck, aiDeck,
    tablePile: [],
    status: state.mode === 'preview' ? 'peeking' : 'idle',
    warPhase: null,
    round: state.round + 1,
    lastResult: battleResult,
    history: [...state.history, battleResult],
    playerPeeked: [],
    playerPeekCount: 0,
    aiPeeked: [],
    aiPeekCount: 0,
  };

  checkGameOver(newState);
  return newState;
}

// === WAR STEP — игрок жмёт кнопку, открываем по одной паре ===
export function warStep(state: GameState): WarStepResult {
  if (state.status !== 'war-hidden' && state.status !== 'war-face') {
    return { state, revealedCards: null, outcome: 'gameover', winner: null };
  }

  let playerDeck = [...state.playerDeck];
  let aiDeck = [...state.aiDeck];
  let tablePile = [...state.tablePile];

  if (state.status === 'war-hidden') {
    const pr = drawFromTop(playerDeck);
    const ar = drawFromTop(aiDeck);
    if (!pr.card) {
      aiDeck = addToTop(aiDeck, tablePile);
      return { state: { ...state, status: 'gameover', winner: 'ai', tablePile: [], aiDeck }, revealedCards: null, outcome: 'gameover', winner: 'ai' };
    }
    if (!ar.card) {
      playerDeck = addToTop(playerDeck, tablePile);
      return { state: { ...state, status: 'gameover', winner: 'player', tablePile: [], playerDeck }, revealedCards: null, outcome: 'gameover', winner: 'player' };
    }
    tablePile.push(pr.card, ar.card);
    return {
      state: { ...state, playerDeck, aiDeck, tablePile, status: 'war-face', warPhase: 'face' },
      revealedCards: null, outcome: 'hidden-placed', winner: null,
    };
  }

  // war-face: open comparison cards
  const pr = drawFromTop(playerDeck);
  const ar = drawFromTop(aiDeck);
  if (!pr.card) {
    aiDeck = addToTop(aiDeck, tablePile);
    return { state: { ...state, status: 'gameover', winner: 'ai', tablePile: [], aiDeck }, revealedCards: null, outcome: 'gameover', winner: 'ai' };
  }
  if (!ar.card) {
    playerDeck = addToTop(playerDeck, tablePile);
    return { state: { ...state, status: 'gameover', winner: 'player', tablePile: [], playerDeck }, revealedCards: null, outcome: 'gameover', winner: 'player' };
  }

  tablePile.push(pr.card, ar.card);
  const revealed = { player: pr.card, ai: ar.card };

  const result = compareCards(pr.card, ar.card);
  if (result === 0) {
    return {
      state: { ...state, playerDeck, aiDeck, tablePile, status: 'war-hidden', warPhase: 'hidden' },
      revealedCards: revealed, outcome: 'war-continues', winner: null,
    };
  }

  const winner = result > 0 ? 'player' : 'ai';
  if (winner === 'player') {
    playerDeck = addToTop(playerDeck, tablePile);
  } else {
    aiDeck = addToTop(aiDeck, tablePile);
  }

  const newState: GameState = {
    ...state,
    playerDeck, aiDeck,
    tablePile: [],
    status: state.mode === 'preview' ? 'peeking' : 'idle',
    warPhase: null,
  };

  checkGameOver(newState);
  const outcome = newState.status === 'gameover' ? 'gameover' : 'war-won';
  return { state: newState, revealedCards: revealed, outcome, winner };
}

function checkGameOver(state: GameState) {
  if (state.playerDeck.length === 0 && state.tablePile.length === 0) {
    state.status = 'gameover';
    state.winner = 'ai';
  } else if (state.aiDeck.length === 0 && state.tablePile.length === 0) {
    state.status = 'gameover';
    state.winner = 'player';
  }
}

export function getPlayerCardCount(state: GameState): number {
  return state.playerDeck.length + state.playerPeeked.length;
}

export function getAiCardCount(state: GameState): number {
  return state.aiDeck.length;
}
