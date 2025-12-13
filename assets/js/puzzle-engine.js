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
      .map((t) => t.replace(/^\d+\.(\.\.)?/, ""))
      .filter(
        (t) =>
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
  /* Local puzzle renderer                              */
  /* -------------------------------------------------- */

  function renderLocalPuzzle(container, fen, moves, counterText, afterReady) {
    container.innerHTML = "";

    const loading = document.createElement("div");
    loading.textContent = "Loading...";
    container.append(loading);

    const boardDiv = document.createElement("div");
    boardDiv.className = "jc-board";
    container.insertBefore(boardDiv, loading);

    const game = new Chess(fen);
    const solverSide = game.turn();
    let index = 0;
    let locked = false;
    let solved = false;
    let board;

    const status = document.createElement("div");
    status.style.display = "flex";
    status.style.alignItems = "center";
    status.style.gap = "8px";
    status.style.marginTop = "6px";

    const counter = document.createElement("span");
    counter.textContent = counterText || "";

    const turn = document.createElement("span");
    const feedback = document.createElement("span");

    status.append(counter, turn, feedback);

    function updateTurn() {
      if (solved) {
        turn.textContent = "";
        return;
      }
      turn.textContent =
        game.turn() === "w" ? "⚐ White to move" : "⚑ Black to move";
    }

    function finishSolved() {
      solved = true;
      feedback.textContent = "Puzzle solved! 🏆";
      updateTurn();
    }

    function autoReply() {
      if (index >= moves.length) {
        finishSolved();
        return;
      }

      const mv = game.move(moves[index], { sloppy: true });
      if (!mv) {
        finishSolved();
        return;
      }

      index++;
      board.move(mv.from + "-" + mv.to);

      setTimeout(() => {
        hardSync(board, game);
        locked = false;
        updateTurn();
      }, ANIM_MS);
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

      if (index >= moves.length) {
        finishSolved();
        return true;
      }

      locked = true;
      setTimeout(autoReply, 80);
      return true;
    }

    // ✅ SINGLE, CORRECT chessboard initialization
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
        loading.remove();
        container.append(status);
        updateTurn();
        afterReady && afterReady(status);
      }
    );
  }

  /* -------------------------------------------------- */
  /* Remote PGN renderer                                */
  /* -------------------------------------------------- */

  function splitIntoPgnGames(text) {
    return String(text || "")
      .replace(/\r/g, "")
      .trim()
      .split(/\n\s*\n(?=\s*\[)/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function extractMovetext(pgn) {
    return String(pgn || "")
      .replace(/^\s*(?:\[[^\n]*\]\s*\n)+/m, "")
      .trim();
  }

  function parseGame(pgn) {
    const fenMatch = pgn.match(/\[FEN\s+"([^"]+)"\]/);
    return {
      fen: fenMatch ? fenMatch[1] : "start",
      moves: tokenizeMoves(extractMovetext(pgn)),
    };
  }

  async function renderRemotePGN(container, url) {
    container.textContent = "Loading...";

    let res;
    try {
      res = await fetch(url, { cache: "no-store" });
    } catch {
      container.textContent = "❌ Failed to load PGN";
      return;
    }

    if (!res.ok) {
      container.textContent = "❌ Failed to load PGN";
      return;
    }

    const text = await res.text();
    const puzzles = splitIntoPgnGames(text)
      .map(parseGame)
      .filter((p) => p.moves.length);

    let index = 0;

    function renderCurrent() {
      container.textContent = "Loading...";

      renderLocalPuzzle(
        container,
        puzzles[index].fen,
        puzzles[index].moves,
        `${index + 1} / ${puzzles.length}`,
        (statusRow) => {
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

          statusRow.append(prev, next);
        }
      );
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
          "",
          () => {}
        );
      } else {
        wrap.textContent = "❌ Invalid puzzle block! ❌";
      }
    });
  });
})();
