import { Field } from '../core/Field';
import type { Game } from '../core/Game';
import type { Ship } from '../core/Ship';
import { CellState, GameState, Orientation, ShotResult } from '../core/types';
import type { Coordinate, GameEvents, ShotOutcome } from '../core/types';

/** Column letters of the board: the first ten letters of the Ukrainian alphabet. */
const COLUMN_LABELS: readonly string[] = ['А', 'Б', 'В', 'Г', 'Ґ', 'Д', 'Е', 'Є', 'Ж', 'З'];

/** The bot "thinks" for a random time in this range, like a real opponent. */
const BOT_DELAY_MIN_MS = 1000;
const BOT_DELAY_MAX_MS = 2000;

/** CSS modifier for every cell state. */
const CELL_CLASS: Readonly<Record<CellState, string>> = {
  [CellState.Empty]: 'cell--empty',
  [CellState.Ship]: 'cell--ship',
  [CellState.Miss]: 'cell--miss',
  [CellState.Hit]: 'cell--hit',
  [CellState.Sunk]: 'cell--sunk',
};

/** Which board a cell belongs to. */
type BoardOwner = 'human' | 'bot';

/**
 * Draws both boards and the controls, and turns clicks into Game calls.
 * It listens to the game through the GameEvents callbacks.
 */
export class GameRenderer implements GameEvents {
  private readonly game: Game;
  private readonly root: HTMLElement;

  private readonly humanCells: HTMLButtonElement[][] = [];
  private readonly botCells: HTMLButtonElement[][] = [];

  private readonly statusElement: HTMLElement;
  private readonly messageElement: HTMLElement;
  private readonly humanCounter: HTMLElement;
  private readonly botCounter: HTMLElement;
  private readonly setupPanel: HTMLElement;
  private readonly shipList: HTMLElement;
  private readonly rotateButton: HTMLButtonElement;
  private readonly startButton: HTMLButtonElement;
  private readonly newGameButton: HTMLButtonElement;

  private selectedLength: number | null = null;
  private orientation: Orientation = Orientation.Horizontal;
  private hoveredCell: Coordinate | null = null;
  private lastShot: { owner: BoardOwner; coord: Coordinate } | null = null;
  private lastMessage = '';
  private botTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(root: HTMLElement, createGame: (events: GameEvents) => Game) {
    this.root = root;
    this.game = createGame(this);

    this.statusElement = this.createElement('p', 'status');
    this.statusElement.setAttribute('role', 'status');
    this.messageElement = this.createElement('p', 'message');
    this.humanCounter = this.createElement('p', 'board__counter');
    this.botCounter = this.createElement('p', 'board__counter');
    this.setupPanel = this.createElement('section', 'setup');
    this.shipList = this.createElement('div', 'setup__ships');
    this.rotateButton = this.createButton('', (): void => this.toggleOrientation());
    this.startButton = this.createButton('Почати гру', (): void => {
      this.game.start();
    });
    this.startButton.classList.add('button--primary');
    this.newGameButton = this.createButton('Нова гра', (): void => this.startNewGame());
    this.newGameButton.classList.add('button--primary');

    this.buildLayout();
    document.addEventListener('keydown', (event: KeyboardEvent): void => this.handleKeyDown(event));
    this.render();
  }

  // --- GameEvents: called by the core ---

  public onStateChange(state: GameState): void {
    if (state === GameState.Setup) {
      this.lastShot = null;
      this.lastMessage = '';
    }
    this.render();
  }

  public onShot(_shooterName: string, outcome: ShotOutcome): void {
    // The callback fires before the turn is switched, so the current player is the shooter.
    const shooterIsHuman = this.game.isHumanTurn();
    this.lastShot = { owner: shooterIsHuman ? 'bot' : 'human', coord: outcome.coordinate };
    this.lastMessage = this.describeShot(shooterIsHuman, outcome);
    this.render();
    // After a hit the bot keeps its turn and shoots again.
    if (!shooterIsHuman && outcome.result !== ShotResult.Miss) {
      this.scheduleBotTurn();
    }
  }

