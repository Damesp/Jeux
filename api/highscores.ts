import { list, put, del } from '@vercel/blob';
import {
  MAX_ENTRIES,
  normalizeName,
  type LeaderboardEntry,
  type LeaderboardMap,
} from '../src/utils/leaderboardCore';

// One blob per score, all data encoded in the pathname:
//   highscores/<game>/<score>-<name>.json (+ random suffix)
// Rationale: blob content reads (get) are CDN-cached for at least 60s, so a
// read-modify-write single-file design loses freshly saved scores. list() is
// immediately consistent after put()/del(), and unique pathnames mean two
// players saving at the same time can never overwrite each other.
const PREFIX = 'highscores/';
// Keep more blobs than displayed so pruning never fights the top 10.
const KEEP_PER_GAME = 30;
// Only real games can receive scores (blocks blob spam on made-up ids).
const GAME_IDS = new Set([
  'space_invaders',
  'car_race',
  'breakout',
  'pacman',
  'canadair',
  'bomberman',
  'free_kick',
]);

// Minimal structural types for the Vercel Node runtime (avoids depending on
// @vercel/node, which is only needed for its type definitions).
interface ApiRequest {
  method?: string;
  body?: unknown;
}
interface ApiResponse {
  status(code: number): ApiResponse;
  json(data: unknown): void;
}

interface ScoreBlob {
  entry: LeaderboardEntry;
  uploadedAt: number;
  pathname: string;
}

function parseBlob(pathname: string, uploadedAt: number): { game: string; blob: ScoreBlob } | null {
  if (!pathname.startsWith(PREFIX)) return null;
  const rest = pathname.slice(PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash === -1) return null;
  const game = rest.slice(0, slash);
  // Filename is "<score>-<NAME>-<random suffix>.json" (suffix added by put())
  const match = rest.slice(slash + 1).match(/^(\d+)-([A-Z0-9]{1,3})[-.]/);
  if (!match) return null;
  return {
    game,
    blob: { entry: { name: match[2], score: parseInt(match[1], 10) }, uploadedAt, pathname },
  };
}

// All score blobs grouped by game, best score first (ties: oldest first).
async function readAll(): Promise<Map<string, ScoreBlob[]>> {
  const byGame = new Map<string, ScoreBlob[]>();
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000 });
    for (const b of page.blobs) {
      const parsed = parseBlob(b.pathname, new Date(b.uploadedAt).getTime());
      if (!parsed) continue;
      const blobs = byGame.get(parsed.game) ?? [];
      blobs.push(parsed.blob);
      byGame.set(parsed.game, blobs);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  for (const blobs of byGame.values()) {
    blobs.sort((a, b) => b.entry.score - a.entry.score || a.uploadedAt - b.uploadedAt);
  }
  return byGame;
}

function toLeaderboards(byGame: Map<string, ScoreBlob[]>): LeaderboardMap {
  const highscores: LeaderboardMap = {};
  for (const [game, blobs] of byGame) {
    highscores[game] = blobs.slice(0, MAX_ENTRIES).map((b) => b.entry);
  }
  return highscores;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'GET') {
    try {
      res.status(200).json(toLeaderboards(await readAll()));
    } catch {
      res.status(500).json({ error: 'Failed to read highscores' });
    }
    return;
  }

  if (req.method === 'POST') {
    const { game, name, score } = (req.body ?? {}) as Record<string, unknown>;
    if (
      typeof game !== 'string' ||
      !GAME_IDS.has(game) ||
      typeof name !== 'string' ||
      typeof score !== 'number' ||
      !Number.isFinite(score) ||
      score < 0
    ) {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    try {
      const pathname = `${PREFIX}${game}/${Math.floor(score)}-${normalizeName(name)}.json`;
      await put(pathname, ' ', { access: 'private', addRandomSuffix: true });

      const byGame = await readAll();
      // Prune the long tail so the store stays small and list() never pages.
      const surplus = (byGame.get(game) ?? []).slice(KEEP_PER_GAME);
      if (surplus.length > 0) {
        await del(surplus.map((b) => b.pathname));
        byGame.set(game, (byGame.get(game) ?? []).slice(0, KEEP_PER_GAME));
      }

      res.status(200).json({ success: true, highscores: toLeaderboards(byGame) });
    } catch {
      res.status(500).json({ error: 'Failed to save highscore' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
