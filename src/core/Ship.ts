import { Orientation } from './types';
import type { Coordinate } from './types';

/** A single ship: its position, size and damage. */
export class Ship {
  private hits = 0;

  public readonly length: number;
  public readonly start: Coordinate;
  public readonly orientation: Orientation;

  public constructor(length: number, start: Coordinate, orientation: Orientation) {
    if (!Number.isInteger(length) || length < 1) {
      throw new RangeError(`Ship length must be a positive integer, got ${length}`);
    }
    this.length = length;
    this.start = start;
    this.orientation = orientation;
  }

  /** All cells this ship covers, in order from `start`. */
  public getCoordinates(): Coordinate[] {
    const cells: Coordinate[] = [];
    for (let i = 0; i < this.length; i++) {
      cells.push(
        this.orientation === Orientation.Horizontal
          ? { row: this.start.row, col: this.start.col + i }
          : { row: this.start.row + i, col: this.start.col },
      );
    }
    return cells;
  }

  /** True if this ship covers the given cell. */
  public occupies(coord: Coordinate): boolean {
    return this.getCoordinates().some(
      (cell) => cell.row === coord.row && cell.col === coord.col,
    );
  }

  /** Registers one hit. The Field guarantees a deck is never hit twice. */
  public hit(): void {
    if (this.hits < this.length) {
      this.hits++;
    }
  }

  public getHits(): number {
    return this.hits;
  }

  public isSunk(): boolean {
    return this.hits >= this.length;
  }
}
