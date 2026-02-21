document.addEventListener("DOMContentLoaded", () => {

  document.querySelectorAll("worksheet").forEach(ws => {

    const pgnLine = ws.innerHTML.match(/PGN:\s*(.*)/);
    if (!pgnLine) return;

    const pgnURL = pgnLine[1].trim();
    ws.innerHTML = "";

    fetch(pgnURL)
      .then(r => r.text())
      .then(pgn => initWorksheet(ws, pgn))
      .catch(err => console.error("Worksheet PGN load error:", err));

  });

});

function initWorksheet(container, pgnText) {

  const games = pgnText
    .split(/\n\n(?=\[Event)/)
    .filter(g => g.trim().length);

  let page = 0;
  const pageSize = 10;

  const grid = document.createElement("div");
  grid.className = "worksheet-grid";

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Next Page →";
  nextBtn.style.display = "none";

  container.append(grid, nextBtn);

  nextBtn.onclick = () => {
    page++;
    renderPage();
  };

  function renderPage() {

    grid.innerHTML = "";
    nextBtn.style.display = "none";

    const start = page * pageSize;
    const slice = games.slice(start, start + pageSize);

    let solvedCount = 0;

    slice.forEach((pgn, i) => {

      const wrapper = document.createElement("div");
      wrapper.className = "worksheet-item";

      const boardDiv = document.createElement("div");
      boardDiv.className = "worksheet-board";
      boardDiv.id = "board_" + page + "_" + i;

      const solveBtn = document.createElement("button");
      solveBtn.textContent = "Solved";

      wrapper.append(boardDiv, solveBtn);
      grid.append(wrapper);

      const game = new Chess();
      game.load_pgn(pgn);

      const fen = game.fen();

      setTimeout(() => {
        Chessboard(boardDiv.id, {
          position: fen,
          draggable: false,
          pieceTheme: "/assets/img/chesspieces/wikipedia/{piece}.png"
        });
      }, 0);

      solveBtn.onclick = () => {

        if (solveBtn.classList.contains("done")) return;

        solveBtn.classList.add("done");
        solveBtn.textContent = "✓ Solved";
        solvedCount++;

        if (solvedCount === slice.length) {
          if ((page + 1) * pageSize < games.length) {
            nextBtn.style.display = "block";
          }
        }

      };

    });

  }

  renderPage();
}
