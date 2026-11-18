/** A cell position on the board. `row` and `col` are 0-based (0..9). */
export interface Coordinate {
  readonly row: number;
  readonly col: number;
}

export enum Orientation {
  Horizontal = 'HORIZONTAL',
  Vertical = 'VERTICAL',
}

/** The real state of one cell, as the Field stores it. */
export enum CellState {
  Empty = 'EMPTY',
  Ship = 'SHIP',
  /** A shot that hit water, or a cell auto-marked around a sunk ship. */
  Miss = 'MISS',
  Hit = 'HIT',
  /** A deck of a ship that has been fully sunk. */
  Sunk = 'SUNK',
}

export enum ShotResult {
  Miss = 'MISS',
  Hit = 'HIT',
  Sunk = 'SUNK',
  /** The cell was shot before: the shot is ignored and the turn is kept. */
  AlreadyShot = 'ALREADY_SHOT',
}

/** The full result of one shot, passed to the UI through callbacks. */
export interface ShotOutcome {
  readonly result: ShotResult;
  readonly coordinate: Coordinate;
  /** Cells of the sunk ship. Only set when `result === ShotResult.Sunk`. */
  readonly sunkShipCells?: readonly Coordinate[];
}

export enum GameState {
  Setup = 'SETUP',
  Playing = 'PLAYING',
  Finished = 'FINISHED',
}

/** Classic fleet: 1×4, 2×3, 3×2, 4×1 (ship lengths). */
export const FLEET_CONFIG: readonly number[] = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];

export const FIELD_SIZE = 10;

/** Source of random numbers in [0, 1). Replaceable in tests. */
export type RandomSource = () => number;

/** Optional callbacks the UI subscribes to. Core code never touches the DOM. */
export interface GameEvents {
  onStateChange?(state: GameState): void;
  onShot?(shooterName: string, outcome: ShotOutcome): void;
  onTurnChange?(currentPlayerName: string): void;
  onGameOver?(winnerName: string): void;
}
