// ======================================================================
// JekyllChess Puzzle Engine — WITH TURN INDICATOR RESTORED
// ======================================================================

document.addEventListener("DOMContentLoaded", () => {
  injectPuzzleStyles();

  const puzzleNodes = Array.from(document.querySelectorAll("puzzle"));
  let remoteUsed = false;

  puzzleNodes.forEach(node => {
    const raw = stripFigurines(node.innerHTML || "").trim();
    const wrap = document.createElement("div");
    wrap.className = "jc-puzzle-wrapper";
    node.replaceWith(wrap);

    const fenMatch    = raw.match(/FEN:\s*([^\n<]+)/i);
    const movesMatch  = raw.match(/Moves:\s*([^\n<]+)/i);
    const pgnUrlMatch = raw.match(/PGN:\s*(https?:\/\/[^\s<]+)/i);
    const pgnInline   = !pgnUrlMatch && raw.match(/PGN:\s*(1\.[\s\S]+)/i);

    // ------------------------------------------------------------
    // REMOTE PGN PACK
    // ------------------------------------------------------------
    if (pgnUrlMatch && !fenMatch) {
      if (remoteUsed) {
        wrap.textContent = "⚠️ Only one remote PGN pack allowed per page.";
        return;
      }
      remoteUsed = true;
      initRemotePGNPackLazy(wrap, pgnUrlMatch[1].trim());
      return;
    }

    // ------------------------------------------------------------
    // INLINE PGN (single puzzle)
    // ------------------------------------------------------------
    if (fenMatch && pgnInline) {
      renderLocalPuzzle(
        wrap,
        fenMatch[1].trim(),
        parsePGNMoves(pgnInline[1])
      );
      return;
    }

    // ------------------------------------------------------------
    // FEN + Moves
    // ------------------------------------------------------------
    if (fenMatch && movesMatch) {
      renderLocalPuzzle(
        wrap,
        fenMatch[1].trim(),
        movesMatch[1].trim().split(/\s+/)
      );
      return;
    }

    wrap.textContent = "❌ Invalid <puzzle> block.";
  });
});

// ======================================================================
// STYLES
// ======================================================================

function injectPuzzleStyles() {
  if (document.getElementById("jc-puzzle-styles")) return;

  const s = document.createElement("style");
  s.id = "jc-puzzle-styles";
  s.textContent = `
    .jc-puzzle-wrapper { margin: 20px 0; }
    .jc-board { width: 350px; }

    .jc-feedback {
      margin-top: 8px;
      font-weight: 600;
      display: flex;
      gap: 6px;
    }

    .jc-icon { animation: jc-pulse 1s ease-in-out infinite; }

    @keyframes jc-pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.15); }
      100% { transform: scale(1); }
    }

    .jc-turn {
      margin-top: 4px;
      font-size: 15px;
      font-weight: 500;
    }

    .jc-controls {
      margin-top: 10px;
      display: flex;
      gap: 8px;
    }

    .jc-selected-square {
      outline: 2px solid rgba(60,132,255,.9);
      outline-offset: -2px;
    }

    @media (max-width: 768px) {
      .jc-board { touch-action: none; }
    }
  `;
  document.head.appendChild(s);
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

function showCorrect(el) {
  el.innerHTML = `Correct move <span class="jc-icon jc-correct">✅</span>`;
}

function showWrong(el) {
  el.innerHTML = `Wrong move <span class="jc-icon jc-wrong">❌</span>`;
}

function showSolved(el) {
  el.innerHTML = `Puzzle solved <span class="jc-icon">🏆</span>`;
}

// ======================================================================
// TURN INDICATOR
// ======================================================================

function updateTurnIndicator(el, game, solved) {
  if (solved) {
    el.textContent = "";
    return;
  }
  el.textContent = game.turn() === "w"
    ? "◎ White to move"
    : "◉ Black to move";
}

// ======================================================================
// LOCAL PUZZLE (UNCHANGED — UCI BASED)
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
  const turnDiv = document.createElement("div");
  turnDiv.className = "jc-turn";

  container.append(boardDiv, feedback, turnDiv);

  const board = Chessboard(boardDiv, {
    draggable: true,
    position: fen,
    pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
    onDrop: (s, t) => playMove(s, t) ? true : "snapback"
  });

  function playMove(src, dst) {
    if (solved) return false;
    const mv = game.move({ from: src, to: dst, promotion: "q" });
    if (!mv) return false;

    if (mv.from + mv.to !== solution[step]) {
      game.undo();
      showWrong(feedback);
      updateTurnIndicator(turnDiv, game, solved);
      return false;
    }

    step++;
    showCorrect(feedback);
    updateTurnIndicator(turnDiv, game, solved);

    if (step < solution.length) {
      game.move(sanMoves[step], { sloppy: true });
      step++;
      setTimeout(() => {
        board.position(game.fen(), true);
        updateTurnIndicator(turnDiv, game, solved);
      }, 200);
    }

    if (step >= solution.length) {
      solved = true;
      showSolved(feedback);
      updateTurnIndicator(turnDiv, game, solved);
    }

    return true;
  }

  updateTurnIndicator(turnDiv, game, solved);
}

