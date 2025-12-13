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

    // Remove PGN comments/annotations/variations/NAGs
    s = s.replace(/\{[\s\S]*?\}/g, " ");
    s = s.replace(/;[^\n]*/g, " ");
    while (/\([^()]*\)/.test(s)) s = s.replace(/\([^()]*\)/g, " ");
    s = s.replace(/\$\d+/g, " ");

    // Normalize whitespace
    s = s.replace(/\s+/g, " ").trim();

    // Split tokens
    const toks = s.split(" ").filter(Boolean);

    // Remove move numbers, results, and stray ellipses tokens
    const out = [];
    for (let t of toks) {
      // strip leading move numbers like "12." or "12..."
      t = t.replace(/^\d+\.(\.\.)?/, "");
      if (!t) continue;

      if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)) continue;
      if (/^\d+\.(\.\.)?$/.test(t)) continue;
      if (/^\.\.\.$/.test(t)) continue;

      out.push(t);
    }

    return out;
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
      requestAnimationFrame(() => safeChessboard(el, opts, cb, tries - 1));
      return;
    }
    const board = Chessboard(el, opts);
    if (cb) cb(board);
  }

  /* -------------------------------------------------- */
  /* Local puzzle renderer                              */
  /* -------------------------------------------------- */

  function renderLocalPuzzle(container, fen, moves, labelText) {
    container.innerHTML = "";

    const game = new Chess(fen);
    const solverSide = game.turn(); // standalone puzzle: first move must match side-to-move in FEN
    let index = 0;
    let locked = false;
    let solved = false;
    let board;

    if (labelText) {
      const label = document.createElement("div");
      label.className = "jc-puzzle-label";
      label.style.fontSize = "0.85em";
      label.style.opacity = "0.75";
      label.style.marginBottom = "6px";
      label.textContent = labelText;
      container.append(label);
    }

    const boardDiv = document.createElement("div");
    boardDiv.className = "jc-board";

    const status = document.createElement("div");
    status.className = "jc-status-row";
    status.style.display = "flex";
    status.style.gap = "10px";
    status.style.marginTop = "6px";

    const turn = document.createElement("span");
    const feedback = document.createElement("span");

    status.append(turn, feedback);
    container.append(boardDiv, status);

    function updateTurn() {
      if (solved) {
        turn.textContent = "";
        return;
      }
      turn.textContent = game.turn() === "w" ? "⚐ White to move" : "⚑ Black to move";
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
        // If PGN ends or move cannot be applied, treat as finished.
        finishSolved();
        return;
      }

      index++;
      hardSync(board, game);
      locked = false;
      updateTurn();
    }

    function onDrop(from, to) {
      if (locked) return "snapback";
      if (solved) return "snapback";
      if (game.turn() !== solverSide) return "snapback";

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

      // If that was the final move, finish immediately.
      if (index >= moves.length) {
        finishSolved();
        return true;
      }

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
        onDrop: onDrop,
        onSnapEnd: function () {
          hardSync(board, game);
        },
      },
      function (b) {
        board = b;
        updateTurn();
      }
    );
  }

  /* -------------------------------------------------- */
  /* Remote PGN renderer                                */
  /* -------------------------------------------------- */

  function splitIntoPgnGames(rawText) {
    // Normalize CRLF and trim
    const t = String(rawText || "").replace(/\r/g, "").trim();
    if (!t) return [];

    // Your sample uses blank lines between games. This handles extra spaces as well.
    // Split on one-or-more blank lines *followed by a tag line*.
    const parts = t.split(/\n\s*\n(?=\s*\[)/).map((x) => x.trim()).filter(Boolean);
    return parts;
  }

  function extractMovetext(pgnBlock) {
    const s = String(pgnBlock || "").replace(/\r/g, "").trim();
    if (!s) return "";

    // Remove all tag-pair lines at the start: [Key "Value"]
    // Then remove ONE optional blank line after tags.
    const withoutTags = s
      .replace(/^\s*(?:\[[^\n]*\]\s*\n)+/m, "")
      .replace(/^\s*\n/, "");

    return withoutTags.trim();
  }

  function parseGame(pgnBlock) {
    const s = String(pgnBlock || "").replace(/\r/g, "").trim();

    const fenMatch = s.match(/^\s*\[FEN\s+"([^"]+)"\]/m);
    const fen = fenMatch ? fenMatch[1] : "start";

    const movetext = extractMovetext(s);
    const moves = tokenizeMoves(movetext);

    return { fen, moves };
  }

  async function renderRemotePGN(container, url) {
    container.textContent = "Loading…";

    let res;
    try {
      res = await fetch(url, { cache: "no-store" });
    } catch (e) {
      container.textContent = "❌ Failed to load PGN";
      return;
    }

    if (!res.ok) {
      container.textContent = "❌ Failed to load PGN";
      return;
    }

    const text = await res.text();
    const games = splitIntoPgnGames(text);
    const puzzles = games.map(parseGame).filter((p) => p.moves.length);

    if (!puzzles.length) {
      container.textContent = "❌ No puzzles found in PGN";
      return;
    }

    let index = 0;

    function renderCurrent() {
      const wrap = document.createElement("div");
      renderLocalPuzzle(
        wrap,
        puzzles[index].fen,
        puzzles[index].moves,
        `Puzzle ${index + 1} / ${puzzles.length}`
      );

      const controls = document.createElement("div");
      controls.style.marginTop = "6px";
      controls.style.display = "flex";
      controls.style.gap = "6px";

      const prev = document.createElement("button");
      prev.textContent = "↶";
      prev.disabled = index === 0;
      prev.onclick = function () {
        index--;
        renderCurrent();
      };

      const next = document.createElement("button");
      next.textContent = "↷";
      next.disabled = index === puzzles.length - 1;
      next.onclick = function () {
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

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("puzzle").forEach(function (node) {
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

      const fen = fenMatch && fenMatch[1] ? fenMatch[1].trim() : "";
      const movesText = movesMatch && movesMatch[1] ? movesMatch[1] : "";

      if (fen && movesText) {
        renderLocalPuzzle(wrap, fen, tokenizeMoves(movesText), "");
      } else {
        wrap.textContent = "❌ Invalid puzzle block! ❌";
      }
    });
  });
})();
