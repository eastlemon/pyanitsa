// Пьяница — игровой движок
// Чистая логика, без UI

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

export interface BattleResult {
  playerCard: Card;
  aiCard: Card;
  winner: 'player' | 'ai' | 'war';
  pile: Card[];
  warRounds?: WarRound[];
  playerPeeked?: Card[];  // карты подсмотренные игроком (для режима preview)
  aiPeeked?: Card[];
}

export interface WarRound {
  playerHidden: Card;
  aiHidden: Card;
  playerFace: Card;
  aiFace: Card;
  winner: 'player' | 'ai' | 'war';
}

export interface GameState {
  mode: GameMode;
  playerDeck: Card[];
  aiDeck: Card[];
  playerPile: Card[];
  aiPile: Card[];
  tablePile: Card[];
  status: 'idle' | 'battling' | 'war' | 'gameover' | 'peeking';
  winner: 'player' | 'ai' | null;
  round: number;
  lastResult: BattleResult | null;
  history: BattleResult[];
  // Preview mode
  playerPeeked: Card[];   // карты которые игрок просмотрел и отложил
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
    playerPile: [],
    aiPile: [],
    tablePile: [],
    status: mode === 'preview' ? 'peeking' : 'idle',
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

// === PREVIEW MODE: peek ====

/**
 * Игрок просматривает верхнюю карту (берёт из колоды в peeked)
 * Возвращает обновлённое состояние или null если нельзя
 */
export function peekCard(state: GameState): GameState | null {
  if (state.mode !== 'preview' || state.status !== 'peeking') return null;
  if (state.playerPeekCount >= state.maxPeeks) return null;

  // Добор из pile если колода пуста
  if (state.playerDeck.length === 0 && state.playerPile.length > 0) {
    state = { ...state, playerDeck: shuffle(state.playerPile), playerPile: [] };
  }
  if (state.playerDeck.length === 0) return null;

  const card = state.playerDeck[0];
  return {
    ...state,
    playerDeck: state.playerDeck.slice(1),
    playerPeeked: [...state.playerPeeked, card],
    playerPeekCount: state.playerPeekCount + 1,
  };
}

/**
 * Сбросить подсмотренные карты и начать заново (например игрок передумал)
 * Только если ещё не дошёл до лимита — нет, нельзя. Правило: подсмотрел = отложил.
 */

// === AI PEEK LOGIC ===
export function aiPeekDecision(state: GameState): { peeked: Card[]; deck: Card[] } {
  let deck = [...state.aiDeck];
  const pile = [...state.aiPile];
  const peeked: Card[] = [];

  for (let i = 0; i < state.maxPeeks; i++) {
    if (deck.length === 0 && pile.length > 0) {
      deck = shuffle(pile);
    }
    if (deck.length === 0) break;

    const card = deck[0];
    peeked.push(card);
    deck = deck.slice(1);

    // AI стратегия: продолжает если карта слабая (< 10)
    // С вероятностью 30% может рискнуть с слабой картой
    if (card.power >= 10 || Math.random() < 0.3) break;
  }

  return { peeked, deck };
}

// === PLAY TURN ===
export function playTurn(state: GameState): GameState {
  if (state.status === 'gameover') return state;

  const pile: Card[] = [];
  const warRounds: WarRound[] = [];

  // === Добор колод ===
  const refill = (deck: Card[], pile: Card[]): Card[] => {
    if (deck.length === 0 && pile.length > 0) return shuffle(pile);
    return deck;
  };

  let playerDeck = refill(state.playerDeck, state.playerPile);
  let aiDeck = refill(state.aiDeck, state.aiPile);
  let playerPile = state.playerDeck.length === 0 ? [] : state.playerPile;
  let aiPile = state.aiDeck.length === 0 ? [] : state.aiPile;

  // === ОПРЕДЕЛЯЕМ КАРТЫ ДЛЯ БОЯ ===
  let playerPeeked = [...state.playerPeeked];
  let aiPeeked: Card[] = [];

  // Карта игрока
  let playerCard: Card;
  if (state.mode === 'preview' && playerPeeked.length > 0) {
    // Берём последнюю подсмотренную
    playerCard = playerPeeked[playerPeeked.length - 1];
    // Остальные подсмотренные идут в кон (ставка)
    pile.push(...playerPeeked.slice(0, -1));
  } else {
    if (playerDeck.length === 0) return { ...state, status: 'gameover', winner: 'ai' };
    playerCard = playerDeck[0];
    playerDeck = playerDeck.slice(1);
  }

  // Карта ИИ
  let aiCard: Card;
  if (state.mode === 'preview') {
    const aiResult = aiPeekDecision({ ...state, aiDeck, aiPile });
    aiPeeked = aiResult.peeked;
    aiDeck = aiResult.deck;
    if (aiPeeked.length > 0) {
      aiCard = aiPeeked[aiPeeked.length - 1];
      pile.push(...aiPeeked.slice(0, -1));
    } else {
      if (aiDeck.length === 0) return { ...state, status: 'gameover', winner: 'player' };
      aiCard = aiDeck[0];
      aiDeck = aiDeck.slice(1);
    }
  } else {
    if (aiDeck.length === 0) return { ...state, status: 'gameover', winner: 'player' };
    aiCard = aiDeck[0];
    aiDeck = aiDeck.slice(1);
  }

  pile.push(playerCard, aiCard);

  // === СРАВНЕНИЕ ===
  let result = compareCards(playerCard, aiCard);
  let winner: 'player' | 'ai' | 'war' = result > 0 ? 'player' : result < 0 ? 'ai' : 'war';

  // === СПОР ===
  while (result === 0) {
    playerDeck = refill(playerDeck, playerPile);
    aiDeck = refill(aiDeck, aiPile);
    if (playerDeck.length < 2) { winner = 'ai'; break; }
    if (aiDeck.length < 2) { winner = 'player'; break; }

    const ph = playerDeck[0]; playerDeck = playerDeck.slice(1);
    const ah = aiDeck[0]; aiDeck = aiDeck.slice(1);
    const pf = playerDeck[0]; playerDeck = playerDeck.slice(1);
    const af = aiDeck[0]; aiDeck = aiDeck.slice(1);
    pile.push(ph, ah, pf, af);

    result = compareCards(pf, af);
    const warWinner = result > 0 ? 'player' : result < 0 ? 'ai' : 'war';
    warRounds.push({ playerHidden: ph, aiHidden: ah, playerFace: pf, aiFace: af, winner: warWinner });
    winner = warWinner;
  }

  // === РАСПРЕДЕЛЕНИЕ КАРТ ===
  const battleResult: BattleResult = {
    playerCard,
    aiCard,
    winner: winner as 'player' | 'ai',
    pile: [...pile],
    warRounds: warRounds.length > 0 ? warRounds : undefined,
    playerPeeked: state.mode === 'preview' ? [...playerPeeked] : undefined,
    aiPeeked: state.mode === 'preview' ? [...aiPeeked] : undefined,
  };

  // Победитель забирает весь кон
  if (winner === 'player') {
    playerPile = [...playerPile, ...pile];
  } else {
    aiPile = [...aiPile, ...pile];
  }

  const newState: GameState = {
    ...state,
    mode: state.mode,
    playerDeck,
    aiDeck,
    playerPile,
    aiPile,
    tablePile: [],
    status: state.mode === 'preview' ? 'peeking' : 'idle',
    round: state.round + 1,
    lastResult: battleResult,
    history: [...state.history, battleResult],
    playerPeeked: [],
    playerPeekCount: 0,
    aiPeeked: [],
    aiPeekCount: 0,
    maxPeeks: state.maxPeeks,
  };

  // === Проверка конца игры ===
  const playerTotal = newState.playerDeck.length + newState.playerPile.length;
  const aiTotal = newState.aiDeck.length + newState.aiPile.length;

  if (playerTotal === 0) {
    newState.status = 'gameover';
    newState.winner = 'ai';
  } else if (aiTotal === 0) {
    newState.status = 'gameover';
    newState.winner = 'player';
  }

  return newState;
}

export function getPlayerCardCount(state: GameState): number {
  return state.playerDeck.length + state.playerPile.length;
}

export function getAiCardCount(state: GameState): number {
  return state.aiDeck.length + state.aiPile.length;
}
