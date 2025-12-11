// ======================================================================
//  PUZZLE ENGINE — SIMPLE VERSION
//  Supports only <puzzle> FEN + Moves blocks in Markdown
// ======================================================================

document.addEventListener("DOMContentLoaded", () => {
  const puzzleNodes = document.querySelectorAll("puzzle");

  puzzleNodes.forEach((node) => {
    const raw = node.textContent.trim();
    const lines = raw.split("\n").map(l => l.trim());

    let fen = null;
    let moves = null;

    for (let line of lines) {
      if (line.startsWith("FEN:"))
        fen = line.replace("FEN:", "").trim();

      if (line.startsWith("Moves:"))
        moves = line.replace("Moves:", "").trim().split(/\s+/);
    }

    const wrapper = document.createElement("div");
    wrapper.className = "puzzle";
    wrapper.style.margin = "25px 0";

    node.replaceWith(wrapper);

    if (!fen || !moves) {
      wrapper.innerHTML = `<div style="color:red">Invalid puzzle block.</div>`;
      return;
    }

    renderPuzzle(wrapper, fen, moves);
  });
});

// ======================================================================
//  RENDER A SINGLE PUZZLE
// ======================================================================

function renderPuzzle(container, fen, moves) {
  const game = new Chess(fen);
  const solution = [];

  // -----------------------------
  // Convert SAN → UCI
  // -----------------------------
  for (let san of moves) {
    const clean = san.replace(/[!?]/g, "");
    const temp = game.move(clean, { sloppy: true });
    if (!temp) continue;
    solution.push(temp.from + temp.to + (temp.promotion || ""));
    game.undo();
  }

  // -----------------------------
  //  Build HTML elements
  // -----------------------------
  const boardDiv = document.createElement("div");
  boardDiv.style.width = "350px";

  const statusDiv = document.createElement("div");
  statusDiv.style.marginTop = "8px";
  statusDiv.style.fontSize = "16px";

  container.append(boardDiv, statusDiv);

  let step = 0;

  // -----------------------------
  //  Initialize the chessboard
  // -----------------------------
  const board = Chessboard(boardDiv, {
    draggable: true,
    position: fen,
    pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",

    onDragStart: (_, piece) => {
      if (game.game_over()) return false;
      if (game.turn() === "w" && piece.startsWith("b")) return false;
      if (game.turn() === "b" && piece.startsWith("w")) return false;
    },

    onDrop: (source, target) => {
      const move = game.move({ from: source, to: target, promotion: "q" });
      if (!move) return "snapback";

      const uci = move.from + move.to + (move.promotion || "");
      const correct = solution[step];

      if (uci !== correct) {
        statusDiv.textContent = "❌ Wrong move";
        game.undo();
        return "snapback";
      }

      statusDiv.textContent = "✅ Correct";
      step++;

      // Opponent move (solution step 2, 4, 6, ...)
      if (step < solution.length) {
        const replySAN = moves[step];
        game.move(replySAN, { sloppy: true });
        step++;
        setTimeout(() => board.position(game.fen()), 150);
      }

      if (step >= solution.length) {
        statusDiv.textContent = "🎉 Puzzle solved!";
      }

      return true;
    },

    onSnapEnd: () => board.position(game.fen())
  });

  statusDiv.textContent = "Your move...";
}