  public onTurnChange(_currentPlayerName: string): void {
    this.render();
    this.scheduleBotTurn();
  }

  public onGameOver(_winnerName: string): void {
    this.render();
  }

  // --- Layout (built once) ---

  private buildLayout(): void {
    const title = this.createElement('h1', 'title', 'Морський бій');

    const boards = this.createElement('div', 'boards');
    boards.append(
      this.buildBoard('Ваше поле', 'human', this.humanCells, this.humanCounter),
      this.buildBoard('Поле суперника', 'bot', this.botCells, this.botCounter),
    );

    const setupTitle = this.createElement('h2', 'setup__title', 'Розстановка кораблів');
    const hint = this.createElement(
      'p',
      'setup__hint',
      'Оберіть корабель і клацніть клітинку на своєму полі. Клавіша R повертає корабель. ' +
        'Щоб прибрати розставлений корабель, клацніть на нього.',
    );
    const actions = this.createElement('div', 'setup__actions');
    actions.append(
      this.rotateButton,
      this.createButton('Розставити випадково', (): void => this.randomizeFleet()),
      this.createButton('Очистити поле', (): void => this.startNewGame()),
      this.startButton,
    );
    this.setupPanel.append(setupTitle, hint, this.shipList, actions);

    this.root.append(
      title,
      this.statusElement,
      this.messageElement,
      this.newGameButton,
      this.setupPanel,
      boards,
    );
  }

  /** Builds one labelled 10×10 board and fills `cells` with its buttons. */
  private buildBoard(
    caption: string,
    owner: BoardOwner,
    cells: HTMLButtonElement[][],
    counter: HTMLElement,
  ): HTMLElement {
    const board = this.createElement('section', `board board--${owner}`);
    const grid = this.createElement('div', 'board__grid');

    grid.append(this.createElement('div', 'board__label'));
    for (const letter of COLUMN_LABELS) {
      grid.append(this.createElement('div', 'board__label', letter));
    }
    for (let row = 0; row < Field.SIZE; row++) {
      grid.append(this.createElement('div', 'board__label', String(row + 1)));
      const rowCells: HTMLButtonElement[] = [];
      for (let col = 0; col < Field.SIZE; col++) {
        const cell = this.createCell(owner, { row, col });
        rowCells.push(cell);
        grid.append(cell);
      }
      cells.push(rowCells);
    }
    if (owner === 'human') {
      grid.addEventListener('mouseleave', (): void => this.setHoveredCell(null));
    }

    board.append(this.createElement('h2', 'board__title', caption), grid, counter);
    return board;
  }

  private createCell(owner: BoardOwner, coord: Coordinate): HTMLButtonElement {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.setAttribute('aria-label', `${COLUMN_LABELS[coord.col]}${coord.row + 1}`);
    if (owner === 'human') {
      cell.addEventListener('click', (): void => this.handleHumanCellClick(coord));
      cell.addEventListener('mouseenter', (): void => this.setHoveredCell(coord));
      cell.addEventListener('focus', (): void => this.setHoveredCell(coord));
    } else {
      cell.addEventListener('click', (): void => this.handleBotCellClick(coord));
    }
    return cell;
  }

  private createElement(tag: string, className: string, text = ''): HTMLElement {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  }

  private createButton(text: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button';
    button.textContent = text;
    button.addEventListener('click', onClick);
    return button;
  }

  // --- User input ---

  /** Setup phase: a click on a ship takes it back, a click on water places one. */
  private handleHumanCellClick(coord: Coordinate): void {
    if (this.game.getState() !== GameState.Setup) {
      return;
    }
    const placedShip = this.game
      .getHuman()
      .field.getShips()
      .find((ship: Ship): boolean => ship.occupies(coord));
    if (placedShip !== undefined) {
      if (this.game.removeHumanShip(coord)) {
        // The removed ship becomes the selected one, ready to be placed again.
        this.selectedLength = placedShip.length;
      }
      this.render();
      return;
    }
    if (this.selectedLength === null) {
      return;
    }
    if (this.game.placeHumanShip(this.selectedLength, coord, this.orientation)) {
      this.selectedLength = null;
    }
    this.render();
  }

