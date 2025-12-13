// ======================================================================
// JekyllChess Puzzle Engine — FINAL (solver moves + full auto-play)
// ======================================================================

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
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

  // =====================================================================
  // Helpers
  // =====================================================================

  function stripFigurines(s) {
    return s.replace(/[♔♕♖♗♘♙]/g, "");
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

  function solverMoveIndexes(fen, allMoves) {
    // In tactics PGNs, solver always plays first move
    return allMoves.map((_, i) => i).filter(i => i % 2 === 0);
  }

  // =====================================================================
  // UI helpers
  // =====================================================================

  function showCorrect(el) {
    el.innerHTML = `Correct move <span class="jc-icon">✅</span>`;
  }

  function showWrong(el) {
    el.innerHTML = `Wrong move <span class="jc-icon">❌</span>`;
  }

  function showSolved(el) {
    el.innerHTML = `Puzzle solved <span class="jc-icon">🏆</span>`;
  }

  function updateTurn(el, game, solved) {
    el.textContent = solved ? "" :
      (game.turn() === "w" ? "White to move" : "Black to move");
  }

  // =====================================================================
  // Local puzzle (FEN + PGN or Moves)
  // =====================================================================

  function renderLocalPuzzle(container, fen, allMoves) {
    const game = new Chess(fen);
    const solverIndexes = solverMoveIndexes(fen, allMoves);
    const solverMoves = solverIndexes.map(i => allMoves[i]);
    let solverStep = 0;
    let autoStep = 0;
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

    const board = Chessboard(boardDiv, {
      draggable: true,
      position: fen,
      pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
      onDrop: (s, t) => playUserMove(s, t) ? true : "snapback"
    });

    function playUserMove(src, dst) {
      if (solved) return false;

      const mv = game.move({ from: src, to: dst, promotion: "q" });
      if (!mv) return false;

      if (normalizeSAN(mv.san) !== normalizeSAN(solverMoves[solverStep])) {
        game.undo();
        showWrong(feedback);
        updateTurn(turnDiv, game, solved);
        return false;
      }

      solverStep++;
      showCorrect(feedback);

      autoPlayRemaining();
      return true;
    }

    function autoPlayRemaining() {
      function step() {
        if (solverStep + autoStep >= allMoves.length) {
          solved = true;
          showSolved(feedback);
          updateTurn(turnDiv, game, solved);
          return;
        }

        const san = allMoves[solverStep + autoStep];
        const mv = game.move(san, { sloppy: true });
        if (!mv) {
          solved = true;
          showSolved(feedback);
          updateTurn(turnDiv, game, solved);
          return;
        }

        autoStep++;
        board.position(game.fen(), true);
        updateTurn(turnDiv, game, solved);
        setTimeout(step, 250);
      }

      setTimeout(step, 250);
    }

    updateTurn(turnDiv, game, solved);
  }

  // =====================================================================
  // Remote PGN — lazy batch loader (FULL AUTO-PLAY)
  // =====================================================================

  function initRemotePGNPackLazy(container, url) {
    const BATCH_SIZE = 20;

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

    const prev = document.createElement("button");
    prev.textContent = "←";

    const next = document.createElement("button");
    next.textContent = "→";

    controls.append(prev, next);
    statusRow.append(turnDiv, feedback, controls);
    container.append(boardDiv, statusRow);

    feedback.textContent = "Loading puzzle pack…";

    fetch(url)
      .then(r => r.text())
      .then(txt => {
        const games = txt.split(/\[Event\b/).slice(1).map(g => "[Event" + g);
        const puzzles = [];
        let parsedUntil = 0;

        let index = 0;
        let game, allMoves, solverMoves, solverStep, autoStep, solved;

        const board = Chessboard(boardDiv, {
          draggable: true,
          pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
          onDrop: (s, t) => playUserMove(s, t) ? true : "snapback"
        });

        function parseNextBatch() {
          const end = Math.min(parsedUntil + BATCH_SIZE, games.length);
          for (let i = parsedUntil; i < end; i++) {
            const fen = games[i].match(/\[FEN\s+"([^"]+)"/)?.[1];
            if (!fen) continue;
            const all = parsePGNMoves(games[i]);
            if (all.length) puzzles.push({ fen, all });
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
          allMoves = puzzles[i].all;
          solverMoves = solverMoveIndexes(puzzles[i].fen, allMoves).map(i => allMoves[i]);
          solverStep = 0;
          autoStep = 0;
          solved = false;

          board.position(game.fen());
          feedback.textContent = "";
          updateTurn(turnDiv, game, solved);
        }

        function playUserMove(src, dst) {
          if (solved) return false;

          const mv = game.move({ from: src, to: dst, promotion: "q" });
          if (!mv) return false;

          if (normalizeSAN(mv.san) !== normalizeSAN(solverMoves[solverStep])) {
            game.undo();
            showWrong(feedback);
            updateTurn(turnDiv, game, solved);
            return false;
          }

          solverStep++;
          showCorrect(feedback);
          autoPlayRemaining();
          return true;
        }

        function autoPlayRemaining() {
          function step() {
            if (solverStep + autoStep >= allMoves.length) {
              solved = true;
              showSolved(feedback);
              updateTurn(turnDiv, game, solved);
              return;
            }

            const san = allMoves[solverStep + autoStep];
            const mv = game.move(san, { sloppy: true });
            if (!mv) {
              solved = true;
              showSolved(feedback);
              updateTurn(turnDiv, game, solved);
              return;
            }

            autoStep++;
            board.position(game.fen(), true);
            updateTurn(turnDiv, game, solved);
            setTimeout(step, 250);
          }

          setTimeout(step, 250);
        }

        prev.onclick = () => loadPuzzle(index - 1);
        next.onclick = () => loadPuzzle(index + 1);

        parseNextBatch();
        loadPuzzle(0);
      })
      .catch(() => {
        feedback.textContent = "❌ Failed to load PGN.";
      });
  }

})();
