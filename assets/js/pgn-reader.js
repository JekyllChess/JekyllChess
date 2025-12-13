// ============================================================================
// pgn-reader.js — interactive PGN viewer (animated, FIXED random-click bug)
// Uses PGNCore for all parsing and constants
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess === "undefined") return;
  if (typeof Chessboard === "undefined") return;
  if (!window.PGNCore) return;

  const C = PGNCore;

  // --------------------------------------------------------------------------
  // ReaderPGNView
  // --------------------------------------------------------------------------

  class ReaderPGNView {
    constructor(src) {
      this.sourceEl = src;
      this.wrapper = document.createElement("div");
      this.wrapper.className = "pgn-reader-block";
      this.finalResultPrinted = false;
      this.build();
      this.applyFigurines();
    }

    static isSANCore(t) {
      return C.SAN_CORE_REGEX.test(t);
    }

    static split(text) {
      let lines = text.split(/\r?\n/),
        H = [],
        M = [],
        inH = true;

      for (let L of lines) {
        let T = L.trim();
        if (inH && T.startsWith("[") && T.endsWith("]")) H.push(L);
        else if (inH && T === "") inH = false;
        else {
          inH = false;
          M.push(L);
        }
      }

      return {
        headers: H,
        moveText: M.join(" ").replace(/\s+/g, " ").trim()
      };
    }

    build() {
      let raw = this.sourceEl.textContent.trim();
      raw = C.normalizeFigurines(raw);

      const { headers: H, moveText: M } = ReaderPGNView.split(raw);
      const pgn = (H.length ? H.join("\n") + "\n\n" : "") + M;

      const chess = new Chess();
      chess.load_pgn(pgn, { sloppy: true });

      const head = chess.header();
      const res = C.normalizeResult(head.Result || "");
      const needsResult = / (1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(M);
      const movetext = needsResult ? M : M + (res ? " " + res : "");

      // Header
      this.headerDiv = document.createElement("div");
      this.headerDiv.className = "pgn-reader-header";
      this.wrapper.appendChild(this.headerDiv);
      this.headerDiv.appendChild(this.buildHeaderContent(head));

      // Columns
      const cols = document.createElement("div");
      cols.className = "pgn-reader-cols";
      this.wrapper.appendChild(cols);

      this.leftCol = document.createElement("div");
      this.leftCol.className = "pgn-reader-left";
      cols.appendChild(this.leftCol);

      this.movesCol = document.createElement("div");
      this.movesCol.className = "pgn-reader-right";
      cols.appendChild(this.movesCol);

      this.createReaderBoard();
      this.createReaderButtons();
      this.parse(movetext);

      this.sourceEl.replaceWith(this.wrapper);
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

      H.appendChild(document.createTextNode(W + " – " + B));
      H.appendChild(document.createElement("br"));
      H.appendChild(document.createTextNode(line));

      return H;
    }

    createReaderBoard() {
      this.boardDiv = document.createElement("div");
      this.boardDiv.className = "pgn-reader-board";
      this.leftCol.appendChild(this.boardDiv);

      setTimeout(() => {
        ReaderBoard.board = Chessboard(this.boardDiv, {
          position: "start",
          draggable: false,
          pieceTheme: C.PIECE_THEME_URL,
          appearSpeed: 200,
          moveSpeed: 200,
          snapSpeed: 25,
          snapbackSpeed: 50
        });
      }, 0);
    }

    createReaderButtons() {
      const wrap = document.createElement("div");
      wrap.className = "pgn-reader-buttons";

      const prev = document.createElement("button");
      prev.className = "pgn-reader-btn";
      prev.textContent = "◀";
      prev.addEventListener("click", () => ReaderBoard.prev());

      const next = document.createElement("button");
      next.className = "pgn-reader-btn";
      next.textContent = "▶";
      next.addEventListener("click", () => ReaderBoard.next());

      wrap.appendChild(prev);
      wrap.appendChild(next);
      this.leftCol.appendChild(wrap);
    }

    ensure(ctx, cls) {
      if (!ctx.container) {
        const p = document.createElement("p");
        p.className = cls;
        this.movesCol.appendChild(p);
        ctx.container = p;
      }
    }

    handleSAN(tok, ctx) {
      let core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
      if (!ReaderPGNView.isSANCore(core)) return null;

      const mv = ctx.chess.move(core, { sloppy: true });
      if (!mv) return null;

      const span = document.createElement("span");
      span.className = "pgn-move reader-move";
      span.dataset.fen = ctx.chess.fen();
      span.dataset.mainline = ctx.type === "main" ? "1" : "0";
      span.textContent = C.makeCastlingUnbreakable(tok) + " ";
      ctx.container.appendChild(span);

      return span;
    }

    parse(t) {
      const chess = new Chess();
      let ctx = {
        type: "main",
        chess,
        container: null
      };

      t.split(/\s+/).forEach(tok => {
        this.ensure(ctx, "pgn-mainline");
        this.handleSAN(tok, ctx);
      });
    }

    applyFigurines() {
      const map = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };
      this.wrapper.querySelectorAll(".pgn-move").forEach(span => {
        const m = span.textContent.match(/^([KQRBN])(.+?)(\s*)$/);
        if (m) span.textContent = map[m[1]] + m[2] + (m[3] || "");
      });
    }
  }

  // --------------------------------------------------------------------------
  // ReaderBoard — FIXED random-access logic
  // --------------------------------------------------------------------------

  const ReaderBoard = {
    board: null,
    moveSpans: [],
    mainlineMoves: [],
    mainlineIndex: -1,

    collectMoves(root) {
      this.moveSpans = Array.from(
        (root || document).querySelectorAll(".reader-move")
      );
      this.mainlineMoves = this.moveSpans.filter(
        s => s.dataset.mainline === "1"
      );
    },

    goto(index) {
      const span = this.moveSpans[index];
      if (!span) return;

      // 🔴 CRITICAL FIX:
      // Random access → ALWAYS hard-set the position
      this.board.position(span.dataset.fen, false);

      this.moveSpans.forEach(s => s.classList.remove("reader-move-active"));
      span.classList.add("reader-move-active");

      const i = this.mainlineMoves.indexOf(span);
      if (i !== -1) this.mainlineIndex = i;
    },

    next() {
      if (!this.mainlineMoves.length) return;
      this.mainlineIndex = Math.min(
        this.mainlineIndex + 1,
        this.mainlineMoves.length - 1
      );
      this.goto(this.moveSpans.indexOf(this.mainlineMoves[this.mainlineIndex]));
    },

    prev() {
      if (!this.mainlineMoves.length) return;
      this.mainlineIndex = Math.max(this.mainlineIndex - 1, 0);
      this.goto(this.moveSpans.indexOf(this.mainlineMoves[this.mainlineIndex]));
    },

    activate(root) {
      this.collectMoves(root);

      this.moveSpans.forEach((span, idx) => {
        span.style.cursor = "pointer";
        span.addEventListener("click", () => this.goto(idx));
      });
    }
  };

  // --------------------------------------------------------------------------
  // Init
  // --------------------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("pgn-reader").forEach(el => new ReaderPGNView(el));
    ReaderBoard.activate(document);
  });

})();
