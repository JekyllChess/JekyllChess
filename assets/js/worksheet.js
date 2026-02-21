document.addEventListener("DOMContentLoaded", () => {
  const worksheets = document.querySelectorAll("worksheet");

  worksheets.forEach(ws => {
    const pgnLine = ws.innerText
      .split("\n")
      .find(l => l.trim().startsWith("PGN:"));

    if (!pgnLine) return;

    const url = pgnLine.replace("PGN:", "").trim();

    fetch(url)
      .then(r => r.text())
      .then(pgnText => {
        const puzzles = splitPGN(pgnText);
        renderBoards(ws, puzzles.slice(0, 10));
      })
      .catch(err => {
        ws.innerHTML = "Failed to load PGN.";
        console.error(err);
      });
  });
});

/* ----------------------------- */
/* Split PGN into individual games */
/* ----------------------------- */

function splitPGN(text) {
  const games = text
    .replace(/\r/g, "")
    .split(/\n\s*\n(?=\[)/g)
    .map(g => g.trim())
    .filter(Boolean);

  return games.map(extractFEN);
}

/* ----------------------------- */
/* Extract starting FEN */
/* ----------------------------- */

function extractFEN(pgn) {
  const fenMatch = pgn.match(/\[FEN\s+"([^"]+)"\]/);

  if (fenMatch) return fenMatch[1];

  // If no FEN tag, assume standard start
  return "start";
}

/* ----------------------------- */
/* Render Boards */
/* ----------------------------- */

function renderBoards(container, fens) {
  container.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "worksheet-grid";
  container.appendChild(grid);

  fens.forEach(fen => {
    const cell = document.createElement("div");
    cell.className = "worksheet-item";

    const boardDiv = document.createElement("div");
    boardDiv.className = "worksheet-board";

    cell.appendChild(boardDiv);
    grid.appendChild(cell);

    requestAnimationFrame(() => {
      Chessboard(boardDiv, {
        position: fen === "start" ? "start" : fen,
        draggable: false,
        pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png"
      });
    });
  });
}