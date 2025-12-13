(function () {
  "use strict";

  if (typeof Chess !== "function" || typeof Chessboard !== "function") {
    console.warn("JekyllChess: chess.js or chessboard.js missing");
    return;
  }

  const PIECE_THEME =
    "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png";

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
      .filter(
        (t) =>
          !/^\d+\.(\.\.)?$/.test(t) &&
          !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)
      )
      .map((t) => t.replace(/^\d+\./, ""));
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
  /* Local puzzle renderer                              */
  /* -------------------------------------------------- */

  function renderLocalPuzzle(container, fen, moves) {
    container.innerHTML = "";

    const game = new Chess(fen);
    const solverSide = game.turn();
    let index = 0;
    let locked = false;
    let solved = false;
    let board;

    const boardDiv = document.createElement("div");
    boardDiv.className = "jc-board";

    const status = document.createElement("div");
    status.className = "jc-status-row";
    status.style.display = "flex";
    status.style.gap = "10px";

    const turn = document.createElement("span");
    const feedback = document.createElement("span");

    status.append(turn, feedback);
    container.append(boardDiv, status);

    function updateTurn() {
      turn.textContent = solved
        ? ""
        : game.turn() === "w"
        ? "⚐ White to move"
        : "⚑ Black to move";
    }

    function autoReply() {
      if (index >= moves.length) {
        solved = true;
        feedback.textContent = "Puzzle solved! 🏆";
        updateTurn();
        return;
      }

      const mv = game.move(moves[index], { sloppy: true });
      if (!mv) {
        solved = true;
        feedback.textContent = "Puzzle solved! 🏆";
        updateTurn();
        return;
      }

      index++;
      board.move(mv.from + "-" + mv.to);
      setTimeout(() => hardSync(board, game), 250);
      locked = false;
      updateTurn();
    }

    function onDrop(from, to) {
      if (locked || solved || game.turn() !== solverSide) return "snapback";

      const expected = moves[index];
      const mv = game.move({ from, to, promotion: "q" });
      if (!mv) return "snapback";

      if (normalizeSAN(mv.san) !== normalizeSAN(expected)) {
        game.undo();
        feedback.textContent = "Wrong move ❌";
        hardSync(board, game);
        return "snapback";
      }

      index++;
      feedback.textContent = "Correct! ✅";
      hardSync(board, game);
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
        onSnapEnd: () => hardSync(board, game),
      },
      (b) => {
        board = b;
        updateTurn();
      }
    );
  }

  /* -------------------------------------------------- */
  /* Remote PGN renderer                                */
  /* -------------------------------------------------- */

  async function renderRemotePGN(container, url) {
    container.textContent = "Loading…";

    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      container.textContent = "❌ Failed to load PGN";
      return;
    }

    if (!res.ok) {
      container.textContent = "❌ Failed to load PGN";
      return;
    }

    const text = await res.text();
    const games = text.split(/\n\n(?=\[Event|\[FEN|\[Site)/);

    let index = 0;

    function parseGame(pgn) {
      const fenMatch = pgn.match(/\[FEN\s+"([^"]+)"\]/);
      const fen = fenMatch ? fenMatch[1] : "start";
      const moves = tokenizeMoves(pgn.split("\n\n").pop());
      return { fen, moves };
    }

    const puzzles = games.map(parseGame).filter((p) => p.moves.length);

    if (!puzzles.length) {
      container.textContent = "❌ No puzzles found in PGN";
      return;
    }

    function renderCurrent() {
      const wrap = document.createElement("div");
      renderLocalPuzzle(wrap, puzzles[index].fen, puzzles[index].moves);

      const controls = document.createElement("div");
      controls.style.marginTop = "6px";

      const prev = document.createElement("button");
      prev.textContent = "↶";
      prev.disabled = index === 0;
      prev.onclick = () => {
        index--;
        renderCurrent();
      };

      const next = document.createElement("button");
      next.textContent = "↷";
      next.disabled = index === puzzles.length - 1;
      next.onclick = () => {
        index++;
        renderCurrent();
      };

      controls.append(prev, next);

      container.innerHTML = "";
      container.append(wrap, controls);
    }

    renderCurrent();
  }

  /* -------------------------------------------------- */
  /* Entry                                              */
  /* -------------------------------------------------- */

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("puzzle").forEach((node) => {
      const raw = normalizePuzzleText(stripFigurines(node.textContent));

      const wrap = document.createElement("div");
      wrap.className = "jc-puzzle-wrapper";
      node.replaceWith(wrap);

      const pgnMatch = raw.match(/PGN:\s*([^\s]+)/i);
      if (pgnMatch) {
        const url = new URL(pgnMatch[1], window.location.href).href;
        renderRemotePGN(wrap, url);
        return;
      }

      const fenMatch = raw.match(/FEN:\s*([^]*?)\s+Moves:/i);
      const movesMatch = raw.match(/Moves:\s*([^]*)$/i);

      const fen = fenMatch?.[1]?.trim();
      const movesText = movesMatch?.[1];

      if (fen && movesText) {
        renderLocalPuzzle(wrap, fen, tokenizeMoves(movesText));
      } else {
        wrap.textContent = "❌ Invalid puzzle block! ❌";
      }
    });
  });
})();
