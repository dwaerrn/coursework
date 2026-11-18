import { Field } from './Field';
import { ShotResult } from './types';
import type { Coordinate, RandomSource, ShotOutcome } from './types';

/** A participant of the game: has a name, a field and can shoot. */
export class Player {
  public readonly name: string;
  public readonly field: Field;
  /** Cells this player already knows the result for, as "row,col" keys. */
  protected readonly shotsFired: Set<string> = new Set<string>();

  public constructor(name: string, field: Field = new Field()) {
    this.name = name;
    this.field = field;
  }

  /** Fires at the opponent's field and remembers the shot. */
  public shootAt(target: Field, coord: Coordinate): ShotOutcome {
    const outcome = target.receiveShot(coord);
    this.shotsFired.add(Player.toKey(coord));
    return outcome;
  }

  /** True when the whole fleet of this player is sunk. */
  public hasLost(): boolean {
    return this.field.allShipsSunk();
  }

  /** Prepares the player for a new game. */
  public reset(): void {
    this.field.clear();
    this.shotsFired.clear();
  }

  protected static toKey(coord: Coordinate): string {
    return `${coord.row},${coord.col}`;
  }
}

/**
 * AI opponent. Shoots at random cells ("hunt" mode); after a hit it tries
 * the neighbouring cells first ("target" mode) until the ship is sunk.
 */
export class BotPlayer extends Player {
  private targetQueue: Coordinate[] = [];
  private readonly random: RandomSource;

  public constructor(name: string, random: RandomSource = Math.random) {
    super(name);
    this.random = random;
  }

  /** Picks the next cell to shoot at. Never repeats a known cell. */
  public chooseTarget(): Coordinate {
    while (this.targetQueue.length > 0) {
      const candidate = this.targetQueue.shift();
      if (candidate !== undefined && this.isUntried(candidate)) {
        return candidate;
      }
    }
    return this.pickRandomUntriedCell();
  }

  /** Shoots and updates the hunt/target state from the result. */
  public override shootAt(target: Field, coord: Coordinate): ShotOutcome {
    const outcome = super.shootAt(target, coord);
    if (outcome.result === ShotResult.Hit) {
      this.enqueueNeighbours(coord);
    } else if (outcome.result === ShotResult.Sunk) {
      this.rememberSunkShipSurroundings(outcome.sunkShipCells ?? []);
      this.targetQueue = [];
    }
    return outcome;
  }

  public override reset(): void {
    super.reset();
    this.targetQueue = [];
  }

  private pickRandomUntriedCell(): Coordinate {
    const untried: Coordinate[] = [];
    for (let row = 0; row < Field.SIZE; row++) {
      for (let col = 0; col < Field.SIZE; col++) {
        if (this.isUntried({ row, col })) {
          untried.push({ row, col });
        }
      }
    }
    if (untried.length === 0) {
      throw new Error('No cells left to shoot at');
    }
    return untried[Math.floor(this.random() * untried.length)];
  }

  /** Queues the 4 side neighbours of a hit: the rest of the ship is there. */
  private enqueueNeighbours(coord: Coordinate): void {
    const candidates: Coordinate[] = [
      { row: coord.row - 1, col: coord.col },
      { row: coord.row + 1, col: coord.col },
      { row: coord.row, col: coord.col - 1 },
      { row: coord.row, col: coord.col + 1 },
    ];
    for (const cell of candidates) {
      if (this.isUntried(cell)) {
        this.targetQueue.push(cell);
      }
    }
  }

  /** Ships never touch, so cells around a sunk ship are not worth a shot. */
  private rememberSunkShipSurroundings(shipCells: readonly Coordinate[]): void {
    for (const deck of shipCells) {
      for (let dRow = -1; dRow <= 1; dRow++) {
        for (let dCol = -1; dCol <= 1; dCol++) {
          this.shotsFired.add(Player.toKey({ row: deck.row + dRow, col: deck.col + dCol }));
        }
      }
    }
  }

  private isUntried(coord: Coordinate): boolean {
    return this.field.isInBounds(coord) && !this.shotsFired.has(Player.toKey(coord));
  }
}
