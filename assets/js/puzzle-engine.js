// ======================================================================
// JekyllChess Puzzle Engine — FINAL, STYLE-FREE, GLOBAL-SAFE
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
        renderLocalPuzzle(wrap, fenMatch[1].trim(), parsePGNMoves(pgnInline[1]));
        return;
      }

      if (fenMatch && movesMatch) {
        renderLocalPuzzle(wrap, fenMatch[1].trim(), movesMatch[1].trim().split(/\s+/));
        return;
      }

      wrap.textContent = "❌ Invalid <puzzle> block.";
    });
  });

  // --------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------

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

  // --------------------------------------------------------------------
  // Feedback
  // --------------------------------------------------------------------

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
    el.textContent = solved ? "" : (game.turn() === "w" ? "White to move" : "Black to move");
  }

  // --------------------------------------------------------------------
  // Local puzzle
  // --------------------------------------------------------------------

  function buildUCISolution(fen, sanMoves) {
    const g = new Chess(fen);
    return sanMoves.map(m => {
      const mv = g.move(m, { sloppy: true });
      return mv ? mv.from + mv.to + (mv.promotion || "") : null;
    }).filter(Boolean);
  }

  function renderLocalPuzzle(container, fen, sanMoves) {
    const game = new Chess(fen);
    const solution = buildUCISolution(fen, sanMoves);
    let step = 0, solved = false;

    const boardDiv = document.createElement("div");
    boardDiv.className = "jc-board";

    const statusRow = document.createElement("div");
    statusRow.className = "jc-status-row";

    const turnDiv = document.createElement("div");
    turnDiv.className = "jc-turn";

    const feedback = document.createElement("div");
    feedback.className = "jc-feedback";

    statusRow.append(turnDiv, feedback);
    container.append(boardDiv, statusRow);

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

      const uci = mv.from + mv.to + (mv.promotion || "");
      if (uci !== solution[step]) {
        game.undo();
        showWrong(feedback);
        updateTurn(turnDiv, game, solved);
        return false;
      }

      step++;
      showCorrect(feedback);
      updateTurn(turnDiv, game, solved);

      if (step < solution.length) {
        game.move(sanMoves[step], { sloppy: true });
        step++;
        setTimeout(() => board.position(game.fen(), true), 200);
      }

      if (step >= solution.length) {
        solved = true;
        showSolved(feedback);
        updateTurn(turnDiv, game, solved);
      }

      return true;
    }

    updateTurn(turnDiv, game, solved);
  }

  // --------------------------------------------------------------------
  // Remote PGN (lazy batch)
  // --------------------------------------------------------------------

  function initRemotePGNPackLazy(container, url) {
    const BATCH = 20;

    const boardWrap = document.createElement("div");
    boardWrap.className = "jc-board-wrap";

    const boardDiv = document.createElement("div");
    boardDiv.className = "jc-board";

    const controls = document.createElement("div");
    controls.className = "jc-controls";

    const prev = document.createElement("button");
    prev.textContent = "←";

    const next = document.createElement("button");
    next.textContent = "→";

    controls.append(prev, next);
    boardWrap.append(boardDiv, controls);

    const statusRow = document.createElement("div");
    statusRow.className = "jc-status-row";

    const turnDiv = document.createElement("div");
    turnDiv.className = "jc-turn";

    const feedback = document.createElement("div");
    feedback.className = "jc-feedback";

    statusRow.append(turnDiv, feedback, controls);
    container.append(boardWrap, statusRow);

    feedback.textContent = "Loading puzzle pack…";

    fetch(url).then(r => r.text()).then(txt => {
      const games = txt.split(/\[Event\b/).slice(1).map(g => "[Event" + g);
      const puzzles = [];
      let parsed = 0;
      let index = 0, game, moves, step = 0, solved = false;

      const board = Chessboard(boardDiv, {
        draggable: true,
        pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
        onDrop: (s, t) => playMove(s, t) ? true : "snapback"
      });

      function parseBatch() {
        for (let i = parsed; i < Math.min(parsed + BATCH, games.length); i++) {
          const fen = games[i].match(/\[FEN\s+"([^"]+)"/)?.[1];
          if (!fen) continue;
          const san = parsePGNMoves(games[i]);
          if (san.length) puzzles.push({ fen, san });
        }
        parsed += BATCH;
      }

      function updateButtons() {
        prev.disabled = index <= 0;
        next.disabled = index >= puzzles.length - 1;
      }

      function load(i) {
        if (i >= puzzles.length && parsed < games.length) parseBatch();
        if (!puzzles[i]) return;

        index = i;
        game = new Chess(puzzles[i].fen);
        moves = puzzles[i].san;
        step = 0;
        solved = false;

        board.position(game.fen());
        feedback.textContent = "";
        updateTurn(turnDiv, game, solved);
        updateButtons();
      }

      function playMove(src, dst) {
        if (solved) return false;

        const expected = moves[step];
        const mv = game.move({ from: src, to: dst, promotion: "q" });
        if (!mv) return false;

        if (normalizeSAN(mv.san) !== normalizeSAN(expected)) {
          game.undo();
          showWrong(feedback);
          updateTurn(turnDiv, game, solved);
          return false;
        }

        step++;
        showCorrect(feedback);
        updateTurn(turnDiv, game, solved);

        if (step < moves.length) {
          game.move(moves[step], { sloppy: true });
          step++;
          setTimeout(() => {
            board.position(game.fen(), true);
            if (step >= moves.length || game.game_over()) {
              solved = true;
              showSolved(feedback);
              updateTurn(turnDiv, game, solved);
            }
          }, 200);
        }

        return true;
      }

      prev.onclick = () => load(index - 1);
      next.onclick = () => load(index + 1);

      parseBatch();
      load(0);
    });
  }

  // Global safety
  window.renderLocalPuzzle = renderLocalPuzzle;
  window.initRemotePGNPackLazy = initRemotePGNPackLazy;

})();
