import { Ship } from './Ship';
import { CellState, FIELD_SIZE, FLEET_CONFIG, Orientation, ShotResult } from './types';
import type { Coordinate, RandomSource, ShotOutcome } from './types';

/** A 10×10 board: owns the ships, validates placement and handles shots. */
export class Field {
  public static readonly SIZE: number = FIELD_SIZE;

  private readonly grid: CellState[][];
  private readonly ships: Ship[] = [];

  public constructor() {
    this.grid = Array.from({ length: Field.SIZE }, () =>
      new Array<CellState>(Field.SIZE).fill(CellState.Empty),
    );
  }

  // --- Placement ---

  /** Checks bounds and the "ships must not touch" rule without placing anything. */
  public canPlaceShip(length: number, start: Coordinate, orientation: Orientation): boolean {
    return this.isValidPlacement(this.buildShipCells(length, start, orientation));
  }

  /** Places a ship. Returns it, or `null` if the placement is invalid. */
  public placeShip(length: number, start: Coordinate, orientation: Orientation): Ship | null {
    if (!this.canPlaceShip(length, start, orientation)) {
      return null;
    }
    const ship = new Ship(length, start, orientation);
    for (const cell of ship.getCoordinates()) {
      this.grid[cell.row][cell.col] = CellState.Ship;
    }
    this.ships.push(ship);
    return ship;
  }

  /** Clears the board and places the whole classic fleet at random. */
  public placeFleetRandomly(random: RandomSource = Math.random): void {
    // A random layout can (very rarely) leave no room for the last ships: retry.
    while (!this.tryPlaceFleet(random)) {
      // keep trying with a fresh board
    }
  }

  /** True when every ship from FLEET_CONFIG has been placed. */
  public isFleetComplete(): boolean {
    return this.ships.length === FLEET_CONFIG.length && this.getRemainingShipLengths().length === 0;
  }

  /** Lengths from FLEET_CONFIG that are not placed yet. */
  public getRemainingShipLengths(): number[] {
    const remaining = [...FLEET_CONFIG];
    for (const ship of this.ships) {
      const index = remaining.indexOf(ship.length);
      if (index !== -1) {
        remaining.splice(index, 1);
      }
    }
    return remaining;
  }

  /** Removes all ships and shot marks. */
  public clear(): void {
    this.ships.length = 0;
    for (const row of this.grid) {
      row.fill(CellState.Empty);
    }
  }

  // --- Combat ---

  /** Handles an incoming shot and updates the board. */
  public receiveShot(coord: Coordinate): ShotOutcome {
    if (!this.isInBounds(coord)) {
      throw new RangeError(`Shot is outside the field: (${coord.row}, ${coord.col})`);
    }
    if (this.hasBeenShot(coord)) {
      return { result: ShotResult.AlreadyShot, coordinate: coord };
    }

    const ship = this.findShipAt(coord);
    if (ship === undefined) {
      this.grid[coord.row][coord.col] = CellState.Miss;
      return { result: ShotResult.Miss, coordinate: coord };
    }

    ship.hit();
    this.grid[coord.row][coord.col] = CellState.Hit;
    if (!ship.isSunk()) {
      return { result: ShotResult.Hit, coordinate: coord };
    }

    this.markSunkShip(ship);
    this.markSurroundingCells(ship);
    return { result: ShotResult.Sunk, coordinate: coord, sunkShipCells: ship.getCoordinates() };
  }

  /** True if the cell was shot at, or auto-marked around a sunk ship. */
  public hasBeenShot(coord: Coordinate): boolean {
    const state = this.grid[coord.row][coord.col];
    return state !== CellState.Empty && state !== CellState.Ship;
  }

  /** True when the field has ships and all of them are sunk. */
  public allShipsSunk(): boolean {
    return this.ships.length > 0 && this.ships.every((ship) => ship.isSunk());
  }

  // --- Read-only access for UI and tests ---

