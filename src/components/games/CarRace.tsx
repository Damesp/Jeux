import React, { useRef, useEffect, useState } from 'react';
import { GameWrapper } from './GameWrapper';
import { audio } from '../../utils/audio';

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 800;
const LANE_WIDTH = 120;
const ROAD_WIDTH = LANE_WIDTH * 4;
const ROAD_LEFT = (CANVAS_WIDTH - ROAD_WIDTH) / 2;

interface ObstacleCar {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  color: string;
  passed: boolean;
  type: number; // visual index
  currentLane: number;
  targetLane: number;
  targetX: number;
  indicator: 'left' | 'right' | 'none';
}

interface Coin {
  id: number;
  x: number;
  y: number;
  radius: number;
  passed: boolean;
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

interface Pedestrian {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  dx: number;
  type: 'human' | 'dog';
  alive: boolean;
}

export const CarRace: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'paused' | 'gameover'>('idle');
  const [speedKmh, setSpeedKmh] = useState(120);

  const stateRef = useRef({
    gameState: 'idle',
    playerX: CANVAS_WIDTH / 2,
    playerY: CANVAS_HEIGHT - 120,
    playerWidth: 50,
    playerHeight: 85,
    playerSpeed: 6.5,
    roadScrollY: 0,
    baseScrollSpeed: 8,
    speedMultiplier: 1.0,
    keys: {} as Record<string, boolean>,
    obstacles: [] as ObstacleCar[],
    coins: [] as Coin[],
    particles: [] as Particle[],
    pedestrians: [] as Pedestrian[],
    lastObstacleSpawnTime: 0,
    lastCoinSpawnTime: 0,
    lastPedestrianSpawnTime: 0,
    obstacleIdCounter: 0,
    coinIdCounter: 0,
    pedestrianIdCounter: 0,
    scoreTimer: 0,
  });


  useEffect(() => {
    stateRef.current.gameState = gameState;
  }, [gameState]);

  const initGame = () => {
    const state = stateRef.current;
    state.playerX = CANVAS_WIDTH / 2;
    state.playerY = CANVAS_HEIGHT - 120;
    state.roadScrollY = 0;
    state.speedMultiplier = 1.0;
    state.obstacles = [];
    state.coins = [];
    state.particles = [];
    state.pedestrians = [];
    state.lastObstacleSpawnTime = 0;
    state.lastCoinSpawnTime = 0;
    state.lastPedestrianSpawnTime = 0;
    state.scoreTimer = 0;
  };

  const startGame = () => {
    setScore(0);
    setLives(3);
    initGame();
    setGameState('playing');
    audio.playGameStart();
  };

  const restartGame = () => {
    setScore(0);
    setLives(3);
    initGame();
    setGameState('playing');
    audio.playGameStart();
  };

  const togglePause = () => {
    setGameState(prev => (prev === 'playing' ? 'paused' : 'playing'));
  };

  // Keyboard Event Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const keys = stateRef.current.keys;
      keys[e.key] = true;

      // Prevent scrolling defaults when playing
      if (stateRef.current.gameState === 'playing' && 
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar'].includes(e.key)) {
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
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar'].includes(e.key)) {
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

  // Main Canvas Render loop
  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const spawnExplosion = (x: number, y: number, color: string, count = 20) => {
      const particles = stateRef.current.particles;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        particles.push({
          x,
          y,
          dx: Math.cos(angle) * speed,
          dy: Math.sin(angle) * speed,
          color,
          size: Math.random() * 5 + 2,
          life: 40 + Math.random() * 20,
        });
      }
    };

    const spawnSpark = (x: number, y: number) => {
      const particles = stateRef.current.particles;
      particles.push({
        x,
        y,
        dx: (Math.random() - 0.5) * 2,
        dy: Math.random() * 2 + 1, // blow back slightly
        color: '#fffb00',
        size: Math.random() * 2 + 1,
        life: 10 + Math.random() * 10,
      });
    };

