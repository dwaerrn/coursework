import { describe, expect, it } from 'vitest';
import { Ship } from '../src/core/Ship';
import { Orientation } from '../src/core/types';

describe('Ship', () => {
  it('builds horizontal coordinates from the start cell', () => {
    const ship = new Ship(3, { row: 2, col: 4 }, Orientation.Horizontal);
    expect(ship.getCoordinates()).toEqual([
      { row: 2, col: 4 },
      { row: 2, col: 5 },
      { row: 2, col: 6 },
    ]);
  });

  it('builds vertical coordinates from the start cell', () => {
    const ship = new Ship(2, { row: 7, col: 0 }, Orientation.Vertical);
    expect(ship.getCoordinates()).toEqual([
      { row: 7, col: 0 },
      { row: 8, col: 0 },
    ]);
  });

  it('knows which cells it occupies', () => {
    const ship = new Ship(4, { row: 0, col: 0 }, Orientation.Vertical);
    expect(ship.occupies({ row: 3, col: 0 })).toBe(true);
    expect(ship.occupies({ row: 4, col: 0 })).toBe(false);
    expect(ship.occupies({ row: 0, col: 1 })).toBe(false);
  });

  it('is sunk only after every deck is hit', () => {
    const ship = new Ship(3, { row: 0, col: 0 }, Orientation.Horizontal);
    expect(ship.isSunk()).toBe(false);
    ship.hit();
    ship.hit();
    expect(ship.getHits()).toBe(2);
    expect(ship.isSunk()).toBe(false);
    ship.hit();
    expect(ship.isSunk()).toBe(true);
  });

  it('never counts more hits than it has decks', () => {
    const ship = new Ship(1, { row: 5, col: 5 }, Orientation.Horizontal);
    ship.hit();
    ship.hit();
    expect(ship.getHits()).toBe(1);
  });

  it('rejects an invalid length', () => {
    expect(() => new Ship(0, { row: 0, col: 0 }, Orientation.Horizontal)).toThrow(RangeError);
    expect(() => new Ship(2.5, { row: 0, col: 0 }, Orientation.Horizontal)).toThrow(RangeError);
  });
});
