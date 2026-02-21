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

  // Find first move line
  const moveLine = pgn
    .split("\n")
    .find(l => /^[0-9]/.test(l));

  let solver = "white";
  let firstMoveSAN = null;

  if (moveLine) {

    // White solver:
    if (/^[0-9]+\.\.\./.test(moveLine)) {
      solver = "white";
      firstMoveSAN = moveLine
        .replace(/^[0-9]+\.\.\.\s*/, "")
        .split(/\s+/)[0];
    }

    // Black solver:
    else if (/^[0-9]+\.\s/.test(moveLine)) {
      solver = "black";
      firstMoveSAN = moveLine
        .replace(/^[0-9]+\.\s*/, "")
        .split(/\s+/)[0];
    }

  }

  let finalFEN = startFEN;

  try {
    const game = new Chess(startFEN === "start" ? undefined : startFEN);

    if (firstMoveSAN) {
      game.move(firstMoveSAN, { sloppy: true });
      finalFEN = game.fen();
    }
  } catch (e) {
    console.warn("Could not apply move:", firstMoveSAN);
  }

  return {
    fen: finalFEN,
    orientation: solver === "black" ? "black" : "white"
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