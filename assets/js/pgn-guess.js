// ============================================================================
// pgn-guess.js — Guess-the-move PGN trainer (capture-safe, autoplay anim only)
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function") return;
  if (typeof Chessboard !== "function") return;
  if (!window.PGNCore) return;

  const C = window.PGNCore;

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
        font-weight: 700;
        text-align: center;
        opacity: 0;
        transition: opacity 0.2s ease;
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

  function extractVariationDisplay(text) {
    return text
      .replace(/\[%.*?]/g, "")
      .replace(/\[D\]/g, "")
      .replace(/\{\s*\}/g, "")
      .replace(/\s+/g, " ")
      .trim();
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
      this.userIsWhite = !this.flipBoard;

      this.moves = [];
      this.index = -1;
      this.currentRow = null;
      this.game = new Chess();

      // authoritative fen for snap-end resync (fixes capture ghosts)
      this.currentFen = "start";

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
      let raw = C.normalizeFigurines(this.rawText);
      const chess = new Chess();

      let ply = 0, i = 0, pending = [];

      const attach = (t) => {
        const c = t.replace(/\[%.*?]/g, "").trim();
        if (!c) return;
        if (this.moves.length) this.moves[this.moves.length - 1].comments.push(c);
        else pending.push(c);
      };

      while (i < raw.length) {
        const ch = raw[i];

        if (ch === "(") {
          let depth = 1, j = i + 1;
          while (j < raw.length && depth > 0) {
            if (raw[j] === "(") depth++;
            else if (raw[j] === ")") depth--;
            j++;
          }
          const v = extractVariationDisplay(raw.slice(i + 1, j - 1));
          if (v) attach(v);
          i = j;
          continue;
        }

        if (ch === "{") {
          let j = i + 1;
          while (j < raw.length && raw[j] !== "}") j++;
          attach(raw.slice(i + 1, j));
          i = j + 1;
          continue;
        }

        if (/\s/.test(ch)) { i++; continue; }

        const s = i;
        while (i < raw.length && !/\s/.test(raw[i]) && !"(){}".includes(raw[i])) i++;
        const tok = raw.slice(s, i);

        if (/^\d+\.{1,3}$/.test(tok)) continue;

        const san = normalizeSAN(tok);
        if (!chess.move(san, { sloppy: true })) continue;

        this.moves.push({
          isWhite: ply % 2 === 0,
          moveNo: Math.floor(ply / 2) + 1,
          san: tok,         // display token
          fen: chess.fen(), // authoritative resulting fen
          comments: pending.splice(0)
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

          // ✅ Critical: after any animation (especially captures), force-sync to authoritative fen
          onSnapEnd: () => {
            if (!this.board) return;
            const fen = this.currentFen === "start" ? "start" : this.currentFen;
            this.board.position(fen, false);
          }
        },
        30,
        (b) => {
          this.board = b;
          this.setBoardPosition("start", false);
          this.autoplayUntilUserTurn();
          this.updateUI();
        }
      );
    }

    // authoritative setter for board position (keeps captures correct)
    setBoardPosition(fen, animate) {
      this.currentFen = fen;
      this.board.position(fen, !!animate);
    }

    autoplayUntilUserTurn() {
      while (this.index + 1 < this.moves.length) {
        const next = this.moves[this.index + 1];
        if (next.isWhite === this.userIsWhite) break;

        this.index++;
        this.game.move(normalizeSAN(next.san), { sloppy: true });

        // ✅ autoplay is animated
        this.setBoardPosition(next.fen, true);
        this.appendMove();
      }
    }

    isGuessTurn() {
      const next = this.moves[this.index + 1];
      return next && next.isWhite === this.userIsWhite;
    }

    updateUI() {
      const on = this.isGuessTurn();
      this.statusEl.textContent = on ? "Your move" : "";
      this.statusEl.style.opacity = on ? "1" : "0";
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

      if (!ok) return "snapback";

      // accept: advance to expected position
      this.index++;
      this.game.load(expected.fen);

      // ⛔ user move should NOT animate
      this.setBoardPosition(expected.fen, false);

      this.appendMove();
      this.autoplayUntilUserTurn();
      this.updateUI();
      return;
    }

    appendMove() {
      const m = this.moves[this.index];
      if (!m) return;

      if (m.isWhite) {
        const row = document.createElement("div");
        row.className = "pgn-move-row";

        const no = document.createElement("span");
        no.className = "pgn-move-no";
        no.textContent = `${m.moveNo}.`;

        const w = document.createElement("span");
        w.className = "pgn-move-white";
        w.textContent = m.san;

        row.appendChild(no);
        row.appendChild(w);
        this.rightPane.appendChild(row);
        this.currentRow = row;
      } else if (this.currentRow) {
        const b = document.createElement("span");
        b.className = "pgn-move-black";
        b.textContent = m.san;
        this.currentRow.appendChild(b);
      }

      m.comments.forEach((c) => {
        const p = document.createElement("p");
        p.className = "pgn-comment";
        p.textContent = c;
        this.rightPane.appendChild(p);
      });

      this.rightPane.scrollTop = this.rightPane.scrollHeight;
    }
  }

  // --------------------------------------------------------------------------

  function init() {
    document.querySelectorAll("pgn-guess, pgn-guess-black")
      .forEach(el => new ReaderPGNView(el));
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init, { once: true })
    : init();

})();
