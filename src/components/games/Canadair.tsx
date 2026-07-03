import React, { useRef, useEffect, useState } from 'react';
import { GameWrapper } from './GameWrapper';
import { audio } from '../../utils/audio';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const GROUND_Y = CANVAS_HEIGHT - 50; // top of ground strip
const PLANE_WIDTH = 70;
const PLANE_HEIGHT = 30;

interface Flame {
  x: number;
  width: number;
  baseHeight: number;   // initial height for this flame
  currentHeight: number; // shrinks as water hits
  alive: boolean;
  flickerOffset: number; // random phase for animation
}

interface WaterDrop {
  x: number;
  y: number;
  dy: number;
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

interface Cloud {
  x: number;
  y: number;
  width: number;
  speed: number;
}

export const Canadair: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'paused' | 'gameover'>('idle');
  const [level, setLevel] = useState(1);

  const stateRef = useRef({
    gameState: 'idle',
    // Plane
    planeX: 30,
    planeY: 40,
    planeDirection: 1 as 1 | -1, // 1 = right, -1 = left
    planeSpeed: 2.5,
    rowHeight: 38,
    // Flames
    flames: [] as Flame[],
    // Water
    waterDrops: [] as WaterDrop[],
    lastDropTime: 0,
    dropCooldown: 500, // ms
    // Particles
    particles: [] as Particle[],
    // Clouds
    clouds: [] as Cloud[],
    // Keys
    keys: {} as Record<string, boolean>,
    // Transition
    isTransitioning: false,
    // Animation time
    tick: 0,
    // Water Capacity & Refill
    waterCapacity: 100,
    lastRefillTime: null as number | null,
  });


  useEffect(() => {
    stateRef.current.gameState = gameState;
  }, [gameState]);

  // ─── Init helpers ───

  const initFlames = (currentLevel: number) => {
    const state = stateRef.current;
    const flameCount = Math.min(12, 5 + Math.floor(currentLevel * 0.8));
    const spacing = (CANVAS_WIDTH - 80) / flameCount;
    const flames: Flame[] = [];

    for (let i = 0; i < flameCount; i++) {
      const baseH = 40 + Math.random() * 20 + currentLevel * 15;
      // Add random offset to spacing to make positions less uniform
      const randomOffset = (Math.random() - 0.5) * (spacing * 0.75);
      const targetX = 40 + i * spacing + spacing / 2 + randomOffset;
      const clampedX = Math.max(40, Math.min(CANVAS_WIDTH - 40, targetX));

      flames.push({
        x: clampedX,
        width: 28 + Math.random() * 12,
        baseHeight: baseH,
        currentHeight: baseH,
        alive: true,
        flickerOffset: Math.random() * Math.PI * 2,
      });
    }
    state.flames = flames;
  };

  const initClouds = () => {
    const clouds: Cloud[] = [];
    for (let i = 0; i < 5; i++) {
      clouds.push({
        x: Math.random() * CANVAS_WIDTH,
        y: 20 + Math.random() * 120,
        width: 60 + Math.random() * 80,
        speed: 0.2 + Math.random() * 0.3,
      });
    }
    stateRef.current.clouds = clouds;
  };

