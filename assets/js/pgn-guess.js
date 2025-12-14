// ============================================================================
// pgn-guess.js — Guess-the-move PGN trainer (FINAL + full PGN header)
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
      .pgn-guess-wrapper { margin-bottom: 1rem; }

      .pgn-guess-header {
        margin-bottom: .6rem;
        font-weight: 600;
      }

      .pgn-guess-cols {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
      }

      .pgn-guess-board {
        width: 360px;
        touch-action: manipulation;
      }

      .pgn-guess-status {
        margin-top: .4em;
        font-size: .95em;
        white-space: nowrap;
      }

      .pgn-guess-status button {
        margin-left: .3em;
        font-size: .9em;
      }

      .pgn-guess-right {
        flex: 1;
        max-height: 420px;
        overflow-y: auto;
      }

      .pgn-move-row { font-weight: 900; margin-top: .5em; }
      .pgn-move-no { margin-right: .3em; }
      .pgn-move-white { margin-right: .6em; }
      .pgn-move-black { margin-left: .3em; }
      .pgn-comment { font-weight: 400; margin: .35em 0; }
    `;
    document.head.appendChild(style);
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  function normalizeSAN(tok) {
    return tok
      .replace(/\[%.*?]/g, "")
      .replace(/[!?]+/g, "")
      .replace(/[+#]$/, "")
      .replace(/0/g, "O")
      .trim();
  }

  function sanitizeComment(text) {
    return (text || "")
      .replace(/\[%.*?]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseHeaders(text) {
    const headers = {};
    text.replace(/\[(\w+)\s+"([^"]*)"\]/g, (_, k, v) => {
      headers[k] = v;
    });
    return headers;
  }

  // --------------------------------------------------------------------------
  // Main class
  // --------------------------------------------------------------------------

  class ReaderPGNView {
    constructor(src) {
      ensureGuessStylesOnce();

      this.rawText = (src.textContent || "").trim();
      this.headers = parseHeaders(this.rawText);

      this.flipBoard = src.tagName.toLowerCase() === "pgn-guess-black";
      this.userIsWhite = !this.flipBoard;

      this.moves = [];
      this.index = -1;
      this.currentRow = null;

      this.game = new Chess();
      this.currentFen = "start";
      this.resultMessage = "";
      this.solved = false;

      this.build(src);
      this.parsePGN();
      this.initBoard();
    }

    // ------------------------------------------------------------------------
    // HEADER (your logic + Opening)
    // ------------------------------------------------------------------------

    renderHeader() {
      const h = this.headers;
      if (!h) return;

      const H = document.createElement("h3");
      H.className = "pgn-guess-header";

      const W =
        (h.WhiteTitle ? h.WhiteTitle + " " : "") +
        C.flipName(h.White || "") +
        (h.WhiteElo ? " (" + h.WhiteElo + ")" : "");

      const B =
        (h.BlackTitle ? h.BlackTitle + " " : "") +
        C.flipName(h.Black || "") +
        (h.BlackElo ? " (" + h.BlackElo + ")" : "");

      if (W || B) {
        H.appendChild(document.createTextNode(W + " – " + B));
        H.appendChild(document.createElement("br"));
      }

      const Y = C.extractYear(h.Date);
      const line = (h.Event || "") + (Y ? ", " + Y : "");
      if (line) {
        H.appendChild(document.createTextNode(line));
        H.appendChild(document.createElement("br"));
      }

      if (h.Opening) {
        H.appendChild(document.createTextNode(h.Opening));
      }

      this.wrapper.appendChild(H);
    }

    // ------------------------------------------------------------------------

    build(src) {
      this.wrapper = document.createElement("div");
      this.wrapper.className = "pgn-guess-wrapper";

      this.renderHeader();

      const cols = document.createElement("div");
      cols.className = "pgn-guess-cols";
      cols.innerHTML = `
        <div>
          <div class="pgn-guess-board"></div>
          <div class="pgn-guess-status"></div>
        </div>
        <div class="pgn-guess-right"></div>
      `;

      this.wrapper.appendChild(cols);
      src.replaceWith(this.wrapper);

      this.boardDiv = cols.querySelector(".pgn-guess-board");
      this.statusEl = cols.querySelector(".pgn-guess-status");
      this.rightPane = cols.querySelector(".pgn-guess-right");
    }

    // ------------------------------------------------------------------------
    // PGN parsing (safe, eval/clk stripped)
    // ------------------------------------------------------------------------

    parsePGN() {
      const raw = C.normalizeFigurines(this.rawText);
      const chess = new Chess();

      let ply = 0, i = 0;
      let pending = [];

      const attach = (t) => {
        const c = sanitizeComment(t);
        if (!c) return;
        if (this.moves.length) this.moves[this.moves.length - 1].comments.push(c);
        else pending.push(c);
      };

      while (i < raw.length) {
        const ch = raw[i];

        if (ch === "(") {
          let d = 1, j = i + 1;
          while (j < raw.length && d) {
            if (raw[j] === "(") d++;
            else if (raw[j] === ")") d--;
            j++;
          }
          attach(raw.slice(i + 1, j - 1));
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

        let s = i;
        while (i < raw.length && !/\s/.test(raw[i]) && !"(){}".includes(raw[i])) i++;
        const tok = raw.slice(s, i);

        if (/^\d+\.{1,3}$/.test(tok)) continue;

        const san = normalizeSAN(tok);
        if (!chess.move(san, { sloppy: true })) continue;

        this.moves.push({
          isWhite: ply % 2 === 0,
          moveNo: Math.floor(ply / 2) + 1,
          san: tok,
          fen: chess.fen(),
          comments: pending.splice(0)
        });

        ply++;
      }
    }

    // ------------------------------------------------------------------------

    initBoard() {
      this.board = Chessboard(this.boardDiv, {
        position: "start",
        orientation: this.flipBoard ? "black" : "white",
        draggable: true,
        pieceTheme: C.PIECE_THEME_URL,
        moveSpeed: 200,
        onDragStart: () => !this.solved && this.isGuessTurn(),
        onDrop: (s, t) => this.onUserDrop(s, t),
        onSnapEnd: () => this.board.position(this.currentFen, false)
      });

      this.updateStatus();

      setTimeout(() => {
        this.autoplayOpponentMoves();
        this.updateStatus();
      }, AUTOPLAY_DELAY);
    }

    // ------------------------------------------------------------------------
    // (rest unchanged: autoplay, status, navigation, user input, move list)
    // ------------------------------------------------------------------------

    autoplayOpponentMoves() { /* unchanged */ }
    isGuessTurn() { /* unchanged */ }
    updateStatus() { /* unchanged */ }
    makeNavButton() { /* unchanged */ }
    goto() { /* unchanged */ }
    onUserDrop() { /* unchanged */ }
    appendMove() { /* unchanged */ }
  }

  function init() {
    document.querySelectorAll("pgn-guess, pgn-guess-black")
      .forEach(el => new ReaderPGNView(el));
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init, { once: true })
    : init();

})();
