import { useState } from 'react';
import './App.css';
import SpaceInvaders from './components/games/SpaceInvaders';
import CarRace from './components/games/CarRace';
import Breakout from './components/games/Breakout';
import Pacman from './components/games/Pacman';
import Canadair from './components/games/Canadair';
import SpaceInvadersImg from './assets/space_invaders_thumb.png';
import CarRaceImg from './assets/car_race_thumb.png';
import BreakoutImg from './assets/breakout_thumb.png';
import PacmanImg from './assets/pacman_thumb.png';
import CanadairImg from './assets/canadair_thumb.png';

// Simple enum for game selection
type Game = '' | 'SpaceInvaders' | 'CarRace' | 'Breakout' | 'Pacman' | 'Canadair';

const GameEnum: Record<string, Game> = {
  None: '',
  SpaceInvaders: 'SpaceInvaders',
  CarRace: 'CarRace',
  Breakout: 'Breakout',
  Pacman: 'Pacman',
  Canadair: 'Canadair',
};

function App() {
  const [selectedGame, setSelectedGame] = useState<Game>(GameEnum.None);

  const renderGame = () => {
    switch (selectedGame) {
      case GameEnum.SpaceInvaders:
        return <SpaceInvaders onBack={() => setSelectedGame(GameEnum.None)} />;
      case GameEnum.CarRace:
        return <CarRace onBack={() => setSelectedGame(GameEnum.None)} />;
      case GameEnum.Breakout:
        return <Breakout onBack={() => setSelectedGame(GameEnum.None)} />;
      case GameEnum.Pacman:
        return <Pacman onBack={() => setSelectedGame(GameEnum.None)} />;
      case GameEnum.Canadair:
        return <Canadair onBack={() => setSelectedGame(GameEnum.None)} />;
      default:
        return null;
    }
  };

  if (selectedGame !== GameEnum.None) {
    return <div className="game-container">{renderGame()}</div>;
  }

  return (
    <div className="menu-container">
      <h1 className="title">Retro Arcade</h1>
      <div className="game-grid">
        {[{ name: 'Space Invaders', enum: GameEnum.SpaceInvaders, img: SpaceInvadersImg },
        { name: 'Car Race', enum: GameEnum.CarRace, img: CarRaceImg },
        { name: 'Breakout', enum: GameEnum.Breakout, img: BreakoutImg },
        { name: 'Canadair', enum: GameEnum.Canadair, img: CanadairImg },
        { name: 'Pacman', enum: GameEnum.Pacman, img: PacmanImg }].map((g) => (
          <div key={g.name} className="game-tile" onClick={() => setSelectedGame(g.enum)}>
            <img src={g.img} alt={g.name} className="game-thumb" />
            <div className="game-label">{g.name}</div>
          </div>
        ))}
      </div>
      <p className="instructions">Use mouse to select a game. Press <strong>Esc</strong> during a game to return to the menu.</p>
    </div>
  );
}

export default App;
