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

        ws._puzzles = puzzles;
        ws._page = 0;

        renderPage(ws);

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
  const startFEN = fenMatch ? fenMatch[1] : "start";

  const moveLine = pgn
    .split("\n")
    .find(l => /^[0-9]/.test(l));

  let solver = "white";
  let solutionMoves = [];

  if (moveLine) {

    // Remove move numbers
    const cleaned = moveLine
      .replace(/[0-9]+\.(\.\.)?/g, "")
      .trim();

    solutionMoves = cleaned.split(/\s+/);

    if (/^[0-9]+\.\.\./.test(moveLine)) {
      solver = "white";
    }
    else if (/^[0-9]+\.\s/.test(moveLine)) {
      solver = "black";
    }

  }

  const game = new Chess(startFEN === "start" ? undefined : startFEN);

  // Apply first solution move (already shown)
  if (solutionMoves.length) {
    game.move(solutionMoves[0], { sloppy: true });
    solutionMoves.shift();
  }

  return {
    fen: game.fen(),
    orientation: solver === "black" ? "black" : "white",
    solution: solutionMoves
  };

}

/* ============================= */
/* Render Current Page           */
/* ============================= */

function renderPage(ws) {

  const start = ws._page * 10;
  const end = start + 10;
  const slice = ws._puzzles.slice(start, end);

  ws.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "worksheet-grid";
  ws.appendChild(grid);

  slice.forEach(puzzle => {

    const cell = document.createElement("div");
cell.className = "worksheet-item";

const boardDiv = document.createElement("div");
boardDiv.className = "worksheet-board";

const solvedOverlay = document.createElement("div");
solvedOverlay.className = "worksheet-solved";
solvedOverlay.textContent = "SOLVED!";

cell.appendChild(boardDiv);
cell.appendChild(solvedOverlay);
grid.appendChild(cell);

    requestAnimationFrame(() => {

const game = new Chess(puzzle.fen);

const feedback = document.createElement("div");
feedback.className = "move-feedback";
cell.appendChild(feedback);

const board = Chessboard(boardDiv, {
  position: puzzle.fen,
  orientation: puzzle.orientation,
  draggable: true,

  moveSpeed: 0,
  snapSpeed: 0,

  pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",

  onDrop: (source, target) => {

    const move = game.move({
      from: source,
      to: target,
      promotion: "q"
    });

    if (!move) return "snapback";

    const expected = puzzle.solution[0];

    // WRONG MOVE
    if (!expected || move.san !== expected) {
      game.undo();
      feedback.textContent = move.san + " ❌";
      cell.classList.add("disabled");
      board.draggable = false;
      return "snapback";
    }

    // CORRECT MOVE
    puzzle.solution.shift();
    feedback.textContent = move.san + " ✅";
    board.position(game.fen(), false);

    // Puzzle completed
    if (puzzle.solution.length === 0) {
      cell.classList.add("disabled");
      board.draggable = false;
    }

  }
});

    });

  });

  if (end < ws._puzzles.length) {

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next";
    nextBtn.className = "worksheet-next";

    nextBtn.addEventListener("click", () => {
      ws._page++;
      renderPage(ws);
    });

    ws.appendChild(nextBtn);

  }

}