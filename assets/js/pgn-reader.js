// ============================================================================
// pgn-reader.js — Interactive PGN viewer (uses PGNCore)
// Board starts at initial position
// Animated navigation
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
  // Safe chessboard init
  // --------------------------------------------------------------------------

  function safeChessboard(targetEl, options, tries = 30, onReady) {
    if (!targetEl) {
      if (tries > 0)
        requestAnimationFrame(() =>
          safeChessboard(targetEl, options, tries - 1, onReady)
        );
      return null;
    }

    const r = targetEl.getBoundingClientRect();
    if ((r.width <= 0 || r.height <= 0) && tries > 0) {
      requestAnimationFrame(() =>
        safeChessboard(targetEl, options, tries - 1, onReady)
      );
      return null;
    }

    try {
      const board = Chessboard(targetEl, options);
      if (onReady) onReady(board);
      return board;
    } catch {
      if (tries > 0)
        requestAnimationFrame(() =>
          safeChessboard(targetEl, options, tries - 1, onReady)
        );
      return null;
    }
  }

  function appendText(el, txt) {
    if (txt) el.appendChild(document.createTextNode(txt));
  }

  // --------------------------------------------------------------------------

  class ReaderPGNView {

    constructor(src) {
      if (src.__pgnReaderRendered) return;
      src.__pgnReaderRendered = true;

      this.sourceEl = src;
      this.wrapper = document.createElement("div");
      this.wrapper.className = "pgn-reader-block";

      this.finalResultPrinted = false;
      this.board = null;

      this.build();
      this.applyFigurines();
      this.initBoardAndControls();
      this.bindMoveClicks();
    }

    static isSANCore(tok) {
      return C.SAN_CORE_REGEX.test(tok);
    }

    // ------------------------------------------------------------------------

    build() {

      const raw = C.normalizeFigurines(
        (this.sourceEl.textContent || "").trim()
      );

      const parts = raw.split(/\r?\n\r?\n/);
      const headerText = parts[0];
      const moveText = parts.slice(1).join(" ");

      const chess = new Chess();
      try { chess.load_pgn(raw, { sloppy: true }); } catch {}

      const head = chess.header ? chess.header() : {};

      const res = C.normalizeResult(head.Result || "");
      const hasRes = / (1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(moveText);
      const movetext = hasRes ? moveText : moveText + (res ? " " + res : "");

      this.wrapper.innerHTML =
        '<div class="pgn-reader-header"></div>' +
        '<div class="pgn-reader-cols">' +
          '<div class="pgn-reader-left">' +
            '<div class="pgn-reader-board"></div>' +
            '<div class="pgn-reader-buttons">' +
              '<button class="pgn-reader-prev">◀</button>' +
              '<button class="pgn-reader-next">▶</button>' +
            '</div>' +
          '</div>' +
          '<div class="pgn-reader-right"></div>' +
        '</div>';

      this.sourceEl.replaceWith(this.wrapper);

      this.headerDiv = this.wrapper.querySelector(".pgn-reader-header");
      this.movesCol = this.wrapper.querySelector(".pgn-reader-right");
      this.boardDiv = this.wrapper.querySelector(".pgn-reader-board");

      this.headerDiv.appendChild(this.buildHeaderContent(head));

      this.parseMovetext(movetext);
    }

    // ------------------------------------------------------------------------

    buildHeaderContent(h) {

      const white = C.formatPlayer(h.White, h.WhiteElo, h.WhiteTitle);
      const black = C.formatPlayer(h.Black, h.BlackElo, h.BlackTitle);

      const y = C.extractYear(h.Date);
      const meta = (h.Event || "") + (y ? ", " + y : "");

      return C.buildGameHeader({ white, black, meta });
    }

    // ------------------------------------------------------------------------

    parseMovetext(text) {

      const chess = new Chess();

      let ctx = {
        type: "main",
        chess,
        container: null,
        lastWasInterrupt: false,
        prevFen: chess.fen(),
        prevHistoryLen: 0,
        baseHistoryLen: null
      };

      let i = 0;

      while (i < text.length) {

        const ch = text[i];

        if (/\s/.test(ch)) {
          while (i < text.length && /\s/.test(text[i])) i++;
          this.ensure(ctx, ctx.type === "main" ? "pgn-mainline" : "pgn-variation");
          appendText(ctx.container, " ");
          continue;
        }

        if (ch === "{") {
          i = this.parseComment(text, i + 1, ctx);
          continue;
        }

        const start = i;
        while (i < text.length && !/\s/.test(text[i])) i++;
        const tok = text.slice(start, i);

        if (!tok) continue;
        if (C.MOVE_NUMBER_REGEX.test(tok)) continue;

        const core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
        if (!ReaderPGNView.isSANCore(core)) continue;

        this.ensure(ctx, "pgn-mainline");
        this.handleSAN(tok, ctx);
      }
    }

    // ------------------------------------------------------------------------

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
      const raw = text.slice(startIndex, j).trim();
      if (text[j] === "}") j++;

      if (!raw) return j;

      const p = document.createElement("p");
      p.className = "pgn-comment";
      p.textContent = raw;
      this.movesCol.appendChild(p);

      ctx.container = null;
      ctx.lastWasInterrupt = true;
      return j;
    }

    handleSAN(tok, ctx) {

      const core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
      const mv = ctx.chess.move(core, { sloppy: true });
      if (!mv) return null;

      const ply = ctx.chess.history().length - 1;
      const white = ply % 2 === 0;
      const num = Math.floor(ply / 2) + 1;

      if (white) appendText(ctx.container, num + "." + C.NBSP);

      const span = document.createElement("span");
      span.className = "pgn-move reader-move";
      span.dataset.fen = ctx.chess.fen();
      span.dataset.mainline = "1";
      span.textContent = unbreak(tok) + " ";
      ctx.container.appendChild(span);

      return span;
    }

    // ------------------------------------------------------------------------

    applyFigurines() {
      const map = { K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘" };
      this.wrapper.querySelectorAll(".pgn-move").forEach(span=>{
        const m=span.textContent.match(/^([KQRBN])(.+)/);
        if(m) span.textContent=map[m[1]]+m[2];
      });
    }

    // ------------------------------------------------------------------------

    initBoardAndControls() {

      safeChessboard(
        this.boardDiv,
        {
          position:"start",
          draggable:false,
          pieceTheme:C.PIECE_THEME_URL,
          moveSpeed:"fast"
        },
        30,
        board => this.board = board
      );

      this.moveSpans = Array.from(
        this.wrapper.querySelectorAll(".reader-move")
      );

      this.mainlineMoves = this.moveSpans;
      this.mainlineIndex = -1;

      const prevBtn = this.wrapper.querySelector(".pgn-reader-prev");
      const nextBtn = this.wrapper.querySelector(".pgn-reader-next");

      prevBtn.onclick = () => this.prev();
      nextBtn.onclick = () => this.next();
    }

    // ------------------------------------------------------------------------

    gotoSpan(span) {

      if (!span || !this.board) return;

      this.board.position(span.dataset.fen, true);

      this.moveSpans.forEach(s=>s.classList.remove("reader-move-active"));
      span.classList.add("reader-move-active");

      span.scrollIntoView({
        behavior:"smooth",
        block:"center"
      });
    }

    next() {
      if (!this.mainlineMoves.length) return;

      if (this.mainlineIndex < 0) this.mainlineIndex = 0;
      else this.mainlineIndex = Math.min(
        this.mainlineIndex + 1,
        this.mainlineMoves.length - 1
      );

      this.gotoSpan(this.mainlineMoves[this.mainlineIndex]);
    }

    prev() {
      if (!this.mainlineMoves.length) return;

      if (this.mainlineIndex <= 0) {
        this.mainlineIndex = -1;
        this.board.position("start", true);
        this.moveSpans.forEach(s=>s.classList.remove("reader-move-active"));
        return;
      }

      this.mainlineIndex--;
      this.gotoSpan(this.mainlineMoves[this.mainlineIndex]);
    }

    bindMoveClicks() {
      this.moveSpans.forEach(span=>{
        span.onclick=()=>{
          const i=this.mainlineMoves.indexOf(span);
          if(i!==-1) this.mainlineIndex=i;
          this.gotoSpan(span);
        };
      });
    }
  }

  function init() {
    document.querySelectorAll("pgn-reader")
      .forEach(el=>new ReaderPGNView(el));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
