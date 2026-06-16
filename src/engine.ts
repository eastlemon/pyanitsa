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

// === War step: what kind of card to draw next in a war ===
export type WarPhase = 'hidden' | 'face';

export interface WarStep {
  phase: WarPhase;
  playerCard: Card;
  aiCard: Card;
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
  playerDeck: Card[];
  aiDeck: Card[];
  playerPile: Card[];
  aiPile: Card[];
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
    playerPile: [],
    aiPile: [],
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

// === Refill helper ===
function refill(deck: Card[], pile: Card[]): [Card[], Card[]] {
  if (deck.length === 0 && pile.length > 0) return [shuffle(pile), []];
  return [deck, pile];
}

// === Draw one card from player or AI (with refill) ===
function drawCard(deck: Card[], pile: Card[]): { card: Card | null; deck: Card[]; pile: Card[] } {
  [deck, pile] = refill(deck, pile);
  if (deck.length === 0) return { card: null, deck, pile };
  return { card: deck[0], deck: deck.slice(1), pile };
}

// === PREVIEW MODE: peek ===
export function peekCard(state: GameState): GameState | null {
  if (state.mode !== 'preview' || state.status !== 'peeking') return null;
  if (state.playerPeekCount >= state.maxPeeks) return null;

  let playerDeck = [...state.playerDeck];
  let playerPile = [...state.playerPile];
  [playerDeck, playerPile] = refill(playerDeck, playerPile);
  if (playerDeck.length === 0) return null;

  const card = playerDeck[0];
  return {
    ...state,
    playerDeck: playerDeck.slice(1),
    playerPile,
    playerPeeked: [...state.playerPeeked, card],
    playerPeekCount: state.playerPeekCount + 1,
  };
}

// === AI PEEK LOGIC ===
export function aiPeekDecision(state: GameState): { peeked: Card[]; deck: Card[] } {
  let deck = [...state.aiDeck];
  let pile = [...state.aiPile];
  const peeked: Card[] = [];

  for (let i = 0; i < state.maxPeeks; i++) {
    [deck, pile] = refill(deck, pile);
    if (deck.length === 0) break;
    peeked.push(deck[0]);
    deck = deck.slice(1);
    if (peeked[peeked.length - 1].power >= 10 || Math.random() < 0.3) break;
  }
  // Вернём pile обратно (AI не трогает pile при peek, только deck)
  return { peeked, deck };
}

// === PLAY TURN (initial play, no auto-war) ===
export function playTurn(state: GameState): GameState {
  if (state.status === 'gameover') return state;

  let playerDeck = [...state.playerDeck];
  let playerPile = [...state.playerPile];
  let aiDeck = [...state.aiDeck];
  let aiPile = [...state.aiPile];

  let playerPeeked = [...state.playerPeeked];
  let aiPeeked: Card[] = [];
  const tablePile: Card[] = [];

  // === Player card ===
  let playerCard: Card;
  if (state.mode === 'preview' && playerPeeked.length > 0) {
    playerCard = playerPeeked[playerPeeked.length - 1];
    tablePile.push(...playerPeeked.slice(0, -1));
  } else {
    const r = drawCard(playerDeck, playerPile);
    if (!r.card) return { ...state, status: 'gameover', winner: 'ai' };
    playerCard = r.card; playerDeck = r.deck; playerPile = r.pile;
  }

  // === AI card ===
  let aiCard: Card;
  if (state.mode === 'preview') {
    const aiResult = aiPeekDecision({ ...state, aiDeck, aiPile });
    aiPeeked = aiResult.peeked;
    aiDeck = aiResult.deck;
    if (aiPeeked.length > 0) {
      aiCard = aiPeeked[aiPeeked.length - 1];
      tablePile.push(...aiPeeked.slice(0, -1));
    } else {
      const r = drawCard(aiDeck, aiPile);
      if (!r.card) return { ...state, status: 'gameover', winner: 'player' };
      aiCard = r.card; aiDeck = r.deck; aiPile = r.pile;
    }
  } else {
    const r = drawCard(aiDeck, aiPile);
    if (!r.card) return { ...state, status: 'gameover', winner: 'player' };
    aiCard = r.card; aiDeck = r.deck; aiPile = r.pile;
  }

  tablePile.push(playerCard, aiCard);

  const result = compareCards(playerCard, aiCard);

  if (result === 0) {
    // === WAR — не решаем автоматически ===
    return {
      ...state,
      playerDeck, aiDeck, playerPile, aiPile,
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
  if (winner === 'player') {
    playerPile = [...playerPile, ...tablePile];
  } else {
    aiPile = [...aiPile, ...tablePile];
  }

  const battleResult: BattleResult = {
    playerCard, aiCard, winner, pile: [...tablePile],
    playerPeeked: state.mode === 'preview' ? [...playerPeeked] : undefined,
    aiPeeked: state.mode === 'preview' ? [...aiPeeked] : undefined,
  };

  const newState: GameState = {
    ...state,
    playerDeck, aiDeck, playerPile, aiPile,
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

export interface WarStepResult {
  state: GameState;
  /** Карты, открытые в этом шаге (для анимации) */
  revealedCards: { player: Card; ai: Card } | null;
  /** Чем завершился шаг */
  outcome: 'hidden-placed' | 'face-revealed' | 'war-won' | 'war-continues' | 'gameover';
  winner: 'player' | 'ai' | null;
}

// === WAR STEP — игрок жмёт кнопку, открываем по одной паре ===
export function warStep(state: GameState): WarStepResult {
  if (state.status !== 'war-hidden' && state.status !== 'war-face') {
    return { state, revealedCards: null, outcome: 'gameover', winner: null };
  }

  let playerDeck = [...state.playerDeck];
  let playerPile = [...state.playerPile];
  let aiDeck = [...state.aiDeck];
  let aiPile = [...state.aiPile];
  let tablePile = [...state.tablePile];

  if (state.status === 'war-hidden') {
    // Drawing 1 hidden card each (rubashka)
    const pr = drawCard(playerDeck, playerPile);
    const ar = drawCard(aiDeck, aiPile);
    if (!pr.card) {
      const ns = { ...state, status: 'gameover' as const, winner: 'ai' as const, tablePile: [] };
      aiPile = [...aiPile, ...tablePile];
      return { state: { ...ns, aiPile }, revealedCards: null, outcome: 'gameover', winner: 'ai' };
    }
    if (!ar.card) {
      const ns = { ...state, status: 'gameover' as const, winner: 'player' as const, tablePile: [] };
      playerPile = [...playerPile, ...tablePile];
      return { state: { ...ns, playerPile }, revealedCards: null, outcome: 'gameover', winner: 'player' };
    }
    playerDeck = pr.deck; playerPile = pr.pile;
    aiDeck = ar.deck; aiPile = ar.pile;
    tablePile.push(pr.card, ar.card);
    const newState: GameState = {
      ...state, playerDeck, aiDeck, playerPile, aiPile, tablePile,
      status: 'war-face', warPhase: 'face',
    };
    return { state: newState, revealedCards: null, outcome: 'hidden-placed', winner: null };
  }

  // war-face: drawing the face-up comparison cards
  const pr = drawCard(playerDeck, playerPile);
  const ar = drawCard(aiDeck, aiPile);
  if (!pr.card) {
    aiPile = [...aiPile, ...tablePile];
    const ns: GameState = { ...state, status: 'gameover', winner: 'ai', tablePile: [], aiPile };
    return { state: ns, revealedCards: null, outcome: 'gameover', winner: 'ai' };
  }
  if (!ar.card) {
    playerPile = [...playerPile, ...tablePile];
    const ns: GameState = { ...state, status: 'gameover', winner: 'player', tablePile: [], playerPile };
    return { state: ns, revealedCards: null, outcome: 'gameover', winner: 'player' };
  }

  playerDeck = pr.deck; playerPile = pr.pile;
  aiDeck = ar.deck; aiPile = ar.pile;
  tablePile.push(pr.card, ar.card);
  const revealed = { player: pr.card, ai: ar.card };

  const result = compareCards(pr.card, ar.card);
  if (result === 0) {
    // Another war!
    const newState: GameState = {
      ...state, playerDeck, aiDeck, playerPile, aiPile, tablePile,
      status: 'war-hidden', warPhase: 'hidden',
    };
    return { state: newState, revealedCards: revealed, outcome: 'war-continues', winner: null };
  }

  const winner = result > 0 ? 'player' : 'ai';
  if (winner === 'player') {
    playerPile = [...playerPile, ...tablePile];
  } else {
    aiPile = [...aiPile, ...tablePile];
  }

  const newState: GameState = {
    ...state,
    playerDeck, aiDeck, playerPile, aiPile,
    tablePile: [],
    status: state.mode === 'preview' ? 'peeking' : 'idle',
    warPhase: null,
  };

  checkGameOver(newState);
  const outcome = newState.status === 'gameover' ? 'gameover' : 'war-won';
  return { state: newState, revealedCards: revealed, outcome, winner };
}

function checkGameOver(state: GameState) {
  const playerTotal = state.playerDeck.length + state.playerPile.length;
  const aiTotal = state.aiDeck.length + state.aiPile.length;
  if (playerTotal === 0) { state.status = 'gameover'; state.winner = 'ai'; }
  else if (aiTotal === 0) { state.status = 'gameover'; state.winner = 'player'; }
}

export function getPlayerCardCount(state: GameState): number {
  return state.playerDeck.length + state.playerPile.length + state.playerPeeked.length;
}

export function getAiCardCount(state: GameState): number {
  return state.aiDeck.length + state.aiPile.length + state.aiPeeked.length;
}
