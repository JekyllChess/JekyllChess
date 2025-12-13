// ======================================================================
// puzzle-engine.js — single final build
// - Local puzzles: FEN + Moves (works as before; DO NOT break)
// - Remote PGN packs: PGN: https://... (FIXED for your pack format)
//   * Splits by [Event ...]
//   * Extracts FEN from [FEN "..."] anywhere in the header blob
//   * Extracts solution moves from the PGN movetext
// - Turn text appears only when board is ready (together)
// - Auto-plays ONLY opponent replies (exactly one reply after correct move)
// - Animates ONLY auto-played moves
// - Prevents ghost pieces via hard-sync after animations
// - Prevents Chessboard error 1003 via layout-safe init
// - Keeps status row inline (no overlap)
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

  const PIECE_THEME =
    "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png";

  // ----------------------------------------------------------------------
  // Chessboard 1003 fix: init only when element has layout
  // ----------------------------------------------------------------------
  function safeChessboard(targetEl, options, tries = 80) {
    if (!targetEl) return null;

    const rect = targetEl.getBoundingClientRect();
    if ((rect.width <= 0 || rect.height <= 0) && tries > 0) {
      requestAnimationFrame(() => safeChessboard(targetEl, options, tries - 1));
      return null;
    }

    try {
      return Chessboard(targetEl, options);
    } catch (err) {
      if (tries > 0) {
        requestAnimationFrame(() =>
          safeChessboard(targetEl, options, tries - 1)
        );
        return null;
      }
      console.warn("puzzle-engine.js: Chessboard init failed", err);
      return null;
    }
  }

  function whenBoardReady(getBoard, cb, tries = 120) {
    const b = getBoard();
    if (b && typeof b.position === "function") {
      cb(b);
      return;
    }
    if (tries <= 0) return;
    requestAnimationFrame(() => whenBoardReady(getBoard, cb, tries - 1));
  }

  // ----------------------------------------------------------------------
  // Parsing helpers
  // ----------------------------------------------------------------------
  function stripFigurines(s) {
    // remove unicode chess pieces, keep text
    return String(s || "").replace(/[♔♕♖♗♘♙♚♛♜♝♞♟]/g, "");
  }

  function normalizeSAN(san) {
    // compare move intent; ignore punctuation
    return String(san || "").replace(/[+#?!]/g, "");
  }

  function parseMovesLine(movesText) {
    return String(movesText || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function parsePGNMoves(pgn) {
    // tolerant: strip headers/comments/vars/move numbers/results; keep SAN tokens
    return String(pgn || "")
      .replace(/\[[^\]]*\]/g, " ") // headers (even if multiple tags on one line)
      .replace(/\{[^}]*\}/g, " ") // comments
      .replace(/\([^)]*\)/g, " ") // variations
      .replace(/\b\d+\.\.\./g, " ") // 1...
      .replace(/\b\d+\.(?:\.\.)?/g, " ") // 1. / 1..
      .replace(/\b(1-0|0-1|1\/2-1\/2|½-½|\*)\b/g, " ") // results
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
  }

  // Robust PGN game splitter: splits by each [Event ...] occurrence
  function splitPGNGames(txt) {
    const s = String(txt || "");
    const re = /\[Event\b/gi;
    const idx = [];
    let m;
    while ((m = re.exec(s))) idx.push(m.index);
    if (idx.length === 0) return [];

    const games = [];
    for (let i = 0; i < idx.length; i++) {
      const start = idx[i];
      const end = i + 1 < idx.length ? idx[i + 1] : s.length;
      const chunk = s.slice(start, end).trim();
      if (chunk) games.push(chunk);
    }
    return games;
  }

  // Extract FEN header from a single PGN game
  function extractFEN(gameText) {
    const m = String(gameText || "").match(/\[FEN\s+"([^"]+)"\]/i);
    return m ? m[1].trim() : "";
  }

  // ----------------------------------------------------------------------
  // UI helpers
  // ----------------------------------------------------------------------
  function showCorrect(el) {
    el.innerHTML = `✅ <span class="jc-icon">Correct</span>`;
  }
  function showWrong(el) {
    el.innerHTML = `❌ <span class="jc-icon">Wrong</span>`;
  }
  function showSolved(el) {
    el.innerHTML = `🏆 <span class="jc-icon">Solved</span>`;
  }

  function updateTurn(turnEl, game, solved) {
    if (solved) {
      turnEl.textContent = "";
      return;
    }
    turnEl.textContent =
      game.turn() === "w" ? "⚐ White to move" : "⚑ Black to move";
  }

  function styleStatusRow(row) {
    // Make overlap impossible even under hostile theme CSS
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.flexWrap = "wrap";
    row.style.gap = "10px";
  }

  // ----------------------------------------------------------------------
  // Board sync + animation helpers (prevents ghost captures)
  // ----------------------------------------------------------------------
  function hardSync(board, game) {
    if (!board || !game || typeof board.position !== "function") return;
    board.position(game.fen(), false);
  }

  function isSpecialMove(mv) {
    // chess.js flags: k/q castling, e en passant, p promotion
    const f = String(mv && mv.flags ? mv.flags : "");
    return f.includes("k") || f.includes("q") || f.includes("e") || f.includes("p");
  }

  function animateAutoMove(board, game, mv) {
    if (!board || !game) return;

    // For castling/promo/e.p., prefer position animation
    try {
      if (!mv || isSpecialMove(mv) || typeof board.move !== "function") {
        board.position(game.fen(), true);
      } else {
        board.move(mv.from + "-" + mv.to);
      }
    } catch {
      try {
        board.position(game.fen(), true);
      } catch {}
    }

    // Hard-sync after animation window to eliminate ghost pieces/captures
    setTimeout(() => hardSync(board, game), 260);
  }

  // ----------------------------------------------------------------------
  // Local puzzle: FEN + Moves
  // Solver plays side-to-move at start; engine replies with exactly one opponent move.
  // ----------------------------------------------------------------------
  function renderLocalPuzzle(container, fen, allMoves) {
    if (!fen || !Array.isArray(allMoves) || !allMoves.length) {
      container.textContent = "❌ Invalid local puzzle data.";
      return;
    }

    const game = new Chess(fen);
    const solverSide = game.turn();

    let moveIndex = 0;
    let solved = false;
    let awaitingUser = true;

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

    statusRow.append(turnDiv, feedback);
    container.append(boardDiv, statusRow);

    // Init board safely (may be delayed)
    let board = null;
    board = safeChessboard(boardDiv, {
      draggable: true,
      position: fen,
      pieceTheme: PIECE_THEME,
      onDrop: (from, to) => (playUserMove(from, to) ? true : "snapback")
    });

    // Show turn together with board: wait until board is ready then sync+turn
    whenBoardReady(
      () => board,
      () => {
        hardSync(board, game);
        updateTurn(turnDiv, game, solved);
      }
    );

    function playUserMove(from, to) {
      if (solved) return false;
      if (!awaitingUser) return false;
      if (game.turn() !== solverSide) return false;

      const expected = allMoves[moveIndex];
      if (!expected) return false;

      const mv = game.move({ from, to, promotion: "q" });
      if (!mv) return false;

      const ok = normalizeSAN(mv.san) === normalizeSAN(expected);
      if (!ok) {
        game.undo();
        hardSync(board, game);
        showWrong(feedback);
        updateTurn(turnDiv, game, solved);
        return false;
      }

      moveIndex++;
      hardSync(board, game);
      showCorrect(feedback);

      // Exactly one opponent reply after a correct move
      awaitingUser = false;
      updateTurn(turnDiv, game, solved);

      // Let chessboard finish rendering the drag-drop before reply animation
      setTimeout(autoPlayOpponentReply, 0);

      return true;
    }

    function autoPlayOpponentReply() {
      if (solved) return;

      // If already back to solver turn, unlock
      if (game.turn() === solverSide) {
        awaitingUser = true;
        updateTurn(turnDiv, game, solved);
        return;
      }

      if (moveIndex >= allMoves.length) {
        solved = true;
        showSolved(feedback);
        updateTurn(turnDiv, game, solved);
        return;
      }

      const san = allMoves[moveIndex];
      const mv = game.move(san, { sloppy: true });

      if (!mv) {
        solved = true;
        showSolved(feedback);
        updateTurn(turnDiv, game, solved);
        return;
      }

      moveIndex++;

      // Animate ONLY the auto move
      animateAutoMove(board, game, mv);

      // Unlock solver again
      awaitingUser = true;
      updateTurn(turnDiv, game, solved);

      if (moveIndex >= allMoves.length) {
        solved = true;
        showSolved(feedback);
        updateTurn(turnDiv, game, solved);
      }
    }
  }

  // ----------------------------------------------------------------------
  // Remote PGN pack: <puzzle> PGN: https://...
  // FIXED for your exact pack format:
  // - many games
  // - each game has [FEN "..."] in headers (sometimes multiple tags per line)
  // - movetext after headers contains solution (e.g. "1.Rxf4 Rd1+ ... *")
  // Works like Local: solver plays side-to-move, engine replies exactly one move.
  // ----------------------------------------------------------------------
  function initRemotePGNPack(container, url) {
    // Layout (same look/behavior as local)
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

    const controls = document.createElement("span");
    controls.className = "jc-controls";
    controls.style.display = "inline-flex";
    controls.style.gap = "8px";
    controls.style.alignItems = "center";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "↶";

    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "↷";

    controls.append(prev, next);
    statusRow.append(turnDiv, feedback, counter, controls);
    container.append(boardDiv, statusRow);

    // Board shown immediately while loading (start position)
    feedback.textContent = "Loading puzzle pack…";
    counter.textContent = "";
    turnDiv.textContent = "";

    let board = null;
    board = safeChessboard(boardDiv, {
      draggable: true,
      position: "start",
      pieceTheme: PIECE_THEME,
      onDrop: (from, to) => (playUserMove(from, to) ? true : "snapback")
    });

    // Remote state
    let puzzles = [];
    let puzzleIndex = 0;

    let game = null;
    let allMoves = null;
    let solverSide = null;
    let moveIndex = 0;
    let solved = false;
    let awaitingUser = true;

    function updateUI() {
      if (!game) {
        // still loading
        return;
      }
      counter.textContent = `Puzzle ${puzzleIndex + 1} / ${puzzles.length}`;
      updateTurn(turnDiv, game, solved);
    }

    function loadPuzzle(i) {
      if (i < 0 || i >= puzzles.length) return;

      puzzleIndex = i;
      game = new Chess(puzzles[i].fen);
      allMoves = puzzles[i].moves;
      solverSide = game.turn();
      moveIndex = 0;
      solved = false;
      awaitingUser = true;

      feedback.textContent = "";
      hardSync(board, game);

      // Turn text should appear together with the loaded puzzle position
      whenBoardReady(
        () => board,
        () => {
          hardSync(board, game);
          updateUI();
        }
      );
    }

    function playUserMove(from, to) {
      if (!game || !allMoves) return false;
      if (solved) return false;
      if (!awaitingUser) return false;
      if (game.turn() !== solverSide) return false;

      const expected = allMoves[moveIndex];
      if (!expected) return false;

      const mv = game.move({ from, to, promotion: "q" });
      if (!mv) return false;

      const ok = normalizeSAN(mv.san) === normalizeSAN(expected);
      if (!ok) {
        game.undo();
        hardSync(board, game);
        showWrong(feedback);
        updateUI();
        return false;
      }

      moveIndex++;
      hardSync(board, game);
      showCorrect(feedback);

      awaitingUser = false;
      updateUI();

      setTimeout(autoPlayOpponentReply, 0);
      return true;
    }

    function autoPlayOpponentReply() {
      if (!game || solved) return;

      if (game.turn() === solverSide) {
        awaitingUser = true;
        updateUI();
        return;
      }

      if (moveIndex >= allMoves.length) {
        solved = true;
        showSolved(feedback);
        updateUI();
        return;
      }

      const san = allMoves[moveIndex];
      const mv = game.move(san, { sloppy: true });

      if (!mv) {
        solved = true;
        showSolved(feedback);
        updateUI();
        return;
      }

      moveIndex++;
      animateAutoMove(board, game, mv);

      awaitingUser = true;
      updateUI();

      if (moveIndex >= allMoves.length) {
        solved = true;
        showSolved(feedback);
        updateUI();
      }
    }

    prev.addEventListener("click", () => loadPuzzle(puzzleIndex - 1));
    next.addEventListener("click", () => loadPuzzle(puzzleIndex + 1));

    // Fetch + parse (FIXED)
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then((txt) => {
        const games = splitPGNGames(txt);

        puzzles = [];
        for (const g of games) {
          const fen = extractFEN(g);
          if (!fen) continue;

          const moves = parsePGNMoves(g);
          if (!moves.length) continue;

          puzzles.push({ fen, moves });
        }

        if (!puzzles.length) {
          feedback.textContent = "❌ No puzzles found in PGN (no [FEN] headers?).";
          return;
        }

        // Load FIRST puzzle (index 0) once board exists
        whenBoardReady(
          () => board,
          () => loadPuzzle(0)
        );
      })
      .catch((err) => {
        console.error("Remote PGN load failed:", err);
        feedback.textContent = "❌ Failed to load PGN (" + err.message + ")";
      });
  }

  // ----------------------------------------------------------------------
  // Entry: scan <puzzle> blocks
  // ----------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    const puzzleNodes = Array.from(document.querySelectorAll("puzzle"));
    let remoteUsed = false;

    puzzleNodes.forEach((node) => {
      // IMPORTANT: use textContent; HTML collapsing won't break parsing
      const raw = stripFigurines(node.textContent || "").trim();

      const wrap = document.createElement("div");
      wrap.className = "jc-puzzle-wrapper";
      node.replaceWith(wrap);

      // Remote pack
      const pgnUrlMatch = raw.match(/PGN:\s*(https?:\/\/[^\s<]+)/i);
      if (pgnUrlMatch) {
        if (remoteUsed) {
          wrap.textContent = "⚠️ Only one remote PGN pack allowed per page.";
          return;
        }
        remoteUsed = true;
        initRemotePGNPack(wrap, pgnUrlMatch[1].trim());
        return;
      }

      // Local puzzle
      const fenMatch = raw.match(/FEN:\s*([^\n<]+)/i);
      const movesMatch = raw.match(/Moves:\s*([^\n<]+)/i);
      const pgnInlineMatch = raw.match(/PGN:\s*(1\.[\s\S]+)/i);

      if (fenMatch && pgnInlineMatch) {
        const fen = fenMatch[1].trim();
        const allMoves = parsePGNMoves(pgnInlineMatch[1]);
        renderLocalPuzzle(wrap, fen, allMoves);
        return;
      }

      if (fenMatch && movesMatch) {
        const fen = fenMatch[1].trim();
        const allMoves = parseMovesLine(movesMatch[1]);
        renderLocalPuzzle(wrap, fen, allMoves);
        return;
      }

      wrap.textContent = "❌ Invalid <puzzle> block.";
    });
  });
})();