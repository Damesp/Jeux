import React, { useRef, useEffect, useState } from 'react';
import { GameWrapper } from './GameWrapper';
import { audio } from '../../utils/audio';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const BALL_X = 400;
const BALL_Y = 505;

type Phase = 'aim' | 'curl' | 'power' | 'flight' | 'result';
type ResultType = 'goal' | 'saved' | 'blocked' | 'wide' | 'post' | 'short';

interface KickConfig {
  distance: number;   // meters (18-35), scales the goal down
  lateral: number;    // -1..1, shifts the goal sideways
  wallCount: number;  // 0 = no wall
  wallMoving: boolean;
  hasKeeper: boolean;
  keeperSpeed: number;
}

interface Shot {
  tx: number;         // aimed target on the goal plane
  ty: number;
  endX: number;       // actual end point (pulled short if power is too low)
  endY: number;
  curl: number;       // -1..1 locked spin
  power: number;      // 0..1 locked power
  dur: number;        // flight duration in frames
  f: number;          // current flight frame
  short: boolean;
  spaceScale: number; // fraction of ball->goal distance actually travelled
  reqPower: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const reqPowerFor = (distance: number) => 0.3 + (distance - 18) / 40;

// Gauges start slow and speed up with each level
const curlSpeedFor = (level: number) => Math.min(0.09, 0.028 + (level - 1) * 0.008);
const powerSpeedFor = (level: number) => Math.min(0.034, 0.011 + (level - 1) * 0.003);

const genKick = (level: number): KickConfig => {
  const distance = Math.min(35, 18 + (level - 1) * 1.5 + Math.random() * 3);
  const lateral = (Math.random() * 2 - 1) * Math.min(1, (level - 1) * 0.18);
  const wallCount =
    level >= 2 && Math.random() < 0.75 ? Math.min(5, 1 + Math.ceil(level / 2)) : 0;
  const hasKeeper = level >= 3 && Math.random() < 0.85;
  return {
    distance,
    lateral,
    wallCount,
    wallMoving: level >= 5 && wallCount > 0 && Math.random() < 0.5,
    hasKeeper,
    keeperSpeed: Math.min(5, 1.2 + level * 0.35),
  };
};

// Screen-space geometry derived from the kick position (fake perspective)
const getGeom = (cfg: KickConfig) => {
  const scale = 20 / cfg.distance;
  const goalW = 320 * scale;
  const goalH = 105 * scale;
  const goalCx = BALL_X + cfg.lateral * 130;
  const goalBaseY = 255 + scale * 45;
  const goalTop = goalBaseY - goalH;
  const pxPerMGoal = goalH / 2.44;
  const wallT = Math.min(0.6, 9.15 / cfg.distance); // wall stands 9.15m from the ball
  const groundYAt = (t: number) => lerp(BALL_Y + 12, goalBaseY, t);
  const pxPerMAt = (t: number) => lerp(58, pxPerMGoal, t);
  return {
    scale, goalW, goalH, goalCx, goalBaseY, goalTop, pxPerMGoal, wallT,
    groundYAt, pxPerMAt,
    goalLeft: goalCx - goalW / 2,
    goalRight: goalCx + goalW / 2,
  };
};

const ballPosAt = (sh: Shot, t: number) => {
  const lift = (30 + sh.power * 95) * (sh.short ? 0.55 : 1);
  return {
    x: lerp(BALL_X, sh.endX, t) + sh.curl * 150 * 4 * t * (1 - t),
    y: lerp(BALL_Y, sh.endY, t) - lift * Math.sin(Math.PI * t),
  };
};

export const FreeKick: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'paused' | 'gameover'>('idle');

  const stateRef = useRef({
    gameState: 'idle',
    level: 1,
    phase: 'aim' as Phase,
    kick: genKick(1),
    tick: 0,
    // Aim cursor
    aimX: 0,
    aimY: 0,
    // Spin gauge
    curlTick: 0,
    curl: 0,
    // Power gauge
    powerTick: 0,
    power: 0,
    // Current shot
    shot: null as Shot | null,
    ballRot: 0,
    // Wall runtime
    wallShift: 0,
    // Keeper runtime
    keeperX: 0,
    keeperCaught: false,
    // Result
    resultType: 'goal' as ResultType,
    resultTimer: 0,
    resultBallX: 0,
    resultBallY: 0,
    resultVX: 0,
    resultVY: 0,
    lastPoints: 0,
    keys: {} as Record<string, boolean>,
  });

