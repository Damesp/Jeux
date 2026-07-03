import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameWrapper } from './GameWrapper';
import { audio } from '../../utils/audio';

const COLS = 15;
const ROWS = 13;
const CELL = 48;
const CANVAS_WIDTH = 760;
const CANVAS_HEIGHT = 660;
const OFFSET_X = (CANVAS_WIDTH - COLS * CELL) / 2; // 20
const OFFSET_Y = 24;

const BOMB_TIMER = 150;      // ~2.5s at 60fps
const EXPLOSION_TIME = 30;   // ~0.5s
const ALIGN_EPS = 1.5;

// 0 = floor, 1 = solid wall, 2 = destructible block
type Cell = 0 | 1 | 2;

type Dir = { x: number; y: number };
const DIRS: Record<string, Dir> = {
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  NONE: { x: 0, y: 0 },
};

type PowerUpType = 'bomb' | 'flame' | 'speed';

interface Fighter {
  id: number;          // 0 = human player
  isAI: boolean;
  alive: boolean;
  col: number;
  row: number;
  px: number;          // pixel center x
  py: number;          // pixel center y
  dir: Dir;
  speed: number;
  maxBombs: number;
  flame: number;       // blast range
  bombsActive: number;
  color: string;
  deathTimer: number;
  ai: AIState | null;
}

interface AIState {
  mode: 'wander' | 'flee' | 'hunt';
  path: { col: number; row: number }[];
  decisionCooldown: number;
  bombCooldown: number;
}

interface Bomb {
  col: number;
  row: number;
  timer: number;
  flame: number;
  ownerId: number;
  passThrough: number[]; // fighter ids still standing on the bomb
}

interface Explosion {
  cells: { col: number; row: number }[];
  timer: number;
  ownerId: number;
}

interface PowerUp {
  col: number;
  row: number;
  type: PowerUpType;
}

interface GameState {
  gameState: 'idle' | 'playing' | 'paused' | 'gameover';
  grid: Cell[][];
  hidden: Map<string, PowerUpType>;
  fighters: Fighter[];
  bombs: Bomb[];
  explosions: Explosion[];
  powerups: PowerUp[];
  score: number;
  initialBlocks: number;
  keys: Record<string, boolean>;
  dirStack: string[];      // held direction keys, most recent last
  bombRequested: boolean;
  animTick: number;
  result: '' | 'win' | 'lose';
  endTimer: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const cellToPixel = (col: number, row: number) => ({
  px: OFFSET_X + col * CELL + CELL / 2,
  py: OFFSET_Y + row * CELL + CELL / 2,
});

const key = (col: number, row: number) => `${col},${row}`;

const buildGrid = (): { grid: Cell[][]; hidden: Map<string, PowerUpType>; initialBlocks: number } => {
  const grid: Cell[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) row.push(1);
      else if (r % 2 === 0 && c % 2 === 0) row.push(1);
      else row.push(0);
    }
    grid.push(row);
  }

  // Keep the 4 spawn corners clear (corner + 2 orthogonal neighbours)
  const safe = new Set<string>();
  const corners = [
    { c: 1, r: 1 }, { c: COLS - 2, r: 1 },
    { c: 1, r: ROWS - 2 }, { c: COLS - 2, r: ROWS - 2 },
  ];
  corners.forEach(({ c, r }) => {
    safe.add(key(c, r));
    safe.add(key(c + (c === 1 ? 1 : -1), r));
    safe.add(key(c, r + (r === 1 ? 1 : -1)));
  });

  const hidden = new Map<string, PowerUpType>();
  let initialBlocks = 0;
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (grid[r][c] !== 0 || safe.has(key(c, r))) continue;
      if (Math.random() < 0.75) {
        grid[r][c] = 2;
        initialBlocks++;
        if (Math.random() < 0.3) {
          const roll = Math.random();
          hidden.set(key(c, r), roll < 0.4 ? 'bomb' : roll < 0.8 ? 'flame' : 'speed');
        }
      }
    }
  }
  return { grid, hidden, initialBlocks };
};

