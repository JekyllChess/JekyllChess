// ============================================================================
// pgn.js  (blog-style PGN renderer with static diagrams)
// Uses PGNCore utilities for parsing + figurines
// Renders <pgn> elements with:
// - Header
// - Text moves (mainline + variations + comments)
// - Static [D] diagrams using chessboard.js (no animation)
// ============================================================================

(function () {
  "use strict";

  // --------------------------------------------------------------------------
  // Require PGNCore
  // --------------------------------------------------------------------------
  if (!window.PGNCore) {
    console.warn("pgn.js: window.PGNCore is missing");
    return;
  }

  const {
    PIECE_THEME_URL,
    SAN_CORE_REGEX,
    RESULT_REGEX,
    MOVE_NUMBER_REGEX,
    NBSP,
    NAG_MAP,
    EVAL_MAP,
    normalizeResult,
    extractYear,
    flipName,
    normalizeFigurines,
    appendText,
    makeCastlingUnbreakable
  } = window.PGNCore;

  // --------------------------------------------------------------------------
  // Local diagram helper for <pgn> (static, non-interactive)
  // --------------------------------------------------------------------------
  let diagramCounter = 0;

  function createDiagram(wrapper, fen) {
    if (typeof Chessboard === "undefined") {
      console.warn("pgn.js: Chessboard.js missing, cannot create diagram");
      return;
    }

    const id = "pgn-diagram-" + (diagramCounter++);
    const d = document.createElement("div");
    d.className = "pgn-diagram";
    d.id = id;
    wrapper.appendChild(d);

    // Defer to ensure the element is in the DOM
    setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      Chessboard(el, {
        position: fen,
        draggable: false,
        pieceTheme: PIECE_THEME_URL
      });
    }, 0);
  }

  // --------------------------------------------------------------------------
  // PGNGameView  (<pgn>)
  // --------------------------------------------------------------------------
  class PGNGameView {
    constructor(src) {
      this.sourceEl = src;
      this.wrapper = document.createElement("div");
      this.wrapper.className = "pgn-blog-block";
      this.finalResultPrinted = false;
      this.build();
      this.applyFigurines();
    }

    static isSANCore(t) {
      return SAN_CORE_REGEX.test(t);
    }

    static split(t) {
      let lines = t.split(/\r?\n/),
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
      raw = normalizeFigurines(raw);

      let { headers: H, moveText: M } = PGNGameView.split(raw),
        pgn = (H.length ? H.join("\n") + "\n\n" : "") + M,
        chess = new Chess();

      chess.load_pgn(pgn, { sloppy: true });

      let head = chess.header(),
        res = normalizeResult(head.Result || ""),
        needs = / (1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(M),
        movetext = needs ? M : M + (res ? " " + res : "");

      this.header(head);
      this.parse(movetext);

      this.sourceEl.replaceWith(this.wrapper);
    }

    header(h) {
      let W =
          (h.WhiteTitle ? h.WhiteTitle + " " : "") +
          flipName(h.White || "") +
          (h.WhiteElo ? " (" + h.WhiteElo + ")" : ""),
        B =
          (h.BlackTitle ? h.BlackTitle + " " : "") +
          flipName(h.Black || "") +
          (h.BlackElo ? " (" + h.BlackElo + ")" : ""),
        Y = extractYear(h.Date),
        line = (h.Event || "") + (Y ? ", " + Y : "");

      let H = document.createElement("h4");
      H.appendChild(document.createTextNode(W + " – " + B));
      H.appendChild(document.createElement("br"));
      H.appendChild(document.createTextNode(line));
      this.wrapper.appendChild(H);
    }

    ensure(ctx, cls) {
      if (!ctx.container) {
        let p = document.createElement("p");
        p.className = cls;
        this.wrapper.appendChild(p);
        ctx.container = p;
      }
    }

    parseComment(text, i, ctx) {
      let j = i;
      while (j < text.length && text[j] !== "}") j++;
      let raw = text.substring(i, j).trim();
      if (text[j] === "}") j++;

      raw = raw.replace(/\[%.*?]/g, "").trim();
      if (!raw.length) return j;

      if (ctx.type === "main") {
        let k = j;
        while (k < text.length && /\s/.test(text[k])) k++;
        let next = "";
        while (
          k < text.length &&
          !/\s/.test(text[k]) &&
          !"(){}".includes(text[k])
        ) {
          next += text[k++];
        }
        if (RESULT_REGEX.test(next)) {
          raw = raw.replace(/(1-0|0-1|1\/2-1\/2|½-½|\*)$/, "").trim();
        }
      }

      let parts = raw.split("[D]");
      for (let idx = 0; idx < parts.length; idx++) {
        let c = parts[idx].trim();
        if (ctx.type === "variation") {
          this.ensure(ctx, "pgn-variation");
          if (c) appendText(ctx.container, " " + c);
        } else {
          if (c) {
            let p = document.createElement("p");
            p.className = "pgn-comment";
            appendText(p, c);
            this.wrapper.appendChild(p);
          }
          ctx.container = null;
        }

        // For each [D] in a comment, create a static diagram
        if (idx < parts.length - 1) {
          createDiagram(this.wrapper, ctx.chess.fen());
        }
      }

      ctx.lastWasInterrupt = true;
      return j;
    }

    handleSAN(tok, ctx) {
      let core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
      if (!PGNGameView.isSANCore(core)) {
        appendText(ctx.container, tok + " ");
        return null;
      }

      let base = ctx.baseHistoryLen || 0,
        count = ctx.chess.history().length,
        ply = base + count,
        white = ply % 2 === 0,
        num = Math.floor(ply / 2) + 1;

      if (ctx.type === "main") {
        if (white) appendText(ctx.container, num + "." + NBSP);
        else if (ctx.lastWasInterrupt)
          appendText(ctx.container, num + "..." + NBSP);
      } else {
        if (white) appendText(ctx.container, num + "." + NBSP);
        else if (ctx.lastWasInterrupt)
          appendText(ctx.container, num + "..." + NBSP);
      }

      ctx.prevFen = ctx.chess.fen();
      ctx.prevHistoryLen = ply;

      let mv = ctx.chess.move(core, { sloppy: true });
      if (!mv) {
        appendText(ctx.container, tok + " ");
        return null;
      }

      ctx.lastWasInterrupt = false;

      let span = document.createElement("span");
      span.className = "pgn-move";
      span.textContent = makeCastlingUnbreakable(tok) + " ";
      ctx.container.appendChild(span);

      return span;
    }

    parse(t) {
      let chess = new Chess(),
        ctx = {
          type: "main",
          chess: chess,
          container: null,
          parent: null,
          lastWasInterrupt: false,
          prevFen: chess.fen(),
          prevHistoryLen: 0,
          baseHistoryLen: null
        },
        i = 0;

      for (; i < t.length;) {
        let ch = t[i];

        // whitespace
        if (/\s/.test(ch)) {
          while (i < t.length && /\s/.test(t[i])) i++;
          this.ensure(
            ctx,
            ctx.type === "main" ? "pgn-mainline" : "pgn-variation"
          );
          appendText(ctx.container, " ");
          continue;
        }

        // variations
        if (ch === "(") {
          i++;
          let fen = ctx.prevFen || ctx.chess.fen(),
            len =
              typeof ctx.prevHistoryLen === "number"
                ? ctx.prevHistoryLen
                : ctx.chess.history().length;
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

        // comments
        if (ch === "{") {
          i = this.parseComment(t, i + 1, ctx);
          continue;
        }

        // token
        let s = i;
        while (
          i < t.length &&
          !/\s/.test(t[i]) &&
          !"(){}".includes(t[i])
        ) {
          i++;
        }

        let tok = t.substring(s, i);
        if (!tok) continue;

        // ignore engine/meta tags
        if (/^\[%.*]$/.test(tok)) continue;

        // bare [D] outside comments -> static diagram
        if (tok === "[D]") {
          createDiagram(this.wrapper, ctx.chess.fen());
          ctx.lastWasInterrupt = true;
          ctx.container = null;
          continue;
        }

        // result
        if (RESULT_REGEX.test(tok)) {
          if (this.finalResultPrinted) continue;
          this.finalResultPrinted = true;
          this.ensure(
            ctx,
            ctx.type === "main" ? "pgn-mainline" : "pgn-variation"
          );
          appendText(ctx.container, tok + " ");
          continue;
        }

        // move numbers
        if (MOVE_NUMBER_REGEX.test(tok)) continue;

        // SAN or something else?
        let core = tok
            .replace(/[^a-hKQRBN0-9=O0-]+$/g, "")
            .replace(/0/g, "O"),
          isSAN = PGNGameView.isSANCore(core);

        if (!isSAN) {
          // evaluation tokens (=, +/=, etc.)
          if (EVAL_MAP[tok]) {
            this.ensure(
              ctx,
              ctx.type === "main" ? "pgn-mainline" : "pgn-variation"
            );
            appendText(ctx.container, EVAL_MAP[tok] + " ");
            continue;
          }

          // NAGs $1, $2, ...
          if (tok[0] === "$") {
            let code = +tok.slice(1);
            if (NAG_MAP[code]) {
              this.ensure(
                ctx,
                ctx.type === "main" ? "pgn-mainline" : "pgn-variation"
              );
              appendText(ctx.container, NAG_MAP[code] + " ");
            }
            continue;
          }

          // plain text (most likely a word / Turkish text etc.)
          if (/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(tok)) {
            if (ctx.type === "variation") {
              this.ensure(ctx, "pgn-variation");
              appendText(ctx.container, " " + tok);
            } else {
              let p = document.createElement("p");
              p.className = "pgn-comment";
              appendText(p, tok);
              this.wrapper.appendChild(p);
              ctx.container = null;
              ctx.lastWasInterrupt = false;
            }
          } else {
            // numeric stuff etc.
            this.ensure(
              ctx,
              ctx.type === "main" ? "pgn-mainline" : "pgn-variation"
            );
            appendText(ctx.container, tok + " ");
          }
          continue;
        }

        // true SAN move
        this.ensure(
          ctx,
          ctx.type === "main" ? "pgn-mainline" : "pgn-variation"
        );
        let m = this.handleSAN(tok, ctx);
        if (!m) {
          appendText(
            ctx.container,
            makeCastlingUnbreakable(tok) + " "
          );
        }
      }
    }

    applyFigurines() {
      const map = {
        K: "♔",
        Q: "♕",
        R: "♖",
        B: "♗",
        N: "♘"
      };

      this.wrapper.querySelectorAll(".pgn-move").forEach(span => {
        let m = span.textContent.match(/^([KQRBN])(.+?)(\s*)$/);
        if (m) {
          span.textContent = map[m[1]] + m[2] + (m[3] || "");
        }
      });
    }
  }

  // --------------------------------------------------------------------------
  // PGNRenderer
  // --------------------------------------------------------------------------
  class PGNRenderer {
    static renderAll(root) {
      (root || document).querySelectorAll("pgn").forEach(el => {
        new PGNGameView(el);
      });
    }

    static init() {
      if (typeof Chess === "undefined") {
        console.warn("pgn.js: chess.js missing");
        return;
      }
      PGNRenderer.renderAll(document);
      window.PGNRenderer = {
        run(root) {
          PGNRenderer.renderAll(root || document.body);
        }
      };
    }
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", () => PGNRenderer.init())
    : PGNRenderer.init();
})();
