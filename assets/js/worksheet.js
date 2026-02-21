/*
  worksheet.js
  Turns <worksheet> PGN into multiple FEN diagrams
  Requires:
   - chess.js
   - chessboard.js
*/

document.addEventListener("DOMContentLoaded", () => {
  const worksheets = document.querySelectorAll("worksheet");

  worksheets.forEach(ws => {
    const raw = ws.textContent.trim();
    const match = raw.match(/PGN:\s*(.+)/i);
    if (!match) return;

    const pgnUrl = match[1].trim();
    ws.innerHTML = `<div class="worksheet-container">Loading puzzles...</div>`;

    fetch(pgnUrl)
      .then(r => r.text())
      .then(pgnText => {
        const games = splitPGN(pgnText);
        renderGames(ws, games);
      })
      .catch(err => {
        ws.innerHTML = "Failed to load PGN file.";
        console.error(err);
      });
  });
});

/* ----------------------------- */
/* Split PGN into individual games */
/* ----------------------------- */

function splitPGN(pgnText) {
  return pgnText
    .split(/\n\s*\n(?=\[Event|\[FEN|\[Site|\[White)/g)
    .map(g => g.trim())
    .filter(g => g.length);
}

/* ----------------------------- */
/* Render puzzles */
/* ----------------------------- */

function renderGames(container, games) {
  container.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "worksheet-container";

  games.forEach((pgn, index) => {
    const boardId = `worksheet-board-${index}`;
    const puzzleDiv = document.createElement("div");
    puzzleDiv.className = "worksheet-puzzle";

    puzzleDiv.innerHTML = `
      <div class="worksheet-board" id="${boardId}"></div>
      <div class="worksheet-label">Puzzle ${index + 1}</div>
    `;

    wrapper.appendChild(puzzleDiv);

    const fen = extractFEN(pgn);

    Chessboard(boardId, {
      position: fen,
      draggable: false,
      showNotation: false
    });
  });

  container.appendChild(wrapper);
}

/* ----------------------------- */
/* Extract FEN */
/* ----------------------------- */

function extractFEN(pgn) {

  // 1) Use FEN tag if exists
  const fenTag = pgn.match(/\[FEN\s+"([^"]+)"\]/i);
  if (fenTag) return fenTag[1];

  // 2) Otherwise build from moves
  const game = new Chess();
  game.load_pgn(pgn);
  return game.fen();
}