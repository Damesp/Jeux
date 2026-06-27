import React, { useRef, useEffect, useState } from 'react';
import { GameWrapper } from './GameWrapper';
import { audio } from '../../utils/audio';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  points: number;
  alive: boolean;
  hard: boolean; // true for bricks that need two hits
  hitsRemaining: number; // 2 for untouched hard bricks, 1 after first hit
}

interface Particle {
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
  size: number;
  life: number;
}

// Power‑up capsule dropped from bricks
interface PowerUp {
  id: number;
  x: number;
  y: number;
  type: 'large' | 'glue' | 'gun' | 'ghost';
  color: string;
  spawnTime: number;
}

export const Breakout: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'paused' | 'gameover'>('idle');
  const [level, setLevel] = useState(1);

  const stateRef = useRef({
    gameState: 'idle',
    paddleX: CANVAS_WIDTH / 2,
    paddleWidth: 100,
    paddleHeight: 15,
    paddleSpeed: 8,
    ballX: CANVAS_WIDTH / 2,
    ballY: CANVAS_HEIGHT - 60,
    ballRadius: 8,
    ballSpeed: 5,
    ballDx: 4,
    ballDy: -4,
    isBallAttached: true,
    keys: {} as Record<string, boolean>,
    bricks: [] as Brick[],
    particles: [] as Particle[],
    ballTrail: [] as { x: number; y: number }[],
    // New power‑up state
    powerUps: [] as PowerUp[],
    activePowerUps: {} as Record<string, number>, // expiry timestamps
    isLargeBarActive: false,
    isGlueActive: false,
    isGunActive: false,
    isGhostActive: false,
    bullets: [] as { x: number; y: number; dx: number; dy: number }[],
    lastGunShot: 0,
    isTransitioning: false,
  });


  useEffect(() => {
    stateRef.current.gameState = gameState;
  }, [gameState]);

  const initBricks = (currentLevel: number) => {
    const state = stateRef.current;
    const rows = 4 + Math.min(2, Math.floor(currentLevel / 2)); // increases rows slightly
    const cols = 9;
    const padding = 12;
    const startX = 65;
    const startY = 70;
    const brickWidth = 65;
    const brickHeight = 22;

    const colors = ['#ff007f', '#ff7300', '#fffb00', '#00f0ff'];
    const bricks: Brick[] = [];

    for (let r = 0; r < rows; r++) {
      const color = colors[r % colors.length];
      const points = (rows - r) * 10;
      for (let c = 0; c < cols; c++) {
        bricks.push({
          x: startX + c * (brickWidth + padding),
          y: startY + r * (brickHeight + padding),
          width: brickWidth,
          height: brickHeight,
          color,
          points,
          alive: true,
          hard: false,
          hitsRemaining: 1,
        });
      }
    }

    // Determine hard bricks count based on level (more hard bricks on higher levels)
    const hardCount = Math.min(currentLevel, 6); // cap at 6 hard bricks
    for (let i = 0; i < hardCount; i++) {
      const idx = Math.floor(Math.random() * bricks.length);
      bricks[idx].hard = true;
      bricks[idx].hitsRemaining = 2;
      // Use a distinct colour for untouched hard bricks
      bricks[idx].color = '#ff007f'; // neon magenta
    }
    state.bricks = bricks;
  };

  const initGame = (currentLevel: number = level) => {
    const state = stateRef.current;
    state.paddleX = CANVAS_WIDTH / 2;
    state.paddleWidth = Math.max(60, 110 - currentLevel * 8); // paddle shrinks as level increases
    state.ballX = state.paddleX;
    state.ballY = CANVAS_HEIGHT - 30 - state.paddleHeight - state.ballRadius;
    state.isBallAttached = true;
    state.ballTrail = [];
    state.particles = [];
    state.powerUps = [];
    state.bullets = [];
    state.activePowerUps = {};
    
    const speed = 5 + currentLevel * 0.5;
    state.ballSpeed = speed;
    state.ballDx = speed * Math.cos(Math.PI / 4);
    state.ballDy = -speed * Math.sin(Math.PI / 4);

    initBricks(currentLevel);
    state.isTransitioning = false;
  };

  const startGame = () => {
    setLevel(1);
    setScore(0);
    setLives(3);
    initGame();
    setGameState('playing');
    audio.playGameStart();
  };

  const restartGame = () => {
    setLevel(1);
    setScore(0);
    setLives(3);
    initGame();
    setGameState('playing');
    audio.playGameStart();
  };

  const togglePause = () => {
    setGameState(prev => (prev === 'playing' ? 'paused' : 'playing'));
  };

  // Keyboard Event Handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const keys = stateRef.current.keys;
      keys[e.key] = true;

      // Prevent scrolling defaults when playing
      if (stateRef.current.gameState === 'playing' && 
          ['ArrowLeft', 'ArrowRight', ' ', 'Spacebar'].includes(e.key)) {
        e.preventDefault();
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        togglePause();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const keys = stateRef.current.keys;
      keys[e.key] = false;
      if (stateRef.current.gameState === 'playing' && 
          ['ArrowLeft', 'ArrowRight', ' ', 'Spacebar'].includes(e.key)) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState]);

  // Main Canvas loop
  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const spawnParticles = (x: number, y: number, color: string, count = 10) => {
      const particles = stateRef.current.particles;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1;
        particles.push({
          x,
          y,
          dx: Math.cos(angle) * speed,
          dy: Math.sin(angle) * speed,
          color,
          size: Math.random() * 4 + 1,
          life: 25 + Math.random() * 15,
        });
      }
    };

    const updateGame = () => {
      const state = stateRef.current;
      if (state.gameState !== 'playing') return;

      // Update Powerup Durations
      const now = Date.now();
      state.isLargeBarActive = (state.activePowerUps['large'] || 0) > now;
      state.isGlueActive = (state.activePowerUps['glue'] || 0) > now;
      state.isGunActive = (state.activePowerUps['gun'] || 0) > now;
      state.isGhostActive = (state.activePowerUps['ghost'] || 0) > now;

      // Move Paddle Left/Right
      const currentPaddleW = state.isLargeBarActive ? 160 : state.paddleWidth;
      if (state.keys['ArrowLeft'] || state.keys['a'] || state.keys['A']) {
        state.paddleX = Math.max(currentPaddleW / 2 + 10, state.paddleX - state.paddleSpeed);
      }
      if (state.keys['ArrowRight'] || state.keys['d'] || state.keys['D']) {
        state.paddleX = Math.min(CANVAS_WIDTH - currentPaddleW / 2 - 10, state.paddleX + state.paddleSpeed);
      }
        // Ball attached movement
        if (state.isBallAttached) {
          state.ballX = state.paddleX;
          state.ballY = CANVAS_HEIGHT - 30 - state.paddleHeight - state.ballRadius;
          
          // Launch ball on Space
          if (state.keys[' '] || state.keys['ArrowUp'] || state.keys['w'] || state.keys['W']) {
            if (state.isGunActive) {
              const now = Date.now();
              const cooldown = 1200; // 1.2 seconds
              if (now - state.lastGunShot >= cooldown) {
                state.lastGunShot = now;
                // Fire two bullets from paddle edges
                const currentPaddleW = state.isLargeBarActive ? 160 : state.paddleWidth;
                const leftX = state.paddleX - currentPaddleW / 2 + 10;
                const rightX = state.paddleX + currentPaddleW / 2 - 10;
                const bulletY = CANVAS_HEIGHT - 30 - state.paddleHeight;
                state.bullets.push({ x: leftX, y: bulletY, dx: 0, dy: -6 });
                state.bullets.push({ x: rightX, y: bulletY, dx: 0, dy: -6 });
              }
            } else {
              // Release the ball with initial velocity
              state.isBallAttached = false;
              // Deactivate glue power-up when ball is released
              state.isGlueActive = false;
              state.activePowerUps['glue'] = 0;
              // Reset speed based on current level speed setting
              const speed = state.ballSpeed;
              state.ballDx = speed * Math.cos(Math.PI / 4);
              state.ballDy = -speed * Math.sin(Math.PI / 4);
              audio.playLaser();
            }
          }
      } else {
        // Record trail points
        state.ballTrail.push({ x: state.ballX, y: state.ballY });
        if (state.ballTrail.length > 5) {
          state.ballTrail.shift();
        }

        // Move Ball
        state.ballX += state.ballDx;
        state.ballY += state.ballDy;

        // Gun fire while ball is free (space key)
        if (state.isGunActive && (state.keys[' '] || state.keys['ArrowUp'] || state.keys['w'] || state.keys['W'])) {
          const now = Date.now();
          const cooldown = 1200; // 1.2 s
          if (now - state.lastGunShot >= cooldown) {
            state.lastGunShot = now;
            // Fire two bullets from paddle edges (use current paddle width)
            const currentPaddleW = state.isLargeBarActive ? 160 : state.paddleWidth;
            const leftX = state.paddleX - currentPaddleW / 2 + 10;
            const rightX = state.paddleX + currentPaddleW / 2 - 10;
            const bulletY = CANVAS_HEIGHT - 30 - state.paddleHeight;
            state.bullets.push({ x: leftX, y: bulletY, dx: 0, dy: -6 });
            state.bullets.push({ x: rightX, y: bulletY, dx: 0, dy: -6 });
          }
        }

          // Side wall collision – bounce without residual dots
          if (state.ballX - state.ballRadius <= 0) {
            state.ballX = state.ballRadius;
            state.ballDx = -state.ballDx;
            audio.playScore();
          } else if (state.ballX + state.ballRadius >= CANVAS_WIDTH) {
            state.ballX = CANVAS_WIDTH - state.ballRadius;
            state.ballDx = -state.ballDx;
            audio.playScore();
          }

        // Collision: Top boundary
        if (state.ballY - state.ballRadius <= 0) {
          state.ballY = state.ballRadius;
          state.ballDy = -state.ballDy;
          audio.playScore();
          // Removed particle spawn to avoid residual dots
        }

        // Collision: Bottom boundary (Losing life)
        if (state.ballY - state.ballRadius >= CANVAS_HEIGHT) {
          audio.playGameOver();
          setLives(l => {
            const nextL = l - 1;
            if (nextL <= 0) {
              setGameState('gameover');
            } else {
              // Reset ball on paddle
              state.isBallAttached = true;
              state.ballX = state.paddleX;
              state.ballY = CANVAS_HEIGHT - 30 - state.paddleHeight - state.ballRadius;
              state.ballTrail = [];
              const speed = 5 + level * 0.5;
              state.ballSpeed = speed;
              state.ballDx = speed * Math.cos(Math.PI / 4);
              state.ballDy = -speed * Math.sin(Math.PI / 4);
            }
            return nextL;
          });
        }

        // Collision: Paddle reflection
        const pTop = CANVAS_HEIGHT - 30 - state.paddleHeight;
        const pLeft = state.paddleX - currentPaddleW / 2;
        const pRight = state.paddleX + currentPaddleW / 2;

        if (
          state.ballY + state.ballRadius >= pTop &&
          state.ballY - state.ballRadius <= pTop + state.paddleHeight &&
          state.ballX >= pLeft &&
          state.ballX <= pRight &&
          state.ballDy > 0 // traveling downwards
        ) {
          if (state.isGlueActive) {
            state.isBallAttached = true;
          } else {
            // Reflect ball based on where it hit the paddle
            const hitPosition = (state.ballX - state.paddleX) / (currentPaddleW / 2); // -1.0 to 1.0
            const bounceAngle = hitPosition * (Math.PI / 3.2); 
            state.ballDx = state.ballSpeed * Math.sin(bounceAngle);
            state.ballDy = -state.ballSpeed * Math.cos(bounceAngle);
            state.ballY = pTop - state.ballRadius;
            audio.playScore();
            // Removed particle spawn to avoid residual dots
          }
        }

        // Collision: Brick breakdown
        let brickHit = false;
        state.bricks.forEach(brick => {
          if (brick.alive && !brickHit) {
            const bx = brick.x;
            const by = brick.y;
            const bw = brick.width;
            const bh = brick.height;
            const r = state.ballRadius;

            if (
              state.ballX + r >= bx &&
              state.ballX - r <= bx + bw &&
              state.ballY + r >= by &&
              state.ballY - r <= by + bh
            ) {
              brick.hitsRemaining -= 1;
              if (brick.hitsRemaining <= 0) {
                brick.alive = false;
                brickHit = true;
                // Removed particle spawn to avoid residual dots
                audio.playScore();
                setScore(s => s + brick.points);
                
                // Spawn Powerup (3% chance)
                if (Math.random() < 0.05) {
                  const types: ('large' | 'glue' | 'gun' | 'ghost')[] = ['large', 'glue', 'gun', 'ghost'];
                  state.powerUps.push({
                    id: Date.now(),
                    x: bx + bw / 2,
                    y: by + bh / 2,
                    type: types[Math.floor(Math.random() * types.length)],
                    color: '#fff',
                    spawnTime: Date.now()
                  });
                }
              } else {
                // Dim hard brick color
                brick.color = '#555';
              }

              if (!state.isGhostActive) {
              const fromLeft = state.ballX - state.ballDx <= bx;
              const fromRight = state.ballX - state.ballDx >= bx + bw;
              if (fromLeft || fromRight) state.ballDx = -state.ballDx;
              else state.ballDy = -state.ballDy;
            }
            }
          }
        });

        // Check level clear
        const activeBricks = state.bricks.filter(b => b.alive);
        if (activeBricks.length === 0 && !state.isTransitioning) {
          state.isTransitioning = true;
          audio.playPowerUp();
          setLevel(l => l + 1);
          setTimeout(() => {
            initGame(level + 1);
          }, 600);
        }
      }

      // Update Powerups
      state.powerUps.forEach((p, idx) => {
        p.y += 2;
        // Collision with paddle
        const pTop = CANVAS_HEIGHT - 30 - state.paddleHeight;
          if (p.y >= pTop && p.x >= state.paddleX - currentPaddleW / 2 && p.x <= state.paddleX + currentPaddleW / 2) {
            // Deactivate any previously active power‑up
            Object.keys(state.activePowerUps).forEach(key => {
              state.activePowerUps[key] = 0;
            });
            state.activePowerUps[p.type] = Date.now() + 15000;
            state.powerUps.splice(idx, 1);
            audio.playPowerUp();
          } else if (p.y > CANVAS_HEIGHT) {
            state.powerUps.splice(idx, 1);
          }
      });

      // Update bullets
      state.bullets.forEach((b, bIdx) => {
        // Move bullet
        b.y += b.dy;
        // Remove bullet if off-screen
        if (b.y < 0) {
          state.bullets.splice(bIdx, 1);
          return;
        }
        // Collision with bricks
        state.bricks.forEach(brick => {
          if (!brick.alive) return;
          const bx = brick.x;
          const by = brick.y;
          const bw = brick.width;
          const bh = brick.height;
          const r = 4; // bullet radius
          if (
            b.x + r >= bx &&
            b.x - r <= bx + bw &&
            b.y + r >= by &&
            b.y - r <= by + bh
          ) {
            // Hit brick
            brick.hitsRemaining -= 1;
            if (brick.hitsRemaining <= 0) {
              brick.alive = false;
              spawnParticles(bx + bw / 2, by + bh / 2, brick.color, 18);
              audio.playScore();
              setScore(s => s + brick.points);
              // Possibly spawn powerup
              if (Math.random() < 0.05) {
                const types: ('large' | 'glue' | 'gun' | 'ghost')[] = ['large', 'glue', 'gun', 'ghost'];
                state.powerUps.push({
                  id: Date.now(),
                  x: bx + bw / 2,
                  y: by + bh / 2,
                  type: types[Math.floor(Math.random() * types.length)],
                  color: '#fff',
                  spawnTime: Date.now(),
                });
              }
            } else {
              // Dim hard brick color
              brick.color = '#555';
            }
            // Remove bullet after hit
            state.bullets.splice(bIdx, 1);
          }
        });
      });

      // After processing bullets, check if level cleared
      const activeBricksAfterBullets = state.bricks.filter(b => b.alive);
      if (activeBricksAfterBullets.length === 0 && !state.isTransitioning) {
        state.isTransitioning = true;
        audio.playPowerUp();
        setLevel(l => l + 1);
        setTimeout(() => {
          initGame(level + 1);
        }, 600);
      }
    };

    const drawGame = () => {
      const state = stateRef.current;
      ctx.fillStyle = '#060410';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw Grid
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
      for (let x = 0; x < CANVAS_WIDTH; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke(); }
      for (let y = 0; y < CANVAS_HEIGHT; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke(); }

      // Draw Level
      ctx.fillStyle = '#5e5975';
      ctx.font = '10px "Press Start 2P"';
      ctx.fillText(`LEVEL: ${level}`, 20, CANVAS_HEIGHT - 20);

        // Draw Bricks
        state.bricks.forEach(brick => {
          if (!brick.alive) return;
          if (brick.hitsRemaining > 1) {
            // Hard brick gradient
            const grad = ctx.createLinearGradient(brick.x, brick.y, brick.x + brick.width, brick.y + brick.height);
            grad.addColorStop(0, '#ff0080');
            grad.addColorStop(1, '#ff66c4');
            ctx.fillStyle = grad;
          } else {
            ctx.fillStyle = brick.color;
          }
          ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.fillRect(brick.x + 2, brick.y + 2, brick.width - 4, 3);
        });

      // Draw Paddle
      const currentPaddleW = state.isLargeBarActive ? 160 : state.paddleWidth;
      const pTop = CANVAS_HEIGHT - 30 - state.paddleHeight;
      const pLeft = state.paddleX - currentPaddleW / 2;
      ctx.fillStyle = state.isGlueActive ? '#ffb700' : '#ff007f';
      ctx.shadowBlur = 10;
      ctx.shadowColor = ctx.fillStyle;
      ctx.fillRect(pLeft, pTop, currentPaddleW, state.paddleHeight);
      ctx.shadowBlur = 0;

      // Visual gun icons on paddle when gun power‑up active
      if (state.isGunActive) {
        ctx.fillStyle = '#00ff00'; // gun colour
        const gunWidth = 8;
        const gunHeight = 12;
        // Left gun near left edge
        ctx.fillRect(pLeft + 6, pTop - gunHeight, gunWidth, gunHeight);
        // Right gun near right edge
        ctx.fillRect(pLeft + currentPaddleW - gunWidth - 6, pTop - gunHeight, gunWidth, gunHeight);
      }

      // Draw PowerUps
      state.powerUps.forEach(p => {
        ctx.fillStyle = p.type === 'large' ? '#ff00ff' : p.type === 'glue' ? '#ffb700' : p.type === 'gun' ? '#00ff00' : p.type === 'ghost' ? '#ff8800' : '#ff8800';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw Ball
      ctx.fillStyle = state.isGhostActive ? '#ff8800' : '#00f0ff';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#00f0ff';
      ctx.beginPath();
      ctx.arc(state.ballX, state.ballY, state.ballRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw Bullets (if gun active)
      if (state.isGunActive) {
        state.bullets.forEach(b => {
          ctx.fillStyle = '#fffb00'; // bright projectile colour
          ctx.beginPath();
          ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Draw Particles
      state.particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      });
    };

    const loop = () => {
      updateGame();
      drawGame();
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [level, gameState]);

  return (
    <GameWrapper
      title="BREAKOUT ARCADE"
      themeColor="magenta"
      score={score}
      gameId="breakout"
      lives={lives}
      gameState={gameState}
      onStart={startGame}
      onRestart={restartGame}
      onTogglePause={togglePause}
      onBack={onBack}
      instructions={[
        "Bounce the cyber ball off the paddle to break rows of top bricks.",
        "Reflect the ball at sharper angles by hitting closer to the paddle's edge.",
        "Clear all bricks to advance to the next level.",
        "Each level decreases paddle size and increases ball speed."
      ]}
      controls={[
        { keys: ['←', 'A'], description: 'Steer Paddle Left' },
        { keys: ['→', 'D'], description: 'Steer Paddle Right' },
        { keys: ['Spacebar', '↑'], description: 'Launch Ball' },
        { keys: ['Esc'], description: 'Pause/Resume' }
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
export default Breakout;