  const initGame = (currentLevel: number = level) => {
    const state = stateRef.current;
    state.planeX = 30;
    state.planeY = 40;
    state.planeDirection = 1;
    state.planeSpeed = 2.2 + currentLevel * 0.2;
    state.rowHeight = 38;
    state.waterDrops = [];
    state.particles = [];
    state.lastDropTime = 0;
    state.dropCooldown = Math.max(300, 500 - currentLevel * 20);
    state.isTransitioning = false;
    state.tick = 0;
    state.waterCapacity = 100;
    state.lastRefillTime = null;
    initFlames(currentLevel);
    initClouds();
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

  // ─── Keyboard ───

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      stateRef.current.keys[e.key] = true;
      if (stateRef.current.gameState === 'playing' && e.key === ' ') {
        e.preventDefault();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        togglePause();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      stateRef.current.keys[e.key] = false;
      if (stateRef.current.gameState === 'playing' && e.key === ' ') {
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

  // ─── Main game loop ───

  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const spawnParticles = (x: number, y: number, color: string, count = 8) => {
      const particles = stateRef.current.particles;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1;
        particles.push({
          x, y,
          dx: Math.cos(angle) * speed,
          dy: Math.sin(angle) * speed - 1,
          color,
          size: Math.random() * 3 + 1,
          life: 20 + Math.random() * 15,
        });
      }
    };

    // ─── UPDATE ───
    const updateGame = () => {
      const state = stateRef.current;
      if (state.gameState !== 'playing' || state.isTransitioning) return;

      state.tick++;

      // Move clouds
      state.clouds.forEach(c => {
        c.x += c.speed;
        if (c.x > CANVAS_WIDTH + c.width) c.x = -c.width;
      });

      // Move plane
      state.planeX += state.planeSpeed * state.planeDirection;

      // Boundary: reverse direction and drop one row
      if (state.planeDirection === 1 && state.planeX >= CANVAS_WIDTH - PLANE_WIDTH - 10) {
        state.planeX = CANVAS_WIDTH - PLANE_WIDTH - 10;
        state.planeDirection = -1;
        state.planeY += state.rowHeight;
      } else if (state.planeDirection === -1 && state.planeX <= 10) {
        state.planeX = 10;
        state.planeDirection = 1;
        state.planeY += state.rowHeight;
      }

      // Refill logic (X to refill)
      if ((state.keys['x'] || state.keys['X']) && !state.keys[' ']) {
        const now = Date.now();
        if (!state.lastRefillTime) {
          state.lastRefillTime = now;
        }
        const dt = (now - state.lastRefillTime) / 1000;
        state.lastRefillTime = now;
        // Refill takes 4 seconds on level 1, increasing up to 8 seconds at level 6+
        const refillDuration = Math.min(8, 4 + (level - 1) * 0.8);
        state.waterCapacity = Math.min(100, state.waterCapacity + dt * (100 / refillDuration));
        
        // Spawn mist/steam particles indicating refilling
        if (state.tick % 6 === 0 && state.waterCapacity < 100) {
          spawnParticles(state.planeX + PLANE_WIDTH / 2, state.planeY + PLANE_HEIGHT + 4, 'rgba(150, 220, 255, 0.6)', 1);
        }
      } else {
        state.lastRefillTime = null;
      }

      // Drop water on spacebar
      if (state.keys[' ']) {
        const now = Date.now();
        if (now - state.lastDropTime >= state.dropCooldown) {
          // Drops consume 5% on level 1, increasing up to 10% at level 6+
          const waterCost = 5 + Math.min(5, level - 1);
          if (state.waterCapacity >= waterCost) {
            state.lastDropTime = now;
            const dropX = state.planeX + PLANE_WIDTH / 2;
            const dropY = state.planeY + PLANE_HEIGHT + 4;
            state.waterDrops.push({ x: dropX, y: dropY, dy: 4 });
            state.waterCapacity = Math.max(0, state.waterCapacity - waterCost);
            audio.playLaser();
          }
        }
      }

      // Move water drops & check collisions
      for (let i = state.waterDrops.length - 1; i >= 0; i--) {
        const drop = state.waterDrops[i];
        drop.y += drop.dy;
        drop.dy += 0.15; // gravity

        // Off screen
        if (drop.y >= GROUND_Y + 10) {
          // Splash particles
          spawnParticles(drop.x, GROUND_Y, 'rgba(100, 180, 255, 0.8)', 5);
          state.waterDrops.splice(i, 1);
          continue;
        }

        // Check collision with flames
        let hitFlame = false;
        for (const flame of state.flames) {
          if (!flame.alive) continue;
          const flameTop = GROUND_Y - flame.currentHeight;
          const flameLeft = flame.x - flame.width / 2;
          const flameRight = flame.x + flame.width / 2;
          if (
            drop.x >= flameLeft - 5 &&
            drop.x <= flameRight + 5 &&
            drop.y >= flameTop &&
            drop.y <= GROUND_Y
          ) {
            // Hit! Reduce flame
            const reduction = 25 + Math.random() * 10;
            flame.currentHeight -= reduction;
            spawnParticles(drop.x, drop.y, 'rgba(200, 200, 200, 0.7)', 6); // steam
            audio.playScore();

            if (flame.currentHeight <= 0) {
              flame.currentHeight = 0;
              flame.alive = false;
              spawnParticles(flame.x, GROUND_Y - 10, 'rgba(150, 150, 150, 0.6)', 12);
              audio.playExplosion();
              setScore(s => s + 100);
            } else {
              setScore(s => s + 20);
            }
            hitFlame = true;
            break;
          }
        }
        if (hitFlame) {
          state.waterDrops.splice(i, 1);
        }
      }

      // Update particles
      for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.dx;
        p.y += p.dy;
        p.life--;
        p.size *= 0.96;
        if (p.life <= 0) {
          state.particles.splice(i, 1);
        }
      }

      // Check plane vs flame collision (game over condition)
      const planeBottom = state.planeY + PLANE_HEIGHT;
      const planeLeft = state.planeX;
      const planeRight = state.planeX + PLANE_WIDTH;

      for (const flame of state.flames) {
        if (!flame.alive) continue;
        const flameTop = GROUND_Y - flame.currentHeight;
        const flameLeft = flame.x - flame.width / 2;
        const flameRight = flame.x + flame.width / 2;

        if (
          planeRight >= flameLeft &&
          planeLeft <= flameRight &&
          planeBottom >= flameTop
        ) {
          // Plane hit a flame!
          audio.playGameOver();
          spawnParticles(state.planeX + PLANE_WIDTH / 2, state.planeY + PLANE_HEIGHT / 2, '#ff4400', 20);
          setLives(l => {
            const nextL = l - 1;
            if (nextL <= 0) {
              setGameState('gameover');
            } else {
              // Reset plane to top
              state.planeX = 30;
              state.planeY = 40;
              state.planeDirection = 1;
              state.waterDrops = [];
            }
            return nextL;
          });
          return; // skip further checks this frame
        }
      }

      // Check plane going below ground (all passes used, missed flames)
      if (state.planeY + PLANE_HEIGHT >= GROUND_Y) {
        // Check if any flames still alive
        const alive = state.flames.filter(f => f.alive);
        if (alive.length > 0) {
          audio.playGameOver();
          setLives(l => {
            const nextL = l - 1;
            if (nextL <= 0) {
              setGameState('gameover');
            } else {
              state.planeX = 30;
              state.planeY = 40;
              state.planeDirection = 1;
              state.waterDrops = [];
            }
            return nextL;
          });
          return;
        }
      }

      // Check level clear
      const aliveFlames = state.flames.filter(f => f.alive);
      if (aliveFlames.length === 0 && !state.isTransitioning) {
        state.isTransitioning = true;
        audio.playPowerUp();
        setScore(s => s + 200); // level bonus
        setLevel(l => l + 1);
        setTimeout(() => {
          initGame(level + 1);
        }, 800);
      }
    };

    // ─── DRAW ───
    const drawGame = () => {
      const state = stateRef.current;

      // ── Sky gradient background
      const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      skyGrad.addColorStop(0, '#1a6dd4');
      skyGrad.addColorStop(0.5, '#4fa8f7');
      skyGrad.addColorStop(1, '#87ceeb');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, GROUND_Y);

      // ── Ground
      const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_HEIGHT);
      groundGrad.addColorStop(0, '#3d8c2e');
      groundGrad.addColorStop(1, '#2a6b1e');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);

      // Grass tufts
      ctx.strokeStyle = '#4aa835';
      ctx.lineWidth = 2;
      for (let gx = 10; gx < CANVAS_WIDTH; gx += 25) {
        const h = 4 + Math.sin(gx * 0.3 + state.tick * 0.02) * 2;
        ctx.beginPath();
        ctx.moveTo(gx, GROUND_Y);
        ctx.lineTo(gx - 3, GROUND_Y - h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(gx, GROUND_Y);
        ctx.lineTo(gx + 3, GROUND_Y - h - 1);
        ctx.stroke();
      }

      // ── Clouds
      state.clouds.forEach(c => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.width / 2, c.width / 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(c.x - c.width * 0.25, c.y + 5, c.width / 3, c.width / 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(c.x + c.width * 0.25, c.y + 3, c.width / 3, c.width / 5, 0, 0, Math.PI * 2);
        ctx.fill();
      });

      // ── Flames
      state.flames.forEach(flame => {
        if (!flame.alive) {
          // Draw scorch mark
          ctx.fillStyle = 'rgba(30, 20, 10, 0.4)';
          ctx.beginPath();
          ctx.ellipse(flame.x, GROUND_Y + 2, flame.width / 2 + 4, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          return;
        }

        const h = flame.currentHeight;
        const w = flame.width;
        const baseX = flame.x;
        const baseY = GROUND_Y;
        const t = state.tick * 0.1 + flame.flickerOffset;

        // Outer glow
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'rgba(255, 100, 0, 0.6)';

        // Draw flame as layered bezier curves for organic look
        // Outer flame (red-orange)
        ctx.fillStyle = '#ff4400';
        ctx.beginPath();
        ctx.moveTo(baseX - w / 2, baseY);
        ctx.quadraticCurveTo(
          baseX - w / 3 + Math.sin(t * 1.3) * 6, baseY - h * 0.6,
          baseX + Math.sin(t) * 4, baseY - h
        );
        ctx.quadraticCurveTo(
          baseX + w / 3 + Math.sin(t * 1.5) * 6, baseY - h * 0.6,
          baseX + w / 2, baseY
        );
        ctx.closePath();
        ctx.fill();

        // Middle flame (orange)
        ctx.fillStyle = '#ff8800';
        ctx.beginPath();
        ctx.moveTo(baseX - w / 3, baseY);
        ctx.quadraticCurveTo(
          baseX - w / 5 + Math.sin(t * 1.7) * 4, baseY - h * 0.5,
          baseX + Math.sin(t * 1.2) * 3, baseY - h * 0.8
        );
        ctx.quadraticCurveTo(
          baseX + w / 5 + Math.sin(t * 2) * 4, baseY - h * 0.5,
          baseX + w / 3, baseY
        );
        ctx.closePath();
        ctx.fill();

        // Inner flame (yellow)
        ctx.fillStyle = '#ffdd00';
        ctx.beginPath();
        ctx.moveTo(baseX - w / 5, baseY);
        ctx.quadraticCurveTo(
          baseX - w / 8 + Math.sin(t * 2.1) * 3, baseY - h * 0.35,
          baseX + Math.sin(t * 1.6) * 2, baseY - h * 0.55
        );
        ctx.quadraticCurveTo(
          baseX + w / 8 + Math.sin(t * 2.5) * 3, baseY - h * 0.35,
          baseX + w / 5, baseY
        );
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;

        // Ember particles rising from flame tip
        if (state.tick % 4 === 0 && Math.random() < 0.4) {
          stateRef.current.particles.push({
            x: baseX + (Math.random() - 0.5) * w * 0.6,
            y: baseY - h + Math.random() * 10,
            dx: (Math.random() - 0.5) * 0.8,
            dy: -(Math.random() * 1.5 + 0.5),
            color: Math.random() > 0.5 ? '#ffaa00' : '#ff5500',
            size: Math.random() * 2.5 + 0.5,
            life: 15 + Math.random() * 10,
          });
        }
      });

      // ── Water drops
      state.waterDrops.forEach(drop => {
        // Teardrop shape
        ctx.fillStyle = '#3399ff';
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#66bbff';
        ctx.beginPath();
        ctx.arc(drop.x, drop.y + 3, 4, 0, Math.PI * 2);
        ctx.fill();
        // Point at top
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y - 4);
        ctx.lineTo(drop.x - 3, drop.y + 2);
        ctx.lineTo(drop.x + 3, drop.y + 2);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // ── Plane
      const px = state.planeX;
      const py = state.planeY;
      const dir = state.planeDirection;

      ctx.save();
      if (dir === -1) {
        // Flip horizontally around the plane center
        ctx.translate(px + PLANE_WIDTH / 2, 0);
        ctx.scale(-1, 1);
        ctx.translate(-(px + PLANE_WIDTH / 2), 0);
      }

      // Fuselage (red)
      ctx.fillStyle = '#cc2200';
      ctx.beginPath();
      ctx.moveTo(px, py + PLANE_HEIGHT / 2); // nose
      ctx.lineTo(px + 18, py + 6);
      ctx.lineTo(px + PLANE_WIDTH - 5, py + 6);
      ctx.lineTo(px + PLANE_WIDTH, py + PLANE_HEIGHT / 2 - 2);
      ctx.lineTo(px + PLANE_WIDTH, py + PLANE_HEIGHT / 2 + 6);
      ctx.lineTo(px + PLANE_WIDTH - 5, py + PLANE_HEIGHT - 4);
      ctx.lineTo(px + 18, py + PLANE_HEIGHT - 4);
      ctx.closePath();
      ctx.fill();

      // Visual Water Tank Pod under fuselage (centered)
      ctx.fillStyle = '#778899'; // metallic gray strut
      ctx.fillRect(px + PLANE_WIDTH / 2 - 8, py + PLANE_HEIGHT - 4, 16, 2);
      
      // Water tank pod container (blue with white outline/details)
      ctx.fillStyle = '#1e88e5';
      ctx.beginPath();
      ctx.arc(px + PLANE_WIDTH / 2 - 10, py + PLANE_HEIGHT, 4, Math.PI/2, Math.PI * 1.5);
      ctx.lineTo(px + PLANE_WIDTH / 2 + 10, py + PLANE_HEIGHT - 4);
      ctx.arc(px + PLANE_WIDTH / 2 + 10, py + PLANE_HEIGHT, 4, Math.PI * 1.5, Math.PI/2);
      ctx.lineTo(px + PLANE_WIDTH / 2 - 10, py + PLANE_HEIGHT + 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Nozzle at bottom of tank
      ctx.fillStyle = '#333333';
      ctx.fillRect(px + PLANE_WIDTH / 2 - 3, py + PLANE_HEIGHT + 3, 6, 2);

      // Yellow belly
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.moveTo(px + 10, py + PLANE_HEIGHT / 2 + 2);
      ctx.lineTo(px + PLANE_WIDTH - 5, py + PLANE_HEIGHT / 2 + 2);
      ctx.lineTo(px + PLANE_WIDTH - 5, py + PLANE_HEIGHT - 4);
      ctx.lineTo(px + 18, py + PLANE_HEIGHT - 4);
      ctx.closePath();
      ctx.fill();

      // Wing (top, darker red)
      ctx.fillStyle = '#aa1800';
      ctx.beginPath();
      ctx.moveTo(px + 25, py + 6);
      ctx.lineTo(px + 35, py - 6);
      ctx.lineTo(px + 55, py - 6);
      ctx.lineTo(px + 50, py + 6);
      ctx.closePath();
      ctx.fill();

      // Tail fin
      ctx.fillStyle = '#cc2200';
      ctx.beginPath();
      ctx.moveTo(px + PLANE_WIDTH - 8, py + 6);
      ctx.lineTo(px + PLANE_WIDTH - 2, py - 8);
      ctx.lineTo(px + PLANE_WIDTH + 5, py - 8);
      ctx.lineTo(px + PLANE_WIDTH, py + 6);
      ctx.closePath();
      ctx.fill();

      // White stripe on tail
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px + PLANE_WIDTH - 6, py - 5, 8, 2);

      // Cockpit window
      ctx.fillStyle = 'rgba(150, 220, 255, 0.8)';
      ctx.beginPath();
      ctx.ellipse(px + 12, py + PLANE_HEIGHT / 2 - 1, 5, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Propeller hint (spinning)
      if (state.tick % 2 === 0) {
        ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px - 4, py + PLANE_HEIGHT / 2 - 5);
        ctx.lineTo(px - 4, py + PLANE_HEIGHT / 2 + 7);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px - 7, py + PLANE_HEIGHT / 2);
        ctx.lineTo(px, py + PLANE_HEIGHT / 2 + 1);
        ctx.stroke();
      }

      ctx.restore();

      // ── Particles
      state.particles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life / 25);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // ── Level indicator
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`LEVEL: ${level}`, 20, CANVAS_HEIGHT - 38);

      // ── Flames remaining
      const remaining = state.flames.filter(f => f.alive).length;
      ctx.fillText(`FIRES: ${remaining}`, 160, CANVAS_HEIGHT - 38);

      // ── Water capacity bar
      const capBarX = 20;
      const capBarY = CANVAS_HEIGHT - 24;
      const capBarW = CANVAS_WIDTH - 40;
      const capBarH = 14;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(capBarX, capBarY, capBarW, capBarH);

      const fillW = (state.waterCapacity / 100) * capBarW;
      const blueGrad = ctx.createLinearGradient(capBarX, capBarY, capBarX, capBarY + capBarH);
      blueGrad.addColorStop(0, '#33b5ff');
      blueGrad.addColorStop(1, '#0066cc');
      ctx.fillStyle = blueGrad;
      ctx.fillRect(capBarX, capBarY, fillW, capBarH);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(capBarX, capBarY, capBarW, capBarH);

      ctx.fillStyle = '#ffffff';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`WATER TANK: ${Math.round(state.waterCapacity)}%`, CANVAS_WIDTH / 2, capBarY + 10);
      ctx.textAlign = 'left';

      // If refilling, show flashing indicator
      if ((state.keys['x'] || state.keys['X']) && !state.keys[' '] && state.waterCapacity < 100) {
        if (Math.floor(state.tick / 15) % 2 === 0) {
          ctx.fillStyle = '#00ffcc';
          ctx.font = '8px "Press Start 2P", monospace';
          ctx.fillText('REFILLING...', capBarX + 10, capBarY + 10);
        }
      }
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
      title="CANADAIR RESCUE"
      themeColor="magenta"
      score={score}
      gameId="canadair"
      lives={lives}
      gameState={gameState}
      onStart={startGame}
      onRestart={restartGame}
      onTogglePause={togglePause}
      onBack={onBack}
      instructions={[
        "A Canadair plane flies automatically across the sky in passes.",
        "Press Space to drop water on the flames below.",
        "Each drop consumes water (5% on level 1). Press X to refill the tank (takes 4s on level 1).",
        "Each water drop shrinks a flame — extinguish all fires to clear the level.",
        "The plane descends with each pass — don't let it hit an active flame!",
        "Higher levels bring taller, tougher flames and slower tank refilling.",
      ]}
      controls={[
        { keys: ['Spacebar'], description: 'Drop Water (Consumes 5%-10%)' },
        { keys: ['X'], description: 'Refill Water Tank (4s - 8s)' },
        { keys: ['Esc'], description: 'Pause / Resume' },
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
export default Canadair;
