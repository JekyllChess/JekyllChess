// ============================================================================
// pgn-reader.js — Interactive PGN viewer (uses PGNCore)
// Patch: safeChessboard() to prevent Chessboard error 1003
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function") {
    console.warn("pgn-reader.js: chess.js missing");
    return;
  }
  if (typeof Chessboard !== "function") {
    console.warn("pgn-reader.js: chessboard.js missing");
    return;
  }
  if (!window.PGNCore) {
    console.error("pgn-reader.js: PGNCore missing");
    return;
  }

  const C = window.PGNCore;
  const unbreak = typeof C.makeCastlingUnbreakable === "function" ? C.makeCastlingUnbreakable : (x) => x;

  // ---- Chessboard 1003 fix (consistent across files) ------------------------
  function safeChessboard(targetEl, options, tries = 30) {
    const el = targetEl;
    if (!el) {
      if (tries > 0) requestAnimationFrame(() => safeChessboard(targetEl, options, tries - 1));
      return null;
    }

    const rect = el.getBoundingClientRect();
    if ((rect.width <= 0 || rect.height <= 0) && tries > 0) {
      requestAnimationFrame(() => safeChessboard(targetEl, options, tries - 1));
      return null;
    }

    try {
      return Chessboard(el, options);
    } catch (err) {
      if (tries > 0) {
        requestAnimationFrame(() => safeChessboard(targetEl, options, tries - 1));
        return null;
      }
      console.warn("pgn-reader.js: Chessboard init failed", err);
      return null;
    }
  }
  // --------------------------------------------------------------------------

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

  class ReaderPGNView {
    constructor(src) {
      if (src.__pgnReaderRendered) return;
      src.__pgnReaderRendered = true;

      this.sourceEl = src;
      this.wrapper = document.createElement("div");
      this.wrapper.className = "pgn-reader-block";
      this.finalResultPrinted = false;

      this.build();
      this.applyFigurines();
      this.initBoardAndControls();
      this.bindMoveClicks();
    }

    static isSANCore(tok) {
      return C.SAN_CORE_REGEX.test(tok);
    }

    build() {
      let raw = (this.sourceEl.textContent || "").trim();
      raw = C.normalizeFigurines(raw);

      const { headers, moveText } = splitPGNText(raw);
      const pgn = (headers.length ? headers.join("\n") + "\n\n" : "") + moveText;

      const chess = new Chess();
      try { chess.load_pgn(pgn, { sloppy: true }); } catch {}

      let head = {};
      try { head = chess.header ? chess.header() : {}; } catch {}

      const res = C.normalizeResult(head.Result || "");
      const hasResultAlready = / (1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(moveText);
      const movetext = hasResultAlready ? moveText : moveText + (res ? " " + res : "");

      this.wrapper.innerHTML =
        '<div class="pgn-reader-header"></div>' +
        '<div class="pgn-reader-cols">' +
          '<div class="pgn-reader-left">' +
            '<div class="pgn-reader-board"></div>' +
            '<div class="pgn-reader-buttons">' +
              '<button class="pgn-reader-btn pgn-reader-prev" type="button">◀</button>' +
              '<button class="pgn-reader-btn pgn-reader-next" type="button">▶</button>' +
            "</div>" +
          "</div>" +
          '<div class="pgn-reader-right"></div>' +
        "</div>";

      this.sourceEl.replaceWith(this.wrapper);

      this.headerDiv = this.wrapper.querySelector(".pgn-reader-header");
      this.movesCol = this.wrapper.querySelector(".pgn-reader-right");
      this.boardDiv = this.wrapper.querySelector(".pgn-reader-board");

      this.headerDiv.appendChild(this.buildHeaderContent(head));
      this.parseMovetext(movetext);
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

    ensure(ctx, cls) {
      if (!ctx.container) {
        const p = document.createElement("p");
        p.className = cls;
        this.movesCol.appendChild(p);
        ctx.container = p;
      }
    }

    parseComment(text, startIndex, ctx) {
      let j = startIndex;
      while (j < text.length && text[j] !== "}") j++;

      let raw = text.substring(startIndex, j).trim();
      if (text[j] === "}") j++;

      raw = raw.replace(/\[%.*?]/g, "").trim();
      if (!raw.length) return j;

      const parts = raw.split("[D]");
      for (let k = 0; k < parts.length; k++) {
        const c = parts[k].trim();
        if (ctx.type === "variation") {
          this.ensure(ctx, "pgn-variation");
          if (c) appendText(ctx.container, " " + c);
        } else {
          if (c) {
            const p = document.createElement("p");
            p.className = "pgn-comment";
            appendText(p, c);
            this.movesCol.appendChild(p);
          }
          ctx.container = null;
        }
      }

      ctx.lastWasInterrupt = true;
      return j;
    }

    handleSAN(tok, ctx) {
      const core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
      if (!ReaderPGNView.isSANCore(core)) {
        appendText(ctx.container, tok + " ");
        return null;
      }

      const base = ctx.baseHistoryLen || 0;
      const count = ctx.chess.history().length;
      const ply = base + count;
      const white = ply % 2 === 0;
      const num = Math.floor(ply / 2) + 1;

      if (white) appendText(ctx.container, num + "." + C.NBSP);
      else if (ctx.lastWasInterrupt) appendText(ctx.container, num + "..." + C.NBSP);

      ctx.prevFen = ctx.chess.fen();
      ctx.prevHistoryLen = ply;

      const mv = ctx.chess.move(core, { sloppy: true });
      if (!mv) {
        appendText(ctx.container, tok + " ");
        return null;
      }

      ctx.lastWasInterrupt = false;

      const span = document.createElement("span");
      span.className = "pgn-move reader-move";
      span.dataset.fen = ctx.chess.fen();
      span.dataset.mainline = ctx.type === "main" ? "1" : "0";
      span.textContent = unbreak(tok) + " ";
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
        prevFen: chess.fen(),
        prevHistoryLen: 0,
        baseHistoryLen: null
      };

      let i = 0;
      while (i < t.length) {
        const ch = t[i];

        if (/\s/.test(ch)) {
          while (i < t.length && /\s/.test(t[i])) i++;
          this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
          appendText(ctx.container, " ");
          continue;
        }

        if (ch === "(") {
          i++;
          const fen = ctx.prevFen || ctx.chess.fen();
          const len = typeof ctx.prevHistoryLen === "number" ? ctx.prevHistoryLen : ctx.chess.history().length;

          ctx = {
            type: "variation",
            chess: new Chess(fen),
            container: null,
            parent: ctx,
            lastWasInterrupt: true,
            prevFen: fen,
            prevHistoryLen: len,
            baseHistoryLen: len
          };
          this.ensure(ctx, "pgn-variation");
          continue;
        }

        if (ch === ")") {
          i++;
          if (ctx.parent) {
            ctx = ctx.parent;
            ctx.lastWasInterrupt = true;
            ctx.container = null;
          }
          continue;
        }

        if (ch === "{") {
          i = this.parseComment(t, i + 1, ctx);
          continue;
        }

        const start = i;
        while (i < t.length && !/\s/.test(t[i]) && !"(){}".includes(t[i])) i++;
        const tok = t.substring(start, i);
        if (!tok) continue;

        if (/^\[%.*]$/.test(tok)) continue;

        if (tok === "[D]") {
          ctx.lastWasInterrupt = true;
          ctx.container = null;
          continue;
        }

        if (C.RESULT_REGEX.test(tok)) {
          if (!this.finalResultPrinted) {
            this.finalResultPrinted = true;
            this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
            appendText(ctx.container, tok + " ");
          }
          continue;
        }

        if (C.MOVE_NUMBER_REGEX.test(tok)) continue;

        const core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
        const san = ReaderPGNView.isSANCore(core);

        if (!san) {
          if (C.EVAL_MAP[tok]) {
            this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
            appendText(ctx.container, C.EVAL_MAP[tok] + " ");
            continue;
          }

          if (tok[0] === "$") {
            const code = +tok.slice(1);
            if (C.NAG_MAP[code]) {
              this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
              appendText(ctx.container, C.NAG_MAP[code] + " ");
            }
            continue;
          }

          if (/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(tok)) {
            if (ctx.type === "variation") {
              this.ensure(ctx, "pgn-variation");
              appendText(ctx.container, " " + tok);
            } else {
              const p = document.createElement("p");
              p.className = "pgn-comment";
              appendText(p, tok);
              this.movesCol.appendChild(p);
              ctx.container = null;
              ctx.lastWasInterrupt = false;
            }
          } else {
            this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
            appendText(ctx.container, tok + " ");
          }

          continue;
        }

        this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
        const m = this.handleSAN(tok, ctx);
        if (!m) appendText(ctx.container, unbreak(tok) + " ");
      }
    }

    applyFigurines() {
      const map = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };
      this.wrapper.querySelectorAll(".pgn-move").forEach(span => {
        const m = span.textContent.match(/^([KQRBN])(.+?)(\s*)$/);
        if (m) span.textContent = map[m[1]] + m[2] + (m[3] || "");
      });
    }

    initBoardAndControls() {
      // Build board safely (prevents 1003)
      this.board = null;
      safeChessboard(this.boardDiv, {
        position: "start",
        draggable: false,
        pieceTheme: C.PIECE_THEME_URL,
        appearSpeed: 200,
        moveSpeed: 200,
        snapSpeed: 25,
        snapbackSpeed: 50
      });

      // Re-bind when board becomes available: we can still position() even if delayed,
      // but chessboard.js instance exists only after safeChessboard succeeds.
      // We'll just re-fetch a moment later.
      const attach = () => {
        try {
          this.board = Chessboard(this.boardDiv);
        } catch {}
      };
      requestAnimationFrame(attach);

      this.moveSpans = Array.from(this.wrapper.querySelectorAll(".reader-move"));
      this.mainlineMoves = this.moveSpans.filter(s => s.dataset.mainline === "1");
      this.mainlineIndex = this.mainlineMoves.length ? 0 : -1;

      const prevBtn = this.wrapper.querySelector(".pgn-reader-prev");
      const nextBtn = this.wrapper.querySelector(".pgn-reader-next");

      prevBtn && prevBtn.addEventListener("click", () => this.prev());
      nextBtn && nextBtn.addEventListener("click", () => this.next());

      if (!ReaderPGNView._keysBound) {
        ReaderPGNView._keysBound = true;
        window.addEventListener("keydown", e => {
          const tag = (e.target && e.target.tagName ? e.target.tagName : "").toLowerCase();
          if (tag === "input" || tag === "textarea") return;
          if (!window.__PGNReaderActive) return;

          if (e.key === "ArrowRight") { e.preventDefault(); window.__PGNReaderActive.next(); }
          if (e.key === "ArrowLeft")  { e.preventDefault(); window.__PGNReaderActive.prev(); }
        });
      }

      if (this.mainlineIndex >= 0) this.gotoSpan(this.mainlineMoves[this.mainlineIndex]);
    }

    gotoSpan(span) {
      if (!span) return;
      window.__PGNReaderActive = this;

      const fen = span.dataset.fen;

      // If board instance isn’t ready yet (because safe init is still retrying),
      // defer this position set a bit.
      const apply = () => {
        try {
          // chessboard.js supports passing element to Chessboard() only on init,
          // but position() exists on the returned instance. If not ready, retry.
          if (this.board && typeof this.board.position === "function") {
            this.board.position(fen, false);
          } else {
            requestAnimationFrame(apply);
            return;
          }
        } catch {
          requestAnimationFrame(apply);
          return;
        }

        this.moveSpans.forEach(s => s.classList.remove("reader-move-active"));
        span.classList.add("reader-move-active");

        const container = this.wrapper.querySelector(".pgn-reader-right");
        if (container) {
          const scrollTo = span.offsetTop - container.offsetTop - container.clientHeight / 3;
          container.scrollTo({ top: scrollTo, behavior: "smooth" });
        }
      };

      apply();
    }

    next() {
      if (!this.mainlineMoves.length) return;
      this.mainlineIndex = Math.min(this.mainlineIndex + 1, this.mainlineMoves.length - 1);
      this.gotoSpan(this.mainlineMoves[this.mainlineIndex]);
    }

    prev() {
      if (!this.mainlineMoves.length) return;
      this.mainlineIndex = Math.max(this.mainlineIndex - 1, 0);
      this.gotoSpan(this.mainlineMoves[this.mainlineIndex]);
    }

    bindMoveClicks() {
      this.moveSpans.forEach(span => {
        span.style.cursor = "pointer";
        span.addEventListener("click", () => {
          const idx = this.mainlineMoves.indexOf(span);
          if (idx !== -1) this.mainlineIndex = idx;
          this.gotoSpan(span);
        });
      });
    }
  }

  function init() {
    document.querySelectorAll("pgn-reader").forEach(el => new ReaderPGNView(el));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