  /** Playing phase: shoot at the clicked cell of the bot's board. */
  private handleBotCellClick(coord: Coordinate): void {
    this.game.humanShoot(coord);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const isRotateKey = event.code === 'KeyR';
    if (isRotateKey && this.game.getState() === GameState.Setup) {
      this.toggleOrientation();
    }
  }

  private toggleOrientation(): void {
    this.orientation =
      this.orientation === Orientation.Horizontal ? Orientation.Vertical : Orientation.Horizontal;
    this.render();
  }

  private randomizeFleet(): void {
    this.game.randomizeHumanFleet();
    this.render();
  }

  private startNewGame(): void {
    this.cancelBotTurn();
    this.selectedLength = null;
    this.game.reset();
  }

  private setHoveredCell(coord: Coordinate | null): void {
    this.hoveredCell = coord;
    if (this.game.getState() === GameState.Setup) {
      this.renderBoards();
    }
  }

  // --- Bot turns ---

  private scheduleBotTurn(): void {
    if (this.game.getState() !== GameState.Playing || this.game.isHumanTurn()) {
      return;
    }
    this.cancelBotTurn();
    this.botTimer = setTimeout((): void => {
      this.botTimer = null;
      this.game.playBotTurn();
    }, this.getBotDelay());
  }

  private getBotDelay(): number {
    return BOT_DELAY_MIN_MS + Math.random() * (BOT_DELAY_MAX_MS - BOT_DELAY_MIN_MS);
  }

  private cancelBotTurn(): void {
    if (this.botTimer !== null) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
  }

  // --- Rendering ---

  private render(): void {
    const state = this.game.getState();
    this.selectDefaultShip();

    this.root.dataset.state = state;
    this.statusElement.textContent = this.getStatusText();
    this.statusElement.className = `status ${this.getStatusModifier()}`;
    this.messageElement.textContent = this.lastMessage;
    this.setupPanel.hidden = state !== GameState.Setup;
    this.newGameButton.hidden = state === GameState.Setup;

    this.renderSetupPanel();
    this.renderBoards();
    this.renderCounters();
  }

  private renderBoards(): void {
    const state = this.game.getState();
    const humanField = this.game.getHuman().field;
    const botField = this.game.getBot().field;
    // The enemy fleet is revealed only when the game is over.
    this.renderBoard(this.humanCells, humanField, true, 'human');
    this.renderBoard(this.botCells, botField, state === GameState.Finished, 'bot');
    this.renderPlacementPreview();
  }

  private renderBoard(
    cells: HTMLButtonElement[][],
    field: Field,
    revealShips: boolean,
    owner: BoardOwner,
  ): void {
    const canShoot =
      owner === 'bot' && this.game.getState() === GameState.Playing && this.game.isHumanTurn();
    for (let row = 0; row < Field.SIZE; row++) {
      for (let col = 0; col < Field.SIZE; col++) {
        const coord: Coordinate = { row, col };
        const cell = cells[row][col];
        cell.className = `cell ${CELL_CLASS[field.getCellState(coord, revealShips)]}`;
        cell.classList.toggle('cell--target', canShoot && !field.hasBeenShot(coord));
        cell.classList.toggle('cell--last', this.isLastShot(owner, coord));
      }
    }
  }

  /** Setup phase: shows where the selected ship would go, valid or not. */
  private renderPlacementPreview(): void {
    if (
      this.game.getState() !== GameState.Setup ||
      this.selectedLength === null ||
      this.hoveredCell === null
    ) {
      return;
    }
    const field = this.game.getHuman().field;
    const isValid = field.canPlaceShip(this.selectedLength, this.hoveredCell, this.orientation);
    for (let i = 0; i < this.selectedLength; i++) {
      const row = this.hoveredCell.row + (this.orientation === Orientation.Vertical ? i : 0);
      const col = this.hoveredCell.col + (this.orientation === Orientation.Horizontal ? i : 0);
      if (field.isInBounds({ row, col })) {
        this.humanCells[row][col].classList.add(
          isValid ? 'cell--preview-valid' : 'cell--preview-invalid',
        );
      }
    }
  }

