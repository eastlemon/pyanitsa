// Пьяница — игровой движок
// Чистая логика, без UI

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
  // Числовая сила для сравнения (6=6, 7=7, ... J=11, Q=12, K=13, A=14)
  power: number;
  id: string;
}

export const RANKS: Rank[] = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];

// Сила карт: 6=6 ... K=13, A=14, но 2 бьёт туза — это обрабатывается в compareCards
const RANK_POWER: Record<Rank, number> = {
  '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

// 36-карточная колода
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        rank,
        suit,
        power: RANK_POWER[rank],
        id: `${rank}${suit}`,
      });
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

/**
 * Сравнение карт по правилам "Пьяницы"
 * Возвращает: 1 если карта A побеждает, -1 если карта B, 0 — спор
 *
 * Спецправило: 6 бьёт туза (в классическом варианте двойка,
 * но в 36-карточной колоде младшая = 6)
 */
export function compareCards(a: Card, b: Card): number {
  // Шестёрка бьёт туза
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
  pile: Card[];           // все карты на кону
  warRounds?: WarRound[];  // раунды спора если был
}

export interface WarRound {
  playerHidden: Card;
  aiHidden: Card;
  playerFace: Card;
  aiFace: Card;
  winner: 'player' | 'ai' | 'war';
}

export interface GameState {
  playerDeck: Card[];
  aiDeck: Card[];
  playerPile: Card[];   // карты взятые игроком
  aiPile: Card[];       // карты взятые ИИ
  tablePile: Card[];    // текущий бой (включая спор)
  status: 'idle' | 'battling' | 'war' | 'gameover';
  winner: 'player' | 'ai' | null;
  round: number;
  lastResult: BattleResult | null;
  history: BattleResult[];
}

export function newGame(): GameState {
  const deck = shuffle(createDeck());
  const half = Math.floor(deck.length / 2);
  return {
    playerDeck: deck.slice(0, half),
    aiDeck: deck.slice(half),
    playerPile: [],
    aiPile: [],
    tablePile: [],
    status: 'idle',
    winner: null,
    round: 0,
    lastResult: null,
    history: [],
  };
}

/**
 * Разыграть один ход (бой)
 * Берёт по карте сверху колоды каждого игрока
 * Если спор — продолжает пока не разрешится
 */
export function playTurn(state: GameState): GameState {
  if (state.status === 'gameover') return state;

  // Если карты закончились — перемешиваем взятые обратно
  if (state.playerDeck.length === 0 && state.playerPile.length > 0) {
    state.playerDeck = shuffle(state.playerPile);
    state.playerPile = [];
  }
  if (state.aiDeck.length === 0 && state.aiPile.length > 0) {
    state.aiDeck = shuffle(state.aiPile);
    state.aiPile = [];
  }

  // Проверка конца игры
  if (state.playerDeck.length === 0) {
    return { ...state, status: 'gameover', winner: 'ai' };
  }
  if (state.aiDeck.length === 0) {
    return { ...state, status: 'gameover', winner: 'player' };
  }

  const pile: Card[] = [];
  const warRounds: WarRound[] = [];

  // Первый бой
  const playerCard = state.playerDeck.shift()!;
  const aiCard = state.aiDeck.shift()!;
  pile.push(playerCard, aiCard);

  let result = compareCards(playerCard, aiCard);
  let winner: 'player' | 'ai' | 'war' = result > 0 ? 'player' : result < 0 ? 'ai' : 'war';

  // Спор
  while (result === 0) {
    // Нужно минимум 2 карты (1 рубашкой + 1 лицом) у каждого
    // Добор из pile если надо
    const refillDeck = (deck: Card[], pile: Card[]): Card[] => {
      if (deck.length === 0) return shuffle(pile);
      return deck;
    };

    state.playerDeck = refillDeck(state.playerDeck, [...state.playerPile]);
    state.aiDeck = refillDeck(state.aiDeck, [...state.aiPile]);

    if (state.playerDeck.length < 2 || state.aiDeck.length < 2) {
      // Тот у кого меньше карт — проиграл
      if (state.playerDeck.length < 2) {
        winner = 'ai';
      } else {
        winner = 'player';
      }
      break;
    }

    const ph = state.playerDeck.shift()!;
    const ah = state.aiDeck.shift()!;
    const pf = state.playerDeck.shift()!;
    const af = state.aiDeck.shift()!;
    pile.push(ph, ah, pf, af);

    result = compareCards(pf, af);
    const warWinner = result > 0 ? 'player' : result < 0 ? 'ai' : 'war' as const;
    warRounds.push({
      playerHidden: ph,
      aiHidden: ah,
      playerFace: pf,
      aiFace: af,
      winner: warWinner,
    });
    winner = warWinner;
  }

  // Победитель забирает стопку
  const battleResult: BattleResult = {
    playerCard,
    aiCard,
    winner: winner as 'player' | 'ai',
    pile: [...pile],
    warRounds: warRounds.length > 0 ? warRounds : undefined,
  };

  const newState: GameState = {
    ...state,
    playerDeck: [...state.playerDeck],
    aiDeck: [...state.aiDeck],
    playerPile: winner === 'player' ? [...state.playerPile, ...pile] : state.playerPile,
    aiPile: winner === 'ai' ? [...state.aiPile, ...pile] : state.aiPile,
    tablePile: [],
    status: 'idle',
    round: state.round + 1,
    lastResult: battleResult,
    history: [...state.history, battleResult],
  };

  // Проверка конца игры
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