  useEffect(() => {
    stateRef.current.gameState = gameState;
  }, [gameState]);

  // ─── Setup helpers ───

  const setupKick = (kick: KickConfig) => {
    const state = stateRef.current;
    state.kick = kick;
    const g = getGeom(kick);
    state.phase = 'aim';
    state.aimX = g.goalCx;
    state.aimY = g.goalTop + g.goalH * 0.4;
    state.curl = 0;
    state.curlTick = 0;
    state.power = 0;
    state.powerTick = 0;
    state.shot = null;
    state.wallShift = 0;
    state.keeperX = g.goalCx + (Math.random() - 0.5) * g.goalW * 0.3;
    state.keeperCaught = false;
    state.resultTimer = 0;
  };

  const startGame = () => {
    const state = stateRef.current;
    state.level = 1;
    setScore(0);
    setLives(3);
    setupKick(genKick(1));
    setGameState('playing');
    audio.playGameStart();
  };

  const togglePause = () => {
    setGameState(prev => (prev === 'playing' ? 'paused' : 'playing'));
  };

  // ─── Keyboard ───

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = stateRef.current;
      state.keys[e.key] = true;
      if (e.key === 'Escape') {
        e.preventDefault();
        togglePause();
        return;
      }
      if (e.key === ' ' && state.gameState === 'playing') {
        e.preventDefault();
        if (state.phase === 'aim') {
          state.phase = 'curl';
          state.curlTick = 0;
        } else if (state.phase === 'curl') {
          state.phase = 'power';
          state.powerTick = 0;
        } else if (state.phase === 'power') {
          // Fire the shot
          const g = getGeom(state.kick);
          const power = state.power;
          let tx = state.aimX;
          let ty = state.aimY;
          if (power > 0.85) {
            const wild = (power - 0.85) / 0.15;
            tx += (Math.random() - 0.5) * 180 * wild;
            ty += (Math.random() - 0.5) * 90 * wild;
          }
          ty = Math.min(ty, g.goalBaseY - 4);
          const reqPower = reqPowerFor(state.kick.distance);
          const short = power < reqPower;
          const spaceScale = short ? Math.max(0.35, (power / reqPower) * 0.85) : 1;
          state.shot = {
            tx, ty,
            endX: short ? lerp(BALL_X, tx, spaceScale) : tx,
            endY: short ? g.groundYAt(spaceScale) - 4 : ty,
            curl: state.curl,
            power,
            dur: Math.round(58 - power * 22),
            f: 0,
            short,
            spaceScale,
            reqPower,
          };
          state.ballRot = 0;
          state.phase = 'flight';
          audio.playLaser();
        }
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
  }, [gameState]);

  // ─── Main game loop ───

  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const wallCenterX = (g: ReturnType<typeof getGeom>) => {
      const state = stateRef.current;
      return lerp(BALL_X, g.goalCx, g.wallT) + state.wallShift;
    };

    const setResult = (type: ResultType, bx: number, by: number) => {
      const state = stateRef.current;
      state.resultType = type;
      state.resultTimer = 85;
      state.phase = 'result';
      state.resultBallX = bx;
      state.resultBallY = by;
      state.resultVX = 0;
      state.resultVY = 0;

      if (type === 'goal') {
        const g = getGeom(state.kick);
        const sh = state.shot!;
        const topCorner =
          by < g.goalTop + g.goalH * 0.38 &&
          (bx < g.goalLeft + g.goalW * 0.3 || bx > g.goalRight - g.goalW * 0.3);
        let pts = 100 * state.level;
        if (topCorner) pts += 50;
        if (Math.abs(sh.curl) > 0.5) pts += 25;
        state.lastPoints = pts;
        setScore(s => s + pts);
        if (topCorner) audio.playPowerUp();
        else audio.playScore();
      } else {
        if (type === 'blocked' || type === 'post') {
          state.resultVX = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2);
          state.resultVY = -3;
        }
        if (type === 'short') {
          state.resultVX = (state.shot!.endX - BALL_X) * 0.006;
        }
        if (type === 'saved') state.keeperCaught = true;
        audio.playExplosion();
      }
    };

    const evaluateArrival = () => {
      const state = stateRef.current;
      const sh = state.shot!;
      const g = getGeom(state.kick);

      if (sh.short) {
        setResult('short', sh.endX, sh.endY);
        return;
      }
      const bx = sh.tx;
      const by = sh.ty;
      const pm = Math.max(4, 5 * g.scale) + 3;

      if (bx < g.goalLeft - pm || bx > g.goalRight + pm || by < g.goalTop - pm) {
        setResult('wide', bx, by);
        return;
      }
      if (bx < g.goalLeft + pm || bx > g.goalRight - pm || by < g.goalTop + pm) {
        setResult('post', bx, by);
        return;
      }
      if (state.kick.hasKeeper) {
        const dx = Math.abs(state.keeperX - bx);
        const ballH = g.goalBaseY - by;
        const softBonus = sh.power < sh.reqPower + 0.12 ? 1.5 : 1;
        const closeCatch = dx < g.pxPerMGoal * 0.45 && ballH < 2.35 * g.pxPerMGoal;
        const diveCatch = dx < g.pxPerMGoal * 1.05 * softBonus && ballH < 1.9 * g.pxPerMGoal;
        if (closeCatch || diveCatch) {
          state.keeperX = bx;
          setResult('saved', bx, by);
          return;
        }
      }
      setResult('goal', bx, by);
    };

    // ─── UPDATE ───
    const updateGame = () => {
      const state = stateRef.current;
      if (state.gameState !== 'playing') return;
      state.tick++;
      const g = getGeom(state.kick);

      if (state.kick.wallMoving && (state.phase === 'aim' || state.phase === 'curl' || state.phase === 'power' || state.phase === 'flight')) {
        state.wallShift = Math.sin(state.tick * 0.035) * 55 * g.scale;
      }

      if (state.phase === 'aim') {
        const speed = 3.5;
        if (state.keys['ArrowLeft']) state.aimX -= speed;
        if (state.keys['ArrowRight']) state.aimX += speed;
        if (state.keys['ArrowUp']) state.aimY -= speed;
        if (state.keys['ArrowDown']) state.aimY += speed;
        state.aimX = Math.max(g.goalLeft - 30, Math.min(g.goalRight + 30, state.aimX));
        state.aimY = Math.max(g.goalTop - 25, Math.min(g.goalBaseY - 6, state.aimY));
      } else if (state.phase === 'curl') {
        state.curlTick++;
        state.curl = Math.sin(state.curlTick * curlSpeedFor(state.level));
      } else if (state.phase === 'power') {
        state.powerTick++;
        const x = (state.powerTick * powerSpeedFor(state.level)) % 2;
        state.power = x < 1 ? x : 2 - x;
      } else if (state.phase === 'flight') {
        const sh = state.shot!;
        const prevT = sh.f / sh.dur;
        sh.f++;
        state.ballRot += 0.25;
        const t = Math.min(1, sh.f / sh.dur);

        // Keeper reacts and tracks the aimed point
        if (state.kick.hasKeeper) {
          const reactT = Math.max(0.12, 0.45 - state.level * 0.03);
          if (t > reactT) {
            const dx = sh.tx - state.keeperX;
            const step = Math.min(Math.abs(dx), state.kick.keeperSpeed * g.scale);
            state.keeperX += Math.sign(dx) * step;
          }
        }

        // Wall collision when the ball crosses the wall plane
        if (state.kick.wallCount > 0) {
          const tCross = g.wallT / sh.spaceScale;
          if (tCross <= 1 && prevT < tCross && t >= tCross) {
            const pos = ballPosAt(sh, tCross);
            const pxm = g.pxPerMAt(g.wallT);
            const playerH = 1.82 * pxm;
            const totalW = state.kick.wallCount * 0.62 * pxm;
            const wx = wallCenterX(g);
            // The wall jumps: its effective top is raised while the ball arrives
            const topY = g.groundYAt(g.wallT) - playerH - 0.22 * playerH;
            if (pos.x > wx - totalW / 2 - 4 && pos.x < wx + totalW / 2 + 4 && pos.y > topY) {
              setResult('blocked', pos.x, pos.y);
              return;
            }
          }
        }

        if (t >= 1) evaluateArrival();
      } else if (state.phase === 'result') {
        // Small physics for the rebound / rolling ball
        if (state.resultType === 'blocked' || state.resultType === 'post') {
          state.resultBallX += state.resultVX;
          state.resultBallY += state.resultVY;
          state.resultVY += 0.25;
          const ground = g.groundYAt(g.wallT) + 6;
          if (state.resultBallY > ground) {
            state.resultBallY = ground;
            state.resultVY *= -0.5;
          }
        } else if (state.resultType === 'short') {
          state.resultBallX += state.resultVX;
          state.resultVX *= 0.96;
        }

        state.resultTimer--;
        if (state.resultTimer <= 0) {
          if (state.resultType === 'goal') {
            state.level++;
            setupKick(genKick(state.level));
          } else {
            setLives(l => {
              const nextL = l - 1;
              if (nextL <= 0) {
                setGameState('gameover');
                audio.playGameOver();
              } else {
                // Retry the very same free kick
                setupKick(state.kick);
              }
              return nextL;
            });
          }
        }
      }
    };

    // ─── DRAW ───

    const drawBall = (x: number, y: number, r: number) => {
      const state = stateRef.current;
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Rotating dark patches for the classic ball look
      ctx.fillStyle = '#222222';
      for (let i = 0; i < 3; i++) {
        const a = state.ballRot + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    };

    const drawPlayer = (x: number, baseY: number, h: number, jersey: string, jump: number) => {
      const w = h * 0.34;
      const y = baseY - jump;
      // Legs
      ctx.fillStyle = '#12233a';
      ctx.fillRect(x - w * 0.35, y - h * 0.45, w * 0.28, h * 0.45);
      ctx.fillRect(x + w * 0.07, y - h * 0.45, w * 0.28, h * 0.45);
      // Jersey
      ctx.fillStyle = jersey;
      ctx.fillRect(x - w / 2, y - h * 0.8, w, h * 0.38);
      // Head
      ctx.fillStyle = '#e8b088';
      ctx.beginPath();
      ctx.arc(x, y - h * 0.88, h * 0.1, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawGame = () => {
      const state = stateRef.current;
      const g = getGeom(state.kick);
      const sh = state.shot;

      // ── Night sky
      const skyGrad = ctx.createLinearGradient(0, 0, 0, 240);
      skyGrad.addColorStop(0, '#070722');
      skyGrad.addColorStop(1, '#14355c');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, 240);

      // Floodlights
      for (const lx of [90, 710]) {
        ctx.strokeStyle = '#4a5a6a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(lx, 175);
        ctx.lineTo(lx, 60);
        ctx.stroke();
        ctx.fillStyle = '#fffbe0';
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#fff8c0';
        ctx.fillRect(lx - 18, 48, 36, 14);
        ctx.shadowBlur = 0;
      }

      // ── Stands with a deterministic crowd pattern
      ctx.fillStyle = '#1a1a30';
      ctx.fillRect(0, 175, CANVAS_WIDTH, 65);
      const crowdColors = ['#5a4a7a', '#7a4a5a', '#4a6a7a', '#6a6a4a'];
      for (let i = 0; i < 260; i++) {
        const cx = (i * 61) % CANVAS_WIDTH;
        const cy = 180 + ((i * 37) % 55);
        ctx.fillStyle = crowdColors[i % 4];
        ctx.fillRect(cx, cy, 3, 3);
      }

      // ── Pitch with mowing stripes
      const pitchGrad = ctx.createLinearGradient(0, 240, 0, CANVAS_HEIGHT);
      pitchGrad.addColorStop(0, '#1e7a2e');
      pitchGrad.addColorStop(1, '#145c20');
      ctx.fillStyle = pitchGrad;
      ctx.fillRect(0, 240, CANVAS_WIDTH, CANVAS_HEIGHT - 240);
      let stripeY = 240;
      let stripeH = 14;
      let light = true;
      while (stripeY < CANVAS_HEIGHT) {
        if (light) {
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(0, stripeY, CANVAS_WIDTH, stripeH);
        }
        stripeY += stripeH;
        stripeH *= 1.22;
        light = !light;
      }

      // ── Penalty box hint
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(g.goalCx - g.goalW * 1.1, g.goalBaseY + 40 * g.scale);
      ctx.lineTo(g.goalLeft - g.goalW * 0.25, g.goalBaseY);
      ctx.moveTo(g.goalCx + g.goalW * 1.1, g.goalBaseY + 40 * g.scale);
      ctx.lineTo(g.goalRight + g.goalW * 0.25, g.goalBaseY);
      ctx.moveTo(g.goalCx - g.goalW * 1.1, g.goalBaseY + 40 * g.scale);
      ctx.lineTo(g.goalCx + g.goalW * 1.1, g.goalBaseY + 40 * g.scale);
      ctx.stroke();

      // ── Goal: net then posts
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      const netStep = Math.max(6, 11 * g.scale);
      for (let nx = g.goalLeft; nx <= g.goalRight; nx += netStep) {
        ctx.beginPath();
        ctx.moveTo(nx, g.goalTop);
        ctx.lineTo(nx, g.goalBaseY);
        ctx.stroke();
      }
      for (let ny = g.goalTop; ny <= g.goalBaseY; ny += netStep) {
        ctx.beginPath();
        ctx.moveTo(g.goalLeft, ny);
        ctx.lineTo(g.goalRight, ny);
        ctx.stroke();
      }
      const postW = Math.max(3, 5 * g.scale);
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(255,255,255,0.7)';
      ctx.fillRect(g.goalLeft - postW / 2, g.goalTop - postW / 2, postW, g.goalH + postW / 2);
      ctx.fillRect(g.goalRight - postW / 2, g.goalTop - postW / 2, postW, g.goalH + postW / 2);
      ctx.fillRect(g.goalLeft - postW / 2, g.goalTop - postW / 2, g.goalW + postW, postW);
      ctx.shadowBlur = 0;

      // ── Goalkeeper
      if (state.kick.hasKeeper) {
        const kh = 1.9 * g.pxPerMGoal;
        if (state.keeperCaught) {
          // Holding the ball after a save
          drawPlayer(state.keeperX, g.goalBaseY, kh, '#ffdd00', 0);
          drawBall(state.keeperX, g.goalBaseY - kh * 0.55, Math.max(4, 6 * g.scale));
        } else {
          drawPlayer(state.keeperX, g.goalBaseY, kh, '#ffdd00', 0);
        }
      }

      // ── Wall
      if (state.kick.wallCount > 0) {
        const pxm = g.pxPerMAt(g.wallT);
        const playerH = 1.82 * pxm;
        const playerW = 0.62 * pxm;
        const wx = wallCenterX(g);
        const baseY = g.groundYAt(g.wallT);
        let jump = 0;
        if (state.phase === 'flight' && sh) {
          jump = Math.sin(Math.min(Math.PI, (sh.f / Math.max(1, sh.dur * 0.45)) * Math.PI)) * 0.27 * playerH;
        }
        const startX = wx - ((state.kick.wallCount - 1) * playerW) / 2;
        for (let i = 0; i < state.kick.wallCount; i++) {
          drawPlayer(startX + i * playerW, baseY, playerH, '#cc2233', jump);
        }
      }

      // ── Ball (+ ground shadow that tracks the flight for depth perception)
      if (state.phase === 'flight' && sh) {
        const t = Math.min(1, sh.f / sh.dur);
        const pos = ballPosAt(sh, t);
        const shadowY = g.groundYAt(t * sh.spaceScale);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(pos.x, shadowY + 4, 10 * (1 - t * 0.6), 3.5 * (1 - t * 0.6), 0, 0, Math.PI * 2);
        ctx.fill();
        drawBall(pos.x, pos.y, lerp(11, 4.5, t));
      } else if (state.phase === 'result') {
        if (!state.keeperCaught) {
          drawBall(state.resultBallX, state.resultBallY, state.resultType === 'goal' ? 4.5 : 6);
        }
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(BALL_X, BALL_Y + 12, 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        drawBall(BALL_X, BALL_Y, 11);
      }

      // ── Aim cursor
      if (state.phase === 'aim' || state.phase === 'curl' || state.phase === 'power') {
        const pulse = 10 + Math.sin(state.tick * 0.15) * 2;
        ctx.strokeStyle = state.phase === 'aim' ? '#00ffff' : 'rgba(0,255,255,0.45)';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#00ffff';
        ctx.beginPath();
        ctx.arc(state.aimX, state.aimY, pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(state.aimX - pulse - 5, state.aimY);
        ctx.lineTo(state.aimX + pulse + 5, state.aimY);
        ctx.moveTo(state.aimX, state.aimY - pulse - 5);
        ctx.lineTo(state.aimX, state.aimY + pulse + 5);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // ── Spin gauge
      if (state.phase === 'curl' || state.phase === 'power' || state.phase === 'flight') {
        const barW = 220;
        const barX = BALL_X - barW / 2;
        const barY = 555;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX, barY, barW, 12);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.strokeRect(barX, barY, barW, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(BALL_X - 1, barY, 2, 12);
        const markerX = BALL_X + state.curl * (barW / 2 - 6);
        ctx.fillStyle = state.phase === 'curl' ? '#00ffff' : '#ffffff';
        ctx.beginPath();
        ctx.moveTo(markerX, barY - 2);
        ctx.lineTo(markerX - 6, barY - 10);
        ctx.lineTo(markerX + 6, barY - 10);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillText('SPIN', barX - 42, barY + 10);
      }

      // ── Power gauge with the minimum-power mark
      if (state.phase === 'power' || state.phase === 'flight') {
        const barH = 220;
        const barX = 755;
        const barY = 320;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX, barY, 18, barH);
        const fillH = barH * state.power;
        const powGrad = ctx.createLinearGradient(0, barY + barH, 0, barY);
        powGrad.addColorStop(0, '#00cc44');
        powGrad.addColorStop(0.6, '#ffcc00');
        powGrad.addColorStop(1, '#ff2200');
        ctx.fillStyle = powGrad;
        ctx.fillRect(barX, barY + barH - fillH, 18, fillH);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.strokeRect(barX, barY, 18, barH);
        const reqY = barY + barH - barH * reqPowerFor(state.kick.distance);
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(barX - 4, reqY);
        ctx.lineTo(barX + 22, reqY);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillText('PWR', barX - 4, barY - 8);
      }

      // ── Phase hint
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      if (state.phase === 'aim') {
        ctx.fillText('ARROWS: AIM  -  SPACE: OK', CANVAS_WIDTH / 2, 58);
      } else if (state.phase === 'curl') {
        ctx.fillText('SPACE: LOCK THE SPIN', CANVAS_WIDTH / 2, 58);
      } else if (state.phase === 'power') {
        ctx.fillText('SPACE: SHOOT!', CANVAS_WIDTH / 2, 58);
      }
      ctx.textAlign = 'left';

      // ── Level / distance / obstacles info
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText(`LEVEL: ${state.level}`, 20, CANVAS_HEIGHT - 15);
      ctx.fillText(`DIST: ${Math.round(state.kick.distance)}m`, 20, CANVAS_HEIGHT - 32);

      // ── Result message
      if (state.phase === 'result') {
        ctx.textAlign = 'center';
        ctx.font = '26px "Press Start 2P", monospace';
        ctx.shadowBlur = 16;
        if (state.resultType === 'goal') {
          ctx.fillStyle = '#00ff66';
          ctx.shadowColor = '#00ff66';
          ctx.fillText('GOAL!', CANVAS_WIDTH / 2, 140);
          ctx.font = '13px "Press Start 2P", monospace';
          ctx.fillText(`+${state.lastPoints}`, CANVAS_WIDTH / 2, 170);
        } else {
          ctx.fillStyle = '#ff3366';
          ctx.shadowColor = '#ff3366';
          const msg =
            state.resultType === 'saved' ? 'SAVED!' :
            state.resultType === 'blocked' ? 'BLOCKED!' :
            state.resultType === 'post' ? 'OFF THE POST!' :
            state.resultType === 'short' ? 'TOO SOFT!' : 'WIDE!';
          ctx.fillText(msg, CANVAS_WIDTH / 2, 140);
        }
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';
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
  }, [gameState]);

  return (
    <GameWrapper
      title="FREE KICK"
      themeColor="green"
      score={score}
      gameId="free_kick"
      lives={lives}
      gameState={gameState}
      onStart={startGame}
      onRestart={startGame}
      onTogglePause={togglePause}
      onBack={onBack}
      instructions={[
        'Every free kick is taken from a new spot: walls, keepers and moving walls appear as you level up.',
        'Phase 1: move the aim cursor inside the goal with the arrow keys, confirm with Space.',
        'Phase 2: lock the swerve gauge with Space to curl the ball around the wall.',
        'Phase 3: lock the oscillating power gauge with Space to shoot. Stay above the red mark, but full power gets wild!',
        'A miss costs a life and you retry the same free kick. Score goals to face harder ones.',
      ]}
      controls={[
        { keys: ['←', '→', '↑', '↓'], description: 'Move Aim Cursor' },
        { keys: ['Spacebar'], description: 'Confirm / Lock / Shoot' },
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
export default FreeKick;
