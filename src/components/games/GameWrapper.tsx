import React, { useState } from 'react';
import { Volume2, VolumeX, Pause, Play, RotateCcw, Home } from 'lucide-react';
import { audio } from '../../utils/audio';
import './GameWrapper.css';

interface ControlMap {
  keys: string[];
  description: string;
}

interface GameWrapperProps {
  title: string;
  themeColor: 'cyan' | 'magenta' | 'green';
  score: number;
  highScore: number;
  lives: number | null;
  gameState: 'idle' | 'playing' | 'paused' | 'gameover';
  onStart: () => void;
  onRestart: () => void;
  onTogglePause: () => void;
  onBack: () => void;
  instructions: string[];
  controls: ControlMap[];
  children: React.ReactNode;
}

export const GameWrapper: React.FC<GameWrapperProps> = ({
  title,
  themeColor,
  score,
  highScore,
  lives,
  gameState,
  onStart,
  onRestart,
  onTogglePause,
  onBack,
  instructions,
  controls,
  children,
}) => {
  const [isMuted, setIsMuted] = useState(audio.getMuteStatus());

  const handleMuteToggle = () => {
    const nextMute = audio.toggleMute();
    setIsMuted(nextMute);
  };

  const getBorderClass = () => {
    if (themeColor === 'magenta') return 'active-border-magenta';
    if (themeColor === 'green') return 'active-border-green';
    return 'active-border-cyan';
  };

  const getTextColorClass = () => {
    if (themeColor === 'magenta') return 'neon-text-magenta';
    if (themeColor === 'green') return 'neon-text-green';
    return 'neon-text-cyan';
  };

  const getBtnClass = () => {
    if (themeColor === 'magenta') return 'neon-btn-magenta';
    if (themeColor === 'green') return 'neon-btn-green';
    return '';
  };

  return (
    <div className="game-wrapper">
      <div className="game-header">
        <div className="game-title-container">
          <button className="game-back-btn" onClick={onBack} title="Back to Dashboard">
            <Home size={18} />
          </button>
          <h2 className={getTextColorClass()}>{title}</h2>
        </div>
        
        <div className="game-header-actions">
          <button className="game-action-btn" onClick={handleMuteToggle} title={isMuted ? "Unmute" : "Mute"}>
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          
          {gameState === 'playing' && (
            <button className="game-action-btn" onClick={onTogglePause} title="Pause Game">
              <Pause size={18} />
            </button>
          )}
          
          {(gameState === 'paused' || gameState === 'gameover') && (
            <button className="game-action-btn" onClick={onRestart} title="Restart Game">
              <RotateCcw size={18} />
            </button>
          )}
        </div>
      </div>

      <div className={`game-screen-container crt-container ${getBorderClass()}`}>
        <div className="crt-screen">
          {/* Main game HUD display */}
          <div className="game-hud">
            <div className="hud-item">
              <span className="hud-label">SCORE</span>
              <span className="hud-value">{score}</span>
            </div>
            
            {lives !== null && (
              <div className="hud-item">
                <span className="hud-label">LIVES</span>
                <span className="hud-lives">
                  {lives <= 5 ? '❤'.repeat(Math.max(0, lives)) : `❤ x${lives}`}
                </span>
              </div>
            )}
            
            <div className="hud-item">
              <span className="hud-label">HIGH SCORE</span>
              <span className="hud-value">{highScore}</span>
            </div>
          </div>

          {/* Children: The Canvas */}
          {children}

          {/* Overlays for Idle/Pause/GameOver */}
          {gameState === 'idle' && (
            <div className="game-overlay">
              <h3 className={getTextColorClass()}>READY PLAYER ONE</h3>
              <p>Prepare to enter the matrix. Guide your destiny using the keyboard controls listed below.</p>
              <button className={`neon-btn ${getBtnClass()}`} onClick={onStart}>
                <Play size={18} /> START GAME
              </button>
            </div>
          )}

          {gameState === 'paused' && (
            <div className="game-overlay">
              <h3 className="neon-text-cyan">GAME PAUSED</h3>
              <p>Take a breath. Press the button below or Escape key to resume your arcade journey.</p>
              <button className="neon-btn" onClick={onTogglePause}>
                <Play size={18} /> RESUME
              </button>
            </div>
          )}

          {gameState === 'gameover' && (
            <div className="game-overlay">
              <h3 className="neon-text-magenta">GAME OVER</h3>
              <div className="overlay-stats">
                <div>FINAL SCORE: <span className="overlay-stat-val">{score}</span></div>
                <div>HIGH SCORE: <span className="overlay-stat-val">{highScore}</span></div>
              </div>
              <button className="neon-btn neon-btn-magenta" onClick={onRestart}>
                <RotateCcw size={18} /> PLAY AGAIN
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Instructions Card at bottom */}
      <div className="game-instructions-card glass-panel">
        <h4 className="instr-title">INSTRUCTIONS & CONTROLS</h4>
        <div className="instr-layout">
          <div>
            <ul className="instr-list">
              {instructions.map((inst, index) => (
                <li key={index}>
                  <div className="instr-dot" />
                  {inst}
                </li>
              ))}
            </ul>
          </div>
          
          <div className="keycaps">
            {controls.map((ctrl, index) => (
              <div className="key-row" key={index}>
                <div style={{ display: 'flex', gap: '5px' }}>
                  {ctrl.keys.map((k, kidx) => (
                    <span className="keycap" key={kidx}>{k}</span>
                  ))}
                </div>
                <span className="key-desc">{ctrl.description}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
export default GameWrapper;
