import React, { useRef, useEffect, useState } from 'react';
import { GameWrapper } from './GameWrapper';
import { audio } from '../../utils/audio';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

interface Bullet {
  x: number;
  y: number;
  dy: number;
}

interface Invader {
  x: number;
  y: number;
  width: number;
  height: number;
  points: number;
  alive: boolean;
  type: 0 | 1 | 2; // 3 visual styles
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

export const SpaceInvaders: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('space_invaders_highscore') || '0', 10);
  });
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'paused' | 'gameover'>('idle');
  const [level, setLevel] = useState(1);

  // Use refs for gameplay state variables to access them in the requestAnimationFrame loop safely
  const stateRef = useRef({
    gameState: 'idle',
    playerX: CANVAS_WIDTH / 2,
    playerWidth: 50,
    playerHeight: 20,
    playerSpeed: 7,
    keys: {} as Record<string, boolean>,
    bullets: [] as Bullet[],
    enemyBullets: [] as Bullet[],
    invaders: [] as Invader[],
    particles: [] as Particle[],
    invaderDirection: 1,
    invaderSpeed: 1.5,
    invaderStepDown: 15,
    lastShootTime: 0,
    lastEnemyShootTime: 0,
    invaderAnimFrame: 0,
    invaderAnimTimer: 0,
    isTransitioning: false,
    stars: [] as { x: number; y: number; size: number; speed: number }[],
  });

  // Load standard stars background once
  useEffect(() => {
    const stars = [];
    for (let i = 0; i < 40; i++) {
      stars.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        size: Math.random() * 2,
        speed: Math.random() * 0.5 + 0.1,
      });
    }
    stateRef.current.stars = stars;
  }, []);

  // Update localStorage high score when score changes
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('space_invaders_highscore', score.toString());
    }
  }, [score, highScore]);

  // Synchronize status state
  useEffect(() => {
    stateRef.current.gameState = gameState;
  }, [gameState]);

  const initGame = (currentLevel: number = level) => {
    const state = stateRef.current;
    state.isTransitioning = false;
    state.playerX = CANVAS_WIDTH / 2;
    state.bullets = [];
    state.enemyBullets = [];
    state.particles = [];
    state.invaderDirection = 1;
    state.invaderSpeed = 1.0 + (currentLevel - 1) * 0.15; // speed increases slowly with level
    
    // Create grid of invaders
    const invaders: Invader[] = [];
    const rows = 5;
    const cols = 10;
    const padding = 20;
    const startX = 100;
    const startY = 80;
    const cellWidth = 45;
    const cellHeight = 30;

    for (let r = 0; r < rows; r++) {
      const type = r === 0 ? 2 : r < 3 ? 1 : 0; // top, middle, bottom styles
      const points = (3 - Math.floor(r/2)) * 10; // 30, 20, 10
      for (let c = 0; c < cols; c++) {
        invaders.push({
          x: startX + c * (cellWidth + padding),
          y: startY + r * (cellHeight + padding),
          width: cellWidth,
          height: cellHeight,
          points,
          alive: true,
          type: type as any,
        });
      }
    }
    state.invaders = invaders;
  };

  const startGame = () => {
    setLevel(1);
    setScore(0);
    setLives(3);
    initGame(1);
    setGameState('playing');
    audio.playGameStart();
  };

  const restartGame = () => {
    setLevel(1);
    setScore(0);
    setLives(3);
    initGame(1);
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

  // Main Canvas Render Game Loop
  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const spawnParticles = (x: number, y: number, color: string, count = 12) => {
      const particles = stateRef.current.particles;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1;
        particles.push({
          x,
          y,
          dx: Math.cos(angle) * speed,
          dy: Math.sin(angle) * speed,
          color,
          size: Math.random() * 3 + 1,
          life: 30 + Math.random() * 20, // number of frames it survives
        });
      }
    };

    const updateGame = () => {
      const state = stateRef.current;
      if (state.gameState !== 'playing') return;

      // Update stars background
      state.stars.forEach(star => {
        star.y += star.speed;
        if (star.y > CANVAS_HEIGHT) {
          star.y = 0;
          star.x = Math.random() * CANVAS_WIDTH;
        }
      });

      // Player Movement
      if (state.keys['ArrowLeft'] || state.keys['a'] || state.keys['A']) {
        state.playerX = Math.max(state.playerWidth / 2, state.playerX - state.playerSpeed);
      }
      if (state.keys['ArrowRight'] || state.keys['d'] || state.keys['D']) {
        state.playerX = Math.min(CANVAS_WIDTH - state.playerWidth / 2, state.playerX + state.playerSpeed);
      }

      // Player Fire
      const now = Date.now();
      if ((state.keys[' '] || state.keys['ArrowUp']) && now - state.lastShootTime > 300) {
        state.bullets.push({
          x: state.playerX,
          y: CANVAS_HEIGHT - 40,
          dy: -8,
        });
        state.lastShootTime = now;
        audio.playLaser();
      }

      // Update Player Bullets
      state.bullets = state.bullets.filter(bullet => {
        bullet.y += bullet.dy;
        return bullet.y > 0;
      });

      // Update Enemy Bullets
      state.enemyBullets = state.enemyBullets.filter(bullet => {
        bullet.y += bullet.dy;
        
        // Check collision with Player
        if (
          bullet.y >= CANVAS_HEIGHT - 35 &&
          bullet.y <= CANVAS_HEIGHT - 15 &&
          bullet.x >= state.playerX - state.playerWidth / 2 &&
          bullet.x <= state.playerX + state.playerWidth / 2
        ) {
          // Player hit!
          spawnParticles(state.playerX, CANVAS_HEIGHT - 25, '#ff007f', 30);
          audio.playExplosion();
          setLives(l => {
            const nextL = l - 1;
            if (nextL <= 0) {
              setGameState('gameover');
              audio.playGameOver();
            }
            return nextL;
          });
          state.playerX = CANVAS_WIDTH / 2; // reset player center
          state.enemyBullets = []; // clear screen bombs
          return false;
        }
        return bullet.y < CANVAS_HEIGHT;
      });

      // Update particles
      state.particles.forEach(p => {
        p.x += p.dx;
        p.y += p.dy;
        p.life -= 1;
      });
      state.particles = state.particles.filter(p => p.life > 0);

      // Update Invader animation
      state.invaderAnimTimer += 1;
      if (state.invaderAnimTimer > 25) {
        state.invaderAnimFrame = state.invaderAnimFrame === 0 ? 1 : 0;
        state.invaderAnimTimer = 0;
      }

      // Update Invader movement
      let edgeReached = false;
      const activeInvaders = state.invaders.filter(inv => inv.alive);
      
      activeInvaders.forEach(inv => {
        inv.x += state.invaderSpeed * state.invaderDirection;
        if (
          (state.invaderDirection > 0 && inv.x + inv.width >= CANVAS_WIDTH - 20) ||
          (state.invaderDirection < 0 && inv.x <= 20)
        ) {
          edgeReached = true;
        }
      });

      if (edgeReached) {
        state.invaderDirection *= -1;
        state.invaders.forEach(inv => {
          if (inv.alive) {
            inv.y += state.invaderStepDown;
            
            // Check if invaders reach player height
            if (inv.y + inv.height >= CANVAS_HEIGHT - 50) {
              setGameState('gameover');
              audio.playGameOver();
            }
          }
        });
      }

      // Check bullet collisions with invaders
      state.bullets = state.bullets.filter(bullet => {
        let hit = false;
        state.invaders.forEach(inv => {
          if (inv.alive && !hit) {
            if (
              bullet.x >= inv.x &&
              bullet.x <= inv.x + inv.width &&
              bullet.y >= inv.y &&
              bullet.y <= inv.y + inv.height
            ) {
              inv.alive = false;
              hit = true;
              spawnParticles(inv.x + inv.width / 2, inv.y + inv.height / 2, 
                inv.type === 2 ? '#ff7300' : inv.type === 1 ? '#00f0ff' : '#39ff14');
              audio.playScore();
              setScore(s => s + inv.points);
            }
          }
        });
        return !hit;
      });

      // Let random bottom invaders fire back
      if (activeInvaders.length > 0 && now - state.lastEnemyShootTime > Math.max(400, 1500 - level * 200)) {
        // Group by columns and find the bottom-most invader of each column
        const columnMap: Record<number, Invader> = {};
        state.invaders.forEach(inv => {
          if (inv.alive) {
            const colIndex = Math.round(inv.x / 60);
            if (!columnMap[colIndex] || columnMap[colIndex].y < inv.y) {
              columnMap[colIndex] = inv;
            }
          }
        });

        const bottomInvaders = Object.values(columnMap);
        if (bottomInvaders.length > 0) {
          const shooter = bottomInvaders[Math.floor(Math.random() * bottomInvaders.length)];
          state.enemyBullets.push({
            x: shooter.x + shooter.width / 2,
            y: shooter.y + shooter.height,
            dy: 4.5 + level * 0.5,
          });
          state.lastEnemyShootTime = now;
        }
      }

      // Check level clear
      if (activeInvaders.length === 0 && !state.isTransitioning) {
        state.isTransitioning = true;
        audio.playPowerUp();
        setTimeout(() => {
          setLevel(l => {
            const nextL = l + 1;
            initGame(nextL);
            return nextL;
          });
        }, 500);
      }
    };

    const drawGame = () => {
      const state = stateRef.current;
      
      // Background clean
      ctx.fillStyle = '#050409';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw stars
      ctx.fillStyle = '#fff';
      state.stars.forEach(star => {
        ctx.fillRect(star.x, star.y, star.size, star.size);
      });

      // Draw Level UI indicator
      ctx.fillStyle = '#5e5975';
      ctx.font = '10px "Press Start 2P"';
      ctx.fillText(`LEVEL: ${level}`, 20, CANVAS_HEIGHT - 20);

      // Draw Player Ship (Retro styled arcade ship)
      if (state.gameState !== 'gameover') {
        const px = state.playerX;
        const py = CANVAS_HEIGHT - 30;
        ctx.fillStyle = '#39ff14'; // neon green
        
        ctx.beginPath();
        // Custom space invader turret shape
        ctx.moveTo(px, py - 15);
        ctx.lineTo(px - 5, py - 5);
        ctx.lineTo(px - 25, py - 5);
        ctx.lineTo(px - 25, py + 10);
        ctx.lineTo(px + 25, py + 10);
        ctx.lineTo(px + 25, py - 5);
        ctx.lineTo(px + 5, py - 5);
        ctx.closePath();
        ctx.fill();

        // Ship glowing effects
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#39ff14';
        ctx.fillRect(px - 2, py - 18, 4, 6);
        ctx.shadowBlur = 0; // reset
      }

      // Draw Invaders
      state.invaders.forEach(inv => {
        if (!inv.alive) return;

        // Visual styles of aliens (pixel shapes)
        if (inv.type === 2) {
          ctx.fillStyle = '#ff7300'; // neon orange top
        } else if (inv.type === 1) {
          ctx.fillStyle = '#00f0ff'; // neon cyan middle
        } else {
          ctx.fillStyle = '#ff007f'; // neon magenta bottom
        }

        // Draw retro invaders pixel art
        const ix = inv.x;
        const iy = inv.y;
        const anim = state.invaderAnimFrame;

        // Custom pixel matrices for the retro shapes
        ctx.fillRect(ix + 10, iy + 6, inv.width - 20, inv.height - 12);
        
        // Legs / Wings animation
        if (anim === 0) {
          ctx.fillRect(ix + 5, iy + 14, 5, 10);
          ctx.fillRect(ix + inv.width - 10, iy + 14, 5, 10);
          ctx.fillRect(ix + 12, iy + 2, 4, 4);
          ctx.fillRect(ix + inv.width - 16, iy + 2, 4, 4);
        } else {
          ctx.fillRect(ix + 2, iy + 18, 5, 8);
          ctx.fillRect(ix + inv.width - 7, iy + 18, 5, 8);
          ctx.fillRect(ix + 8, iy + 4, 4, 4);
          ctx.fillRect(ix + inv.width - 12, iy + 4, 4, 4);
        }
        
        // Eyes
        ctx.fillStyle = '#000';
        ctx.fillRect(ix + 12, iy + 10, 4, 4);
        ctx.fillRect(ix + inv.width - 16, iy + 10, 4, 4);
      });

      // Draw Player Bullets
      ctx.fillStyle = '#fffb00'; // yellow neon
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#fffb00';
      state.bullets.forEach(bullet => {
        ctx.fillRect(bullet.x - 2, bullet.y, 4, 12);
      });
      ctx.shadowBlur = 0;

      // Draw Enemy Bullets (Bombs)
      ctx.fillStyle = '#ff007f'; // magenta laser
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ff007f';
      state.enemyBullets.forEach(bullet => {
        // Draw squiggle bomb
        ctx.fillRect(bullet.x - 2, bullet.y, 4, 10);
        ctx.fillRect(bullet.x - (bullet.y % 6 > 3 ? 4 : 0), bullet.y + 4, 4, 2);
      });
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
      title="SPACE INVADERS"
      themeColor="green"
      score={score}
      highScore={highScore}
      lives={lives}
      gameState={gameState}
      onStart={startGame}
      onRestart={restartGame}
      onTogglePause={togglePause}
      onBack={onBack}
      instructions={[
        "Dodge falling alien lasers & bombs.",
        "Destroy all alien invaders in the sky to complete the level.",
        "Invader speeds and rate of fire increase with each new level.",
        "Letting any invader reach the bottom shield line results in instant Game Over."
      ]}
      controls={[
        { keys: ['←', 'A'], description: 'Steer Spacecraft Left' },
        { keys: ['→', 'D'], description: 'Steer Spacecraft Right' },
        { keys: ['Spacebar', '↑'], description: 'Fire Laser Turret' },
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
export default SpaceInvaders;