  private renderSetupPanel(): void {
    const field = this.game.getHuman().field;
    const remaining = field.getRemainingShipLengths();

    this.shipList.replaceChildren();
    for (const length of [...new Set(remaining)]) {
      const count = remaining.filter((value: number): boolean => value === length).length;
      const button = this.createButton(`${this.getShipLabel(length)} × ${count}`, (): void => {
        this.selectedLength = length;
        this.render();
      });
      button.classList.add('ship-option');
      button.classList.toggle('ship-option--selected', length === this.selectedLength);
      button.setAttribute('aria-pressed', String(length === this.selectedLength));
      this.shipList.append(button);
    }
    if (remaining.length === 0) {
      this.shipList.append(this.createElement('p', 'setup__done', 'Усі кораблі розставлено.'));
    }

    this.rotateButton.textContent =
      this.orientation === Orientation.Horizontal
        ? 'Орієнтація: горизонтальна'
        : 'Орієнтація: вертикальна';
    this.startButton.disabled = !field.isFleetComplete();
  }

  private renderCounters(): void {
    // During setup there is nothing to count yet.
    const isSetup = this.game.getState() === GameState.Setup;
    this.humanCounter.textContent = isSetup ? '' : this.getCounterText(this.game.getHuman().field);
    this.botCounter.textContent = isSetup ? '' : this.getCounterText(this.game.getBot().field);
  }

  // --- Small helpers ---

  /** Keeps a ship selected while there is something left to place. */
  private selectDefaultShip(): void {
    const remaining = this.game.getHuman().field.getRemainingShipLengths();
    if (this.selectedLength === null || !remaining.includes(this.selectedLength)) {
      this.selectedLength = remaining.length > 0 ? Math.max(...remaining) : null;
    }
  }

  private isLastShot(owner: BoardOwner, coord: Coordinate): boolean {
    return (
      this.lastShot !== null &&
      this.lastShot.owner === owner &&
      this.lastShot.coord.row === coord.row &&
      this.lastShot.coord.col === coord.col
    );
  }

  private getStatusText(): string {
    switch (this.game.getState()) {
      case GameState.Setup:
        return this.game.getHuman().field.isFleetComplete()
          ? 'Флот готовий. Натисніть «Почати гру».'
          : 'Розставте кораблі на своєму полі.';
      case GameState.Playing:
        return this.game.isHumanTurn()
          ? 'Ваш хід — стріляйте по полю суперника.'
          : 'Хід суперника…';
      case GameState.Finished:
        return this.game.getWinner() === this.game.getHuman()
          ? 'Перемога! Ви потопили весь флот суперника.'
          : 'Поразка. Суперник потопив ваш флот.';
    }
  }

  private getStatusModifier(): string {
    if (this.game.getState() !== GameState.Finished) {
      return '';
    }
    return this.game.getWinner() === this.game.getHuman() ? 'status--win' : 'status--lose';
  }

  private describeShot(shooterIsHuman: boolean, outcome: ShotOutcome): string {
    const cellName = `${COLUMN_LABELS[outcome.coordinate.col]}${outcome.coordinate.row + 1}`;
    const who = shooterIsHuman ? 'Ви' : 'Суперник';
    switch (outcome.result) {
      case ShotResult.Hit:
        return shooterIsHuman
          ? `${who}: ${cellName} — влучання!`
          : `${who}: ${cellName} — влучив у ваш корабель.`;
      case ShotResult.Sunk:
        return shooterIsHuman
          ? `${who}: ${cellName} — корабель потоплено!`
          : `${who}: ${cellName} — потопив ваш корабель.`;
      default:
        return `${who}: ${cellName} — промах.`;
    }
  }

  private getShipLabel(length: number): string {
    return `${length}-палубний`;
  }

  private getCounterText(field: Field): string {
    const ships = field.getShips();
    const afloat = ships.filter((ship: Ship): boolean => !ship.isSunk()).length;
    return `Кораблів на плаву: ${afloat} з ${ships.length}`;
  }
}
