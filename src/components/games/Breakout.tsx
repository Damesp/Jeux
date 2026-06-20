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

export const Breakout: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('breakout_highscore') || '0', 10);
  });
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
  });

  // Track high score
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('breakout_highscore', score.toString());
    }
  }, [score, highScore]);

  useEffect(() => {
    stateRef.current.gameState = gameState;
  }, [gameState]);

  const initBricks = () => {
    const state = stateRef.current;
    const rows = 4 + Math.min(2, Math.floor(level / 2)); // increases rows slightly
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
        });
      }
    }
    state.bricks = bricks;
  };

  const initGame = () => {
    const state = stateRef.current;
    state.paddleX = CANVAS_WIDTH / 2;
    state.paddleWidth = Math.max(60, 110 - level * 8); // paddle shrinks as level increases
    state.ballX = state.paddleX;
    state.ballY = CANVAS_HEIGHT - 30 - state.paddleHeight - state.ballRadius;
    state.isBallAttached = true;
    state.ballTrail = [];
    state.particles = [];
    
    const speed = 5 + level * 0.5;
    state.ballSpeed = speed;
    state.ballDx = speed * Math.cos(Math.PI / 4);
    state.ballDy = -speed * Math.sin(Math.PI / 4);

    initBricks();
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

      // Move Paddle Left/Right
      if (state.keys['ArrowLeft'] || state.keys['a'] || state.keys['A']) {
        state.paddleX = Math.max(state.paddleWidth / 2 + 10, state.paddleX - state.paddleSpeed);
      }
      if (state.keys['ArrowRight'] || state.keys['d'] || state.keys['D']) {
        state.paddleX = Math.min(CANVAS_WIDTH - state.paddleWidth / 2 - 10, state.paddleX + state.paddleSpeed);
      }

      // Ball attached movement
      if (state.isBallAttached) {
        state.ballX = state.paddleX;
        state.ballY = CANVAS_HEIGHT - 30 - state.paddleHeight - state.ballRadius;
        
        // Launch ball on Space
        if (state.keys[' '] || state.keys['ArrowUp'] || state.keys['w'] || state.keys['W']) {
          state.isBallAttached = false;
          audio.playLaser();
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

        // Collision: Left/Right boundaries
        if (state.ballX - state.ballRadius <= 0) {
          state.ballX = state.ballRadius;
          state.ballDx = -state.ballDx;
          audio.playScore();
          spawnParticles(0, state.ballY, '#fff', 5);
        } else if (state.ballX + state.ballRadius >= CANVAS_WIDTH) {
          state.ballX = CANVAS_WIDTH - state.ballRadius;
          state.ballDx = -state.ballDx;
          audio.playScore();
          spawnParticles(CANVAS_WIDTH, state.ballY, '#fff', 5);
        }

        // Collision: Top boundary
        if (state.ballY - state.ballRadius <= 0) {
          state.ballY = state.ballRadius;
          state.ballDy = -state.ballDy;
          audio.playScore();
          spawnParticles(state.ballX, 0, '#fff', 5);
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
        const pLeft = state.paddleX - state.paddleWidth / 2;
        const pRight = state.paddleX + state.paddleWidth / 2;

        if (
          state.ballY + state.ballRadius >= pTop &&
          state.ballY - state.ballRadius <= pTop + state.paddleHeight &&
          state.ballX >= pLeft &&
          state.ballX <= pRight &&
          state.ballDy > 0 // traveling downwards
        ) {
          // Reflect ball based on where it hit the paddle (radial angles)
          const hitPosition = (state.ballX - state.paddleX) / (state.paddleWidth / 2); // -1.0 to 1.0
          const bounceAngle = hitPosition * (Math.PI / 3.2); // max 56 degree reflection
          
          state.ballDx = state.ballSpeed * Math.sin(bounceAngle);
          state.ballDy = -state.ballSpeed * Math.cos(bounceAngle);
          
          state.ballY = pTop - state.ballRadius; // pop above paddle
          audio.playScore();
          spawnParticles(state.ballX, pTop, '#ff007f', 12);
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

            // Simple box-circle collision approximation
            if (
              state.ballX + r >= bx &&
              state.ballX - r <= bx + bw &&
              state.ballY + r >= by &&
              state.ballY - r <= by + bh
            ) {
              brick.alive = false;
              brickHit = true;
              spawnParticles(bx + bw / 2, by + bh / 2, brick.color, 18);
              audio.playScore();
              setScore(s => s + brick.points);

              // Determine bounce reflection side (left/right vs top/bottom)
              const fromLeft = state.ballX - state.ballDx <= bx;
              const fromRight = state.ballX - state.ballDx >= bx + bw;
              const fromTop = state.ballY - state.ballDy <= by;
              const fromBottom = state.ballY - state.ballDy >= by + bh;

              if (fromLeft || fromRight) {
                state.ballDx = -state.ballDx;
              } else if (fromTop || fromBottom) {
                state.ballDy = -state.ballDy;
              } else {
                // fallback
                state.ballDy = -state.ballDy;
              }
            }
          }
        });

        // Check level clear
        const activeBricks = state.bricks.filter(b => b.alive);
        if (activeBricks.length === 0) {
          setLevel(l => {
            const nextL = l + 1;
            audio.playPowerUp();
            setTimeout(() => {
              initGame();
            }, 600);
            return nextL;
          });
        }
      }

      // Update particles
      state.particles.forEach(p => {
        p.x += p.dx;
        p.y += p.dy;
        p.life -= 1;
      });
      state.particles = state.particles.filter(p => p.life > 0);
    };

    const drawGame = () => {
      const state = stateRef.current;
      
      // Clean canvas
      ctx.fillStyle = '#060410';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw background borders grid
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x < CANVAS_WIDTH; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y < CANVAS_HEIGHT; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();
      }

      // Draw Level indicators
      ctx.fillStyle = '#5e5975';
      ctx.font = '10px "Press Start 2P"';
      ctx.fillText(`LEVEL: ${level}`, 20, CANVAS_HEIGHT - 20);

      // Draw Bricks
      state.bricks.forEach(brick => {
        if (!brick.alive) return;
        ctx.fillStyle = brick.color;
        
        // Draw brick box with neon shadows
        ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
        
        // Internal brick highlight line
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fillRect(brick.x + 2, brick.y + 2, brick.width - 4, 3);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(brick.x + 2, brick.y + brick.height - 5, brick.width - 4, 3);
      });

      // Draw Paddle (Neon glowing bar)
      const pTop = CANVAS_HEIGHT - 30 - state.paddleHeight;
      const pLeft = state.paddleX - state.paddleWidth / 2;
      ctx.fillStyle = '#ff007f'; // neon magenta paddle
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff007f';
      ctx.fillRect(pLeft, pTop, state.paddleWidth, state.paddleHeight);
      ctx.shadowBlur = 0;
      
      // Paddle details
      ctx.fillStyle = '#fff';
      ctx.fillRect(pLeft + 4, pTop + 2, state.paddleWidth - 8, 3);

      // Draw Ball Trail
      state.ballTrail.forEach((t, index) => {
        const opacity = (index + 1) / (state.ballTrail.length + 1) * 0.45;
        ctx.fillStyle = `rgba(0, 240, 255, ${opacity})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, state.ballRadius * 0.8, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw Ball
      ctx.fillStyle = '#00f0ff'; // Neon Cyan
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#00f0ff';
      ctx.beginPath();
      ctx.arc(state.ballX, state.ballY, state.ballRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

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
      highScore={highScore}
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
