import {
  mergeScore,
  normalizeName,
  sanitizeEntries,
  type LeaderboardEntry,
} from './leaderboardCore';

export type { LeaderboardEntry };
export { qualifiesForLeaderboard } from './leaderboardCore';

const localKey = (gameId: string) => `${gameId}_leaderboard`;

function writeLocal(gameId: string, entries: LeaderboardEntry[]): void {
  try {
    localStorage.setItem(localKey(gameId), JSON.stringify(entries));
  } catch {
    // storage unavailable (private mode, quota) — scores just won't persist locally
  }
}

function readLocal(gameId: string): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(localKey(gameId));
    if (raw) return sanitizeEntries(JSON.parse(raw));

    // Migrate the legacy single-record keys into the new list format
    const legacyScore = localStorage.getItem(`${gameId}_highscore`);
    if (legacyScore) {
      const migrated = sanitizeEntries([
        {
          name: localStorage.getItem(`${gameId}_highscore_name`) || 'AAA',
          score: parseInt(legacyScore, 10),
        },
      ]);
      writeLocal(gameId, migrated);
      return migrated;
    }
  } catch {
    // corrupted JSON or storage unavailable
  }
  return [];
}

export async function fetchLeaderboard(gameId: string): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/highscores');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const entries = sanitizeEntries(data?.[gameId]);
    writeLocal(gameId, entries);
    return entries;
  } catch {
    return readLocal(gameId);
  }
}

export async function submitScore(
  gameId: string,
  name: string,
  score: number
): Promise<LeaderboardEntry[]> {
  const finalName = normalizeName(name);
  try {
    const res = await fetch('/api/highscores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: gameId, name: finalName, score }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const entries = sanitizeEntries(data?.highscores?.[gameId]);
    writeLocal(gameId, entries);
    return entries;
  } catch {
    const merged = mergeScore(readLocal(gameId), { name: finalName, score });
    writeLocal(gameId, merged);
    return merged;
  }
}
