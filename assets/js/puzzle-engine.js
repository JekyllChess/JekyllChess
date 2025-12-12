// ======================================================================
// JekyllChess Puzzle Engine — FIXED PIECE ANIMATION
// User moves: no re-animation
// Auto moves: animated
// ======================================================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("Puzzle engine loaded.");
  injectPuzzleStyles();

  const puzzleNodes = Array.from(document.querySelectorAll("puzzle"));
  if (!puzzleNodes.length) return;

  let remotePGNUsed = false;

  for (const node of puzzleNodes) {
    const raw = stripFigurines(node.innerHTML || "").trim();

    const fenMatch    = raw.match(/FEN:\s*([^\n<]+)/i);
    const movesMatch  = raw.match(/Moves:\s*([^\n<]+)/i);
    const pgnUrlMatch = raw.match(/PGN:\s*(https?:\/\/[^\s<]+)/i);
    const pgnInline   = !pgnUrlMatch && raw.match(/PGN:\s*(1\.[\s\S]+)/i);

    const wrap = document.createElement("div");
    wrap.className = "jc-puzzle-wrapper";
    node.replaceWith(wrap);

    if (pgnUrlMatch && !fenMatch) {
      if (remotePGNUsed) {
        wrap.textContent = "⚠️ Only one remote PGN pack allowed per page.";
        continue;
      }
      remotePGNUsed = true;
      initRemotePackLazy(wrap, pgnUrlMatch[1]);
      continue;
    }

    if (fenMatch && pgnInline) {
      const fen = fenMatch[1].trim();
      const sanMoves = parsePGNMoves(pgnInline[1]);
      renderLocalPuzzle(wrap, fen, sanMoves);
      continue;
    }

    if (fenMatch && movesMatch) {
      const fen = fenMatch[1].trim();
      const sanMoves = movesMatch[1].trim().split(/\s+/);
      renderLocalPuzzle(wrap, fen, sanMoves);
      continue;
    }

    wrap.textContent = "❌ Invalid <puzzle> block.";
  }
});

// ======================================================================
// STYLES
// ======================================================================

function injectPuzzleStyles() {
  if (document.getElementById("jc-puzzle-styles")) return;

  const style = document.createElement("style");
  style.id = "jc-puzzle-styles";
  style.textContent = `
    .jc-puzzle-wrapper { margin: 20px 0; }
    .jc-board { width: 350px; }
    .jc-feedback {
      margin-top: 8px;
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .jc-icon {
      display: inline-block;
      animation: jc-icon-pulse 1s ease-in-out infinite;
    }
    .jc-correct-icon { color: #2e8b57; }
    .jc-wrong-icon { color: #b22222; }

    @keyframes jc-icon-pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.15); }
      100% { transform: scale(1); }
    }

    .jc-turn {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
      font-size: 15px;
      font-weight: 500;
    }

    .jc-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 1px solid #555;
    }

    .jc-selected-square {
      outline: 2px solid rgba(60,132,255,.9);
      outline-offset: -2px;
    }

    @media (max-width: 768px) {
      .jc-board { touch-action: none; }
    }
  `;
  document.head.appendChild(style);
}

// ======================================================================
// HELPERS
// ======================================================================

function stripFigurines(s) {
  return s.replace(/[♔♕♖♗♘♙]/g, "");
}

function parsePGNMoves(pgn) {
  return pgn
    .replace(/\{[^}]*\}/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\d+\.(\.\.)?/g, "")
    .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function buildUCISolution(fen, san) {
  const g = new Chess(fen);
  const out = [];
  for (const m of san) {
    const mv = g.move(m, { sloppy: true });
    if (!mv) break;
    out.push(mv.from + mv.to + (mv.promotion || ""));
  }
  return out;
}

// ======================================================================
// FEEDBACK
// ======================================================================

function setCorrectFeedback(el) {
  el.innerHTML = `Correct move <span class="jc-icon jc-correct-icon">✔️</span>`;
}

function setWrongFeedback(el) {
  el.innerHTML = `Wrong move <span class="jc-icon jc-wrong-icon">✖️</span>`;
}

function setSolvedFeedback(el) {
  el.innerHTML = `Puzzle solved <span class="jc-icon">🏆</span>`;
}

// ======================================================================
// TURN INDICATOR
// ======================================================================

function createTurnIndicator() {
  const row = document.createElement("div");
  row.className = "jc-turn";
  const dot = document.createElement("div");
  dot.className = "jc-dot";
  const label = document.createElement("div");
  row.append(dot, label);
  return { row, dot, label };
}

function updateTurn(game, dot, label) {
  if (game.turn() === "w") {
    dot.style.background = "#fff";
    label.textContent = "White to move";
  } else {
    dot.style.background = "#000";
    label.textContent = "Black to move";
  }
}

// ======================================================================
// TAP-TO-MOVE
// ======================================================================

function attachTap(boardEl, game, tryMove, solved) {
  let from = null;

  boardEl.addEventListener("click", e => {
    if (solved()) return;

    const sqEl = e.target.closest("[data-square]");
    if (!sqEl) return;

    const sq = sqEl.dataset.square;
    if (!from) {
      const p = game.get(sq);
      if (!p || p.color !== game.turn()) return;
      sqEl.classList.add("jc-selected-square");
      from = sq;
    } else {
      boardEl.querySelectorAll(".jc-selected-square")
        .forEach(x => x.classList.remove("jc-selected-square"));
      tryMove(from, sq);
      from = null;
    }
  });
}

// ======================================================================
// LOCAL PUZZLE RENDER (FIXED ANIMATION)
// ======================================================================

function renderLocalPuzzle(container, fen, sanMoves) {
  const game = new Chess(fen);
  const solution = buildUCISolution(fen, sanMoves);
  let step = 0;
  let solved = false;

  const boardDiv = document.createElement("div");
  boardDiv.className = "jc-board";

  const feedback = document.createElement("div");
  feedback.className = "jc-feedback";

  const { row: turnRow, dot, label } = createTurnIndicator();

  container.append(boardDiv, feedback, turnRow);

  const board = Chessboard(boardDiv, {
    draggable: true,
    position: fen,
    pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",

    onDrop: (src, dst) => tryMove(src, dst) ? true : "snapback"
  });

  function tryMove(src, dst) {
    if (solved) return false;

    const mv = game.move({ from: src, to: dst, promotion: "q" });
    if (!mv) return false;

    if (mv.from + mv.to !== solution[step]) {
      game.undo();
      setWrongFeedback(feedback);
      updateTurn(game, dot, label);
      return false;
    }

    // ✅ Correct user move — DO NOT call board.position()
    step++;
    setCorrectFeedback(feedback);
    updateTurn(game, dot, label);

    // ▶️ Animate automatic reply move
    if (step < solution.length) {
      const reply = game.move(sanMoves[step], { sloppy: true });
      step++;
      setTimeout(() => {
        board.position(game.fen(), true); // animated
        updateTurn(game, dot, label);
      }, 200);
    }

    if (step >= solution.length) {
      solved = true;
      setSolvedFeedback(feedback);
      turnRow.style.display = "none";
    }

    return true;
  }

  updateTurn(game, dot, label);
  attachTap(boardDiv, game, tryMove, () => solved);
}

// ======================================================================
// REMOTE PGN PLACEHOLDER
// ======================================================================

function initRemotePackLazy(container, url) {
  container.textContent = "Remote PGN puzzle pack loading…";
}
