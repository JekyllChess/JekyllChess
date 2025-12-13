// ============================================================================
// pgn-guess.js — Guess-the-move PGN viewer (single-move display)
// Features:
//   - Header above board
//   - Single-move display in right pane
//   - Correct comment attachment
//   - Bold move line only
//   - Board flips for <pgn-guess-black>
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

  // --------------------------------------------------------------------------
  // Inject styling once
  function ensureGuessStylesOnce() {
    if (document.getElementById("pgn-guess-style")) return;

    const style = document.createElement("style");
    style.id = "pgn-guess-style";
    style.textContent = `
      .pgn-guess-current-move {
        font-weight: 900 !important;
      }
      .pgn-guess-right .pgn-comment {
        font-weight: 400 !important;
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

  // --------------------------------------------------------------------------
  class ReaderPGNView {
    constructor(src) {
      if (src.__pgnReaderRendered) return;
      src.__pgnReaderRendered = true;

      ensureGuessStylesOnce();

      this.sourceEl = src;
      this.rawText = (src.textContent || "").trim();
      this.flipBoard = src.tagName.toLowerCase() === "pgn-guess-black";

      this.wrapper = document.createElement("div");
      this.wrapper.className = "pgn-guess-block";

      this.moves = []; // { label, fen, comments[] }
      this.index = -1;

      this.build();
      this.parsePGN();
      this.initBoardAndControls();
      this.renderRightPane();
    }

    // ---------- HEADER -------------------------------------------------------
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

    // ---------- BUILD LAYOUT -------------------------------------------------
    build() {
      const chess = new Chess();
      try { chess.load_pgn(this.rawText, { sloppy: true }); } catch {}
      const headers = chess.header ? chess.header() : {};

      const headerWrap = document.createElement("div");
      headerWrap.className = "pgn-guess-header";
      headerWrap.appendChild(this.buildHeaderContent(headers));

      const cols = document.createElement("div");
      cols.className = "pgn-guess-cols";
      cols.innerHTML =
        '<div class="pgn-guess-left">' +
          '<div class="pgn-guess-board"></div>' +
          '<div class="pgn-guess-buttons">' +
            '<button class="pgn-guess-btn pgn-guess-prev" type="button">◀</button>' +
            '<button class="pgn-guess-btn pgn-guess-next" type="button">▶</button>' +
          '</div>' +
        '</div>' +
        '<div class="pgn-guess-right"></div>';

      this.wrapper.appendChild(headerWrap);
      this.wrapper.appendChild(cols);

      this.sourceEl.replaceWith(this.wrapper);

      this.boardDiv = this.wrapper.querySelector(".pgn-guess-board");
      this.rightPane = this.wrapper.querySelector(".pgn-guess-right");
    }

    // ---------- PGN PARSER ---------------------------------------------------
    parsePGN() {
      let raw = C.normalizeFigurines(this.rawText);
      const chess = new Chess();

      let ply = 0;
      let i = 0;
      let inVariation = 0;
      let pendingComments = [];

      const attachComment = (txt) => {
        const cleaned = txt.replace(/\[%.*?]/g, "").trim();
        if (!cleaned) return;

        if (this.moves.length) {
          this.moves[this.moves.length - 1].comments.push(cleaned);
        } else {
          pendingComments.push(cleaned);
        }
      };

      while (i < raw.length) {
        const ch = raw[i];

        if (ch === "(") { inVariation++; i++; continue; }
        if (ch === ")" && inVariation) { inVariation--; i++; continue; }
        if (inVariation) { i++; continue; }

        if (ch === "{") {
          let j = i + 1;
          while (j < raw.length && raw[j] !== "}") j++;
          attachComment(raw.slice(i + 1, j));
          i = j + 1;
          continue;
        }

        if (ch === "[") {
          let j = i + 1;
          while (j < raw.length && raw[j] !== "]") j++;
          i = j + 1;
          continue;
        }

        if (/\s/.test(ch)) { i++; continue; }

        const start = i;
        while (i < raw.length && !/\s/.test(raw[i]) && !"(){}".includes(raw[i])) i++;
        const tok = raw.slice(start, i);

        if (/^\d+\.{1,3}$/.test(tok)) continue;
        if (/^(1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(tok)) continue;
        if (tok[0] === "$") continue;

        const core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
        if (!C.SAN_CORE_REGEX.test(core)) continue;

        const isWhite = ply % 2 === 0;
        const moveNum = Math.floor(ply / 2) + 1;

        const mv = chess.move(core, { sloppy: true });
        if (!mv) continue;

        const label = isWhite
          ? `${moveNum}. ${tok}`
          : `${moveNum}... ${tok}`;

        const entry = {
          label,
          fen: chess.fen(),
          comments: []
        };

        if (pendingComments.length) {
          entry.comments.push(...pendingComments);
          pendingComments = [];
        }

        this.moves.push(entry);
        ply++;
      }
    }

    // ---------- BOARD & CONTROLS --------------------------------------------
    initBoardAndControls() {
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
        (b) => (this.board = b)
      );

      this.wrapper.querySelector(".pgn-guess-next")
        .addEventListener("click", () => this.next());
      this.wrapper.querySelector(".pgn-guess-prev")
        .addEventListener("click", () => this.prev());
    }

    // ---------- RIGHT PANE ---------------------------------------------------
    renderRightPane() {
      this.rightPane.innerHTML = "";

      if (this.index < 0 || this.index >= this.moves.length) return;

      const m = this.moves[this.index];

      const moveLine = document.createElement("div");
      moveLine.className = "pgn-guess-current-move";
      moveLine.textContent = m.label;
      this.rightPane.appendChild(moveLine);

      m.comments.forEach((c) => {
        const p = document.createElement("p");
        p.className = "pgn-comment";
        p.textContent = c;
        this.rightPane.appendChild(p);
      });
    }

    // ---------- NAVIGATION ---------------------------------------------------
    next() {
      if (this.index + 1 >= this.moves.length) return;
      this.index++;

      const apply = () => {
        if (!this.board || typeof this.board.position !== "function") {
          requestAnimationFrame(apply);
          return;
        }
        this.board.position(this.moves[this.index].fen, true);
      };
      apply();

      this.renderRightPane();
    }

    prev() {
      if (this.index < 0) return;
      this.index--;

      const apply = () => {
        if (!this.board || typeof this.board.position !== "function") {
          requestAnimationFrame(apply);
          return;
        }
        if (this.index < 0) this.board.position("start", true);
        else this.board.position(this.moves[this.index].fen, true);
      };
      apply();

      this.renderRightPane();
    }
  }

  // --------------------------------------------------------------------------
  function init() {
    document.querySelectorAll("pgn-guess, pgn-guess-black")
      .forEach((el) => new ReaderPGNView(el));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
