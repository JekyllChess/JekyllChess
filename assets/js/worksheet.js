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


/* ============================= */
/* Split PGN into puzzles        */
/* ============================= */

function splitPGN(text) {

  const games = text
    .replace(/\r/g, "")
    .split(/\n\s*\n(?=\[)/g)
    .map(g => g.trim())
    .filter(Boolean);

  return games.map(extractPuzzle);

}


/* ============================= */
/* Extract FEN + solver color    */
/* ============================= */

function extractPuzzle(pgn) {

  const fenMatch = pgn.match(/\[FEN\s+"([^"]+)"\]/);
  const fen = fenMatch ? fenMatch[1] : "start";

  const moveLine = pgn
    .split("\n")
    .find(l => /^[0-9]/.test(l));

  let solver = "white";

  // Example: "31. Qe3 Rxa4# *"  → black solves
  if (moveLine && /^[0-9]+\.\s/.test(moveLine)) {
    solver = "black";
  }

  // Example: "14... Qxc3 15. Qc8# *" → white solves
  if (moveLine && /^[0-9]+\.\.\./.test(moveLine)) {
    solver = "white";
  }

  return {
    fen: fen,
    orientation: solver === "black" ? "black" : "white"
  };

}


/* ============================= */
/* Render Boards                 */
/* ============================= */

function renderBoards(container, puzzles) {

  container.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "worksheet-grid";
  container.appendChild(grid);

  puzzles.forEach(puzzle => {

    const cell = document.createElement("div");
    cell.className = "worksheet-item";

    const boardDiv = document.createElement("div");
    boardDiv.className = "worksheet-board";

    cell.appendChild(boardDiv);
    grid.appendChild(cell);

    requestAnimationFrame(() => {

      Chessboard(boardDiv, {
        position: puzzle.fen === "start" ? "start" : puzzle.fen,
        orientation: puzzle.orientation,
        draggable: false,
        pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png"
      });

    });

  });

}