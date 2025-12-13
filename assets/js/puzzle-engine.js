// ======================================================================
// JekyllChess Puzzle Engine — robust local puzzles, remote URL placeholder
// - Local: FEN + Moves (SAN) with tolerant parsing
// - Turn display appears only when board is ready
// - Auto-plays EXACTLY one opponent reply after each correct user move
// - Animates ONLY auto reply, then hard-syncs to prevent ghost pieces
// - Remote PGN URL: placeholder UI (disabled) so nothing breaks
// ======================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function") {
    console.warn("puzzle-engine.js: chess.js missing");
    return;
  }
  if (typeof Chessboard !== "function") {
    console.warn("puzzle-engine.js: chessboard.js missing");
    return;
  }

  const PIECE_THEME = "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png";

  // ----------------------------------------------------------------------
  // Chessboard 1003 fix: init only when element has layout (and return board)
  // ----------------------------------------------------------------------
  function safeChessboard(targetEl, options, onReady, tries = 90) {
    if (!targetEl) return;

    const rect = targetEl.getBoundingClientRect();
    if ((rect.width <= 0 || rect.height <= 0) && tries > 0) {
      requestAnimationFrame(() => safeChessboard(targetEl, options, onReady, tries - 1));
      return;
    }

    let board = null;
    try {
      board = Chessboard(targetEl, options);
    } catch (err) {
      if (tries > 0) {
        requestAnimationFrame(() => safeChessboard(targetEl, options, onReady, tries - 1));
        return;
      }
      console.warn("puzzle-engine.js: Chessboard init failed", err);
      return;
    }

    if (typeof onReady === "function") onReady(board);
  }

  // ----------------------------------------------------------------------
  // Parsing helpers
  // ----------------------------------------------------------------------
  function stripFigurines(s) {
    return String(s || "").replace(/[♔♕♖♗♘♙♚♛♜♝♞♟]/g, "");
  }

  // Remove common PGN clutter while keeping SAN tokens.
  function tokenizeMoves(movesText) {
    let s = String(movesText || "");

    // Remove braces comments { ... }
    s = s.replace(/\{[\s\S]*?\}/g, " ");

    // Remove semicolon comments ; ...
    s = s.replace(/;[^\n\r]*/g, " ");

    // Remove variations ( ... ) repeatedly (simple non-nested handling)
    // If you later want nested-paren support, we can implement a small stack parser.
    while (/\([^()]*\)/.test(s)) s = s.replace(/\([^()]*\)/g, " ");

    // Remove NAGs like $1
    s = s.replace(/\$\d+/g, " ");

    // Normalize whitespace
    s = s.replace(/\s+/g, " ").trim();

    const rawTokens = s.split(" ").filter(Boolean);

    // Filter out move numbers and results
    const tokens = rawTokens.filter((t) => {
      // 1. or 23. or 23...
      if (/^\d+\.(\.\.)?$/.test(t)) return false;
      if (/^\d+\.\.\.$/.test(t)) return false;

      // "1.e4" style
      if (/^\d+\.(?:[A-Za-zO0-9])/.test(t)) {
        // split "1.e4" into "e4"
        return true;
      }

      // results
      if (t === "1-0" || t === "0-1" || t === "1/2-1/2" || t === "*") return false;

      return true;
    });

    // Expand "1.e4" into "e4"
    const expanded = [];
    for (const t of tokens) {
      const m = t.match(/^(\d+)\.(.+)$/);
      if (m && m[2]) expanded.push(m[2]);
      else expanded.push(t);
    }

    return expanded;
  }

  function normalizeSAN(san) {
    // Strip check/mate + annotation glyphs and normalize 0-0 vs O-O
    return String(san || "")
      .replace(/[+#?!]/g, "")
      .replace(/0-0-0/g, "O-O-O")
      .replace(/0-0/g, "O-O")
      .trim();
  }

  function sameMoveLoosely(mv, expectedSan) {
    // Compare normalized SAN first
    if (!mv) return false;
    const a = normalizeSAN(mv.san);
    const b = normalizeSAN(expectedSan);

    if (a === b) return true;

    // Fallback: compare move identity (from/to/promotion) if SAN differs by disambiguation
    // Build a crude expected signature by trying to play expectedSan from a cloned position.
    return false;
  }

  // ----------------------------------------------------------------------
  // UI helpers
  // ----------------------------------------------------------------------
  function styleStatusRow(row) {
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.flexWrap = "wrap";
    row.style.gap = "10px";
  }

  function updateTurn(turnEl, game, solved) {
    if (solved) {
      turnEl.textContent = "";
      return;
    }
    turnEl.textContent = game.turn() === "w" ? "⚐ White to move" : "⚑ Black to move";
  }

  function showCorrect(el) { el.textContent = "✅ Correct"; }
  function showWrong(el) { el.textContent = "❌ Wrong"; }
  function showSolved(el) { el.textContent = "🏆 Solved"; }

  // ----------------------------------------------------------------------
  // Board sync + animation helpers (anti-ghost)
  // ----------------------------------------------------------------------
  function hardSync(board, game) {
    if (!board || !game || typeof board.position !== "function") return;
    board.position(game.fen(), false);
  }

  function isSpecialMove(mv) {
    const f = String(mv && mv.flags ? mv.flags : "");
    return f.includes("k") || f.includes("q") || f.includes("e") || f.includes("p");
  }

  function animateAutoMove(board, game, mv) {
    if (!board || !game) return;

    try {
      if (!mv || isSpecialMove(mv) || typeof board.move !== "function") {
        board.position(game.fen(), true);
      } else {
        board.move(mv.from + "-" + mv.to);
      }
    } catch {
      try { board.position(game.fen(), true); } catch {}
    }

    setTimeout(() => hardSync(board, game), 260);
  }

  // Try promotions in order (q,r,b,n) if needed.
  function tryUserMove(game, from, to) {
    // Non-promotion move usually succeeds without specifying promotion.
    let mv = game.move({ from, to });
    if (mv) return mv;

    // If it might be a promotion, try common promotion pieces.
    const promos = ["q", "r", "b", "n"];
    for (const p of promos) {
      mv = game.move({ from, to, promotion: p });
      if (mv) return mv;
    }
    return null;
  }

  // ----------------------------------------------------------------------
  // Local puzzle: FEN + Moves
  // ----------------------------------------------------------------------
  function renderLocalPuzzle(container, fen, moves) {
    if (!fen || !Array.isArray(moves) || !moves.length) {
      container.textContent = "❌ Invalid local puzzle data.";
      return;
    }

    const game = new Chess(fen);
    const solverSide = game.turn();

    let board = null;
    let moveIndex = 0;
    let solved = false;
    let locked = false;

    // Layout
    const boardDiv = document.createElement("div");
    boardDiv.className = "jc-board";

    const statusRow = document.createElement("div");
    statusRow.className = "jc-status-row";
    styleStatusRow(statusRow);

    const turnDiv = document.createElement("span");
    turnDiv.className = "jc-turn";

    const feedback = document.createElement("span");
    feedback.className = "jc-feedback";

    const counter = document.createElement("span");
    counter.className = "jc-counter";

    statusRow.append(turnDiv, feedback, counter);
    container.append(boardDiv, statusRow);

    function updateCounter() {
      counter.textContent = solved ? "" : `Move ${Math.min(moveIndex + 1, moves.length)} / ${moves.length}`;
    }

    function finishSolvedIfDone() {
      if (moveIndex >= moves.length) {
        solved = true;
        showSolved(feedback);
        updateTurn(turnDiv, game, solved);
        updateCounter();
      }
    }

    function playExpectedAutoMove() {
      if (solved) return;

      // If already solver turn, unlock
      if (game.turn() === solverSide) {
        locked = false;
        updateTurn(turnDiv, game, solved);
        updateCounter();
        return;
      }

      // no move left => solved
      if (moveIndex >= moves.length) {
        locked = false;
        finishSolvedIfDone();
        return;
      }

      const expectedSan = moves[moveIndex];

      // Apply expected move using sloppy SAN
      const mv = game.move(expectedSan, { sloppy: true });

      if (!mv) {
        // If line ends unexpectedly, treat as solved to avoid trapping the UI
        locked = false;
        solved = true;
        showSolved(feedback);
        updateTurn(turnDiv, game, solved);
        updateCounter();
        hardSync(board, game);
        return;
      }

      moveIndex++;
      updateCounter();

      // animate only auto move
      animateAutoMove(board, game, mv);

      setTimeout(() => {
        hardSync(board, game);
        locked = false;
        updateTurn(turnDiv, game, solved);
        finishSolvedIfDone();
      }, 280);
    }

    function isUserMoveCorrect(from, to, userMv, expectedSan) {
      // 1) simple SAN normalize compare
      if (sameMoveLoosely(userMv, expectedSan)) return true;

      // 2) position-based compare: try applying expectedSan on a clone from the *pre-move* position
      // We need the pre-move position; easiest is: undo user move temporarily.
      const fenAfterUser = game.fen();
      game.undo(); // back to pre-user-move
      const preFen = game.fen();

      const g2 = new Chess(preFen);
      const expectedMv = g2.move(expectedSan, { sloppy: true });

      // restore user move (try by replaying from/to; fallback to fenAfterUser if anything odd happens)
      const restore = tryUserMove(game, from, to);
      if (!restore) {
        // last resort: set to after-user position
        try { game.load(fenAfterUser); } catch {}
      }

      if (!expectedMv) return false;

      // Compare resulting FENs (strict): if user move leads to same position as expected SAN, accept.
      return g2.fen() === game.fen();
    }

    function onDrop(from, to) {
      if (!board || solved) return "snapback";
      if (locked) return "snapback";
      if (game.turn() !== solverSide) return "snapback";

      const expectedSan = moves[moveIndex];
      if (!expectedSan) return "snapback";

      const userMv = tryUserMove(game, from, to);
      if (!userMv) return "snapback";

      const ok = isUserMoveCorrect(from, to, userMv, expectedSan);
      if (!ok) {
        game.undo();
        showWrong(feedback);
        hardSync(board, game);
        updateTurn(turnDiv, game, solved);
        updateCounter();
        return "snapback";
      }

      // correct move
      moveIndex++;
      showCorrect(feedback);
      hardSync(board, game);
      updateTurn(turnDiv, game, solved);
      updateCounter();

      // lock and reply once (unless line ended)
      locked = true;
      setTimeout(playExpectedAutoMove, 60);

      // If user just played the last move in the line, solve immediately (no forced reply)
      finishSolvedIfDone();

      return true;
    }

    // init board safely; show turn only when board is ready (together)
    safeChessboard(
      boardDiv,
      {
        draggable: true,
        position: fen,
        pieceTheme: PIECE_THEME,
        onDrop,
        // Global anti-ghost safety net:
        onSnapEnd: function () {
          hardSync(board, game);
        }
      },
      (b) => {
        board = b;
        hardSync(board, game);
        updateTurn(turnDiv, game, solved);
        updateCounter();
      }
    );
  }

  // ----------------------------------------------------------------------
  // Remote PGN URL placeholder (disabled)
  // ----------------------------------------------------------------------
  function renderRemotePlaceholder(container, url) {
    const boardDiv = document.createElement("div");
    boardDiv.className = "jc-board";

    const statusRow = document.createElement("div");
    statusRow.className = "jc-status-row";
    styleStatusRow(statusRow);

    const turnDiv = document.createElement("span");
    turnDiv.className = "jc-turn";
    turnDiv.textContent = "";

    const feedback = document.createElement("span");
    feedback.className = "jc-feedback";
    feedback.textContent = "Remote PGN packs are disabled (placeholder).";

    statusRow.append(turnDiv, feedback);
    container.append(boardDiv, statusRow);

    safeChessboard(
      boardDiv,
      { draggable: false, position: "start", pieceTheme: PIECE_THEME },
      () => {}
    );

    const small = document.createElement("div");
    small.style.fontSize = "0.9em";
    small.style.opacity = "0.8";
    small.textContent = "PGN URL: " + String(url || "");
    container.appendChild(small);
  }

  // ----------------------------------------------------------------------
  // Entry: scan <puzzle> blocks
  // ----------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    const puzzleNodes = Array.from(document.querySelectorAll("puzzle"));

    puzzleNodes.forEach((node) => {
      const raw = stripFigurines(node.textContent || "").trim();

      const wrap = document.createElement("div");
      wrap.className = "jc-puzzle-wrapper";
      node.replaceWith(wrap);

      // Remote URL PGN => placeholder
      const pgnUrlMatch = raw.match(/PGN:\s*(https?:\/\/[^\s<]+)\s*/i);
      if (pgnUrlMatch) {
        renderRemotePlaceholder(wrap, pgnUrlMatch[1].trim());
        return;
      }

      // Local FEN + Moves
      // FEN can contain spaces; capture until "Moves:" marker.
      const fenMatch = raw.match(/FEN:\s*([\s\S]*?)\s*Moves:\s*/i);
      const movesMatch = raw.match(/Moves:\s*([\s\S]+)$/i);

      if (fenMatch && movesMatch) {
        const fen = fenMatch[1].replace(/\s+/g, " ").trim();
        const moves = tokenizeMoves(movesMatch[1]);
        renderLocalPuzzle(wrap, fen, moves);
        return;
      }

      wrap.textContent = "❌ Invalid <puzzle> block.";
    });
  });
})();