const makeFighters = (): Fighter[] => {
  const specs = [
    { col: 1, row: 1, color: '#ffffff', isAI: false },
    { col: COLS - 2, row: 1, color: '#ff4444', isAI: true },
    { col: 1, row: ROWS - 2, color: '#4488ff', isAI: true },
    { col: COLS - 2, row: ROWS - 2, color: '#1b1b1b', isAI: true },
  ];
  return specs.map((sp, i) => {
    const { px, py } = cellToPixel(sp.col, sp.row);
    return {
      id: i,
      isAI: sp.isAI,
      alive: true,
      col: sp.col,
      row: sp.row,
      px,
      py,
      dir: DIRS.NONE,
      speed: sp.isAI ? 1.7 : 2.0, // the player keeps a small speed edge
      maxBombs: 1,
      flame: 2,
      bombsActive: 0,
      color: sp.color,
      deathTimer: 0,
      ai: sp.isAI ? { mode: 'wander' as const, path: [], decisionCooldown: i * 8, bombCooldown: 120 + i * 40 } : null,
    };
  });
};

const bombAt = (s: GameState, col: number, row: number): Bomb | undefined =>
  s.bombs.find(b => b.col === col && b.row === row);

const isWalkable = (s: GameState, col: number, row: number, fighterId: number): boolean => {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  if (s.grid[row][col] !== 0) return false;
  const bomb = bombAt(s, col, row);
  if (bomb && !bomb.passThrough.includes(fighterId)) return false;
  return true;
};

const countBlocks = (grid: Cell[][]): number =>
  grid.flat().filter(c => c === 2).length;

// Project one bomb's blast cross into a danger map (min timer wins)
const projectBlast = (danger: number[][], grid: Cell[][], col: number, row: number, flame: number, timer: number, bombs: Bomb[]): boolean => {
  let changed = false;
  const write = (c: number, r: number) => {
    if (timer < danger[r][c]) { danger[r][c] = timer; changed = true; }
  };
  write(col, row);
  for (const d of [DIRS.UP, DIRS.DOWN, DIRS.LEFT, DIRS.RIGHT]) {
    for (let i = 1; i <= flame; i++) {
      const c = col + d.x * i;
      const r = row + d.y * i;
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) break;
      if (grid[r][c] === 1) break;
      write(c, r);
      if (grid[r][c] === 2) break;                                   // blocks absorb the blast
      if (bombs.some(b => b.col === c && b.row === r)) break;        // bombs stop flames (and chain)
    }
  }
  return changed;
};

const buildDangerMap = (s: GameState): number[][] => {
  const danger: number[][] = Array.from({ length: ROWS }, () => new Array<number>(COLS).fill(Infinity));
  s.explosions.forEach(e => e.cells.forEach(c => { danger[c.row][c.col] = 0; }));
  // Iterate so chained bombs inherit the earliest trigger time
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const b of s.bombs) {
      const eff = Math.min(b.timer, danger[b.row][b.col]);
      if (projectBlast(danger, s.grid, b.col, b.row, b.flame, eff, s.bombs)) changed = true;
    }
    if (!changed) break;
  }
  return danger;
};

// BFS over floor cells; cells hotter than minDanger (danger < minDanger) are avoided.
// Returns the path (excluding start) to the closest goal cell, or null.
const bfs = (
  s: GameState,
  danger: number[][],
  startCol: number,
  startRow: number,
  isGoal: (col: number, row: number) => boolean,
  minDanger: number,
): { col: number; row: number }[] | null => {
  const visited: boolean[][] = Array.from({ length: ROWS }, () => new Array<boolean>(COLS).fill(false));
  const prev = new Map<string, string>();
  const queue: { col: number; row: number }[] = [{ col: startCol, row: startRow }];
  visited[startRow][startCol] = true;

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (isGoal(cur.col, cur.row)) {
      // Reconstruct path
      const path: { col: number; row: number }[] = [];
      let k = key(cur.col, cur.row);
      const startKey = key(startCol, startRow);
      while (k !== startKey) {
        const [c, r] = k.split(',').map(Number);
        path.unshift({ col: c, row: r });
        k = prev.get(k)!;
      }
      return path;
    }
    for (const d of [DIRS.UP, DIRS.DOWN, DIRS.LEFT, DIRS.RIGHT]) {
      const c = cur.col + d.x;
      const r = cur.row + d.y;
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
      if (visited[r][c]) continue;
      if (s.grid[r][c] !== 0) continue;
      if (bombAt(s, c, r)) continue;
      if (danger[r][c] < minDanger) continue;
      visited[r][c] = true;
      prev.set(key(c, r), key(cur.col, cur.row));
      queue.push({ col: c, row: r });
    }
  }
  return null;
};

