import './styles/main.css';
import { Game } from './core/Game';
import type { GameEvents } from './core/types';
import { GameRenderer } from './ui/GameRenderer';

const root = document.querySelector<HTMLDivElement>('#app');
if (root === null) {
  throw new Error('Root element #app was not found');
}

// The renderer passes itself as the event listener of the game it shows.
new GameRenderer(root, (events: GameEvents): Game => new Game('Гравець', events));
