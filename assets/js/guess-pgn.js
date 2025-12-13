// ============================================================================
// guess-pgn.js — PGN viewer that reveals moves progressively
// Based on pgn-reader.js
// Difference:
//   • Only shows moves/comments/variations up to current board position
//   • Future content is hidden
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function") return;
  if (typeof Chessboard !== "function") return;
  if (!window.PGNCore) return;

  const C = window.PGNCore;
  const unbreak =
    typeof C.makeCastlingUnbreakable === "function"
      ? C.makeCastlingUnbreakable
      : (x) => x;

  // --------------------------------------------------------------------------
  function safeChessboard(targetEl, options, tries = 30, onReady) {
    if (!targetEl) return null;

    const rect = targetEl.getBoundingClientRect();
    if ((rect.width <= 0 || rect.height <= 0) && tries > 0) {
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

  function appendText(el, txt) {
    if (txt) el.appendChild(document.createTextNode(txt));
  }

  function splitPGNText(text) {
    const lines = text.split(/\r?\n/);
    const headers = [];
    const moves = [];
    let inHeaders = true;

    for (const line of lines) {
      const t = line.trim();
      if (inHeaders && t.startsWith("[") && t.endsWith("]")) headers.push(line);
      else if (inHeaders && t === "") inHeaders = false;
      else {
        inHeaders = false;
        moves.push(line);
      }
    }

    return { headers, moveText: moves.join(" ").replace(/\s+/g, " ").trim() };
  }

  // ==========================================================================

  class GuessPGNView {
    constructor(src) {
      if (src.__guessPGNRendered) return;
      src.__guessPGNRendered = true;

      this.sourceEl = src;
      this.wrapper = document.createElement("div");
      this.wrapper.className = "guess-pgn-block";

      this.board = null;
      this.plyCounter = 0;

      this.build();
      this.applyFigurines();
      this.initBoardAndControls();
      this.bindMoveClicks();
      this.updateVisibility();
    }

    static isSANCore(tok) {
      return C.SAN_CORE_REGEX.test(tok);
    }

    // ------------------------------------------------------------------------

    build() {
      let raw = (this.sourceEl.textContent || "").trim();
      raw = C.normalizeFigurines(raw);

      const { headers, moveText } = splitPGNText(raw);
      const pgn = (headers.length ? headers.join("\n") + "\n\n" : "") + moveText;

      const chess = new Chess();
      try { chess.load_pgn(pgn, { sloppy: true }); } catch {}

      let head = {};
      try { head = chess.header(); } catch {}

      const res = C.normalizeResult(head.Result || "");
      const hasResultAlready = / (1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(moveText);
      const movetext = hasResultAlready ? moveText : moveText + (res ? " " + res : "");

      this.wrapper.innerHTML =
        '<div class="guess-pgn-header"></div>' +
        '<div class="guess-pgn-cols">' +
          '<div class="guess-pgn-left">' +
            '<div class="guess-pgn-board"></div>' +
            '<div class="guess-pgn-buttons">' +
              '<button class="guess-pgn-prev">◀</button>' +
              '<button class="guess-pgn-next">▶</button>' +
            '</div>' +
          '</div>' +
          '<div class="guess-pgn-right"></div>' +
        '</div>';

      this.sourceEl.replaceWith(this.wrapper);

      this.headerDiv = this.wrapper.querySelector(".guess-pgn-header");
      this.movesCol = this.wrapper.querySelector(".guess-pgn-right");
      this.boardDiv = this.wrapper.querySelector(".guess-pgn-board");

      this.headerDiv.appendChild(this.buildHeaderContent(head));
      this.parseMovetext(movetext);
    }

    buildHeaderContent(h) {
      const H = document.createElement("h3");
      appendText(
        H,
        `${C.flipName(h.White || "")} – ${C.flipName(h.Black || "")}`
      );
      return H;
    }

    // ------------------------------------------------------------------------

    ensure(ctx, cls) {
      if (!ctx.container) {
        const p = document.createElement("p");
        p.className = cls;
        p.dataset.ply = ctx.currentPly;
        this.movesCol.appendChild(p);
        ctx.container = p;
      }
    }

    parseComment(text, start, ctx) {
      let j = start;
      while (j < text.length && text[j] !== "}") j++;
      let raw = text.substring(start, j).replace(/\[%.*?]/g, "").trim();
      if (text[j] === "}") j++;

      if (!raw) return j;

      const p = document.createElement("p");
      p.className = "pgn-comment";
      p.dataset.ply = ctx.currentPly;
      appendText(p, raw);
      this.movesCol.appendChild(p);

      ctx.container = null;
      ctx.lastWasInterrupt = true;
      return j;
    }

    handleSAN(tok, ctx) {
      const core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
      if (!GuessPGNView.isSANCore(core)) return null;

      ctx.currentPly = this.plyCounter++;
      this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");

      const mv = ctx.chess.move(core, { sloppy: true });
      if (!mv) return null;

      const span = document.createElement("span");
      span.className = "pgn-move guess-move";
      span.textContent = unbreak(tok) + " ";
      span.dataset.fen = ctx.chess.fen();
      span.dataset.ply = ctx.currentPly;
      span.dataset.mainline = ctx.type === "main" ? "1" : "0";

      ctx.container.appendChild(span);
      return span;
    }

    parseMovetext(t) {
      const chess = new Chess();

      let ctx = {
        type: "main",
        chess,
        container: null,
        parent: null,
        lastWasInterrupt: false,
        currentPly: 0
      };

      let i = 0;
      while (i < t.length) {
        const ch = t[i];

        if (ch === "{") {
          i = this.parseComment(t, i + 1, ctx);
          continue;
        }

        if (ch === "(") {
          i++;
          ctx = {
            type: "variation",
            chess: new Chess(ctx.chess.fen()),
            container: null,
            parent: ctx,
            lastWasInterrupt: true,
            currentPly: ctx.currentPly
          };
          continue;
        }

        if (ch === ")") {
          i++;
          ctx = ctx.parent || ctx;
          ctx.container = null;
          continue;
        }

        if (/\s/.test(ch)) { i++; continue; }

        const start = i;
        while (i < t.length && !/\s|[(){}]/.test(t[i])) i++;
        const tok = t.substring(start, i);

        this.handleSAN(tok, ctx);
      }
    }

    // ------------------------------------------------------------------------

    applyFigurines() {
      const map = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };
      this.wrapper.querySelectorAll(".pgn-move").forEach((s) => {
        const m = s.textContent.match(/^([KQRBN])(.+)/);
        if (m) s.textContent = map[m[1]] + m[2];
      });
    }

    initBoardAndControls() {
      safeChessboard(
        this.boardDiv,
        {
          position: "start",
          draggable: false,
          pieceTheme: C.PIECE_THEME_URL
        },
        30,
        (b) => (this.board = b)
      );

      this.moveSpans = Array.from(this.wrapper.querySelectorAll(".guess-move"));
      this.mainlineMoves = this.moveSpans.filter(m => m.dataset.mainline === "1");
      this.mainlineIndex = -1;

      this.wrapper.querySelector(".guess-pgn-next")
        .addEventListener("click", () => this.next());
      this.wrapper.querySelector(".guess-pgn-prev")
        .addEventListener("click", () => this.prev());
    }

    gotoSpan(span) {
      if (!span || !this.board) return;
      this.board.position(span.dataset.fen, true);
      this.mainlineIndex = this.mainlineMoves.indexOf(span);
      this.updateVisibility();
    }

    updateVisibility() {
      const maxPly =
        this.mainlineIndex < 0
          ? -1
          : Number(this.mainlineMoves[this.mainlineIndex].dataset.ply);

      this.wrapper.querySelectorAll("[data-ply]").forEach((el) => {
        el.style.display =
          Number(el.dataset.ply) <= maxPly ? "" : "none";
      });
    }

    next() {
      if (!this.mainlineMoves.length) return;
      this.mainlineIndex =
        this.mainlineIndex < 0 ? 0 :
        Math.min(this.mainlineIndex + 1, this.mainlineMoves.length - 1);
      this.gotoSpan(this.mainlineMoves[this.mainlineIndex]);
    }

    prev() {
      if (this.mainlineIndex <= 0) {
        this.mainlineIndex = -1;
        this.board.position("start", true);
        this.updateVisibility();
        return;
      }
      this.mainlineIndex--;
      this.gotoSpan(this.mainlineMoves[this.mainlineIndex]);
    }

    bindMoveClicks() {
      this.moveSpans.forEach((s) =>
        s.addEventListener("click", () => this.gotoSpan(s))
      );
    }
  }

  // --------------------------------------------------------------------------

  function init() {
    document.querySelectorAll("guess-pgn").forEach(el => new GuessPGNView(el));
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

})();
