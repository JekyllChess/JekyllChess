// ============================================================================
// pgn-reader.js — Interactive PGN viewer (uses PGNCore)
// FINAL PATCH:
//   1) Board starts at initial position (no auto-first-move)
//   2) Animate piece movement on clicks/buttons/keys
// Keeps (unchanged): original parsing, styling, tag stripping, variations, etc.
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
  const unbreak =
    typeof C.makeCastlingUnbreakable === "function"
      ? C.makeCastlingUnbreakable
      : (x) => x;

  // ---------------------------------------------------------------------------
  // Safe chessboard initializer
  // ---------------------------------------------------------------------------

  function safeChessboard(targetEl, options, tries = 30, onReady) {
    const el = targetEl;
    if (!el) {
      if (tries > 0)
        requestAnimationFrame(() =>
          safeChessboard(targetEl, options, tries - 1, onReady)
        );
      return null;
    }

    const rect = el.getBoundingClientRect();
    if ((rect.width <= 0 || rect.height <= 0) && tries > 0) {
      requestAnimationFrame(() =>
        safeChessboard(targetEl, options, tries - 1, onReady)
      );
      return null;
    }

    try {
      const board = Chessboard(el, options);
      if (typeof onReady === "function") onReady(board);
      return board;
    } catch (err) {
      if (tries > 0) {
        requestAnimationFrame(() =>
          safeChessboard(targetEl, options, tries - 1, onReady)
        );
        return null;
      }
      console.warn("pgn-reader.js: Chessboard init failed", err);
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
      if (inHeaders && t.startsWith("[") && t.endsWith("]")) {
        headers.push(line);
      } else if (inHeaders && t === "") {
        inHeaders = false;
      } else {
        inHeaders = false;
        moves.push(line);
      }
    }

    return {
      headers,
      moveText: moves.join(" ").replace(/\s+/g, " ").trim()
    };
  }

  // ===========================================================================
  // Main Class
  // ===========================================================================

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

    // -------------------------------------------------------------------------

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
      const movetext = hasResultAlready
        ? moveText
        : moveText + (res ? " " + res : "");

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
      const white = C.formatPlayer(h.White, h.WhiteElo, h.WhiteTitle);
      const black = C.formatPlayer(h.Black, h.BlackElo, h.BlackTitle);
      const y = C.extractYear(h.Date);
      const meta = (h.Event || "") + (y ? ", " + y : "");

      return C.buildGameHeader({ white, black, meta });
    }

    // -------------------------------------------------------------------------

    initBoardAndControls() {
      this.board = null;

      safeChessboard(
        this.boardDiv,
        {
          position: "start",
          draggable: false,
          pieceTheme: C.PIECE_THEME_URL,
          appearSpeed: 150,
          moveSpeed: "fast",
          snapSpeed: 120,
          snapbackSpeed: 120
        },
        30,
        (board) => {
          this.board = board;
        }
      );

      this.moveSpans = Array.from(
        this.wrapper.querySelectorAll(".reader-move")
      );

      this.mainlineMoves = this.moveSpans.filter(
        (s) => s.dataset.mainline === "1"
      );

      this.mainlineIndex = -1;

      const prevBtn = this.wrapper.querySelector(".pgn-reader-prev");
      const nextBtn = this.wrapper.querySelector(".pgn-reader-next");

      if (prevBtn) prevBtn.addEventListener("click", () => this.prev());
      if (nextBtn) nextBtn.addEventListener("click", () => this.next());

      if (!ReaderPGNView._keysBound) {
        ReaderPGNView._keysBound = true;

        window.addEventListener("keydown", (e) => {
          const tag = (
            e.target && e.target.tagName
              ? e.target.tagName
              : ""
          ).toLowerCase();

          if (tag === "input" || tag === "textarea") return;
          if (!window.__PGNReaderActive) return;

          if (e.key === "ArrowRight") {
            e.preventDefault();
            window.__PGNReaderActive.next();
          }

          if (e.key === "ArrowLeft") {
            e.preventDefault();
            window.__PGNReaderActive.prev();
          }
        });
      }
    }

    // -------------------------------------------------------------------------

    gotoSpan(span) {
      if (!span) return;

      window.__PGNReaderActive = this;

      const fen = span.dataset.fen;

      const apply = () => {
        try {
          if (this.board && typeof this.board.position === "function") {
            this.board.position(fen, true);
          } else {
            requestAnimationFrame(apply);
            return;
          }
        } catch {
          requestAnimationFrame(apply);
          return;
        }

        this.moveSpans.forEach((s) =>
          s.classList.remove("reader-move-active")
        );

        span.classList.add("reader-move-active");

        span.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      };

      apply();
    }

    // -------------------------------------------------------------------------

    next() {
      if (!this.mainlineMoves.length) return;

      if (this.mainlineIndex < 0) {
        this.mainlineIndex = 0;
      } else {
        this.mainlineIndex = Math.min(
          this.mainlineIndex + 1,
          this.mainlineMoves.length - 1
        );
      }

      this.gotoSpan(this.mainlineMoves[this.mainlineIndex]);
    }

    prev() {
      if (!this.mainlineMoves.length) return;

      if (this.mainlineIndex <= 0) {
        this.mainlineIndex = -1;

        const backToStart = () => {
          if (!this.board || typeof this.board.position !== "function") {
            requestAnimationFrame(backToStart);
            return;
          }
          this.board.position("start", true);
        };

        backToStart();

        this.moveSpans.forEach((s) =>
          s.classList.remove("reader-move-active")
        );
        return;
      }

      this.mainlineIndex = Math.max(this.mainlineIndex - 1, 0);
      this.gotoSpan(this.mainlineMoves[this.mainlineIndex]);
    }

    bindMoveClicks() {
      this.moveSpans.forEach((span) => {
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
    document
      .querySelectorAll("pgn-reader")
      .forEach((el) => new ReaderPGNView(el));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

})();
