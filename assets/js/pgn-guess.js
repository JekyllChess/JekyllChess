// ============================================================================
// pgn-guess.js — Guess-the-move PGN trainer (FINAL bugfixes)
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function") return;
  if (typeof Chessboard !== "function") return;
  if (!window.PGNCore) return;

  const C = window.PGNCore;
  const AUTOPLAY_DELAY = 700;
  const FEEDBACK_DELAY = 600;

  // --------------------------------------------------------------------------
  // Styles
  // --------------------------------------------------------------------------

  function ensureGuessStylesOnce() {
    if (document.getElementById("pgn-guess-style")) return;

    const style = document.createElement("style");
    style.id = "pgn-guess-style";
    style.textContent = `
      .pgn-guess-cols {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
      }

      .pgn-guess-left { flex: 0 0 auto; }

      .pgn-guess-board {
        width: 320px;
        max-width: 100%;
        touch-action: manipulation;
      }

      @media (min-width: 480px) { .pgn-guess-board { width: 360px; } }
      @media (min-width: 768px) { .pgn-guess-board { width: 400px; } }

      .pgn-guess-status {
        margin-top: 0.4em;
        font-size: 0.95em;
        white-space: nowrap;
      }

      .pgn-guess-right {
        flex: 1 1 auto;
        max-height: 420px;
        overflow-y: auto;
      }

      .pgn-move-row { font-weight: 900; margin-top: 0.5em; }
      .pgn-move-no { margin-right: 0.3em; }
      .pgn-move-white { margin-right: 0.6em; }
      .pgn-move-black { margin-left: 0.3em; }
    `;
    document.head.appendChild(style);
  }

  // --------------------------------------------------------------------------

  function safeChessboard(targetEl, options, tries = 30, onReady) {
    if (!targetEl) return;
    const r = targetEl.getBoundingClientRect();
    if ((r.width <= 0 || r.height <= 0) && tries > 0) {
      requestAnimationFrame(() =>
        safeChessboard(targetEl, options, tries - 1, onReady)
      );
      return;
    }
    try {
      const board = Chessboard(targetEl, options);
      onReady && onReady(board);
    } catch {
      if (tries > 0) {
        requestAnimationFrame(() =>
          safeChessboard(targetEl, options, tries - 1, onReady)
        );
      }
    }
  }

  function normalizeSAN(tok) {
    return tok
      .replace(/\[%.*?]/g, "")
      .replace(/[!?]+/g, "")
      .replace(/[+#]$/, "")
      .replace(/0/g, "O")
      .trim();
  }

  // --------------------------------------------------------------------------
  // Main class
  // --------------------------------------------------------------------------

  class ReaderPGNView {
    constructor(src) {
      if (src.__pgnReaderRendered) return;
      src.__pgnReaderRendered = true;

      ensureGuessStylesOnce();

      this.rawText = (src.textContent || "").trim();
      this.flipBoard = src.tagName.toLowerCase() === "pgn-guess-black";

      this.moves = [];
      this.index = -1;
      this.currentRow = null;
      this.game = new Chess();
      this.currentFen = "start";
      this.resultMessage = "";

      this.build(src);
      this.parsePGN();
      this.initBoard();
    }

    build(src) {
      const wrapper = document.createElement("div");
      wrapper.className = "pgn-guess-cols";

      wrapper.innerHTML = `
        <div class="pgn-guess-left">
          <div class="pgn-guess-board"></div>
          <div class="pgn-guess-status"></div>
        </div>
        <div class="pgn-guess-right"></div>
      `;

      src.replaceWith(wrapper);

      this.boardDiv = wrapper.querySelector(".pgn-guess-board");
      this.statusEl = wrapper.querySelector(".pgn-guess-status");
      this.rightPane = wrapper.querySelector(".pgn-guess-right");
    }

    parsePGN() {
      const chess = new Chess();
      const raw = C.normalizeFigurines(this.rawText);
      let ply = 0, i = 0;

      while (i < raw.length) {
        if (/\s/.test(raw[i])) { i++; continue; }

        const s = i;
        while (i < raw.length && !/\s/.test(raw[i])) i++;
        const tok = raw.slice(s, i);

        if (/^\d+\.{1,3}$/.test(tok)) continue;

        const san = normalizeSAN(tok);
        if (!chess.move(san, { sloppy: true })) continue;

        this.moves.push({
          isWhite: ply % 2 === 0,
          san: tok,
          fen: chess.fen()
        });

        ply++;
      }
    }

    initBoard() {
      safeChessboard(
        this.boardDiv,
        {
          position: "start",
          orientation: this.flipBoard ? "black" : "white",
          draggable: true,
          pieceTheme: C.PIECE_THEME_URL,
          moveSpeed: 200,
          onDragStart: () => this.isGuessTurn(),
          onDrop: (s, t) => this.onUserDrop(s, t),
          onSnapEnd: () => this.board.position(this.currentFen, false)
        },
        30,
        (b) => {
          this.board = b;
          this.updateStatus();
          setTimeout(() => {
            this.autoplayUntilUserTurn();
            this.updateStatus();
          }, AUTOPLAY_DELAY);
        }
      );
    }

    autoplayUntilUserTurn() {
      while (this.index + 1 < this.moves.length) {
        const next = this.moves[this.index + 1];
        if (next.isWhite === (this.game.turn() === "w")) break;

        this.index++;
        this.game.move(normalizeSAN(next.san), { sloppy: true });
        this.currentFen = next.fen;
        this.board.position(next.fen, true);
      }
      this.resultMessage = "";
    }

    isGuessTurn() {
      const next = this.moves[this.index + 1];
      return next && next.isWhite === (this.game.turn() === "w");
    }

    updateStatus() {
      const turn = this.game.turn() === "w" ? "White" : "Black";
      const flag = this.game.turn() === "w" ? "⚐" : "⚑";
      const suffix = this.resultMessage ? ` · ${this.resultMessage}` : "";
      this.statusEl.textContent = `${flag} ${turn} to move${suffix}`;
    }

    onUserDrop(source, target) {
      if (!this.isGuessTurn()) return "snapback";

      const expected = this.moves[this.index + 1];
      const legal = this.game.moves({ verbose: true });

      const ok = legal.some(m => {
        if (m.from !== source || m.to !== target) return false;
        const t = new Chess(this.game.fen());
        t.move(m);
        return t.fen() === expected.fen;
      });

      if (!ok) {
        this.resultMessage = "Wrong move ❌";
        this.updateStatus();
        return "snapback";
      }

      this.index++;
      this.game.load(expected.fen);
      this.currentFen = expected.fen;
      this.board.position(expected.fen, false);

      if (this.index === this.moves.length - 1) {
        this.resultMessage = "Training solved! 🏆";
        this.updateStatus();
        return;
      }

      this.resultMessage = "Correct! ✅";
      this.updateStatus();

      setTimeout(() => {
        this.autoplayUntilUserTurn();
        this.updateStatus();
      }, FEEDBACK_DELAY);
    }
  }

  function init() {
    document.querySelectorAll("pgn-guess, pgn-guess-black")
      .forEach(el => new ReaderPGNView(el));
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init, { once: true })
    : init();

})();
