import { describe, expect, it } from 'vitest';
import { Field } from '../src/core/Field';
import { CellState, FLEET_CONFIG, Orientation, ShotResult } from '../src/core/types';
import { createSeededRandom } from './helpers';

const H = Orientation.Horizontal;
const V = Orientation.Vertical;

describe('Field: ship placement', () => {
  it('places a ship inside the board', () => {
    const field = new Field();
    const ship = field.placeShip(4, { row: 0, col: 0 }, H);
    expect(ship).not.toBeNull();
    expect(field.getShips()).toHaveLength(1);
    expect(field.getCellState({ row: 0, col: 3 }, true)).toBe(CellState.Ship);
    expect(field.getCellState({ row: 0, col: 4 }, true)).toBe(CellState.Empty);
  });

  it('rejects ships that leave the board', () => {
    const field = new Field();
    expect(field.placeShip(4, { row: 0, col: 7 }, H)).toBeNull();
    expect(field.placeShip(3, { row: 8, col: 0 }, V)).toBeNull();
    expect(field.placeShip(1, { row: -1, col: 0 }, H)).toBeNull();
    expect(field.placeShip(1, { row: 0, col: 10 }, H)).toBeNull();
    expect(field.getShips()).toHaveLength(0);
  });

  it('allows ships that end exactly at the border', () => {
    const field = new Field();
    expect(field.placeShip(4, { row: 9, col: 6 }, H)).not.toBeNull();
    expect(field.placeShip(3, { row: 5, col: 0 }, V)).not.toBeNull();
  });

  it('rejects overlapping ships', () => {
    const field = new Field();
    field.placeShip(3, { row: 4, col: 4 }, H);
    expect(field.canPlaceShip(3, { row: 3, col: 5 }, V)).toBe(false);
  });

  it('rejects ships touching by side or by corner', () => {
    const field = new Field();
    field.placeShip(2, { row: 4, col: 4 }, H); // (4,4) (4,5)
    expect(field.canPlaceShip(1, { row: 3, col: 4 }, H)).toBe(false); // above
    expect(field.canPlaceShip(1, { row: 4, col: 6 }, H)).toBe(false); // right
    expect(field.canPlaceShip(1, { row: 5, col: 6 }, H)).toBe(false); // corner
    expect(field.canPlaceShip(1, { row: 3, col: 3 }, H)).toBe(false); // corner
  });

  it('allows ships with a one-cell gap', () => {
    const field = new Field();
    field.placeShip(2, { row: 4, col: 4 }, H);
    expect(field.canPlaceShip(1, { row: 6, col: 4 }, H)).toBe(true);
    expect(field.canPlaceShip(2, { row: 4, col: 7 }, V)).toBe(true);
  });

  it('tracks which ships of the fleet are still missing', () => {
    const field = new Field();
    expect(field.getRemainingShipLengths()).toEqual([...FLEET_CONFIG]);
    field.placeShip(4, { row: 0, col: 0 }, H);
    field.placeShip(1, { row: 9, col: 9 }, H);
    expect(field.getRemainingShipLengths()).toEqual([3, 3, 2, 2, 2, 1, 1, 1]);
    expect(field.isFleetComplete()).toBe(false);
  });

  it('removes an untouched ship and frees its cells', () => {
    const field = new Field();
    field.placeShip(3, { row: 2, col: 2 }, H);
    field.placeShip(1, { row: 9, col: 9 }, H);

    expect(field.removeShipAt({ row: 2, col: 4 })).toBe(true);
    expect(field.getShips()).toHaveLength(1);
    expect(field.getCellState({ row: 2, col: 2 }, true)).toBe(CellState.Empty);
    expect(field.getRemainingShipLengths()).toContain(3);
    // The freed area can be used again, even right next to the old position.
    expect(field.canPlaceShip(3, { row: 3, col: 2 }, H)).toBe(true);
  });

  it('does not remove water or a ship that was already hit', () => {
    const field = new Field();
    field.placeShip(2, { row: 0, col: 0 }, H);
    expect(field.removeShipAt({ row: 5, col: 5 })).toBe(false);
    field.receiveShot({ row: 0, col: 0 });
    expect(field.removeShipAt({ row: 0, col: 1 })).toBe(false);
    expect(field.getShips()).toHaveLength(1);
  });

  it('clear() removes ships and shot marks', () => {
    const field = new Field();
    field.placeShip(2, { row: 0, col: 0 }, H);
    field.receiveShot({ row: 0, col: 0 });
    field.receiveShot({ row: 5, col: 5 });
    field.clear();
    expect(field.getShips()).toHaveLength(0);
    expect(field.hasBeenShot({ row: 5, col: 5 })).toBe(false);
    expect(field.getCellState({ row: 0, col: 0 }, true)).toBe(CellState.Empty);
  });
});

