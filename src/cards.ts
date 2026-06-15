// SVG-карты — классический дизайн, генерируются в коде

const SUIT_SYMBOLS = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
} as const;

type SuitName = keyof typeof SUIT_SYMBOLS;

const RANK_LABELS: Record<string, string> = {
  '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
  'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A',
};

// SVG для масти (path для чёткой отрисовки на любом масштабе)
const SUIT_PATHS: Record<SuitName, string> = {
  spades: 'M50 10 C30 35 10 45 10 65 C10 80 22 90 35 90 C42 90 47 87 50 82 C53 87 58 90 65 90 C78 90 90 80 90 65 C90 45 70 35 50 10 Z',
  hearts: 'M50 88 C50 88 12 60 12 38 C12 24 22 14 34 14 C42 14 47 18 50 24 C53 18 58 14 66 14 C78 14 88 24 88 38 C88 60 50 88 50 88 Z',
  diamonds: 'M50 8 L88 50 L50 92 L12 50 Z',
  clubs: 'M50 12 C38 12 30 20 30 32 C30 38 33 43 37 46 C28 43 18 48 18 60 C18 72 28 80 40 80 C44 80 47 79 50 77 L50 88 L42 92 L58 92 L50 88 L50 77 C53 79 56 80 60 80 C72 80 82 72 82 60 C82 48 72 43 63 46 C67 43 70 38 70 32 C70 20 62 12 50 12 Z',
};

export function suitName(suit: string): SuitName {
  if (suit === '♠') return 'spades';
  if (suit === '♥') return 'hearts';
  if (suit === '♦') return 'diamonds';
  return 'clubs';
}

export function isRed(suit: string): boolean {
  return suit === '♥' || suit === '♦';
}

// Раскладка мастей в центре карты для числовых значений
const PIP_LAYOUTS: Record<string, [number, number][]> = {
  '6':  [[35,28],[65,28],[35,50],[65,50],[35,72],[65,72]],
  '7':  [[35,25],[65,25],[50,37],[35,50],[65,50],[35,75],[65,75]],
  '8':  [[35,22],[65,22],[35,40],[65,40],[35,60],[65,60],[35,78],[65,78]],
  '9':  [[35,22],[65,22],[35,38],[65,38],[50,50],[35,62],[65,62],[35,78],[65,78]],
  '10': [[35,20],[65,20],[35,33],[65,33],[50,42],[50,58],[35,67],[65,67],[35,80],[65,80]],
};

/**
 * Генерирует SVG для лицевой стороны карты
 */
export function cardSVG(rank: string, suit: string): string {
  const sn = suitName(suit);
  const color = isRed(suit) ? '#d32f2f' : '#1a1a1a';
  const label = RANK_LABELS[rank] || rank;
  const symbol = SUIT_SYMBOLS[sn];
  const path = SUIT_PATHS[sn];
  const isFace = rank === 'J' || rank === 'Q' || rank === 'K' || rank === 'A';

  let centerContent = '';

  if (isFace) {
    // Для картинок — крупная масть + буква
    centerContent = `
      <text x="50" y="40" font-size="28" font-weight="700" text-anchor="middle" fill="${color}" font-family="Georgia, serif">${label}</text>
      <g transform="translate(50,62) scale(0.5)">
        <path d="${path}" fill="${color}"/>
      </g>
    `;
  } else {
    // Для числовых — раскладка pip'ов
    const pips = PIP_LAYOUTS[rank] || [];
    const pipSVGs = pips.map(([cx, cy]) => {
      const scale = 0.22;
      // Центрируем path (он в координатах 0-100) в точке (cx,cy)
      return `<g transform="translate(${cx - 50 * scale},${cy - 50 * scale}) scale(${scale})${cy > 50 ? ` rotate(180 50 50)` : ''}"><path d="${path}" fill="${color}"/></g>`;
    }).join('\n      ');
    centerContent = pipSVGs;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140" width="100" height="140">
  <rect x="1" y="1" width="98" height="138" rx="8" fill="#fafaf8" stroke="#ccc" stroke-width="1"/>
  <!-- Верхний левый угол -->
  <text x="8" y="16" font-size="13" font-weight="700" fill="${color}" font-family="Georgia, serif">${label}</text>
  <text x="8" y="28" font-size="11" fill="${color}">${symbol}</text>
  <!-- Нижний правый угол -->
  <text x="92" y="134" font-size="13" font-weight="700" fill="${color}" font-family="Georgia, serif" text-anchor="end" transform="rotate(180 92 130)">${label}</text>
  <text x="92" y="122" font-size="11" fill="${color}" text-anchor="end" transform="rotate(180 92 118)">${symbol}</text>
  <!-- Центр -->
  ${centerContent}
</svg>`;
}

/**
 * SVG для рубашки
 */
export function cardBackSVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140" width="100" height="140">
  <defs>
    <pattern id="diamonds" x="0" y="0" width="12" height="12" patternUnits="userSpaceOnUse">
      <rect width="12" height="12" fill="#7a0e0e"/>
      <path d="M6 2 L10 6 L6 10 L2 6 Z" fill="none" stroke="#d4af37" stroke-width="0.6"/>
    </pattern>
  </defs>
  <rect x="1" y="1" width="98" height="138" rx="8" fill="url(#diamonds)" stroke="#d4af37" stroke-width="2"/>
  <rect x="6" y="6" width="88" height="128" rx="5" fill="none" stroke="#d4af37" stroke-width="0.8" opacity="0.6"/>
</svg>`;
}

/**
 * Data URL для использования в CSS/HTML
 */
export function cardDataURL(rank: string, suit: string): string {
  const svg = cardSVG(rank, suit);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function cardBackDataURL(): string {
  const svg = cardBackSVG();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
