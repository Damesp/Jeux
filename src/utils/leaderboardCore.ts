// Pure leaderboard logic shared by the frontend, the Vite dev middleware and
// the Vercel serverless function. Must stay free of DOM and Node APIs: it is
// type-checked under both tsconfig.app (DOM) and tsconfig.node (ES only).

export interface LeaderboardEntry {
  name: string;
  score: number;
}

export type LeaderboardMap = Record<string, LeaderboardEntry[]>;

export const MAX_ENTRIES = 10;

// Alphanumeric only: the prod backend encodes the name in a blob pathname.
export function normalizeName(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'AAA';
}

// Accepts anything coming from the network, localStorage or a hand-edited
// file and always returns a valid leaderboard: sorted desc, max 10 entries.
export function sanitizeEntries(raw: unknown): LeaderboardEntry[] {
  if (!raw || typeof raw !== 'object') return [];
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  return list
    .filter(
      (e): e is LeaderboardEntry =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as LeaderboardEntry).name === 'string' &&
        typeof (e as LeaderboardEntry).score === 'number' &&
        Number.isFinite((e as LeaderboardEntry).score)
    )
    .map((e) => ({ name: normalizeName(e.name), score: Math.floor(e.score) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES);
}

// Inserts after equal scores so the older entry keeps its rank.
export function mergeScore(
  entries: LeaderboardEntry[],
  entry: LeaderboardEntry
): LeaderboardEntry[] {
  const list = sanitizeEntries(entries);
  const normalized = { name: normalizeName(entry.name), score: Math.floor(entry.score) };
  const index = list.findIndex((e) => e.score < normalized.score);
  if (index === -1) {
    list.push(normalized);
  } else {
    list.splice(index, 0, normalized);
  }
  return list.slice(0, MAX_ENTRIES);
}

export function qualifiesForLeaderboard(
  entries: LeaderboardEntry[],
  score: number
): boolean {
  if (score <= 0) return false;
  if (entries.length < MAX_ENTRIES) return true;
  return score > entries[entries.length - 1].score;
}