  /**
   * State of a cell for display. With `revealShips = false` intact decks
   * are reported as Empty, so the enemy fleet is never exposed.
   */
  public getCellState(coord: Coordinate, revealShips: boolean): CellState {
    const state = this.grid[coord.row][coord.col];
    return state === CellState.Ship && !revealShips ? CellState.Empty : state;
  }

  public getShips(): readonly Ship[] {
    return this.ships;
  }

  public isInBounds(coord: Coordinate): boolean {
    return (
      Number.isInteger(coord.row) &&
      Number.isInteger(coord.col) &&
      coord.row >= 0 &&
      coord.row < Field.SIZE &&
      coord.col >= 0 &&
      coord.col < Field.SIZE
    );
  }

  // --- Private helpers ---

  private isValidPlacement(cells: readonly Coordinate[]): boolean {
    return (
      cells.length > 0 &&
      cells.every((cell) => this.isInBounds(cell) && !this.hasAdjacentShip(cell))
    );
  }

  /** True if the cell itself or any of its 8 neighbours holds a ship. */
  private hasAdjacentShip(coord: Coordinate): boolean {
    return [coord, ...this.getNeighbours(coord)].some(
      (cell) => this.findShipAt(cell) !== undefined,
    );
  }

  /** Up to 8 in-bounds cells around the given one. */
  private getNeighbours(coord: Coordinate): Coordinate[] {
    const neighbours: Coordinate[] = [];
    for (let dRow = -1; dRow <= 1; dRow++) {
      for (let dCol = -1; dCol <= 1; dCol++) {
        const cell: Coordinate = { row: coord.row + dRow, col: coord.col + dCol };
        if ((dRow !== 0 || dCol !== 0) && this.isInBounds(cell)) {
          neighbours.push(cell);
        }
      }
    }
    return neighbours;
  }

  private buildShipCells(length: number, start: Coordinate, orientation: Orientation): Coordinate[] {
    if (!Number.isInteger(length) || length < 1) {
      return [];
    }
    return new Ship(length, start, orientation).getCoordinates();
  }

  private findShipAt(coord: Coordinate): Ship | undefined {
    return this.ships.find((ship) => ship.occupies(coord));
  }

  /** One attempt to place the whole fleet. Returns false if it got stuck. */
  private tryPlaceFleet(random: RandomSource): boolean {
    this.clear();
    for (const length of FLEET_CONFIG) {
      const options = this.findAllPlacements(length);
      if (options.length === 0) {
        return false;
      }
      const choice = options[Math.floor(random() * options.length)];
      this.placeShip(length, choice.start, choice.orientation);
    }
    return true;
  }

  /** Every currently valid position for a ship of the given length. */
  private findAllPlacements(length: number): { start: Coordinate; orientation: Orientation }[] {
    const options: { start: Coordinate; orientation: Orientation }[] = [];
    // A one-deck ship looks the same in both orientations.
    const orientations =
      length === 1 ? [Orientation.Horizontal] : [Orientation.Horizontal, Orientation.Vertical];
    for (let row = 0; row < Field.SIZE; row++) {
      for (let col = 0; col < Field.SIZE; col++) {
        for (const orientation of orientations) {
          if (this.canPlaceShip(length, { row, col }, orientation)) {
            options.push({ start: { row, col }, orientation });
          }
        }
      }
    }
    return options;
  }

  /** Turns all decks of a sunk ship from Hit to Sunk. */
  private markSunkShip(ship: Ship): void {
    for (const cell of ship.getCoordinates()) {
      this.grid[cell.row][cell.col] = CellState.Sunk;
    }
  }

  /** Marks empty cells around a sunk ship as Miss: no ship can be there. */
  private markSurroundingCells(ship: Ship): void {
    for (const deck of ship.getCoordinates()) {
      for (const cell of this.getNeighbours(deck)) {
        if (this.grid[cell.row][cell.col] === CellState.Empty) {
          this.grid[cell.row][cell.col] = CellState.Miss;
        }
      }
    }
  }
}
