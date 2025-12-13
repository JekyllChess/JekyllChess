// ============================================================================
// pgn.js — Static PGN blog renderer (uses PGNCore)
// Patch: safeChessboard() to prevent Chessboard error 1003
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function") {
    console.warn("pgn.js: chess.js missing");
    return;
  }
  if (!window.PGNCore) {
    console.error("pgn.js: PGNCore missing");
    return;
  }

  const C = window.PGNCore;
  const HAS_CHESSBOARD = typeof window.Chessboard === "function";

  let diagramCounter = 0;

  // ---- Chessboard 1003 fix (consistent across files) ------------------------
  function safeChessboard(target, options, tries = 30) {
    if (!HAS_CHESSBOARD) return null;

    const el =
      typeof target === "string" ? document.getElementById(target) : target;

    if (!el) {
      if (tries > 0) requestAnimationFrame(() => safeChessboard(target, options, tries - 1));
      return null;
    }

    // must be in DOM & have layout
    const rect = el.getBoundingClientRect();
    if ((rect.width <= 0 || rect.height <= 0) && tries > 0) {
      requestAnimationFrame(() => safeChessboard(target, options, tries - 1));
      return null;
    }

    try {
      return window.Chessboard(el, options);
    } catch (err) {
      // If layout is still not ready, retry a bit (prevents intermittent 1003)
      if (tries > 0) {
        requestAnimationFrame(() => safeChessboard(target, options, tries - 1));
        return null;
      }
      console.warn("pgn.js: Chessboard init failed", err);
      return null;
    }
  }
  // --------------------------------------------------------------------------

  function createDiagram(parent, fen) {
    if (!HAS_CHESSBOARD || !parent || !fen) return;

    const id = "pgn-diagram-" + diagramCounter++;
    const div = document.createElement("div");
    div.className = "pgn-diagram";
    div.id = id;
    parent.appendChild(div);

    safeChessboard(div, {
      position: fen,
      draggable: false,
      pieceTheme: C.PIECE_THEME_URL
    });
  }

  function isSANCore(token) {
    return C.SAN_CORE_REGEX.test(token);
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

  function appendText(el, txt) {
    if (txt) el.appendChild(document.createTextNode(txt));
  }

  class PGNGameView {
    constructor(srcEl) {
      this.sourceEl = srcEl;
      this.wrapper = document.createElement("div");
      this.wrapper.className = "pgn-blog-block";
      this.finalResultPrinted = false;

      this.build();
      this.applyFigurines();
    }

    build() {
      let raw = "";
      try {
        raw = (this.sourceEl.textContent || "").trim();
      } catch {
        return;
      }

      raw = C.normalizeFigurines(raw);

      const { headers, moveText } = splitPGNText(raw);
      const pgn = (headers.length ? headers.join("\n") + "\n\n" : "") + moveText;

      const chess = new Chess();
      try {
        chess.load_pgn(pgn, { sloppy: true });
      } catch {}

      let head = {};
      try {
        head = chess.header ? chess.header() : {};
      } catch {}

      const res = C.normalizeResult((head && head.Result) || "");
      const hasResultAlready = / (1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(moveText);
      const movetext = hasResultAlready ? moveText : moveText + (res ? " " + res : "");

      this.renderHeader(head);
      this.parseMovetext(movetext);

      try {
        this.sourceEl.replaceWith(this.wrapper);
      } catch {
        this.sourceEl.parentNode && this.sourceEl.parentNode.replaceChild(this.wrapper, this.sourceEl);
      }
    }

    renderHeader(h) {
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
      this.wrapper.appendChild(H);
    }

    ensureContainer(ctx, cls) {
      if (!ctx.container) {
        const p = document.createElement("p");
        p.className = cls;
        this.wrapper.appendChild(p);
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
          this.ensureContainer(ctx, "pgn-variation");
          if (c) appendText(ctx.container, " " + c);
        } else {
          if (c) {
            const p = document.createElement("p");
            p.className = "pgn-comment";
            appendText(p, c);
            this.wrapper.appendChild(p);
          }
          ctx.container = null;
        }

        if (k < parts.length - 1) createDiagram(this.wrapper, ctx.chess.fen());
      }

      ctx.lastWasInterrupt = true;
      return j;
    }

    handleSAN(tok, ctx) {
      const core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
      if (!isSANCore(core)) {
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
      span.className = "pgn-move";
      const unbreak = typeof C.makeCastlingUnbreakable === "function" ? C.makeCastlingUnbreakable : (x) => x;
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
          this.ensureContainer(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
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
          this.ensureContainer(ctx, "pgn-variation");
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
          createDiagram(this.wrapper, ctx.chess.fen());
          ctx.lastWasInterrupt = true;
          ctx.container = null;
          continue;
        }

        if (C.RESULT_REGEX.test(tok)) {
          if (!this.finalResultPrinted) {
            this.finalResultPrinted = true;
            this.ensureContainer(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
            appendText(ctx.container, tok + " ");
          }
          continue;
        }

        if (C.MOVE_NUMBER_REGEX.test(tok)) continue;

        const core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
        const san = isSANCore(core);

        if (!san) {
          if (C.EVAL_MAP[tok]) {
            this.ensureContainer(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
            appendText(ctx.container, C.EVAL_MAP[tok] + " ");
            continue;
          }

          if (tok[0] === "$") {
            const code = +tok.slice(1);
            if (C.NAG_MAP[code]) {
              this.ensureContainer(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
              appendText(ctx.container, C.NAG_MAP[code] + " ");
            }
            continue;
          }

          if (/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(tok)) {
            if (ctx.type === "variation") {
              this.ensureContainer(ctx, "pgn-variation");
              appendText(ctx.container, " " + tok);
            } else {
              const p = document.createElement("p");
              p.className = "pgn-comment";
              appendText(p, tok);
              this.wrapper.appendChild(p);
              ctx.container = null;
              ctx.lastWasInterrupt = false;
            }
          } else {
            this.ensureContainer(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
            appendText(ctx.container, tok + " ");
          }

          continue;
        }

        this.ensureContainer(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
        const m = this.handleSAN(tok, ctx);
        if (!m) {
          const unbreak = typeof C.makeCastlingUnbreakable === "function" ? C.makeCastlingUnbreakable : (x) => x;
          appendText(ctx.container, unbreak(tok) + " ");
        }
      }
    }

    applyFigurines() {
      if (this.wrapper.__pgnFigurined) return;
      this.wrapper.__pgnFigurined = true;

      const map = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };
      this.wrapper.querySelectorAll(".pgn-move").forEach(span => {
        const m = span.textContent.match(/^([KQRBN])(.+?)(\s*)$/);
        if (m) span.textContent = map[m[1]] + m[2] + (m[3] || "");
      });
    }
  }

  function renderAll(root) {
    (root || document).querySelectorAll("pgn").forEach(el => {
      if (el.__pgnRendered) return;
      el.__pgnRendered = true;
      new PGNGameView(el);
    });
  }

  function init() {
    renderAll(document);
    window.PGNRenderer = { run: renderAll };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