const hasAdjacentBlock = (s: GameState, col: number, row: number): boolean =>
  [DIRS.UP, DIRS.DOWN, DIRS.LEFT, DIRS.RIGHT].some(d => {
    const c = col + d.x;
    const r = row + d.y;
    return c >= 0 && c < COLS && r >= 0 && r < ROWS && s.grid[r][c] === 2;
  });

const enemyInBlastLine = (s: GameState, f: Fighter): boolean =>
  s.fighters.some(g => {
    if (!g.alive || g.id === f.id) return false;
    if (Math.abs(g.col - f.col) + Math.abs(g.row - f.row) <= 1) return true;
    if (g.row === f.row && Math.abs(g.col - f.col) <= f.flame) {
      const step = Math.sign(g.col - f.col);
      for (let c = f.col + step; c !== g.col; c += step) {
        if (s.grid[f.row][c] !== 0) return false;
      }
      return true;
    }
    if (g.col === f.col && Math.abs(g.row - f.row) <= f.flame) {
      const step = Math.sign(g.row - f.row);
      for (let r = f.row + step; r !== g.row; r += step) {
        if (s.grid[r][f.col] !== 0) return false;
      }
      return true;
    }
    return false;
  });

// ─── Component ────────────────────────────────────────────────────────────────

export const Bomberman: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'paused' | 'gameover'>('idle');

  const stateRef = useRef<GameState>((() => {
    const { grid, hidden, initialBlocks } = buildGrid();
    return {
      gameState: 'idle' as const,
      grid,
      hidden,
      fighters: makeFighters(),
      bombs: [],
      explosions: [],
      powerups: [],
      score: 0,
      initialBlocks,
      keys: {},
      dirStack: [],
      bombRequested: false,
      animTick: 0,
      result: '' as const,
      endTimer: 0,
    };
  })());

  const initGame = useCallback(() => {
    const s = stateRef.current;
    const { grid, hidden, initialBlocks } = buildGrid();
    s.grid = grid;
    s.hidden = hidden;
    s.initialBlocks = initialBlocks;
    s.fighters = makeFighters();
    s.bombs = [];
    s.explosions = [];
    s.powerups = [];
    s.score = 0;
    s.dirStack = [];
    s.bombRequested = false;
    s.animTick = 0;
    s.result = '';
    s.endTimer = 0;
  }, []);

  const startGame = useCallback(() => {
    initGame();
    setScore(0);
    setGameState('playing');
    audio.playGameStart();
  }, [initGame]);

  const restartGame = useCallback(() => {
    initGame();
    setScore(0);
    setGameState('playing');
    audio.playGameStart();
  }, [initGame]);

  const togglePause = useCallback(() => {
    setGameState(prev => prev === 'playing' ? 'paused' : 'playing');
  }, []);

  // Sync react state → ref
  useEffect(() => { stateRef.current.gameState = gameState; }, [gameState]);

  // Keyboard events
  useEffect(() => {
    const dirForKey = (k: string): string | null => {
      switch (k.toLowerCase()) {
        case 'arrowup': case 'z': case 'w': return 'UP';
        case 'arrowdown': case 's': return 'DOWN';
        case 'arrowleft': case 'q': case 'a': return 'LEFT';
        case 'arrowright': case 'd': return 'RIGHT';
        default: return null;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current;
      s.keys[e.key] = true;

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
        e.preventDefault();
      }
      if (e.key === 'Escape') { e.preventDefault(); togglePause(); return; }

      if (s.gameState === 'playing') {
        const dir = dirForKey(e.key);
        if (dir && !s.dirStack.includes(dir)) s.dirStack.push(dir);
        if (e.key === ' ' && !e.repeat) s.bombRequested = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const s = stateRef.current;
      s.keys[e.key] = false;
      const dir = dirForKey(e.key);
      if (dir) s.dirStack = s.dirStack.filter(d => d !== dir);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [togglePause]);

  // Main game loop
  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const addScore = (s: GameState, pts: number) => {
      s.score += pts;
      setScore(s.score);
    };

    const placeBomb = (s: GameState, f: Fighter) => {
      if (f.bombsActive >= f.maxBombs) return;
      if (bombAt(s, f.col, f.row)) return;
      s.bombs.push({
        col: f.col,
        row: f.row,
        timer: BOMB_TIMER,
        flame: f.flame,
        ownerId: f.id,
        passThrough: s.fighters.filter(g => g.alive && g.col === f.col && g.row === f.row).map(g => g.id),
      });
      f.bombsActive++;
      audio.playLaser();
    };

    const detonate = (s: GameState, bomb: Bomb) => {
      s.bombs = s.bombs.filter(b => b !== bomb);
      const owner = s.fighters[bomb.ownerId];
      if (owner) owner.bombsActive = Math.max(0, owner.bombsActive - 1);

      const cells: { col: number; row: number }[] = [{ col: bomb.col, row: bomb.row }];
      for (const d of [DIRS.UP, DIRS.DOWN, DIRS.LEFT, DIRS.RIGHT]) {
        for (let i = 1; i <= bomb.flame; i++) {
          const c = bomb.col + d.x * i;
          const r = bomb.row + d.y * i;
          if (c < 0 || c >= COLS || r < 0 || r >= ROWS) break;
          if (s.grid[r][c] === 1) break;
          if (s.grid[r][c] === 2) {
            // Destroy the block, maybe reveal a power-up, and stop this branch
            s.grid[r][c] = 0;
            if (bomb.ownerId === 0) addScore(s, 10);
            const hiddenType = s.hidden.get(key(c, r));
            if (hiddenType) {
              s.hidden.delete(key(c, r));
              s.powerups.push({ col: c, row: r, type: hiddenType });
            }
            cells.push({ col: c, row: r });
            break;
          }
          cells.push({ col: c, row: r });
          // Flames destroy exposed power-ups
          s.powerups = s.powerups.filter(p => !(p.col === c && p.row === r));
          // Chain reaction: nearby bombs blow up shortly after
          const other = bombAt(s, c, r);
          if (other) {
            other.timer = Math.min(other.timer, 3);
            break;
          }
        }
      }
      s.explosions.push({ cells, timer: EXPLOSION_TIME, ownerId: bomb.ownerId });
      audio.playExplosion();
    };

    const moveFighter = (s: GameState, f: Fighter, dir: Dir) => {
      if (dir === DIRS.NONE || (dir.x === 0 && dir.y === 0)) return;
      f.dir = dir;
      const speed = f.speed;
      const center = cellToPixel(f.col, f.row);

      if (dir.x !== 0) {
        const offY = f.py - center.py;
        if (Math.abs(offY) > ALIGN_EPS) {
          // Corner slide: realign vertically before moving horizontally
          f.py -= Math.sign(offY) * Math.min(speed, Math.abs(offY));
        } else {
          f.py = center.py;
          let nx = f.px + dir.x * speed;
          if (!isWalkable(s, f.col + dir.x, f.row, f.id)) {
            nx = dir.x > 0
              ? Math.min(nx, Math.max(f.px, center.px))
              : Math.max(nx, Math.min(f.px, center.px));
          }
          f.px = nx;
        }
      } else {
        const offX = f.px - center.px;
        if (Math.abs(offX) > ALIGN_EPS) {
          f.px -= Math.sign(offX) * Math.min(speed, Math.abs(offX));
        } else {
          f.px = center.px;
          let ny = f.py + dir.y * speed;
          if (!isWalkable(s, f.col, f.row + dir.y, f.id)) {
            ny = dir.y > 0
              ? Math.min(ny, Math.max(f.py, center.py))
              : Math.max(ny, Math.min(f.py, center.py));
          }
          f.py = ny;
        }
      }

      f.col = Math.round((f.px - OFFSET_X - CELL / 2) / CELL);
      f.row = Math.round((f.py - OFFSET_Y - CELL / 2) / CELL);
    };

    const aiDecide = (s: GameState, f: Fighter, danger: number[][]) => {
      const ai = f.ai!;
      ai.decisionCooldown = 12;

      // 1. Flee any blast zone
      if (danger[f.row][f.col] !== Infinity) {
        ai.mode = 'flee';
        const isSafe = (c: number, r: number) => danger[r][c] === Infinity;
        let path = bfs(s, danger, f.col, f.row, isSafe, 45);
        if (!path) path = bfs(s, danger, f.col, f.row, isSafe, 1); // desperate: run through hot cells
        if (path) ai.path = path;
        return;
      }

      // 2. Drop a bomb if useful AND a safe escape exists (prevents suicides)
      if (ai.bombCooldown <= 0 && f.bombsActive < f.maxBombs && !bombAt(s, f.col, f.row)) {
        if (hasAdjacentBlock(s, f.col, f.row) || enemyInBlastLine(s, f)) {
          const sim = danger.map(r => [...r]);
          projectBlast(sim, s.grid, f.col, f.row, f.flame, BOMB_TIMER, s.bombs);
          const escape = bfs(s, sim, f.col, f.row, (c, r) => sim[r][c] === Infinity, 45);
          // Only bomb if the escape is reachable before the fuse runs out (with margin)
          const maxEscapeCells = Math.floor((BOMB_TIMER - 30) / (CELL / f.speed));
          if (escape && escape.length <= maxEscapeCells) {
            placeBomb(s, f);
            ai.bombCooldown = 90;
            ai.mode = 'flee';
            ai.path = escape;
            return;
          }
        }
      }

      // 3. Wander toward blocks, hunt when the arena opens up
      const blocksLeft = countBlocks(s.grid);
      const aliveCount = s.fighters.filter(x => x.alive).length;
      const hunting = blocksLeft < s.initialBlocks * 0.25 || aliveCount <= 2;
      ai.mode = hunting ? 'hunt' : 'wander';

      // Small jitter so the 3 AIs don't behave identically
      if (Math.random() < 0.05) {
        const options = [DIRS.UP, DIRS.DOWN, DIRS.LEFT, DIRS.RIGHT]
          .map(d => ({ col: f.col + d.x, row: f.row + d.y }))
          .filter(c => isWalkable(s, c.col, c.row, f.id) && danger[c.row][c.col] === Infinity);
        if (options.length > 0) {
          ai.path = [options[Math.floor(Math.random() * options.length)]];
          return;
        }
      }

      let path: { col: number; row: number }[] | null = null;
      if (hunting) {
        const targets = s.fighters.filter(x => x.alive && x.id !== f.id);
        if (targets.length > 0) {
          const t = targets.reduce((best, x) =>
            Math.abs(x.col - f.col) + Math.abs(x.row - f.row) <
            Math.abs(best.col - f.col) + Math.abs(best.row - f.row) ? x : best);
          path = bfs(s, danger, f.col, f.row, (c, r) => c === t.col && r === t.row, 60);
        }
      }
      if (!path) {
        path = bfs(s, danger, f.col, f.row,
          (c, r) => hasAdjacentBlock(s, c, r) && danger[r][c] === Infinity, 60);
      }
      ai.path = path ?? [];
    };

    const aiDirFromPath = (f: Fighter): Dir => {
      const ai = f.ai!;
      while (ai.path.length > 0) {
        const target = ai.path[0];
        const tc = cellToPixel(target.col, target.row);
        if (Math.abs(f.px - tc.px) < 2 && Math.abs(f.py - tc.py) < 2) {
          ai.path.shift();
          continue;
        }
        if (target.col > f.col) return DIRS.RIGHT;
        if (target.col < f.col) return DIRS.LEFT;
        if (target.row > f.row) return DIRS.DOWN;
        if (target.row < f.row) return DIRS.UP;
        // Same cell, not centered yet: finish walking to the center
        const dx = tc.px - f.px;
        const dy = tc.py - f.py;
        if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? DIRS.RIGHT : DIRS.LEFT;
        return dy > 0 ? DIRS.DOWN : DIRS.UP;
      }
      return DIRS.NONE;
    };

    // ── Update ──────────────────────────────────────────────────────────────
    const update = () => {
      const s = stateRef.current;
      if (s.gameState !== 'playing') return;

      s.animTick++;
      const player = s.fighters[0];

      if (s.result === '') {
        const danger = buildDangerMap(s);

        // Player input
        if (player.alive) {
          const wantKey = s.dirStack[s.dirStack.length - 1];
          const wantDir = wantKey ? DIRS[wantKey] : DIRS.NONE;
          moveFighter(s, player, wantDir);
          if (s.bombRequested) placeBomb(s, player);
        }
        s.bombRequested = false;

        // AI fighters
        s.fighters.forEach(f => {
          if (!f.isAI || !f.alive) return;
          const ai = f.ai!;
          ai.decisionCooldown--;
          if (ai.bombCooldown > 0) ai.bombCooldown--;
          if (ai.decisionCooldown <= 0) aiDecide(s, f, danger);
          moveFighter(s, f, aiDirFromPath(f));
        });
      } else {
        s.endTimer--;
        if (s.endTimer <= 0) setGameState('gameover');
      }

      // Release bombs once their owner walked away
      s.bombs.forEach(b => {
        const bc = cellToPixel(b.col, b.row);
        b.passThrough = b.passThrough.filter(id => {
          const f = s.fighters[id];
          if (!f || !f.alive) return false;
          if (f.col === b.col && f.row === b.row) return true;
          return Math.abs(f.px - bc.px) < CELL - ALIGN_EPS && Math.abs(f.py - bc.py) < CELL - ALIGN_EPS;
        });
      });

      // Tick bombs and detonate (chains resolve over the next frames)
      s.bombs.forEach(b => b.timer--);
      let exploded = true;
      while (exploded) {
        exploded = false;
        const due = s.bombs.find(b => b.timer <= 0);
        if (due) {
          detonate(s, due);
          exploded = true;
        }
      }

      // Tick explosions
      s.explosions.forEach(e => e.timer--);
      s.explosions = s.explosions.filter(e => e.timer > 0);

      // Death animations
      s.fighters.forEach(f => { if (!f.alive && f.deathTimer > 0) f.deathTimer--; });

      if (s.result !== '') return;

      // Kill check
      s.explosions.forEach(e => {
        e.cells.forEach(c => {
          s.fighters.forEach(f => {
            if (!f.alive || f.col !== c.col || f.row !== c.row) return;
            f.alive = false;
            f.deathTimer = 60;
            if (e.ownerId === 0 && f.id !== 0) {
              addScore(s, 500);
              audio.playScore();
            }
          });
        });
      });

      // Power-up pickup
      s.fighters.forEach(f => {
        if (!f.alive) return;
        const pu = s.powerups.find(p => p.col === f.col && p.row === f.row);
        if (!pu) return;
        s.powerups = s.powerups.filter(p => p !== pu);
        if (pu.type === 'bomb') f.maxBombs++;
        else if (pu.type === 'flame') f.flame++;
        else f.speed = Math.min(3.2, f.speed + 0.35);
        if (f.id === 0) {
          addScore(s, 50);
          audio.playPowerUp();
        }
      });

      // Win / lose
      const aliveAIs = s.fighters.filter(f => f.isAI && f.alive).length;
      if (!player.alive) {
        s.result = 'lose';
        s.endTimer = 120;
        audio.playGameOver();
      } else if (aliveAIs === 0) {
        s.result = 'win';
        s.endTimer = 150;
        addScore(s, 1000);
        audio.playPowerUp();
      }
    };

    // ── Draw ─────────────────────────────────────────────────────────────────
    const roundRectPath = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    const drawFighter = (f: Fighter, animTick: number) => {
      if (!f.alive) {
        if (f.deathTimer <= 0) return;
        if (Math.floor(f.deathTimer / 6) % 2 === 0) return; // blink while dying
      }
      const x = f.px;
      const y = f.py + (f.dir !== DIRS.NONE ? Math.sin(animTick * 0.4) * 1.5 : 0);
      const r = CELL * 0.36;

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(f.px, f.py + r * 0.95, r * 0.75, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.fillStyle = f.color;
      roundRectPath(x - r * 0.65, y - r * 0.1, r * 1.3, r * 1.05, r * 0.4);
      ctx.fill();
      // Head
      ctx.beginPath();
      ctx.arc(x, y - r * 0.4, r * 0.78, 0, Math.PI * 2);
      ctx.fill();

      // Player highlight ring
      if (f.id === 0) {
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y - r * 0.4, r * 0.78, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Eyes (look toward moving direction)
      const ex = f.dir.x * 2;
      const ey = f.dir.y * 1.5;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x - 5 + ex, y - r * 0.45 + ey, 3.5, 4.5, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 5 + ex, y - r * 0.45 + ey, 3.5, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(x - 5 + ex * 1.5, y - r * 0.45 + ey * 1.5, 1.8, 0, Math.PI * 2);
      ctx.arc(x + 5 + ex * 1.5, y - r * 0.45 + ey * 1.5, 1.8, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = () => {
      const s = stateRef.current;
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Grid
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const x = OFFSET_X + c * CELL;
          const y = OFFSET_Y + r * CELL;
          const cell = s.grid[r][c];

          // Floor (checker pattern)
          ctx.fillStyle = (r + c) % 2 === 0 ? '#2e8b3d' : '#2a7f38';
          ctx.fillRect(x, y, CELL, CELL);

          if (cell === 1) {
            // Solid wall (bevelled)
            ctx.fillStyle = '#70707c';
            ctx.fillRect(x, y, CELL, CELL);
            ctx.fillStyle = '#9c9ca8';
            ctx.fillRect(x, y, CELL, 5);
            ctx.fillRect(x, y, 5, CELL);
            ctx.fillStyle = '#46464f';
            ctx.fillRect(x, y + CELL - 5, CELL, 5);
            ctx.fillRect(x + CELL - 5, y, 5, CELL);
          } else if (cell === 2) {
            // Destructible brick
            ctx.fillStyle = '#c4692a';
            ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
            ctx.fillStyle = '#d98a4a';
            ctx.fillRect(x + 1, y + 1, CELL - 2, 4);
            ctx.strokeStyle = '#8f4515';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 1; i < 3; i++) {
              ctx.moveTo(x + 1, y + (CELL / 3) * i);
              ctx.lineTo(x + CELL - 1, y + (CELL / 3) * i);
            }
            ctx.moveTo(x + CELL / 2, y + 1);
            ctx.lineTo(x + CELL / 2, y + CELL / 3);
            ctx.moveTo(x + CELL / 4, y + CELL / 3);
            ctx.lineTo(x + CELL / 4, y + (CELL / 3) * 2);
            ctx.moveTo(x + (CELL / 4) * 3, y + CELL / 3);
            ctx.lineTo(x + (CELL / 4) * 3, y + (CELL / 3) * 2);
            ctx.moveTo(x + CELL / 2, y + (CELL / 3) * 2);
            ctx.lineTo(x + CELL / 2, y + CELL - 1);
            ctx.stroke();
          }
        }
      }

      // Power-ups
      s.powerups.forEach(p => {
        const { px, py } = cellToPixel(p.col, p.row);
        const pulse = 1 + 0.06 * Math.sin(s.animTick * 0.15);
        const size = (CELL - 16) * pulse;
        ctx.fillStyle = '#f4f4f4';
        roundRectPath(px - size / 2, py - size / 2, size, size, 6);
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = p.type === 'bomb' ? '#333' : p.type === 'flame' ? '#ff7b00' : '#00b8d9';
        roundRectPath(px - size / 2, py - size / 2, size, size, 6);
        ctx.stroke();

        if (p.type === 'bomb') {
          ctx.fillStyle = '#1a1a1a';
          ctx.beginPath();
          ctx.arc(px, py + 2, size * 0.28, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#1a1a1a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px, py - size * 0.22);
          ctx.lineTo(px + 4, py - size * 0.36);
          ctx.stroke();
        } else if (p.type === 'flame') {
          ctx.fillStyle = '#ff7b00';
          ctx.beginPath();
          ctx.moveTo(px, py - size * 0.34);
          ctx.quadraticCurveTo(px + size * 0.32, py, px, py + size * 0.34);
          ctx.quadraticCurveTo(px - size * 0.32, py, px, py - size * 0.34);
          ctx.fill();
          ctx.fillStyle = '#ffd23f';
          ctx.beginPath();
          ctx.arc(px, py + size * 0.1, size * 0.14, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Speed: lightning bolt
          ctx.fillStyle = '#00b8d9';
          ctx.beginPath();
          ctx.moveTo(px + 3, py - size * 0.34);
          ctx.lineTo(px - 5, py + 2);
          ctx.lineTo(px - 1, py + 2);
          ctx.lineTo(px - 3, py + size * 0.34);
          ctx.lineTo(px + 5, py - 2);
          ctx.lineTo(px + 1, py - 2);
          ctx.closePath();
          ctx.fill();
        }
      });

      // Bombs
      s.bombs.forEach(b => {
        const { px, py } = cellToPixel(b.col, b.row);
        const urgent = b.timer < 45;
        const pulse = 1 + 0.09 * Math.sin(s.animTick * (urgent ? 0.6 : 0.15));
        const r = CELL * 0.32 * pulse;
        ctx.fillStyle = urgent && Math.floor(s.animTick / 5) % 2 === 0 ? '#5a1a1a' : '#1a1a1a';
        ctx.beginPath();
        ctx.arc(px, py + 2, r, 0, Math.PI * 2);
        ctx.fill();
        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.arc(px - r * 0.35, py + 2 - r * 0.35, r * 0.22, 0, Math.PI * 2);
        ctx.fill();
        // Fuse + spark
        ctx.strokeStyle = '#8f6a3a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(px, py + 2 - r);
        ctx.quadraticCurveTo(px + 6, py - r - 8, px + 10, py - r - 4);
        ctx.stroke();
        ctx.fillStyle = Math.floor(s.animTick / 4) % 2 === 0 ? '#ffd23f' : '#ff7b00';
        ctx.beginPath();
        ctx.arc(px + 10, py - r - 4, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Explosions
      s.explosions.forEach(e => {
        const alpha = e.timer / EXPLOSION_TIME;
        e.cells.forEach(c => {
          const x = OFFSET_X + c.col * CELL;
          const y = OFFSET_Y + c.row * CELL;
          ctx.globalAlpha = Math.min(1, alpha + 0.2);
          ctx.fillStyle = '#ff7b00';
          roundRectPath(x + 3, y + 3, CELL - 6, CELL - 6, 8);
          ctx.fill();
          ctx.fillStyle = '#ffd23f';
          roundRectPath(x + 12, y + 12, CELL - 24, CELL - 24, 6);
          ctx.fill();
          ctx.globalAlpha = 1;
        });
      });

      // Fighters (player drawn last, on top)
      [...s.fighters].sort((a, b) => (a.id === 0 ? 1 : 0) - (b.id === 0 ? 1 : 0))
        .forEach(f => drawFighter(f, s.animTick));

      // HUD
      const p = s.fighters[0];
      const aliveAIs = s.fighters.filter(f => f.isAI && f.alive).length;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`BOMBS ${p.maxBombs}  FLAME ${p.flame}  SPEED ${p.speed.toFixed(1)}`, OFFSET_X, 16);
      ctx.textAlign = 'right';
      ctx.fillText(`FOES ${aliveAIs}`, OFFSET_X + COLS * CELL, 16);
      ctx.textAlign = 'left';

      // End banner
      if (s.result !== '') {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, CANVAS_HEIGHT / 2 - 55, CANVAS_WIDTH, 110);
        ctx.font = '32px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = s.result === 'win' ? '#00ff88' : '#ff4466';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 16;
        ctx.fillText(s.result === 'win' ? 'VICTORY!' : 'DEFEATED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 12);
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';
      }
    };

    // Fixed 60Hz timestep so the game speed is identical on 120Hz+ displays
    const STEP = 1000 / 60;
    let lastTime = performance.now();
    let acc = 0;
    const loop = () => {
      const now = performance.now();
      acc = Math.min(acc + (now - lastTime), 250);
      lastTime = now;
      while (acc >= STEP) {
        update();
        acc -= STEP;
      }
      draw();
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState]);

  return (
    <GameWrapper
      title="BOMBERMAN"
      themeColor="magenta"
      score={score}
      gameId="bomberman"
      lives={null}
      gameState={gameState}
      onStart={startGame}
      onRestart={restartGame}
      onTogglePause={togglePause}
      onBack={onBack}
      instructions={[
        'Last one standing wins — defeat the 3 CPU bombers!',
        'Drop bombs to blast bricks and enemies. Explosions travel in a cross.',
        'Grab power-ups: extra bomb, longer flame, speed boost.',
        'Watch out: your own bombs can kill you!',
      ]}
      controls={[
        { keys: ['←', '→', '↑', '↓'], description: 'Move' },
        { keys: ['W', 'A', 'S', 'D'], description: 'Move (alt)' },
        { keys: ['Space'], description: 'Drop Bomb' },
        { keys: ['Esc'], description: 'Pause/Resume' },
      ]}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="game-canvas"
      />
    </GameWrapper>
  );
};

export default Bomberman;
