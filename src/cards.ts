// PNG-карты из public/cards/

const SUIT_NAMES: Record<string, string> = {
  '♠': 'spades',
  '♥': 'hearts',
  '♦': 'diamonds',
  '♣': 'clubs',
};

const RANK_NAMES: Record<string, string> = {
  '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
  'J': 'jack', 'Q': 'queen', 'K': 'king', 'A': 'ace',
};

export function suitName(suit: string): string {
  return SUIT_NAMES[suit] || 'clubs';
}

export function isRed(suit: string): boolean {
  return suit === '♥' || suit === '♦';
}

/**
 * URL для лицевой стороны карты (PNG из public/cards/)
 */
export function cardImageURL(rank: string, suit: string): string {
  const r = RANK_NAMES[rank] || rank.toLowerCase();
  const s = SUIT_NAMES[suit] || suit;
  return `/cards/${r}_of_${s}.png`;
}

/**
 * URL для рубашки
 */
export function cardBackURL(): string {
  return `/cards/back.png`;
}

// Совместимость со старым API
export function cardDataURL(rank: string, suit: string): string {
  return cardImageURL(rank, suit);
}

export function cardBackDataURL(): string {
  return cardBackURL();
}
