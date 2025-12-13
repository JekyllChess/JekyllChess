// ======================================================================
// JekyllChess Puzzle Engine
// Patch: safeChessboard() to prevent Chessboard error 1003
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

  // ---- Chessboard 1003 fix (consistent across files) ------------------------
  function safeChessboard(targetEl, options, tries = 30) {
    const el = targetEl;
    if (!el) {
      if (tries > 0) requestAnimationFrame(() => safeChessboard(targetEl, options, tries - 1));
      return null;
    }

    const rect = el.getBoundingClientRect();
    if ((rect.width <= 0 || rect.height <= 0) && tries > 0) {
      requestAnimationFrame(() => safeChessboard(targetEl, options, tries - 1));
      return null;
    }

    try {
      return Chessboard(el, options);
    } catch (err) {
      if (tries > 0) {
        requestAnimationFrame(() => safeChessboard(targetEl, options, tries - 1));
        return null;
      }
      console.warn("puzzle-engine.js: Chessboard init failed", err);
      return null;
    }
  }
  // --------------------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", () => {
    const puzzleNodes = Array.from(document.querySelectorAll("puzzle"));
    let remoteUsed = false;

    puzzleNodes.forEach(node => {
      const raw = stripFigurines(node.innerHTML || "").trim();
      const wrap = document.createElement("div");
      wrap.className = "jc-puzzle-wrapper";
      node.replaceWith(wrap);

      const fenMatch = raw.match(/FEN:\s*([^\n<]+)/i);
      const movesMatch = raw.match(/Moves:\s*([^\n<]+)/i);
      const pgnUrlMatch = raw.match(/PGN:\s*(https?:\/\/[^\s<]+)/i);
      const pgnInline = !pgnUrlMatch && raw.match(/PGN:\s*(1\.[\s\S]+)/i);

      if (pgnUrlMatch && !fenMatch) {
        if (remoteUsed) {
          wrap.textContent = "⚠️ Only one remote PGN pack allowed per page.";
          return;
        }
        remoteUsed = true;
        initRemotePGNPackLazy(wrap, pgnUrlMatch[1].trim());
        return;
      }

      if (fenMatch && pgnInline) {
        const allMoves = parsePGNMoves(pgnInline[1]);
        renderLocalPuzzle(wrap, fenMatch[1].trim(), allMoves);
        return;
      }

      if (fenMatch && movesMatch) {
        renderLocalPuzzle(wrap, fenMatch[1].trim(), movesMatch[1].trim().split(/\s+/));
        return;
      }

      wrap.textContent = "❌ Invalid <puzzle> block.";
    });
  });

  function stripFigurines(s) {
    return s.replace(/[♔♕♖♗♘♙♚♛♜♝♞♟]/g, "");
  }

  function parsePGNMoves(pgn) {
    return pgn
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\{[^}]*\}/g, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b\d+\.\.\./g, " ")
      .replace(/\b\d+\.(?:\.\.)?/g, " ")
      .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
  }

  function normalizeSAN(san) {
    return (san || "").replace(/[+#?!]/g, "");
  }

  function showCorrect(el) { el.innerHTML = `Correct move <span class="jc-icon">✅</span>`; }
  function showWrong(el) { el.innerHTML = `Wrong move <span class="jc-icon">❌</span>`; }
  function showSolved(el) { el.innerHTML = `Puzzle solved <span class="jc-icon">🏆</span>`; }

  function updateTurn(el, game, solved) {
    el.textContent = solved ? "" : (game.turn() === "w" ? "⚐ White to move" : "⚑ Black to move");
  }

  function renderLocalPuzzle(container, fen, allMoves) {
    const game = new Chess(fen);
    const solverSide = game.turn(); // side to move at start is the "solver"
    let moveIndex = 0;
    let solved = false;

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
    board = safeChessboard(boardDiv, {
      draggable: true,
      position: fen,
      pieceTheme: PIECE_THEME,
      onDrop: (s, t) => (playUserMove(s, t) ? true : "snapback")
    });

    function sync() {
      if (!board || typeof board.position !== "function") return;
      board.position(game.fen(), false);
    }

    function playUserMove(src, dst) {
      if (solved) return false;
      if (game.turn() !== solverSide) return false;

      const expected = allMoves[moveIndex];
      const mv = game.move({ from: src, to: dst, promotion: "q" });
      if (!mv) return false;

      if (normalizeSAN(mv.san) !== normalizeSAN(expected)) {
        game.undo();
        sync();
        showWrong(feedback);
        updateTurn(turnDiv, game, solved);
        return false;
      }

      moveIndex++;
      sync();
      showCorrect(feedback);
      autoOpponent();
      return true;
    }

    function autoOpponent() {
      if (moveIndex >= allMoves.length) {
        solved = true;
        showSolved(feedback);
        updateTurn(turnDiv, game, solved);
        return;
      }

      if (game.turn() === solverSide) {
        updateTurn(turnDiv, game, solved);
        return;
      }

      const san = allMoves[moveIndex];
      setTimeout(() => {
        const mv = game.move(san, { sloppy: true });
        if (!mv) {
          solved = true;
          showSolved(feedback);
          updateTurn(turnDiv, game, solved);
          return;
        }
        moveIndex++;
        sync();
        updateTurn(turnDiv, game, solved);
      }, 0);
    }

    // initial render (may be delayed if board hidden)
    const initSync = () => {
      if (board && typeof board.position === "function") {
        sync();
        updateTurn(turnDiv, game, solved);
      } else {
        requestAnimationFrame(initSync);
      }
    };
    initSync();
  }

  function initRemotePGNPackLazy(container, url) {
    const boardDiv = document.createElement("div");
    boardDiv.className = "jc-board";

    const statusRow = document.createElement("div");
    statusRow.className = "jc-status-row";

    const turnDiv = document.createElement("span");
    turnDiv.className = "jc-turn";

    const feedback = document.createElement("span");
    feedback.className = "jc-feedback";

    const controls = document.createElement("span");
    controls.className = "jc-controls";

    const counter = document.createElement("span");
    counter.className = "jc-counter";

    const prev = document.createElement("button");
    prev.textContent = "↶";

    const next = document.createElement("button");
    next.textContent = "↷";

    controls.append(prev, next);
    statusRow.append(turnDiv, feedback, counter, controls);
    container.append(boardDiv, statusRow);

    feedback.textContent = "Loading puzzle pack…";

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then(txt => {
        const chunks = txt.split(/\n\s*\n(?=\[|1\.)/);
        const puzzles = [];

        chunks.forEach(g => {
          const fen = g.match(/\[FEN\s+"([^"]+)"/)?.[1];
          if (!fen) return;
          const all = parsePGNMoves(g);
          if (all.length) puzzles.push({ fen, all });
        });

        if (!puzzles.length) {
          feedback.textContent = "❌ No puzzles found in PGN.";
          return;
        }

        let puzzleIndex = 0;
        let moveIndex = 0;
        let game = null;
        let allMoves = null;
        let solverSide = null;
        let solved = false;

        let board = null;
        board = safeChessboard(boardDiv, {
          draggable: true,
          pieceTheme: PIECE_THEME,
          onDrop: (s, t) => (playUserMove(s, t) ? true : "snapback")
        });

        function sync() {
          if (!board || typeof board.position !== "function") return;
          board.position(game.fen(), false);
        }

        function updateUI() {
          counter.textContent = `Puzzle ${puzzleIndex + 1} / ${puzzles.length}`;
          updateTurn(turnDiv, game, solved);
        }

        function loadPuzzle(i) {
          if (!puzzles[i]) return;
          puzzleIndex = i;
          game = new Chess(puzzles[i].fen);
          allMoves = puzzles[i].all;
          solverSide = game.turn();
          moveIndex = 0;
          solved = false;

          feedback.textContent = "";
          sync();
          updateUI();
        }

        function playUserMove(src, dst) {
          if (solved) return false;
          if (game.turn() !== solverSide) return false;

          const expected = allMoves[moveIndex];
          const mv = game.move({ from: src, to: dst, promotion: "q" });
          if (!mv) return false;

          if (normalizeSAN(mv.san) !== normalizeSAN(expected)) {
            game.undo();
            sync();
            showWrong(feedback);
            updateUI();
            return false;
          }

          moveIndex++;
          sync();
          showCorrect(feedback);
          autoOpponent();
          return true;
        }

        function autoOpponent() {
          if (moveIndex >= allMoves.length) {
            solved = true;
            showSolved(feedback);
            updateUI();
            return;
          }

          if (game.turn() === solverSide) {
            updateUI();
            return;
          }

          const san = allMoves[moveIndex];
          setTimeout(() => {
            const mv = game.move(san, { sloppy: true });
            if (!mv) {
              solved = true;
              showSolved(feedback);
              updateUI();
              return;
            }
            moveIndex++;
            sync();
            updateUI();
          }, 0);
        }

        prev.onclick = () => loadPuzzle(puzzleIndex - 1);
        next.onclick = () => loadPuzzle(puzzleIndex + 1);

        // wait until board is actually ready, then load puzzle 0
        const start = () => {
          if (board && typeof board.position === "function") loadPuzzle(0);
          else requestAnimationFrame(start);
        };
        start();
      })
      .catch(err => {
        console.error("PGN load failed:", err);
        feedback.textContent = "❌ Failed to load PGN (" + err.message + ")";
      });
  }
})();
