// ============================================================================
// puzzle-engine.js — Local + Remote PGN Puzzle Engine (FIXED)
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function" || typeof Chessboard !== "function") {
    console.warn("JekyllChess: chess.js or chessboard.js missing");
    return;
  }

  const PIECE_THEME =
    "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png";

  const ANIM_MS = 250;

  /* -------------------------------------------------- */
  /* Utilities                                          */
  /* -------------------------------------------------- */

  function stripFigurines(s) {
    return String(s || "").replace(/[♔♕♖♗♘♙♚♛♜♝♞♟]/g, "");
  }

  function normalizePuzzleText(s) {
    return String(s || "")
      .replace(/\r/g, "")
      .replace(/\n+/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\s*:\s*/g, ": ")
      .trim();
  }

  function normalizeSAN(s) {
    return String(s || "")
      .replace(/[+#?!]/g, "")
      .replace(/0-0-0/g, "O-O-O")
      .replace(/0-0/g, "O-O")
      .trim();
  }

  function tokenizeMoves(text) {
    let s = String(text || "");
    s = s.replace(/\{[\s\S]*?\}/g, " ");
    s = s.replace(/;[^\n]*/g, " ");
    while (/\([^()]*\)/.test(s)) s = s.replace(/\([^()]*\)/g, " ");
    s = s.replace(/\$\d+/g, " ");
    s = s.replace(/\s+/g, " ").trim();

    return s
      .split(" ")
      .map(t => t.replace(/^\d+\.(\.\.)?/, ""))
      .filter(t =>
        t &&
        !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t) &&
        !/^\.\.\.$/.test(t)
      );
  }

  function hardSync(board, game) {
    board.position(game.fen(), false);
  }

  /* -------------------------------------------------- */
  /* Safe chessboard init                               */
  /* -------------------------------------------------- */

  function safeChessboard(el, opts, cb, tries = 60) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    if ((r.width === 0 || r.height === 0) && tries) {
      requestAnimationFrame(() =>
        safeChessboard(el, opts, cb, tries - 1)
      );
      return;
    }
    const board = Chessboard(el, opts);
    cb && cb(board);
  }

  /* -------------------------------------------------- */
  /* Local puzzle renderer                               */
  /* -------------------------------------------------- */

  function renderLocalPuzzle(container, fen, moves, label) {

    container.innerHTML = "";

    const boardDiv = document.createElement("div");
    boardDiv.className = "jc-board";

    const status = document.createElement("div");
    status.style.marginTop = "6px";

    container.append(boardDiv, status);

    const game = new Chess(fen);
    const solverSide = game.turn();

    let board;
    let index = 0;
    let locked = false;
    let solved = false;

    function updateStatus(msg = "") {
      status.textContent = msg || label || "";
    }

    function finishSolved() {
      solved = true;
      updateStatus("Solved! 🏆");
    }

    function autoReply() {
      if (index >= moves.length) {
        finishSolved();
        return;
      }

      const mv = game.move(moves[index], { sloppy: true });
      if (!mv) return finishSolved();

      index++;
      board.move(mv.from + "-" + mv.to);

      setTimeout(() => {
        hardSync(board, game);
        locked = false;
      }, ANIM_MS);
    }

    function onDrop(from, to) {
      if (locked || solved || game.turn() !== solverSide) return "snapback";

      const expected = moves[index];
      const mv = game.move({ from, to, promotion: "q" });
      if (!mv) return "snapback";

      if (normalizeSAN(mv.san) !== normalizeSAN(expected)) {
        game.undo();
        updateStatus("Wrong move ❌");
        hardSync(board, game);
        return "snapback";
      }

      index++;
      updateStatus("Correct! ✅");
      hardSync(board, game);

      if (index >= moves.length) return finishSolved();

      locked = true;
      setTimeout(autoReply, 80);
      return true;
    }

    safeChessboard(
      boardDiv,
      {
        draggable: true,
        position: fen,
        pieceTheme: PIECE_THEME,
        onDrop,
        onSnapEnd: () => hardSync(board, game)
      },
      b => {
        board = b;

        // Auto-play first move
        const mv = game.move(moves[0], { sloppy: true });
        if (mv) {
          board.position(game.fen(), true);
          index = 1;
        }

        updateStatus(label);
      }
    );
  }

  /* -------------------------------------------------- */
  /* Remote PGN parsing                                  */
  /* -------------------------------------------------- */

  function splitIntoPgnGames(text) {
    return String(text || "")
      .replace(/\r/g, "")
      .trim()
      .split(/\n\s*\n(?=\s*\[)/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function parseGame(pgn) {

    const fenMatch = pgn.match(/\[FEN\s+"([^"]+)"\]/i);
    const fen = fenMatch ? fenMatch[1] : "start";

    const moveText = String(pgn)
      .replace(/^\s*(?:\[[^\n]*\]\s*\n)+/m, "")
      .trim();

    if (!moveText) return { error: "PGN contains no movetext." };

    const moves = tokenizeMoves(moveText);
    if (!moves.length) return { error: "No legal moves found." };

    const test = new Chess(fen);
    for (const m of moves) {
      if (!test.move(m, { sloppy: true })) {
        return { error: "Illegal move: " + m };
      }
    }

    return { fen, moves };
  }

  /* -------------------------------------------------- */
  /* Remote PGN renderer                                  */
  /* -------------------------------------------------- */

  async function renderRemotePGN(container, url) {

    container.textContent = "Loading...";

    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();

    const puzzles = splitIntoPgnGames(text)
      .map(parseGame)
      .filter(p => !p.error);

    if (!puzzles.length) {
      container.textContent = "No valid puzzles in PGN file.";
      return;
    }

    let index = 0;

    function renderCurrent() {
      const p = puzzles[index];

      renderLocalPuzzle(
        container,
        p.fen,
        p.moves,
        `Puzzle ${index + 1} / ${puzzles.length}`
      );

      const next = document.createElement("button");
      next.textContent = "Next Puzzle →";
      next.style.marginTop = "8px";
      next.onclick = () => {
        if (index + 1 < puzzles.length) {
          index++;
          renderCurrent();
        }
      };

      container.append(next);
    }

    renderCurrent();
  }

  /* -------------------------------------------------- */
  /* Entry                                              */
  /* -------------------------------------------------- */

  document.addEventListener("DOMContentLoaded", () => {

    document.querySelectorAll("puzzle").forEach(node => {

      const raw = normalizePuzzleText(stripFigurines(node.textContent));

      const wrap = document.createElement("div");
      wrap.className = "jc-puzzle-wrapper";
      wrap.textContent = "Loading...";
      node.replaceWith(wrap);

      const pgnMatch = raw.match(/PGN:\s*([^\s]+)/i);
      if (pgnMatch) {
        renderRemotePGN(
          wrap,
          new URL(pgnMatch[1], window.location.href).href
        );
        return;
      }

      const fenMatch = raw.match(/FEN:\s*([^]*?)\s+Moves:/i);
      const movesMatch = raw.match(/Moves:\s*([^]*)$/i);

      if (fenMatch && movesMatch) {
        renderLocalPuzzle(
          wrap,
          fenMatch[1].trim(),
          tokenizeMoves(movesMatch[1]),
          ""
        );
      } else {
        wrap.textContent = "❌ Invalid puzzle block! ❌";
      }

    });

  });

})();
