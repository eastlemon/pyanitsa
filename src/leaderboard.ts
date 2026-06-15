export interface ScoreEntry {
  name: string;
  rounds: number;
  result: 'win' | 'lose';
  date: string;
}

const STORAGE_KEY = 'pyanitsa_scores';
const MAX_ENTRIES = 10;

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ScoreEntry[];
  } catch {
    return [];
  }
}

export function saveScore(entry: ScoreEntry): ScoreEntry[] {
  const scores = loadScores();
  scores.push(entry);
  // Сортировка: победы по возрастанию раундов, потом поражения по убыванию
  scores.sort((a, b) => {
    if (a.result === 'win' && b.result === 'win') return a.rounds - b.rounds;
    if (a.result === 'win' && b.result === 'lose') return -1;
    if (a.result === 'lose' && b.result === 'win') return 1;
    return b.rounds - a.rounds;
  });
  const trimmed = scores.slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function getBestWin(): ScoreEntry | null {
  const wins = loadScores().filter(s => s.result === 'win');
  if (wins.length === 0) return null;
  return wins[0];
}

// === UI ===

export function createScoreboardHTML(): string {
  const scores = loadScores();
  const rows = scores.length === 0
    ? '<div class="sb-empty">Пока нет записей. Сыграй первую партию!</div>'
    : scores.map((s, i) => `
        <div class="sb-row ${s.result}">
          <span class="sb-rank">${i + 1}</span>
          <span class="sb-name">${escapeHtml(s.name)}</span>
          <span class="sb-rounds">${s.rounds}</span>
          <span class="sb-badge ${s.result}">${s.result === 'win' ? '🏆' : '💀'}</span>
        </div>
      `).join('');

  return `
    <div class="scoreboard" id="scoreboard" style="display:none;">
      <div class="sb-header">
        <h2>🏆 Топ игроков</h2>
        <button class="sb-close" id="sb-close">✕</button>
      </div>
      <div class="sb-list">${rows}</div>
    </div>
  `;
}

export function showScoreboard() {
  const sb = document.getElementById('scoreboard');
  if (sb) {
    sb.style.display = 'flex';
    // Обновляем список
    const list = sb.querySelector('.sb-list');
    if (list) {
      const scores = loadScores();
      list.innerHTML = scores.length === 0
        ? '<div class="sb-empty">Пока нет записей. Сыграй первую партию!</div>'
        : scores.map((s, i) => `
            <div class="sb-row ${s.result}">
              <span class="sb-rank">${i + 1}</span>
              <span class="sb-name">${escapeHtml(s.name)}</span>
              <span class="sb-rounds">${s.rounds}</span>
              <span class="sb-badge ${s.result}">${s.result === 'win' ? '🏆' : '💀'}</span>
            </div>
          `).join('');
    }
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
