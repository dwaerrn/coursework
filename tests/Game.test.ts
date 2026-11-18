import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { BotPlayer } from '../src/core/Player';
import { Field } from '../src/core/Field';
import { CellState, GameState, Orientation, ShotResult } from '../src/core/types';
import type { Coordinate } from '../src/core/types';
import { createSeededRandom } from './helpers';

/** Finds a cell on the bot's field by peeking at the real ship positions. */
function findBotCell(game: Game, wantShip: boolean): Coordinate {
  const field = game.getBot().field;
  for (let row = 0; row < Field.SIZE; row++) {
    for (let col = 0; col < Field.SIZE; col++) {
      const coord = { row, col };
      const isShip = field.getCellState(coord, true) === CellState.Ship;
      if (isShip === wantShip && !field.hasBeenShot(coord)) {
        return coord;
      }
    }
  }
  throw new Error('No matching cell');
}

describe('Game', () => {
  it('does not start until the human fleet is complete', () => {
    const game = new Game('Tester', {}, createSeededRandom(1));
    expect(game.getState()).toBe(GameState.Setup);
    expect(game.start()).toBe(false);
    expect(game.placeHumanShip(4, { row: 0, col: 0 }, Orientation.Horizontal)).toBe(true);
    expect(game.start()).toBe(false);

    game.randomizeHumanFleet();
    expect(game.start()).toBe(true);
    expect(game.getState()).toBe(GameState.Playing);
    expect(game.isHumanTurn()).toBe(true);
    expect(game.getBot().field.isFleetComplete()).toBe(true);
  });

  it('only accepts ships that are still missing from the fleet', () => {
    const game = new Game('Tester');
    expect(game.placeHumanShip(4, { row: 0, col: 0 }, Orientation.Horizontal)).toBe(true);
    expect(game.placeHumanShip(4, { row: 2, col: 0 }, Orientation.Horizontal)).toBe(false);
    expect(game.placeHumanShip(5, { row: 4, col: 0 }, Orientation.Horizontal)).toBe(false);
  });

  it('rejects shots outside the PLAYING state', () => {
    const game = new Game('Tester');
    expect(game.humanShoot({ row: 0, col: 0 })).toBeNull();
    expect(game.playBotTurn()).toBeNull();
  });

  it('keeps the turn after a hit and passes it after a miss', () => {
    const game = new Game('Tester', {}, createSeededRandom(5));
    game.randomizeHumanFleet();
    game.start();

    const hit = game.humanShoot(findBotCell(game, true));
    expect(hit?.result === ShotResult.Hit || hit?.result === ShotResult.Sunk).toBe(true);
    expect(game.isHumanTurn()).toBe(true);
    expect(game.playBotTurn()).toBeNull();

    const missCell = findBotCell(game, false);
    expect(game.humanShoot(missCell)?.result).toBe(ShotResult.Miss);
    expect(game.isHumanTurn()).toBe(false);
    expect(game.humanShoot(findBotCell(game, false))).toBeNull();
  });

  it('does not consume the turn on an already shot cell', () => {
    const game = new Game('Tester', {}, createSeededRandom(9));
    game.randomizeHumanFleet();
    game.start();
    const cell = findBotCell(game, true);
    game.humanShoot(cell);
    expect(game.humanShoot(cell)?.result).toBe(ShotResult.AlreadyShot);
    expect(game.isHumanTurn()).toBe(true);
  });

  it.each([11, 12, 13])('plays a full game to a winner (seed %i)', (seed) => {
    const random = createSeededRandom(seed);
    const log: string[] = [];
    let announcedWinner = '';
    const game = new Game(
      'Tester',
      {
        onStateChange: (state) => log.push(state),
        onGameOver: (winnerName) => {
          announcedWinner = winnerName;
        },
      },
      random,
    );
    game.randomizeHumanFleet();
    game.start();

    // The human plays like a simple random shooter.
    let steps = 0;
    while (game.getState() === GameState.Playing) {
      if (game.isHumanTurn()) {
        game.humanShoot({ row: Math.floor(random() * 10), col: Math.floor(random() * 10) });
      } else {
        const outcome = game.playBotTurn();
        // The bot must never waste a shot on a known cell.
        expect(outcome?.result).not.toBe(ShotResult.AlreadyShot);
      }
      expect(++steps).toBeLessThan(5000);
    }

    const winner = game.getWinner();
    expect(winner).not.toBeNull();
    expect(announcedWinner).toBe(winner?.name);
    expect(log).toEqual([GameState.Playing, GameState.Finished]);
    const loser = winner === game.getHuman() ? game.getBot() : game.getHuman();
    expect(loser.hasLost()).toBe(true);
    expect(winner?.hasLost()).toBe(false);
    expect(game.humanShoot({ row: 0, col: 0 })).toBeNull();

    game.reset();
    expect(game.getState()).toBe(GameState.Setup);
    expect(game.getWinner()).toBeNull();
    expect(game.getHuman().field.getShips()).toHaveLength(0);
  });
});

describe('BotPlayer', () => {
  it('sinks a whole fleet without repeating a cell', () => {
    const random = createSeededRandom(3);
    const bot = new BotPlayer('Bot', random);
    const enemy = new Field();
    enemy.placeFleetRandomly(random);

    let shots = 0;
    while (!enemy.allShipsSunk()) {
      const outcome = bot.shootAt(enemy, bot.chooseTarget());
      expect(outcome.result).not.toBe(ShotResult.AlreadyShot);
      expect(++shots).toBeLessThanOrEqual(100);
    }
  });

  it('shoots next to a hit on its following turn', () => {
    const bot = new BotPlayer('Bot', createSeededRandom(4));
    const enemy = new Field();
    enemy.placeShip(3, { row: 5, col: 4 }, Orientation.Horizontal);
    bot.shootAt(enemy, { row: 5, col: 5 });

    const next = bot.chooseTarget();
    const distance = Math.abs(next.row - 5) + Math.abs(next.col - 5);
    expect(distance).toBe(1);
  });
});
