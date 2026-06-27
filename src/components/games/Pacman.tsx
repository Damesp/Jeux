import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameWrapper } from './GameWrapper';
import { audio } from '../../utils/audio';

const CANVAS_WIDTH = 560;
const CANVAS_HEIGHT = 620;
const CELL = 20; // size of each tile

// ─── Maze layout ──────────────────────────────────────────────────────────────
// 0 = wall, 1 = pellet, 2 = empty, 3 = power pellet, 4 = ghost house door
const RAW_MAZE: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
  [0, 3, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 3, 0],
  [0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0],
  [0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0],
  [0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 4, 4, 0, 0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 2, 2, 2, 2, 0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 0, 0, 2, 2, 2, 2, 0, 0, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2],
  [0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 2, 2, 2, 2, 0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
  [0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
  [0, 3, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 3, 0],
  [0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0],
  [0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0],
  [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
  [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

const COLS = RAW_MAZE[0].length; // 28
const ROWS = RAW_MAZE.length;    // 31

// Offset to center horizontally on the canvas
const OFFSET_X = (CANVAS_WIDTH - COLS * CELL) / 2;
const OFFSET_Y = 30;

type Dir = { x: number; y: number };
const DIRS: Record<string, Dir> = {
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  NONE: { x: 0, y: 0 },
};

type GhostMode = 'chase' | 'scatter' | 'frightened' | 'dead';

interface Ghost {
  col: number;
  row: number;
  px: number;  // pixel x (center)
  py: number;  // pixel y (center)
  dir: Dir;
  nextDir: Dir;
  mode: GhostMode;
  color: string;
  scatterTarget: { col: number; row: number };
  frightenTimer: number;
  deadTimer: number;
  speed: number;
}

interface GameState {
  gameState: 'idle' | 'playing' | 'paused' | 'gameover';
  maze: number[][];
  pacCol: number;
  pacRow: number;
  pacPx: number;
  pacPy: number;
  pacDir: Dir;
  pacNextDir: Dir;
  pacSpeed: number;
  pacMouthAngle: number;
  pacMouthDir: number;
  ghosts: Ghost[];
  score: number;
  pelletsLeft: number;
  totalPellets: number;
  frightenedTimer: number;
  keys: Record<string, boolean>;
  animTick: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const cellToPixel = (col: number, row: number) => ({
  px: OFFSET_X + col * CELL + CELL / 2,
  py: OFFSET_Y + row * CELL + CELL / 2,
});

const isWalkable = (maze: number[][], col: number, row: number, isGhostHouseDoorAllowed: boolean = false): boolean => {
  if (row < 0 || row >= ROWS) return true; // tunnels wrap
  if (col < 0 || col >= COLS) return true;
  if (maze[row][col] === 4) return isGhostHouseDoorAllowed;
  return maze[row][col] !== 0;
};

const countPellets = (maze: number[][]) =>
  maze.flat().filter(c => c === 1 || c === 3).length;

const cloneMaze = (): number[][] => RAW_MAZE.map(r => [...r]);

const manhattanDist = (c1: number, r1: number, c2: number, r2: number) =>
  Math.abs(c1 - c2) + Math.abs(r1 - r2);

// ─── Ghost AI ─────────────────────────────────────────────────────────────────

const chooseGhostDir = (
  ghost: Ghost,
  maze: number[][],
  pacCol: number,
  pacRow: number,
  pacDir: Dir,
): Dir => {
  const { col, row, dir } = ghost;

  // Determine target tile
  let targetCol = ghost.scatterTarget.col;
  let targetRow = ghost.scatterTarget.row;

  if (ghost.mode === 'chase') {
    if (ghost.color === '#ff0000') {
      // Blinky: target Pac directly
      targetCol = pacCol;
      targetRow = pacRow;
    } else if (ghost.color === '#ffb8ff') {
      // Pinky: target 4 ahead of Pac
      targetCol = pacCol + pacDir.x * 4;
      targetRow = pacRow + pacDir.y * 4;
    } else if (ghost.color === '#00ffff') {
      // Inky: complex flank
      targetCol = pacCol + pacDir.x * 2;
      targetRow = pacRow + pacDir.y * 2;
    } else {
      // Clyde: target Pac if far, else scatter
      if (manhattanDist(col, row, pacCol, pacRow) > 8) {
        targetCol = pacCol;
        targetRow = pacRow;
      }
    }
  } else if (ghost.mode === 'frightened') {
    targetCol = pacCol;
    targetRow = pacRow;
    let bestDir = dir;
    let bestDist = -Infinity;
    const isGhostHouseDoorAllowed = (row >= 13 && row <= 15);

    for (const d of [DIRS.UP, DIRS.LEFT, DIRS.DOWN, DIRS.RIGHT]) {
      const nc = col + d.x;
      const nr = row + d.y;
      if (d.x === -dir.x && d.y === -dir.y) continue; // no reverse
      if (!isWalkable(maze, nc, nr, isGhostHouseDoorAllowed)) continue;
      const dist = manhattanDist(nc, nr, targetCol, targetRow);
      if (dist > bestDist) {
        bestDist = dist;
        bestDir = d;
      }
    }

    if (bestDist === -Infinity) {
      for (const d of [DIRS.UP, DIRS.LEFT, DIRS.DOWN, DIRS.RIGHT]) {
        const nc = col + d.x;
        const nr = row + d.y;
        if (!isWalkable(maze, nc, nr, isGhostHouseDoorAllowed)) continue;
        bestDir = d;
      }
    }
    return bestDir;
  } else if (ghost.mode === 'dead') {
    // Head to ghost house (col 13, row 13)
    targetCol = 13;
    targetRow = 13;
  }

  // Pick the walkable neighbour closest to target (not reversing unless no choice)
  let bestDir = dir;
  let bestDist = Infinity;
  const isGhostHouseDoorAllowed = ghost.mode === 'dead' || (row >= 13 && row <= 15);
  for (const d of [DIRS.UP, DIRS.LEFT, DIRS.DOWN, DIRS.RIGHT]) {
    const nc = col + d.x;
    const nr = row + d.y;
    // Cannot reverse
    if (d.x === -dir.x && d.y === -dir.y) continue;
    if (!isWalkable(maze, nc, nr, isGhostHouseDoorAllowed)) continue;
    const dist = manhattanDist(nc, nr, targetCol, targetRow);
    if (dist < bestDist) {
      bestDist = dist;
      bestDir = d;
    }
  }
  return bestDir;
};

// ─── Component ────────────────────────────────────────────────────────────────

export const Pacman: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() =>
    parseInt(localStorage.getItem('pacman_highscore') || '0', 10)
  );
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'paused' | 'gameover'>('idle');

  const stateRef = useRef<GameState>({
    gameState: 'idle',
    maze: cloneMaze(),
    pacCol: 13,
    pacRow: 22,
    pacPx: 0,
    pacPy: 0,
    pacDir: DIRS.NONE,
    pacNextDir: DIRS.NONE,
    pacSpeed: 1.5,
    pacMouthAngle: 0.25,
    pacMouthDir: 1,
    ghosts: [],
    score: 0,
    pelletsLeft: 0,
    totalPellets: 0,
    frightenedTimer: 0,
    keys: {},
    animTick: 0,
  });

  const makeGhosts = (): Ghost[] => {
    const specs = [
      { col: 13, row: 13, color: '#ff0000', scatter: { col: 25, row: 0 } },
      { col: 13, row: 14, color: '#ffb8ff', scatter: { col: 2, row: 0 } },
      { col: 14, row: 14, color: '#00ffff', scatter: { col: 27, row: 29 } },
      { col: 12, row: 14, color: '#ffb852', scatter: { col: 0, row: 29 } },
    ];
    return specs.map(s => {
      const { px, py } = cellToPixel(s.col, s.row);
      return {
        col: s.col,
        row: s.row,
        px,
        py,
        dir: DIRS.LEFT,
        nextDir: DIRS.LEFT,
        mode: 'chase' as GhostMode,
        color: s.color,
        scatterTarget: s.scatter,
        frightenTimer: 0,
        deadTimer: 0,
        speed: 1.0,
      };
    });
  };

  const initGame = useCallback(() => {
    const s = stateRef.current;
    s.maze = cloneMaze();
    s.pacCol = 13;
    s.pacRow = 22;
    const pp = cellToPixel(13, 22);
    s.pacPx = pp.px;
    s.pacPy = pp.py;
    s.pacDir = DIRS.NONE;
    s.pacNextDir = DIRS.NONE;
    s.pacMouthAngle = 0.25;
    s.pacMouthDir = 1;
    s.ghosts = makeGhosts();
    s.score = 0;
    s.pelletsLeft = countPellets(s.maze);
    s.totalPellets = s.pelletsLeft;
    s.frightenedTimer = 0;
    s.animTick = 0;
  }, []);

  const startGame = useCallback(() => {
    initGame();
    setScore(0);
    setLives(3);
    setGameState('playing');
    audio.playGameStart();
  }, [initGame]);

  const restartGame = useCallback(() => {
    initGame();
    setScore(0);
    setLives(3);
    setGameState('playing');
    audio.playGameStart();
  }, [initGame]);

  const togglePause = useCallback(() => {
    setGameState(prev => prev === 'playing' ? 'paused' : 'playing');
  }, []);

  // Sync react state → ref
  useEffect(() => { stateRef.current.gameState = gameState; }, [gameState]);

  // High score tracking
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('pacman_highscore', score.toString());
    }
  }, [score, highScore]);

  // Keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      stateRef.current.keys[e.key] = true;
      const s = stateRef.current;

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
        e.preventDefault();
      }

      if (e.key === 'Escape') { e.preventDefault(); togglePause(); }

      if (s.gameState === 'playing') {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') s.pacNextDir = DIRS.LEFT;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') s.pacNextDir = DIRS.RIGHT;
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') s.pacNextDir = DIRS.UP;
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') s.pacNextDir = DIRS.DOWN;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      stateRef.current.keys[e.key] = false;
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

    // ── Update ──────────────────────────────────────────────────────────────
    const update = () => {
      const s = stateRef.current;
      if (s.gameState !== 'playing') return;

      s.animTick++;

      // ── Pac-Man movement ──────────────────────────────────────────────────
      const tryDir = (dir: Dir): boolean => {
        const nextCol = s.pacCol + dir.x;
        const nextRow = s.pacRow + dir.y;
        return isWalkable(s.maze, nextCol, nextRow);
      };

      // Try to apply requested direction
      if (s.pacNextDir !== DIRS.NONE && tryDir(s.pacNextDir)) {
        s.pacDir = s.pacNextDir;
      }

      if (s.pacDir !== DIRS.NONE && tryDir(s.pacDir)) {
        // Move pixel-by-pixel
        s.pacPx += s.pacDir.x * s.pacSpeed;
        s.pacPy += s.pacDir.y * s.pacSpeed;

        // Snap to grid cell center when passing through
        const centerX = OFFSET_X + s.pacCol * CELL + CELL / 2;
        const centerY = OFFSET_Y + s.pacRow * CELL + CELL / 2;

        const dx = s.pacPx - centerX;
        const dy = s.pacPy - centerY;

        if (Math.abs(dx) >= CELL || Math.abs(dy) >= CELL) {
          const newCol = Math.round((s.pacPx - OFFSET_X - CELL / 2) / CELL);
          const newRow = Math.round((s.pacPy - OFFSET_Y - CELL / 2) / CELL);

          // Tunnel wrap
          s.pacCol = ((newCol % COLS) + COLS) % COLS;
          s.pacRow = Math.max(0, Math.min(ROWS - 1, newRow));

          const snapped = cellToPixel(s.pacCol, s.pacRow);
          s.pacPx = snapped.px;
          s.pacPy = snapped.py;

          // Eat pellet
          const cell = s.maze[s.pacRow]?.[s.pacCol];
          if (cell === 1) {
            s.maze[s.pacRow][s.pacCol] = 2;
            s.score += 10;
            s.pelletsLeft--;
            setScore(s.score);
            audio.playScore();
          } else if (cell === 3) {
            s.maze[s.pacRow][s.pacCol] = 2;
            s.score += 50;
            s.pelletsLeft--;
            setScore(s.score);
            audio.playPowerUp();
            // Frighten all ghosts
            s.frightenedTimer = 300; // ~5s at 60fps
            s.ghosts.forEach(g => {
              if (g.mode !== 'dead') {
                g.mode = 'frightened';
                g.frightenTimer = 300;
              }
            });
          }

          // Win condition
          if (s.pelletsLeft <= 0) {
            audio.playPowerUp();
            setTimeout(() => {
              s.maze = cloneMaze();
              s.pelletsLeft = countPellets(s.maze);
              s.score += 1000;
              setScore(s.score);
              const pp = cellToPixel(13, 22);
              s.pacCol = 13; s.pacRow = 22;
              s.pacPx = pp.px; s.pacPy = pp.py;
              s.pacDir = DIRS.NONE;
              s.ghosts = makeGhosts();
            }, 1500);
          }
        }
      }

      // Mouth animation
      s.pacMouthAngle += 0.05 * s.pacMouthDir;
      if (s.pacMouthAngle > 0.3) s.pacMouthDir = -1;
      if (s.pacMouthAngle < 0.02) s.pacMouthDir = 1;

      // ── Frighten timer ────────────────────────────────────────────────────
      if (s.frightenedTimer > 0) {
        s.frightenedTimer--;
        if (s.frightenedTimer === 0) {
          s.ghosts.forEach(g => { if (g.mode === 'frightened') g.mode = 'chase'; });
        }
      }

      // ── Ghost movement ────────────────────────────────────────────────────
      s.ghosts.forEach((g, gi) => {
        if (g.mode === 'dead') {
          g.deadTimer--;
          if (g.deadTimer <= 0) {
            g.mode = 'scatter';
            const hp = cellToPixel(13, 13);
            g.col = 13; g.row = 13;
            g.px = hp.px; g.py = hp.py;
          }
          return;
        }

        if (g.frightenTimer > 0) {
          g.frightenTimer--;
          if (g.frightenTimer === 0 && g.mode === 'frightened') g.mode = 'chase';
        }

        // Move ghost at cell boundaries
        const ghostCenter = cellToPixel(g.col, g.row);
        const gDx = g.px - ghostCenter.px;
        const gDy = g.py - ghostCenter.py;

        const speed = g.mode === 'frightened' ? 0.6 : 1.0 + gi * 0.05;
        g.px += g.dir.x * speed;
        g.py += g.dir.y * speed;

        // At the center of a new cell, choose next direction
        if (Math.abs(gDx) < speed && Math.abs(gDy) < speed) {
          g.px = ghostCenter.px;
          g.py = ghostCenter.py;

          g.dir = chooseGhostDir(g, s.maze, s.pacCol, s.pacRow, s.pacDir);

          g.col = ((g.col + g.dir.x % COLS) + COLS) % COLS;
          g.row = Math.max(0, Math.min(ROWS - 1, g.row + g.dir.y));
        }
      });

      // ── Collision Pac vs Ghosts ───────────────────────────────────────────
      const COLLISION_RADIUS = CELL * 0.6;
      s.ghosts.forEach(g => {
        if (g.mode === 'dead') return;
        const dist = Math.hypot(g.px - s.pacPx, g.py - s.pacPy);
        if (dist < COLLISION_RADIUS) {
          if (g.mode === 'frightened') {
            g.mode = 'dead';
            g.deadTimer = 120;
            s.score += 200;
            setScore(s.score);
            audio.playScore();
          } else {
            // Pac-Man dies
            audio.playGameOver();
            setLives(prev => {
              const next = prev - 1;
              if (next <= 0) {
                setGameState('gameover');
              } else {
                // Reset positions
                const pp = cellToPixel(13, 22);
                s.pacCol = 13; s.pacRow = 22;
                s.pacPx = pp.px; s.pacPy = pp.py;
                s.pacDir = DIRS.NONE;
                s.ghosts = makeGhosts();
              }
              return next;
            });
          }
        }
      });
    };

    // ── Draw ─────────────────────────────────────────────────────────────────
    const draw = () => {
      const s = stateRef.current;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw maze
      s.maze.forEach((row, ri) => {
        row.forEach((cell, ci) => {
          const x = OFFSET_X + ci * CELL;
          const y = OFFSET_Y + ri * CELL;

          if (cell === 0) {
            // Wall
            ctx.fillStyle = '#1a0080';
            ctx.fillRect(x, y, CELL, CELL);
            // Wall border highlight
            ctx.strokeStyle = '#3333ff';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 0.75, y + 0.75, CELL - 1.5, CELL - 1.5);
          } else if (cell === 1) {
            // Pellet
            ctx.fillStyle = '#ffcc88';
            ctx.beginPath();
            ctx.arc(x + CELL / 2, y + CELL / 2, 2.5, 0, Math.PI * 2);
            ctx.fill();
          } else if (cell === 3) {
            // Power pellet (pulsing)
            const pulse = 0.5 + 0.5 * Math.sin(s.animTick * 0.15);
            const r = 4 + pulse * 3;
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 8 + pulse * 6;
            ctx.beginPath();
            ctx.arc(x + CELL / 2, y + CELL / 2, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          } else if (cell === 4) {
            // Ghost house door
            ctx.fillStyle = '#ff88ff';
            ctx.fillRect(x, y + CELL / 2 - 1.5, CELL, 3);
          }
        });
      });

      // Draw Pac-Man
      const pacRadius = CELL * 0.45;
      const mouthAngle = s.pacMouthAngle * Math.PI;

      // Rotation based on direction
      let rotation = 0;
      if (s.pacDir === DIRS.RIGHT || s.pacDir === DIRS.NONE) rotation = 0;
      else if (s.pacDir === DIRS.DOWN) rotation = Math.PI / 2;
      else if (s.pacDir === DIRS.LEFT) rotation = Math.PI;
      else if (s.pacDir === DIRS.UP) rotation = -Math.PI / 2;

      ctx.save();
      ctx.translate(s.pacPx, s.pacPy);
      ctx.rotate(rotation);

      ctx.fillStyle = '#ffe000';
      ctx.shadowColor = '#ffe000';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, pacRadius, mouthAngle, Math.PI * 2 - mouthAngle);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();

      // Draw Ghosts
      const ghostRadius = CELL * 0.45;
      s.ghosts.forEach(g => {
        if (g.mode === 'dead') {
          // Just draw eyes travelling
          ctx.fillStyle = 'white';
          ctx.beginPath();
          ctx.arc(g.px - 4, g.py - 3, 4, 0, Math.PI * 2);
          ctx.arc(g.px + 4, g.py - 3, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#00f';
          ctx.beginPath();
          ctx.arc(g.px - 4 + g.dir.x * 1.5, g.py - 3 + g.dir.y * 1.5, 2, 0, Math.PI * 2);
          ctx.arc(g.px + 4 + g.dir.x * 1.5, g.py - 3 + g.dir.y * 1.5, 2, 0, Math.PI * 2);
          ctx.fill();
          return;
        }

        const flashingBlue = g.frightenTimer > 0 && g.frightenTimer < 80 && Math.floor(g.frightenTimer / 10) % 2 === 0;
        const bodyColor = g.mode === 'frightened'
          ? (flashingBlue ? '#ffffff' : '#2222ff')
          : g.color;

        ctx.shadowColor = bodyColor;
        ctx.shadowBlur = 8;
        ctx.fillStyle = bodyColor;

        const gx = g.px;
        const gy = g.py;

        // Ghost body shape
        ctx.beginPath();
        ctx.arc(gx, gy - 1, ghostRadius, Math.PI, 0);
        // Wavy bottom
        const segments = 3;
        const segW = (ghostRadius * 2) / segments;
        for (let i = 0; i <= segments; i++) {
          const wx = gx - ghostRadius + i * segW;
          const wy = gy + ghostRadius - (i % 2 === 0 ? 6 : 0);
          ctx.lineTo(wx, wy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Ghost eyes (only when not frightened)
        if (g.mode !== 'frightened') {
          ctx.fillStyle = 'white';
          ctx.beginPath();
          ctx.ellipse(gx - 4, gy - 3, 3.5, 4, 0, 0, Math.PI * 2);
          ctx.ellipse(gx + 4, gy - 3, 3.5, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#00f';
          ctx.beginPath();
          ctx.arc(gx - 4 + g.dir.x * 1.5, gy - 3 + g.dir.y * 1.5, 2, 0, Math.PI * 2);
          ctx.arc(gx + 4 + g.dir.x * 1.5, gy - 3 + g.dir.y * 1.5, 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Frightened face (X eyes and wavy mouth)
          ctx.strokeStyle = flashingBlue ? '#2222ff' : '#fff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(gx - 6, gy - 5); ctx.lineTo(gx - 2, gy - 1);
          ctx.moveTo(gx - 2, gy - 5); ctx.lineTo(gx - 6, gy - 1);
          ctx.moveTo(gx + 2, gy - 5); ctx.lineTo(gx + 6, gy - 1);
          ctx.moveTo(gx + 6, gy - 5); ctx.lineTo(gx + 2, gy - 1);
          ctx.stroke();
        }
      });

      // Score display on canvas (small, bottom-left)
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`HI: ${stateRef.current.score}`, OFFSET_X, CANVAS_HEIGHT - 6);
    };

    const loop = () => {
      update();
      draw();
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState]);

  return (
    <GameWrapper
      title="PAC-MAN"
      themeColor="cyan"
      score={score}
      highScore={highScore}
      lives={lives}
      gameState={gameState}
      onStart={startGame}
      onRestart={restartGame}
      onTogglePause={togglePause}
      onBack={onBack}
      instructions={[
        'Eat all pellets to clear the level.',
        'Power pellets let you eat the ghosts!',
        'Avoid the 4 ghosts — they each have unique AI.',
        'Eating ghosts while powered up scores 200 pts.',
      ]}
      controls={[
        { keys: ['←', 'A'], description: 'Move Left' },
        { keys: ['→', 'D'], description: 'Move Right' },
        { keys: ['↑', 'W'], description: 'Move Up' },
        { keys: ['↓', 'S'], description: 'Move Down' },
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

export default Pacman;