describe('Field: random fleet placement', () => {
  it.each([1, 2, 3, 42, 2026])('places a full valid fleet (seed %i)', (seed) => {
    const field = new Field();
    field.placeFleetRandomly(createSeededRandom(seed));

    expect(field.isFleetComplete()).toBe(true);
    const lengths = field.getShips().map((ship) => ship.length);
    expect(lengths.sort()).toEqual([...FLEET_CONFIG].sort());

    // No two ships overlap or touch, including diagonally.
    const ships = field.getShips();
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        for (const a of ships[i].getCoordinates()) {
          for (const b of ships[j].getCoordinates()) {
            const touching = Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1;
            expect(touching).toBe(false);
          }
        }
      }
    }
    // 4 + 3*2 + 2*3 + 1*4 = 20 decks, all inside the board.
    const decks = ships.flatMap((ship) => ship.getCoordinates());
    expect(decks).toHaveLength(20);
    expect(decks.every((cell) => field.isInBounds(cell))).toBe(true);
  });

  it('replaces an existing layout instead of adding to it', () => {
    const field = new Field();
    field.placeShip(4, { row: 0, col: 0 }, H);
    field.placeFleetRandomly(createSeededRandom(7));
    expect(field.getShips()).toHaveLength(FLEET_CONFIG.length);
  });
});

describe('Field: shots', () => {
  it('reports a miss on water', () => {
    const field = new Field();
    field.placeShip(2, { row: 0, col: 0 }, H);
    const outcome = field.receiveShot({ row: 5, col: 5 });
    expect(outcome.result).toBe(ShotResult.Miss);
    expect(field.getCellState({ row: 5, col: 5 }, false)).toBe(CellState.Miss);
  });

  it('reports a hit, then sunk on the last deck', () => {
    const field = new Field();
    const ship = field.placeShip(2, { row: 3, col: 3 }, V);
    expect(field.receiveShot({ row: 3, col: 3 }).result).toBe(ShotResult.Hit);
    expect(field.getCellState({ row: 3, col: 3 }, false)).toBe(CellState.Hit);

    const outcome = field.receiveShot({ row: 4, col: 3 });
    expect(outcome.result).toBe(ShotResult.Sunk);
    expect(outcome.sunkShipCells).toEqual(ship?.getCoordinates());
    expect(field.getCellState({ row: 3, col: 3 }, false)).toBe(CellState.Sunk);
    expect(field.getCellState({ row: 4, col: 3 }, false)).toBe(CellState.Sunk);
  });

  it('ignores a repeated shot at the same cell', () => {
    const field = new Field();
    const ship = field.placeShip(3, { row: 0, col: 0 }, H);
    field.receiveShot({ row: 0, col: 0 });
    expect(field.receiveShot({ row: 0, col: 0 }).result).toBe(ShotResult.AlreadyShot);
    expect(ship?.getHits()).toBe(1);

    field.receiveShot({ row: 9, col: 9 });
    expect(field.receiveShot({ row: 9, col: 9 }).result).toBe(ShotResult.AlreadyShot);
  });

  it('marks all cells around a sunk ship as misses', () => {
    const field = new Field();
    field.placeShip(2, { row: 4, col: 4 }, H); // (4,4) (4,5)
    field.receiveShot({ row: 4, col: 4 });
    field.receiveShot({ row: 4, col: 5 });

    for (let row = 3; row <= 5; row++) {
      for (let col = 3; col <= 6; col++) {
        const isDeck = row === 4 && (col === 4 || col === 5);
        expect(field.getCellState({ row, col }, false)).toBe(
          isDeck ? CellState.Sunk : CellState.Miss,
        );
      }
    }
    // Cells further away are untouched.
    expect(field.getCellState({ row: 2, col: 4 }, false)).toBe(CellState.Empty);
    expect(field.getCellState({ row: 4, col: 7 }, false)).toBe(CellState.Empty);
    // Auto-marked cells count as already shot.
    expect(field.receiveShot({ row: 3, col: 3 }).result).toBe(ShotResult.AlreadyShot);
  });

  it('marks surroundings correctly for a ship in the corner', () => {
    const field = new Field();
    field.placeShip(1, { row: 0, col: 0 }, H);
    expect(field.receiveShot({ row: 0, col: 0 }).result).toBe(ShotResult.Sunk);
    expect(field.getCellState({ row: 0, col: 1 }, false)).toBe(CellState.Miss);
    expect(field.getCellState({ row: 1, col: 0 }, false)).toBe(CellState.Miss);
    expect(field.getCellState({ row: 1, col: 1 }, false)).toBe(CellState.Miss);
  });

  it('throws on a shot outside the board', () => {
    const field = new Field();
    expect(() => field.receiveShot({ row: 10, col: 0 })).toThrow(RangeError);
  });

  it('hides intact ships unless they are revealed', () => {
    const field = new Field();
    field.placeShip(1, { row: 2, col: 2 }, H);
    expect(field.getCellState({ row: 2, col: 2 }, false)).toBe(CellState.Empty);
    expect(field.getCellState({ row: 2, col: 2 }, true)).toBe(CellState.Ship);
  });

  it('allShipsSunk() is true only when every ship is sunk', () => {
    const field = new Field();
    expect(field.allShipsSunk()).toBe(false); // no ships yet
    field.placeShip(1, { row: 0, col: 0 }, H);
    field.placeShip(1, { row: 9, col: 9 }, H);
    field.receiveShot({ row: 0, col: 0 });
    expect(field.allShipsSunk()).toBe(false);
    field.receiveShot({ row: 9, col: 9 });
    expect(field.allShipsSunk()).toBe(true);
  });
});