// ======================================================================
// REMOTE PGN — FIXED (SAN-BASED VALIDATION)
// ======================================================================

function initRemotePGNPackLazy(container, url) {
  const BATCH_SIZE = 20;

  const boardDiv = document.createElement("div");
  boardDiv.className = "jc-board";
  const feedback = document.createElement("div");
  feedback.className = "jc-feedback";
  const turnDiv = document.createElement("div");
  turnDiv.className = "jc-turn";
  const controls = document.createElement("div");
  controls.className = "jc-controls";

  const prev = document.createElement("button");
  prev.textContent = "Previous";
  const next = document.createElement("button");
  next.textContent = "Next";

  controls.append(prev, next);
  container.append(boardDiv, feedback, turnDiv, controls);

  feedback.textContent = "Loading puzzle pack…";

  fetch(url)
    .then(r => r.text())
    .then(txt => {
      const games = txt.split(/\[Event\b/).slice(1).map(g => "[Event" + g);
      const puzzles = [];
      let parsedUntil = 0;

      let index = 0;
      let game, moves, step = 0, solved = false;

      const board = Chessboard(boardDiv, {
        draggable: true,
        pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
        onDrop: (s, t) => playMove(s, t) ? true : "snapback"
      });

      function parseNextBatch() {
        const end = Math.min(parsedUntil + BATCH_SIZE, games.length);
        for (let i = parsedUntil; i < end; i++) {
          const g = games[i];
          const fen = g.match(/\[FEN\s+"([^"]+)"/)?.[1];
          if (!fen) continue;
          const sanMoves = parsePGNMoves(g);
          if (sanMoves.length) puzzles.push({ fen, sanMoves });
        }
        parsedUntil = end;
      }

      function loadPuzzle(i) {
        if (i >= puzzles.length && parsedUntil < games.length) {
          parseNextBatch();
        }
        if (!puzzles[i]) return;

        index = i;
        game = new Chess(puzzles[i].fen);
        moves = puzzles[i].sanMoves;
        step = 0;
        solved = false;

        board.position(game.fen());
        feedback.textContent = "";
        updateTurnIndicator(turnDiv, game, solved);
      }

      function playMove(src, dst) {
        if (solved) return false;

        const expectedSAN = moves[step];
        const mv = game.move({ from: src, to: dst, promotion: "q" });
        if (!mv) return false;

        if (mv.san !== expectedSAN) {
          game.undo();
          showWrong(feedback);
          updateTurnIndicator(turnDiv, game, solved);
          return false;
        }

        step++;
        showCorrect(feedback);
        updateTurnIndicator(turnDiv, game, solved);

        if (step < moves.length) {
          game.move(moves[step], { sloppy: true });
          step++;
          setTimeout(() => {
            board.position(game.fen(), true);
            updateTurnIndicator(turnDiv, game, solved);
          }, 200);
        }

        if (step >= moves.length) {
          solved = true;
          showSolved(feedback);
          updateTurnIndicator(turnDiv, game, solved);
        }

        return true;
      }

      prev.onclick = () => loadPuzzle(Math.max(index - 1, 0));
      next.onclick = () => loadPuzzle(index + 1);

      parseNextBatch();
      loadPuzzle(0);
    })
    .catch(() => {
      feedback.textContent = "❌ Failed to load PGN.";
    });
}
