// ============================================================================
// pgn-guess.js — Guess-the-move PGN trainer (drag-enabled, gated by turn)
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
      .pgn-move-row { font-weight: 900; margin-top: 0.5em; }
      .pgn-move-no { margin-right: 0.3em; }
      .pgn-move-white { margin-right: 0.6em; }
      .pgn-move-black { margin-left: 0.3em; }

      .pgn-guess-status {
        margin-top: 0.4em;
        font-weight: 700;
        text-align: center;
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      .pgn-guess-board {
        touch-action: manipulation;
      }

      .pgn-guess-board.flash-correct {
        box-shadow: 0 0 0 4px #3fb950 inset;
        animation: flash-green 0.35s ease;
      }

      .pgn-guess-board.flash-wrong {
        box-shadow: 0 0 0 4px #f85149 inset;
        animation: flash-red 0.35s ease;
      }

      @keyframes flash-green {
        0%   { box-shadow: 0 0 0 0 #3fb950 inset; }
        50%  { box-shadow: 0 0 0 6px #3fb950 inset; }
        100% { box-shadow: 0 0 0 4px #3fb950 inset; }
      }

      @keyframes flash-red {
        0%   { box-shadow: 0 0 0 0 #f85149 inset; }
        50%  { box-shadow: 0 0 0 6px #f85149 inset; }
        100% { box-shadow: 0 0 0 4px #f85149 inset; }
      }
    `;
    document.head.appendChild(style);
  }

  // --------------------------------------------------------------------------

  function safeChessboard(targetEl, options, tries = 30, onReady) {
    if (!targetEl) return null;
    const r = targetEl.getBoundingClientRect();
    if ((r.width <= 0 || r.height <= 0) && tries > 0) {
      requestAnimationFrame(() =>
        safeChessboard(targetEl, options, tries - 1, onReady)
      );
      return null;
    }
    try {
      const board = Chessboard(targetEl, options);
      onReady && onReady(board);
      return board;
    } catch {
      if (tries > 0) {
        requestAnimationFrame(() =>
          safeChessboard(targetEl, options, tries - 1, onReady)
        );
      }
      return null;
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

      this.build(src);
      this.parsePGN();
      this.initBoard();
    }

    // ------------------------------------------------------------------------

    build(src) {
      const wrapper = document.createElement("div");
      wrapper.className = "pgn-guess-block";

      wrapper.innerHTML = `
        <div class="pgn-guess-cols">
          <div class="pgn-guess-left">
            <div class="pgn-guess-board"></div>
            <div class="pgn-guess-status"></div>
            <div class="pgn-guess-buttons">
              <button class="pgn-guess-btn pgn-guess-next">▶</button>
            </div>
          </div>
          <div class="pgn-guess-right"></div>
        </div>
      `;

      src.replaceWith(wrapper);

      this.boardDiv = wrapper.querySelector(".pgn-guess-board");
      this.rightPane = wrapper.querySelector(".pgn-guess-right");
      this.nextBtn = wrapper.querySelector(".pgn-guess-next");
      this.statusEl = wrapper.querySelector(".pgn-guess-status");
    }

    // ------------------------------------------------------------------------

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

        const core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
        if (!C.SAN_CORE_REGEX.test(core)) continue;

        const isWhite = ply % 2 === 0;
        const num = Math.floor(ply / 2) + 1;
        if (!chess.move(core, { sloppy: true })) continue;

        this.moves.push({
          isWhite,
          moveNo: num,
          san: tok,
          fen: chess.fen(),
          comments: pending.splice(0)
        });

        ply++;
      }
    }

    // ------------------------------------------------------------------------

    initBoard() {
      safeChessboard(
        this.boardDiv,
        {
          position: "start",
          orientation: this.flipBoard ? "black" : "white",
          draggable: true,                 // ✅ ALWAYS TRUE
          pieceTheme: C.PIECE_THEME_URL,
          moveSpeed: 200,
          onDragStart: () => this.isGuessTurn(),  // ✅ gate dragging here
          onDrop: (s, t) => this.onUserDrop(s, t)
        },
        30,
        (b) => {
          this.board = b;

          if (this.flipBoard && this.moves[0]?.isWhite) {
            this.index = 0;
            this.game.move(this.moves[0].san, { sloppy: true });
            this.board.position(this.moves[0].fen, true);
            this.appendMove();
          }

          this.updateUI();
        }
      );

      this.nextBtn.addEventListener("click", () => this.nextUserMove());
    }

    // ------------------------------------------------------------------------

    isGuessTurn() {
      const next = this.moves[this.index + 1];
      return next && next.isWhite !== this.userIsWhite;
    }

    updateUI() {
      if (this.isGuessTurn()) {
        this.statusEl.textContent = "Your move";
        this.statusEl.style.opacity = "1";
      } else {
        this.statusEl.textContent = "";
        this.statusEl.style.opacity = "0";
      }
    }

    flash(correct) {
      const el = this.boardDiv;
      el.classList.remove("flash-correct", "flash-wrong");
      void el.offsetWidth;
      el.classList.add(correct ? "flash-correct" : "flash-wrong");
      setTimeout(() => {
        el.classList.remove("flash-correct", "flash-wrong");
      }, 400);
    }

    // ------------------------------------------------------------------------

    onUserDrop(source, target) {
      if (!this.isGuessTurn()) return "snapback";

      const expected = this.moves[this.index + 1];
      const legal = this.game.moves({ verbose: true });

      const isCorrect = legal.some(m => {
        if (m.from !== source || m.to !== target) return false;
        const test = new Chess(this.game.fen());
        test.move(m);
        return test.fen() === expected.fen;
      });

      if (!isCorrect) {
        this.flash(false);
        return "snapback";
      }

      this.flash(true);
      this.index++;
      this.game.load(expected.fen);
      this.board.position(expected.fen, true);
      this.appendMove();
      this.autoAdvance();
      return;
    }

    // ------------------------------------------------------------------------

    autoAdvance() {
      while (this.index + 1 < this.moves.length) {
        const next = this.moves[this.index + 1];
        if (next.isWhite !== this.userIsWhite) break;

        this.index++;
        this.game.move(next.san, { sloppy: true });
        this.board.position(next.fen, true);
        this.appendMove();
      }
      this.updateUI();
    }

    nextUserMove() {
      if (this.isGuessTurn()) return;
      if (this.index + 1 >= this.moves.length) return;

      this.index++;
      this.game.move(this.moves[this.index].san, { sloppy: true });
      this.board.position(this.moves[this.index].fen, true);
      this.appendMove();
      this.autoAdvance();
    }

    // ------------------------------------------------------------------------

    appendMove() {
      const m = this.moves[this.index];

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
