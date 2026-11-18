import { BotPlayer, Player } from './Player';
import { GameState, ShotResult } from './types';
import type { Coordinate, GameEvents, Orientation, RandomSource, ShotOutcome } from './types';

/** Main controller: owns both players, the game state and the turn order. */
export class Game {
  private state: GameState = GameState.Setup;
  private readonly human: Player;
  private readonly bot: BotPlayer;
  private currentPlayer: Player;
  private winner: Player | null = null;
  private readonly events: GameEvents;
  private readonly random: RandomSource;

  public constructor(
    humanName: string,
    events: GameEvents = {},
    random: RandomSource = Math.random,
  ) {
    this.human = new Player(humanName);
    this.bot = new BotPlayer('Bot', random);
    this.currentPlayer = this.human;
    this.events = events;
    this.random = random;
  }

  // --- Setup phase ---

  /** Places one of the human's remaining ships. Only works in SETUP. */
  public placeHumanShip(length: number, start: Coordinate, orientation: Orientation): boolean {
    if (this.state !== GameState.Setup) {
      return false;
    }
    if (!this.human.field.getRemainingShipLengths().includes(length)) {
      return false;
    }
    return this.human.field.placeShip(length, start, orientation) !== null;
  }

  /** Replaces the human's layout with a random full fleet. Only works in SETUP. */
  public randomizeHumanFleet(): void {
    if (this.state === GameState.Setup) {
      this.human.field.placeFleetRandomly(this.random);
    }
  }

  /** SETUP → PLAYING. Fails if the human fleet is incomplete. */
  public start(): boolean {
    if (this.state !== GameState.Setup || !this.human.field.isFleetComplete()) {
      return false;
    }
    this.bot.field.placeFleetRandomly(this.random);
    this.currentPlayer = this.human;
    this.setState(GameState.Playing);
    this.events.onTurnChange?.(this.currentPlayer.name);
    return true;
  }

  // --- Playing phase ---

  /** The human shoots at the bot. Returns null if the shot is not allowed now. */
  public humanShoot(coord: Coordinate): ShotOutcome | null {
    if (this.state !== GameState.Playing || !this.isHumanTurn()) {
      return null;
    }
    if (!this.bot.field.isInBounds(coord)) {
      return null;
    }
    return this.processShot(this.human, this.bot, coord);
  }

  /** The bot makes one shot. Returns null if it is not the bot's turn. */
  public playBotTurn(): ShotOutcome | null {
    if (this.state !== GameState.Playing || this.isHumanTurn()) {
      return null;
    }
    return this.processShot(this.bot, this.human, this.bot.chooseTarget());
  }

  // --- Queries ---

  public getState(): GameState {
    return this.state;
  }

  public getHuman(): Player {
    return this.human;
  }

  public getBot(): Player {
    return this.bot;
  }

  public getCurrentPlayer(): Player {
    return this.currentPlayer;
  }

  public isHumanTurn(): boolean {
    return this.currentPlayer === this.human;
  }

  public getWinner(): Player | null {
    return this.winner;
  }

  /** Back to SETUP with empty fields. */
  public reset(): void {
    this.human.reset();
    this.bot.reset();
    this.winner = null;
    this.currentPlayer = this.human;
    this.setState(GameState.Setup);
  }

  // --- Private helpers ---

  /** Applies a shot, then switches the turn or finishes the game. */
  private processShot(shooter: Player, target: Player, coord: Coordinate): ShotOutcome {
    const outcome = shooter.shootAt(target.field, coord);
    if (outcome.result === ShotResult.AlreadyShot) {
      return outcome;
    }
    this.events.onShot?.(shooter.name, outcome);

    if (outcome.result === ShotResult.Miss) {
      this.switchTurn();
    } else if (this.checkWinCondition(shooter, target)) {
      this.setState(GameState.Finished);
      this.events.onGameOver?.(shooter.name);
    }
    // After Hit or Sunk the shooter keeps the turn (classic rule).
    return outcome;
  }

  private switchTurn(): void {
    this.currentPlayer = this.getOpponent(this.currentPlayer);
    this.events.onTurnChange?.(this.currentPlayer.name);
  }

  /** Records the winner if the target has no ships left. */
  private checkWinCondition(shooter: Player, target: Player): boolean {
    if (!target.hasLost()) {
      return false;
    }
    this.winner = shooter;
    return true;
  }

  private setState(next: GameState): void {
    this.state = next;
    this.events.onStateChange?.(next);
  }

  private getOpponent(player: Player): Player {
    return player === this.human ? this.bot : this.human;
  }
}
