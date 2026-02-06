/**
 * Game Utility Functions
 *
 * Pure helper functions for Connect4 and TicTacToe logic:
 * win detection, draw detection, board rendering.
 */

// ── Connect4 ──────────────────────────────────────────

/**
 * Check for a Connect4 winner (horizontal, vertical, diagonal)
 * @param board 6×7 board of player IDs or null
 * @returns Player ID if winner found, null otherwise
 */
export function checkConnect4Win(board: (string | null)[][]): string | null {
  const rows = 6;
  const cols = 7;

  const checkLine = (positions: [number, number][]): string | null => {
    const values = positions.map(([r, c]) => board[r]?.[c]);
    if (values.every((v) => v && v === values[0])) {
      return values[0] || null;
    }
    return null;
  };

  // Horizontal
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col <= cols - 4; col++) {
      const result = checkLine([
        [row, col],
        [row, col + 1],
        [row, col + 2],
        [row, col + 3],
      ]);
      if (result) return result;
    }
  }

  // Vertical
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row <= rows - 4; row++) {
      const result = checkLine([
        [row, col],
        [row + 1, col],
        [row + 2, col],
        [row + 3, col],
      ]);
      if (result) return result;
    }
  }

  // Diagonal (down-right)
  for (let row = 0; row <= rows - 4; row++) {
    for (let col = 0; col <= cols - 4; col++) {
      const result = checkLine([
        [row, col],
        [row + 1, col + 1],
        [row + 2, col + 2],
        [row + 3, col + 3],
      ]);
      if (result) return result;
    }
  }

  // Diagonal (down-left)
  for (let row = 0; row <= rows - 4; row++) {
    for (let col = 3; col < cols; col++) {
      const result = checkLine([
        [row, col],
        [row + 1, col - 1],
        [row + 2, col - 2],
        [row + 3, col - 3],
      ]);
      if (result) return result;
    }
  }

  return null;
}

/** Check if the Connect4 board is full (draw) */
export function isConnect4Draw(board: (string | null)[][]): boolean {
  return board.every((row) => row.every((cell) => cell !== null));
}

/** Get lowest available row in a Connect4 column, or -1 if full */
export function getConnect4DropRow(board: (string | null)[][], col: number): number {
  for (let row = 5; row >= 0; row--) {
    const rowData = board[row];
    if (rowData && rowData[col] === null) {
      return row;
    }
  }
  return -1;
}

/** Render a Connect4 board as an emoji grid string */
export function formatConnect4Board(board: (string | null)[][], player1: string, player2: string): string {
  const emojis = { empty: "⚫", player1: "🔴", player2: "🟡" };

  let output = "```\n 1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣\n";

  for (const row of board) {
    output += row
      .map((cell) => {
        if (cell === player1) return emojis.player1;
        if (cell === player2) return emojis.player2;
        return emojis.empty;
      })
      .join("");
    output += "\n";
  }

  output += "```";
  return output;
}

// ── TicTacToe ─────────────────────────────────────────

/** Win patterns for a 3×3 board (indices into flat 9-element array) */
const TTT_WIN_PATTERNS = [
  [0, 1, 2], // top row
  [3, 4, 5], // middle row
  [6, 7, 8], // bottom row
  [0, 3, 6], // left column
  [1, 4, 7], // middle column
  [2, 5, 8], // right column
  [0, 4, 8], // diagonal ↘
  [2, 4, 6], // diagonal ↙
];

/** Check for a TicTacToe winner */
export function checkTicTacToeWin(board: (string | null)[]): string | null {
  for (const pattern of TTT_WIN_PATTERNS) {
    const [a, b, c] = pattern;
    if (a !== undefined && b !== undefined && c !== undefined) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
  }
  return null;
}

/** Check if the TicTacToe board is full (draw) */
export function isTicTacToeDraw(board: (string | null)[]): boolean {
  return board.every((cell) => cell !== null);
}

/** Render a TicTacToe board as an emoji grid string */
export function formatTicTacToeBoard(board: (string | null)[], player1: string, player2: string): string {
  const emojis = { empty: "⬜", player1: "❌", player2: "⭕" };

  const formatted = board.map((cell) => {
    if (cell === player1) return emojis.player1;
    if (cell === player2) return emojis.player2;
    return emojis.empty;
  });

  let output = "```\n";
  output += `${formatted[0]}${formatted[1]}${formatted[2]}\n`;
  output += `${formatted[3]}${formatted[4]}${formatted[5]}\n`;
  output += `${formatted[6]}${formatted[7]}${formatted[8]}\n`;
  output += "```";

  return output;
}
