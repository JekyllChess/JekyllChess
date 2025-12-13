// ============================================================================
// pgn-guess.js — Guess-the-move PGN viewer (single-move display)
// FINAL INITIALIZATION RULES:
//   - <pgn-guess>        → start from initial position
//   - <pgn-guess-black>  → auto-play White's first move on load
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function") return;
  if (typeof Chessboard !== "function") return;
  if (!window.PGNCore) return;

  const C = window.PGNCore;

  function appendText(el, txt) {
    if (txt) el.appendChild(document.createTextNode(txt));
  }

  function ensureGuessStylesOnce() {
    if (document.getElementById("pgn-guess-style")) return;
    const style = document.createElement("style");
    style.id = "pgn-guess-style";
    style.textContent = `
      .pgn-guess-current-move { font-weight: 900 !important; }
      .pgn-guess-right .pgn-comment { font-weight: 400 !important; }
    `;
    document.head.appendChild(style);
  }

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

  class ReaderPGNView {
    constructor(src) {
      if (src.__pgnReaderRendered) return;
      src.__pgnReaderRendered = true;

      ensureGuessStylesOnce();

      this.sourceEl = src;
      this.rawText = (src.textContent || "").trim();
      this.flipBoard = src.tagName.toLowerCase() === "pgn-guess-black";
      this.userIsWhite = !this.flipBoard;

      this.moves = [];
      this.index = -1;

      this.build();
      this.parsePGN();
      this.initBoard();
    }

    buildHeaderContent(h) {
      const H = document.createElement("h3");
      const W =
        (h.WhiteTitle ? h.WhiteTitle + " " : "") +
        C.flipName(h.White || "") +
        (h.WhiteElo ? " (" + h.WhiteElo + ")" : "");
      const B =
        (h.BlackTitle ? h.BlackTitle + " " : "") +
        C.flipName(h.Black || "") +
        (h.BlackElo ? " (" + h.BlackElo + ")" : "");
      const Y = C.extractYear(h.Date);
      const line = (h.Event || "") + (Y ? ", " + Y : "");
      appendText(H, W + " – " + B);
      H.appendChild(document.createElement("br"));
      appendText(H, line);
      return H;
    }

    build() {
      const chess = new Chess();
      try { chess.load_pgn(this.rawText, { sloppy: true }); } catch {}
      const headers = chess.header ? chess.header() : {};

      const header = document.createElement("div");
      header.className = "pgn-guess-header";
      header.appendChild(this.buildHeaderContent(headers));

      const cols = document.createElement("div");
      cols.className = "pgn-guess-cols";
      cols.innerHTML =
        '<div class="pgn-guess-left">' +
          '<div class="pgn-guess-board"></div>' +
          '<div class="pgn-guess-buttons">' +
            '<button class="pgn-guess-btn pgn-guess-next">▶</button>' +
          '</div>' +
        '</div>' +
        '<div class="pgn-guess-right"></div>';

      const wrapper = document.createElement("div");
      wrapper.className = "pgn-guess-block";
      wrapper.appendChild(header);
      wrapper.appendChild(cols);

      this.sourceEl.replaceWith(wrapper);

      this.boardDiv = wrapper.querySelector(".pgn-guess-board");
      this.rightPane = wrapper.querySelector(".pgn-guess-right");
      this.nextBtn = wrapper.querySelector(".pgn-guess-next");
    }

    parsePGN() {
      let raw = C.normalizeFigurines(this.rawText);
      const chess = new Chess();

      let ply = 0, i = 0, inVar = 0, pending = [];

      const attach = (t) => {
        const c = t.replace(/\[%.*?]/g, "").trim();
        if (!c) return;
        if (this.moves.length) this.moves[this.moves.length - 1].comments.push(c);
        else pending.push(c);
      };

      while (i < raw.length) {
        const ch = raw[i];

        if (ch === "(") { inVar++; i++; continue; }
        if (ch === ")" && inVar) { inVar--; i++; continue; }
        if (inVar) { i++; continue; }

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
        if (/^(1-0|0-1|½-½|\*)$/.test(tok)) continue;

        const core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
        if (!C.SAN_CORE_REGEX.test(core)) continue;

        const isWhite = ply % 2 === 0;
        const num = Math.floor(ply / 2) + 1;
        const mv = chess.move(core, { sloppy: true });
        if (!mv) continue;

        this.moves.push({
          isWhite,
          label: isWhite ? `${num}. ${tok}` : `${num}... ${tok}`,
          fen: chess.fen(),
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
          draggable: false,
          pieceTheme: C.PIECE_THEME_URL,
          moveSpeed: 200
        },
        30,
        (b) => {
          this.board = b;

          // ⭐ INITIAL AUTO-PLAY RULE
          if (this.flipBoard && this.moves.length && this.moves[0].isWhite) {
            this.index = 0;
            this.board.position(this.moves[0].fen, true);
          }
        }
      );

      this.nextBtn.addEventListener("click", () => this.nextUserMove());
    }

    renderRightPane() {
      this.rightPane.innerHTML = "";
      if (this.index < 0) return;

      const m = this.moves[this.index];
      const div = document.createElement("div");
      div.className = "pgn-guess-current-move";
      div.textContent = m.label;
      this.rightPane.appendChild(div);

      m.comments.forEach((c) => {
        const p = document.createElement("p");
        p.className = "pgn-comment";
        p.textContent = c;
        this.rightPane.appendChild(p);
      });
    }

    nextUserMove() {
      while (true) {
        if (this.index + 1 >= this.moves.length) return;
        this.index++;

        const m = this.moves[this.index];
        const isUserMove = m.isWhite === this.userIsWhite;

        if (!isUserMove) {
          this.board.position(m.fen, true);
          continue;
        }

        this.renderRightPane();
        return;
      }
    }
  }

  function init() {
    document.querySelectorAll("pgn-guess, pgn-guess-black")
      .forEach((el) => new ReaderPGNView(el));
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init, { once: true })
    : init();
})();
