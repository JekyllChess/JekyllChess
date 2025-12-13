// ======================================================================
// JekyllChess Puzzle Engine — patched
// - Local puzzles: user plays solver side, auto-plays opponent replies only
// - Remote PGN pack: loads reliably + shows counter
// - Fixes Chessboard error 1003 via safeChessboard()
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
  // Chessboard 1003 fix: init only when element exists + has layout
  // ----------------------------------------------------------------------
  function safeChessboard(el, options, onReady, tries = 60) {
    if (!el) {
      if (tries > 0) requestAnimationFrame(() => safeChessboard(el, options, onReady, tries - 1));
      return;
    }

    // must be attached + measurable
    const rect = el.getBoundingClientRect();
    if ((rect.width <= 0 || rect.height <= 0) && tries > 0) {
      requestAnimationFrame(() => safeChessboard(el, options, onReady, tries - 1));
      return;
    }

    try {
      const board = Chessboard(el, options);
      if (typeof onReady === "function") onReady(board);
    } catch (err) {
      if (tries > 0) {
        requestAnimationFrame(() => safeChessboard(el, options, onReady, tries - 1));
        return;
      }
      console.warn("puzzle-engine.js: Chessboard init failed", err);
    }
  }

  // ----------------------------------------------------------------------
  // Parsing helpers
  // ----------------------------------------------------------------------
  function stripFigurines(s) {
    return String(s || "").replace(/[♔♕♖♗♘♙♚♛♜♝♞♟]/g, "");
  }

  // Extract "FEN: ...." and "Moves: ...." from a puzzle block, even if the
  // browser flattened newlines into spaces.
  function extractPuzzleSpec(rawText) {
    const raw = stripFigurines(rawText)
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const fenMatch = raw.match(/FEN:\s*([\s\S]*?)(?=\s+(Moves:|PGN:|$))/i);
    const movesMatch = raw.match(/Moves:\s*([\s\S]*?)(?=\s+(FEN:|PGN:|$)|$)/i);
    const pgnUrlMatch = raw.match(/PGN:\s*(https?:\/\/[^\s<]+)/i);

    const fen = fenMatch ? fenMatch[1].trim() : "";
    const movesStr = movesMatch ? movesMatch[1].trim() : "";

    return { fen, movesStr, pgnUrl: pgnUrlMatch ? pgnUrlMatch[1].trim() : "" };
  }

  function splitMoves(movesStr) {
    return String(movesStr || "")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
  }

  function normalizeSAN(san) {
    return String(san || "").replace(/[+#?!]/g, "");
  }

  // Parse a PGN game into SAN move list (simple + robust for tactics packs)
  function parsePGNMoves(pgnText) {
    const txt = String(pgnText || "");
    return txt
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\{[^}]*\}/g, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b\d+\.\.\./g, " ")
      .replace(/\b\d+\.(?:\.\.)?/g, " ")
      .replace(/\b(1-0|0-1|1\/2-1\/2|½-½|\*)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
  }

  // ----------------------------------------------------------------------
  // UI helpers
  // ----------------------------------------------------------------------
  function showCorrect(el) {
    el.innerHTML = `Correct move <span class="jc-icon">✅</span>`;
  }
  function showWrong(el) {
    el.innerHTML = `Wrong move <span class="jc-icon">❌</span>`;
  }
  function showSolved(el) {
    el.innerHTML = `Puzzle solved <span class="jc-icon">🏆</span>`;
  }
  function clearFeedback(el) {
    el.textContent = "";
  }
  function updateTurn(el, game, solved) {
    if (!el) return;
    if (solved) {
      el.textContent = "";
      return;
    }
    el.textContent = game.turn() === "w" ? "⚐ White to move" : "⚑ Black to move";
  }

  function clampIndex(i, max) {
    if (max <= 0) return 0;
    if (i < 0) return 0;
    if (i >= max) return max - 1;
    return i;
  }

  // ----------------------------------------------------------------------
  // Local puzzle: FEN + Moves
  // Behavior:
  // - user is solver side (side to move at start)
  // - user must play expected solver moves (0,2,4,...)
  // - after correct solver move, engine auto-plays one opponent reply (1,3,5,...)
  // ----------------------------------------------------------------------
  function renderLocalPuzzle(container, fen, allMoves) {
    let game;
    try {
      game = new Chess(fen);
    } catch (e) {
      container.textContent = "❌ Invalid FEN.";
      return;
    }

    const solverSide = game.turn(); // solver = side to move at start
    let moveIndex = 0; // index into allMoves[]
    let solved = false;
    let busy = false; // prevents double-drops during autoplay

    // UI
    const boardDiv = document.createElement("div");
    boardDiv.className = "jc-board";

    const statusRow = document.createElement("div");
    statusRow.className = "jc-status-row";

    const turnDiv = document.createElement("span");
    turnDiv.className = "jc-turn";

    const feedback = document.createElement("span");
    feedback.className = "jc-feedback";

    statusRow.append(turnDiv, feedback);
    container.append(boardDiv, statusRow);

    let board = null;

    function hardSync() {
      if (!board || typeof board.position !== "function") return;
      // Hard sync avoids “ghost capture” artifacts
      board.position(game.fen(), false);
    }

    function finishIfDone() {
      if (moveIndex >= allMoves.length) {
        solved = true;
        showSolved(feedback);
        updateTurn(turnDiv, game, solved);
        return true;
      }
      return false;
    }

    function autoOpponentReply() {
      if (solved || busy) return;
      if (finishIfDone()) return;

      // If it's solver's turn, we wait for user
      if (game.turn() === solverSide) {
        updateTurn(turnDiv, game, solved);
        return;
      }

      const san = allMoves[moveIndex];
      if (typeof san !== "string" || !san) {
        solved = true;
        showSolved(feedback);
        updateTurn(turnDiv, game, solved);
        return;
      }

      busy = true;
      setTimeout(() => {
        let mv = null;
        try {
          mv = game.move(san, { sloppy: true });
        } catch {}
        if (!mv) {
          // If PGN is weird, just end cleanly instead of breaking UI
          solved = true;
          showSolved(feedback);
          busy = false;
          updateTurn(turnDiv, game, solved);
          return;
        }

        moveIndex++;
        hardSync();
        busy = false;

        if (!finishIfDone()) {
          clearFeedback(feedback); // optional: clear after reply
          updateTurn(turnDiv, game, solved);
        }
      }, 250);
    }

    function playUserMove(src, dst) {
      if (!board) return false;
      if (solved || busy) return false;

      // user can only play on solver turn
      if (game.turn() !== solverSide) return false;

      if (finishIfDone()) return false;

      const expected = allMoves[moveIndex];
      if (typeof expected !== "string" || !expected) return false;

      let mv = null;
      try {
        mv = game.move({ from: src, to: dst, promotion: "q" });
      } catch {
        mv = null;
      }
      if (!mv) return false;

      // compare SAN
      if (normalizeSAN(mv.san) !== normalizeSAN(expected)) {
        try { game.undo(); } catch {}
        hardSync();
        showWrong(feedback);
        updateTurn(turnDiv, game, solved);
        return false;
      }

      // correct
      moveIndex++;
      hardSync();
      showCorrect(feedback);

      if (!finishIfDone()) {
        updateTurn(turnDiv, game, solved);
        autoOpponentReply();
      }

      return true;
    }

    // Init chessboard safely
    safeChessboard(
      boardDiv,
      {
        draggable: true,
        position: fen,
        pieceTheme: PIECE_THEME,
        onDrop: (s, t) => (playUserMove(s, t) ? true : "snapback")
      },
      (b) => {
        board = b;
        hardSync();
        clearFeedback(feedback);
        updateTurn(turnDiv, game, solved);
      }
    );
  }

  // ----------------------------------------------------------------------
  // Remote PGN pack (one per page)
  // Supports:
  // - PGN with [FEN "..."] tags per game
  // - Counter "Puzzle i / N"
  // - Prev/Next navigation
  // - Same move logic: user solver, auto opponent replies
  // ----------------------------------------------------------------------
  function initRemotePGNPackLazy(container, url) {
    const boardDiv = document.createElement("div");
    boardDiv.className = "jc-board";

    const statusRow = document.createElement("div");
    statusRow.className = "jc-status-row";

    const turnDiv = document.createElement("span");
    turnDiv.className = "jc-turn";

    const feedback = document.createElement("span");
    feedback.className = "jc-feedback";

    const counter = document.createElement("span");
    counter.className = "jc-counter";

    const controls = document.createElement("span");
    controls.className = "jc-controls";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "↶";

    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "↷";

    controls.append(prev, next);
    statusRow.append(turnDiv, feedback, counter, controls);
    container.append(boardDiv, statusRow);

    feedback.textContent = "Loading puzzle pack…";

    let board = null;
    let puzzles = [];

    let puzzleIndex = 0;
    let moveIndex = 0;
    let game = null;
    let allMoves = [];
    let solverSide = "w";
    let solved = false;
    let busy = false;

    function hardSync() {
      if (!board || typeof board.position !== "function" || !game) return;
      board.position(game.fen(), false);
    }

    function updateUI() {
      counter.textContent = puzzles.length
        ? `Puzzle ${puzzleIndex + 1} / ${puzzles.length}`
        : "";
      updateTurn(turnDiv, game || { turn: () => "w" }, solved);
    }

    function finishIfDone() {
      if (moveIndex >= allMoves.length) {
        solved = true;
        showSolved(feedback);
        updateUI();
        return true;
      }
      return false;
    }

    function autoOpponentReply() {
      if (solved || busy || !game) return;
      if (finishIfDone()) return;

      if (game.turn() === solverSide) {
        updateUI();
        return;
      }

      const san = allMoves[moveIndex];
      if (typeof san !== "string" || !san) {
        solved = true;
        showSolved(feedback);
        updateUI();
        return;
      }

      busy = true;
      setTimeout(() => {
        let mv = null;
        try {
          mv = game.move(san, { sloppy: true });
        } catch {}
        if (!mv) {
          solved = true;
          showSolved(feedback);
          busy = false;
          updateUI();
          return;
        }

        moveIndex++;
        hardSync();
        busy = false;

        if (!finishIfDone()) {
          clearFeedback(feedback);
          updateUI();
        }
      }, 250);
    }

    function playUserMove(src, dst) {
      if (!board || !game) return false;
      if (solved || busy) return false;
      if (game.turn() !== solverSide) return false;
      if (finishIfDone()) return false;

      const expected = allMoves[moveIndex];
      if (typeof expected !== "string" || !expected) return false;

      let mv = null;
      try {
        mv = game.move({ from: src, to: dst, promotion: "q" });
      } catch {
        mv = null;
      }
      if (!mv) return false;

      if (normalizeSAN(mv.san) !== normalizeSAN(expected)) {
        try { game.undo(); } catch {}
        hardSync();
        showWrong(feedback);
        updateUI();
        return false;
      }

      moveIndex++;
      hardSync();
      showCorrect(feedback);

      if (!finishIfDone()) {
        updateUI();
        autoOpponentReply();
      }

      return true;
    }

    function loadPuzzle(i) {
      if (!puzzles.length) return;
      puzzleIndex = clampIndex(i, puzzles.length);

      const p = puzzles[puzzleIndex];
      try {
        game = new Chess(p.fen);
      } catch {
        feedback.textContent = "❌ Invalid FEN in PGN pack.";
        return;
      }

      allMoves = p.moves.slice();
      solverSide = game.turn();
      moveIndex = 0;
      solved = false;
      busy = false;

      clearFeedback(feedback);
      hardSync();
      updateUI();
    }

    // Init board safely first, then fetch + load puzzle 0
    safeChessboard(
      boardDiv,
      {
        draggable: true,
        position: "start",
        pieceTheme: PIECE_THEME,
        onDrop: (s, t) => (playUserMove(s, t) ? true : "snapback")
      },
      (b) => {
        board = b;

        // Now fetch PGN
        fetch(url)
          .then((r) => {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.text();
          })
          .then((txt) => {
            // Split games. Most packs have repeated [Event ...]
            const games = txt.includes("[Event")
              ? txt.split(/\[Event\b/).slice(1).map((g) => "[Event" + g)
              : [txt];

            puzzles = [];
            for (const g of games) {
              const fen = g.match(/\[FEN\s+"([^"]+)"/i)?.[1];
              if (!fen) continue;
              const moves = parsePGNMoves(g);
              if (moves.length) puzzles.push({ fen, moves });
            }

            if (!puzzles.length) {
              feedback.textContent = "❌ No puzzles found in PGN pack.";
              return;
            }

            prev.onclick = () => loadPuzzle(puzzleIndex - 1);
            next.onclick = () => loadPuzzle(puzzleIndex + 1);

            // Load FIRST puzzle (index 0)
            loadPuzzle(0);
          })
          .catch((err) => {
            console.error("Remote PGN load failed:", err);
            feedback.textContent = "❌ Failed to load PGN (" + err.message + ")";
          });
      }
    );
  }

  // ----------------------------------------------------------------------
  // Main init: convert <puzzle> blocks to UI
  // ----------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    const puzzleNodes = Array.from(document.querySelectorAll("puzzle"));
    let remoteUsed = false;

    puzzleNodes.forEach((node) => {
      // IMPORTANT: use textContent so we still get the labels even when HTML is flattened
      const rawText = node.textContent || node.innerText || "";
      const spec = extractPuzzleSpec(rawText);

      const wrap = document.createElement("div");
      wrap.className = "jc-puzzle-wrapper";
      node.replaceWith(wrap);

      // Remote pack mode: "PGN: <url>" without local FEN
      if (spec.pgnUrl && !spec.fen) {
        if (remoteUsed) {
          wrap.textContent = "⚠️ Only one remote PGN pack allowed per page.";
          return;
        }
        remoteUsed = true;
        initRemotePGNPackLazy(wrap, spec.pgnUrl);
        return;
      }

      // Local mode requires FEN + Moves
      if (spec.fen && spec.movesStr) {
        const moves = splitMoves(spec.movesStr);
        if (!moves.length) {
          wrap.textContent = "❌ No moves found in puzzle.";
          return;
        }
        renderLocalPuzzle(wrap, spec.fen, moves);
        return;
      }

      wrap.textContent =
        "❌ Invalid <puzzle> block. Expected:\n" +
        "FEN: ...\nMoves: ...\n(or PGN: https://...)";
    });
  });
})();