    const updateGame = () => {
      const state = stateRef.current;
      if (state.gameState !== 'playing') return;

      // Increase speed gradually over time
      state.speedMultiplier += 0.0001;
      const currentScrollSpeed = state.baseScrollSpeed * state.speedMultiplier;
      setSpeedKmh(Math.floor(currentScrollSpeed * 15));

      // Scroll Road Lines
      state.roadScrollY += currentScrollSpeed;
      if (state.roadScrollY >= 80) {
        state.roadScrollY = 0;
      }

      // Continuous points for surviving
      state.scoreTimer += 1;
      if (state.scoreTimer >= 15) {
        setScore(s => s + 2);
        state.scoreTimer = 0;
      }

      // Steer Player Car Left/Right
      if (state.keys['ArrowLeft'] || state.keys['a'] || state.keys['A']) {
        state.playerX = Math.max(ROAD_LEFT + state.playerWidth / 2 + 10, state.playerX - state.playerSpeed);
      }
      if (state.keys['ArrowRight'] || state.keys['d'] || state.keys['D']) {
        state.playerX = Math.min(ROAD_LEFT + ROAD_WIDTH - state.playerWidth / 2 - 10, state.playerX + state.playerSpeed);
      }
      
      // Move Player Car Forward/Backward slightly
      if (state.keys['ArrowUp'] || state.keys['w'] || state.keys['W']) {
        state.playerY = Math.max(150, state.playerY - 4);
      }
      if (state.keys['ArrowDown'] || state.keys['s'] || state.keys['S']) {
        state.playerY = Math.min(CANVAS_HEIGHT - 100, state.playerY + 4);
      }

      // Exhaust spark particle trail from tires
      if (Math.random() < 0.25) {
        spawnSpark(state.playerX - 18, state.playerY + state.playerHeight / 2);
        spawnSpark(state.playerX + 18, state.playerY + state.playerHeight / 2);
      }

      // Spawn Obstacle Cars
      const now = Date.now();
      const spawnInterval = Math.max(800, 2500 - state.speedMultiplier * 600);
      if (now - state.lastObstacleSpawnTime > spawnInterval) {
        // Decide how many cars to spawn based on speed multiplier
        const numCarsToSpawn = Math.min(4, 1 + Math.floor((state.speedMultiplier - 1.0) * 5));
        
        let availableLanes = [0, 1, 2, 3];
        // Shuffle lanes
        availableLanes.sort(() => Math.random() - 0.5);
        
        for (let i = 0; i < numCarsToSpawn; i++) {
          const lane = availableLanes[i];
          const laneCenterX = ROAD_LEFT + lane * LANE_WIDTH + LANE_WIDTH / 2;
          
          // Ensure not overlapping too closely with other obstacles
          let overlapping = false;
          state.obstacles.forEach(obs => {
            if (obs.y < 120 && Math.abs(obs.x - laneCenterX) < 50) {
              overlapping = true;
            }
          });

          if (!overlapping) {
            const colors = ['#ff007f', '#ff7300', '#fffb00', '#a855f7'];
            const obstacleColors = colors.filter(c => c !== '#00f0ff'); // avoid player color
            const color = obstacleColors[Math.floor(Math.random() * obstacleColors.length)];
            
            let targetLane = lane;
            let indicator: 'left' | 'right' | 'none' = 'none';
            if (Math.random() < 0.20) {
              const possibleLanes = [];
              if (lane > 0) possibleLanes.push(lane - 1);
              if (lane < 3) possibleLanes.push(lane + 1);
              if (possibleLanes.length > 0) {
                targetLane = possibleLanes[Math.floor(Math.random() * possibleLanes.length)];
                indicator = targetLane < lane ? 'left' : 'right';
              }
            }
            const targetX = ROAD_LEFT + targetLane * LANE_WIDTH + LANE_WIDTH / 2;
            
            state.obstacleIdCounter += 1;
            state.obstacles.push({
              id: state.obstacleIdCounter,
              x: laneCenterX,
              y: -100 - (Math.random() * 150), // Stagger spawns vertically
              width: 48,
              height: 80,
              speed: Math.random() * 2 + 1.5, // speed differential
              color,
              passed: false,
              type: Math.floor(Math.random() * 3),
              currentLane: lane,
              targetLane,
              targetX,
              indicator,
            });
          }
        }
        state.lastObstacleSpawnTime = now;
      }

      // Spawn Coins
      if (now - state.lastCoinSpawnTime > 4000) { // check every 4 seconds
        if (Math.random() < 0.6) { // 60% chance to spawn a coin
          const lane = Math.floor(Math.random() * 4);
          const laneCenterX = ROAD_LEFT + lane * LANE_WIDTH + LANE_WIDTH / 2;
          
          state.coinIdCounter += 1;
          state.coins.push({
            id: state.coinIdCounter,
            x: laneCenterX,
            y: -50,
            radius: 12,
            passed: false,
          });
        }
        state.lastCoinSpawnTime = now;
      }

      // Spawn Pedestrians
      if (now - state.lastPedestrianSpawnTime > 3000) { // check every 3 seconds
        if (Math.random() < 0.5) { // 50% chance
          const isLeft = Math.random() > 0.5;
          const type = Math.random() > 0.7 ? 'dog' : 'human';
          const dx = (Math.random() * 1.5 + 1) * (isLeft ? 1 : -1);
          
          state.pedestrianIdCounter += 1;
          state.pedestrians.push({
            id: state.pedestrianIdCounter,
            x: isLeft ? ROAD_LEFT - 30 : ROAD_LEFT + ROAD_WIDTH + 30,
            y: -50 - Math.random() * 100,
            width: type === 'dog' ? 24 : 16,
            height: type === 'dog' ? 12 : 16,
            dx,
            type,
            alive: true,
          });
        }
        state.lastPedestrianSpawnTime = now;
      }

      // Update Obstacle Cars
      state.obstacles = state.obstacles.filter(obs => {
        // Obstacles travel downwards relative to the scrolling road
        obs.y += currentScrollSpeed - obs.speed;

        // Lane change logic
        if (obs.currentLane !== obs.targetLane && obs.y > 0) { // start changing once visible
          const diff = obs.targetX - obs.x;
          // Smooth transition speed
          const transitionSpeed = 1.5;
          if (Math.abs(diff) <= transitionSpeed) {
            obs.x = obs.targetX;
            obs.currentLane = obs.targetLane;
            obs.indicator = 'none';
          } else {
            obs.x += Math.sign(diff) * transitionSpeed;
          }
        }

        // Check collision with Player (AABB bounding box collision)
        const px = state.playerX - state.playerWidth / 2;
        const py = state.playerY - state.playerHeight / 2;
        const ox = obs.x - obs.width / 2;
        const oy = obs.y - obs.height / 2;

        if (
          px < ox + obs.width - 4 &&
          px + state.playerWidth - 4 > ox &&
          py < oy + obs.height - 4 &&
          py + state.playerHeight - 4 > oy
        ) {
          // Crash!
          spawnExplosion(state.playerX, state.playerY, '#ff7300', 35);
          spawnExplosion(obs.x, obs.y, obs.color, 20);
          audio.playExplosion();
          
          setLives(l => {
            const nextL = l - 1;
            if (nextL <= 0) {
              setGameState('gameover');
              audio.playGameOver();
            }
            return nextL;
          });

          // Reset road scenario
          state.obstacles = [];
          state.playerX = CANVAS_WIDTH / 2;
          state.playerY = CANVAS_HEIGHT - 120;
          return false;
        }

        // Check if player passed obstacle car safely
        if (!obs.passed && obs.y > state.playerY + 30) {
          obs.passed = true;
          setScore(s => s + 15);
          audio.playScore();
        }

        return obs.y < CANVAS_HEIGHT + 100;
      });

      // Update Coins
      state.coins = state.coins.filter(coin => {
        coin.y += currentScrollSpeed;
        
        // Check collision with Player
        const px = state.playerX;
        const py = state.playerY;
        const dist = Math.hypot(coin.x - px, coin.y - py);
        
        if (dist < coin.radius + state.playerWidth / 2) {
          // Collect coin (bonus points equivalent to 2 cars)
          setScore(s => s + 30);
          audio.playScore();
          spawnSpark(coin.x, coin.y);
          spawnSpark(coin.x + 5, coin.y + 5);
          spawnSpark(coin.x - 5, coin.y - 5);
          return false;
        }
        
        return coin.y < CANVAS_HEIGHT + 100;
      });

      // Update Pedestrians
      state.pedestrians = state.pedestrians.filter(p => {
        if (!p.alive) return false;
        
        p.x += p.dx;
        p.y += currentScrollSpeed;

        // Check collision with Player
        const px = state.playerX - state.playerWidth / 2;
        const py = state.playerY - state.playerHeight / 2;
        const ox = p.x - p.width / 2;
        const oy = p.y - p.height / 2;

        if (
          px < ox + p.width &&
          px + state.playerWidth > ox &&
          py < oy + p.height &&
          py + state.playerHeight > oy
        ) {
          // Hit pedestrian
          p.alive = false;
          spawnExplosion(p.x, p.y, '#ff0000', 30);
          audio.playExplosion();
          
          setScore(s => Math.max(0, s - 100));
          return false;
        }

        return p.y < CANVAS_HEIGHT + 100 && p.x > -100 && p.x < CANVAS_WIDTH + 100;
      });

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
      
      // Draw background (cyberpunk grass landscape)
      ctx.fillStyle = '#060410';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw highway margins
      ctx.fillStyle = '#0e0b24';
      ctx.fillRect(ROAD_LEFT, 0, ROAD_WIDTH, CANVAS_HEIGHT);

      // Draw shoulder rails (Left and Right highway barriers with neon dash)
      ctx.fillStyle = '#ff007f'; // neon magenta rails
      ctx.fillRect(ROAD_LEFT - 8, 0, 8, CANVAS_HEIGHT);
      ctx.fillRect(ROAD_LEFT + ROAD_WIDTH, 0, 8, CANVAS_HEIGHT);
      
      // Rail shadows
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ff007f';
      ctx.fillStyle = 'rgba(255, 0, 127, 0.4)';
      ctx.fillRect(ROAD_LEFT - 8, 0, 2, CANVAS_HEIGHT);
      ctx.fillRect(ROAD_LEFT + ROAD_WIDTH + 6, 0, 2, CANVAS_HEIGHT);
      ctx.shadowBlur = 0;

      // Draw road dashed lane markings
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      const dashHeight = 40;
      const gapHeight = 40;
      
      // We have 3 lane lines separating 4 lanes
      for (let i = 1; i <= 3; i++) {
        const lineX = ROAD_LEFT + i * LANE_WIDTH - 2;
        let startY = state.roadScrollY - 80;
        
        while (startY < CANVAS_HEIGHT) {
          ctx.fillRect(lineX, startY, 4, dashHeight);
          startY += dashHeight + gapHeight;
        }
      }

      // Draw tire tracks/particles
      state.particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      });

      // Helper function to draw a cool futuristic neon car
      const drawNeonCar = (x: number, y: number, w: number, h: number, bodyColor: string, isPlayer = false, indicator: 'left' | 'right' | 'none' = 'none') => {
        const cx = x - w / 2;
        const cy = y - h / 2;
        
        // Wheels
        ctx.fillStyle = '#111';
        ctx.fillRect(cx - 4, cy + 10, 6, 16); // Front-Left
        ctx.fillRect(cx + w - 2, cy + 10, 6, 16); // Front-Right
        ctx.fillRect(cx - 4, cy + h - 26, 6, 16); // Rear-Left
        ctx.fillRect(cx + w - 2, cy + h - 26, 6, 16); // Rear-Right

        // Car Main Body (Neon theme)
        ctx.fillStyle = bodyColor;
        ctx.shadowBlur = isPlayer ? 10 : 6;
        ctx.shadowColor = bodyColor;
        
        ctx.beginPath();
        ctx.moveTo(cx + 8, cy);
        ctx.lineTo(cx + w - 8, cy);
        ctx.lineTo(cx + w - 3, cy + 15);
        ctx.lineTo(cx + w, cy + h - 20);
        ctx.lineTo(cx + w - 6, cy + h);
        ctx.lineTo(cx + 6, cy + h);
        ctx.lineTo(cx, cy + h - 20);
        ctx.lineTo(cx + 3, cy + 15);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0; // reset

        // Cockpit window glass (reflective dark overlay)
        ctx.fillStyle = '#0a0813';
        ctx.fillRect(cx + 10, cy + 28, w - 20, 20);
        
        // Cockpit trim glow
        ctx.strokeStyle = isPlayer ? '#00f0ff' : '#fff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx + 10, cy + 28, w - 20, 20);

        // Headlights (neon yellow glow forward, rear lights red)
        if (isPlayer) {
          // Player lights forward (towards top)
          ctx.fillStyle = '#fffb00';
          ctx.fillRect(cx + 6, cy - 2, 6, 4);
          ctx.fillRect(cx + w - 12, cy - 2, 6, 4);
          
          // Rear red break lights
          ctx.fillStyle = '#ff0000';
          ctx.fillRect(cx + 8, cy + h - 2, 6, 3);
          ctx.fillRect(cx + w - 14, cy + h - 2, 6, 3);
        } else {
          // Enemies go forward too, but they go down screen, so lights are on top (or bottom depending on perspective).
          // Let's draw standard headlights at front (top side)
          ctx.fillStyle = '#fffb00';
          ctx.fillRect(cx + 6, cy - 2, 6, 4);
          ctx.fillRect(cx + w - 12, cy - 2, 6, 4);
          
          ctx.fillStyle = '#ff0000';
          ctx.fillRect(cx + 8, cy + h - 2, 6, 3);
          ctx.fillRect(cx + w - 14, cy + h - 2, 6, 3);
        }

        // Custom racing stripes/decals
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillRect(cx + w / 2 - 3, cy + 5, 6, 16);

        // Turn indicators
        if (indicator !== 'none') {
          // Blink every 300ms
          if (Math.floor(Date.now() / 300) % 2 === 0) {
            ctx.fillStyle = '#ffaa00'; // Amber blinker
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#ffaa00';
            
            if (indicator === 'left') {
              // Left side (screen left)
              ctx.fillRect(cx + 4, cy - 4, 4, 6);
              ctx.fillRect(cx + 6, cy + h - 4, 4, 6);
            } else if (indicator === 'right') {
              // Right side (screen right)
              ctx.fillRect(cx + w - 8, cy - 4, 4, 6);
              ctx.fillRect(cx + w - 10, cy + h - 4, 4, 6);
            }
            ctx.shadowBlur = 0;
          }
        }
      };

      // Draw Obstacle Cars
      state.obstacles.forEach(obs => {
        drawNeonCar(obs.x, obs.y, obs.width, obs.height, obs.color, false, obs.indicator);
      });

      // Draw Coins
      state.coins.forEach(coin => {
        ctx.fillStyle = '#ffdf00'; // Gold color
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffdf00';
        ctx.beginPath();
        ctx.arc(coin.x, coin.y, coin.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0; // reset
        
        // Inner detail
        ctx.fillStyle = '#b8860b'; // Dark goldenrod
        ctx.beginPath();
        ctx.arc(coin.x, coin.y, coin.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
        // Coin center symbol
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', coin.x, coin.y + 1);
      });
      
      // Reset text alignment
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      // Draw Pedestrians
      state.pedestrians.forEach(p => {
        if (!p.alive) return;
        if (p.type === 'human') {
          // Draw Human (Top down)
          ctx.fillStyle = '#00ff88'; // Neon green
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#00ff88';
          
          // Head
          ctx.beginPath();
          ctx.arc(p.x, p.y - 4, 6, 0, Math.PI * 2);
          ctx.fill();
          
          // Shoulders/Body
          ctx.fillRect(p.x - p.width / 2, p.y, p.width, p.height / 2);
          
          ctx.shadowBlur = 0;
        } else {
          // Draw Dog (Top down)
          ctx.fillStyle = '#ffaa00'; // Neon orange
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#ffaa00';
          
          // Dog body
          const bodyW = p.width;
          const bodyH = p.height;
          ctx.fillRect(p.x - bodyW / 2, p.y - bodyH / 2, bodyW, bodyH);
          
          // Dog head (front)
          const headX = p.dx > 0 ? p.x + bodyW / 2 : p.x - bodyW / 2;
          ctx.beginPath();
          ctx.arc(headX, p.y, 5, 0, Math.PI * 2);
          ctx.fill();
          
          // Tail (back)
          const tailX = p.dx > 0 ? p.x - bodyW / 2 - 4 : p.x + bodyW / 2;
          ctx.fillRect(tailX, p.y - 1, 4, 2);
          
          ctx.shadowBlur = 0;
        }
      });

      // Draw Player Car
      if (state.gameState !== 'gameover') {
        drawNeonCar(state.playerX, state.playerY, state.playerWidth, state.playerHeight, '#00f0ff', true);
      }

      // Draw Dashboard Speed indicator
      ctx.fillStyle = '#5e5975';
      ctx.font = '10px "Press Start 2P"';
      ctx.fillText(`${speedKmh} KM/H`, 20, CANVAS_HEIGHT - 20);
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
  }, [gameState, speedKmh]);

  return (
    <GameWrapper
      title="SIMPLE CAR RACE"
      themeColor="cyan"
      score={score}
      gameId="car_race"
      lives={lives}
      gameState={gameState}
      onStart={startGame}
      onRestart={restartGame}
      onTogglePause={togglePause}
      onBack={onBack}
      instructions={[
        "Evade oncoming traffic at high speeds.",
        "Maneuver left & right using steering keys.",
        "Pass traffic closely or advance forward to increase score.",
        "Crashing directly into vehicles costs 1 life and resets the highway."
      ]}
      controls={[
        { keys: ['←', 'A'], description: 'Steer Vehicle Left' },
        { keys: ['→', 'D'], description: 'Steer Vehicle Right' },
        { keys: ['↑', 'W'], description: 'Accelerate Forward' },
        { keys: ['↓', 'S'], description: 'Deccelerate Backward' },
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
export default CarRace;
