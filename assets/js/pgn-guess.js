// ============================================================================
// pgn-guess.js — Interactive PGN viewer (uses PGNCore)
// Progressive reveal:
//   - Load: board at start, right pane empty
//   - ▶ reveals next move (and its move number when White) + animates board
//   - ◀ hides moves backward and rewinds board
// Fixes implemented:
//   1) Proper move numbers: "1. e4 c5 2. c3 d5 ..."
//   2) Moves wrap + scroll vertically (no horizontal run-on)
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function") return;
  if (typeof Chessboard !== "function") return;
  if (!window.PGNCore) return;

  const C = window.PGNCore;

  // ---- Chessboard 1003 fix (consistent across files) ------------------------
  function safeChessboard(targetEl, options, tries = 30, onReady) {
    const el = targetEl;
    if (!el) return null;

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
      this.wrapper.className = "pgn-guess-block";

      this.board = null;

      this.build();
      this.initBoardAndControls();
      this.bindMoveClicks();

      // 🔒 start with an empty right pane (everything hidden)
      this._hideAll();
      this._syncMoveContainerVisibility();
    }

    static isSANCore(tok) {
      return C.SAN_CORE_REGEX.test(tok);
    }

    build() {
      let raw = (this.sourceEl.textContent || "").trim();
      raw = C.normalizeFigurines(raw);

      const { moveText } = splitPGNText(raw);

      this.wrapper.innerHTML =
        '<div class="pgn-guess-header"></div>' +
        '<div class="pgn-guess-cols">' +
          '<div class="pgn-guess-left">' +
            '<div class="pgn-guess-board"></div>' +
            '<div class="pgn-guess-buttons">' +
              '<button class="pgn-guess-btn pgn-guess-prev" type="button">◀</button>' +
              '<button class="pgn-guess-btn pgn-guess-next" type="button">▶</button>' +
            "</div>" +
          "</div>" +
          '<div class="pgn-guess-right"></div>' +
        "</div>";

      this.sourceEl.replaceWith(this.wrapper);

      this.movesCol = this.wrapper.querySelector(".pgn-guess-right");
      this.boardDiv = this.wrapper.querySelector(".pgn-guess-board");

      // Force wrapping + vertical scrolling (in case site CSS sets nowrap)
      if (this.movesCol) {
        this.movesCol.style.whiteSpace = "normal";
        this.movesCol.style.overflowX = "hidden";
        this.movesCol.style.overflowY = "auto";
        this.movesCol.style.wordBreak = "break-word";
        this.movesCol.style.overflowWrap = "anywhere";
      }

      // A dedicated stream container (so we can show/hide it cleanly)
      this.stream = document.createElement("div");
      this.stream.className = "pgn-guess-stream";
      this.stream.style.whiteSpace = "normal";
      this.stream.style.wordBreak = "break-word";
      this.stream.style.overflowWrap = "anywhere";
      this.movesCol.appendChild(this.stream);

      this.parseMovetext(moveText);
    }

    _mkSpan(cls, text) {
      const s = document.createElement("span");
      s.className = cls;
      s.textContent = text;
      return s;
    }

    parseMovetext(t) {
      const chess = new Chess();

      // We'll build:
      //   [numSpan(hidden)] [moveSpan(hidden)] [space]
      // with correct move numbers for White moves: "1. ", "2. ", ...
      this.moveSpans = [];
      this.numSpans = [];

      let ply = 0; // 0-based ply count
      let i = 0;

      while (i < t.length) {
        // skip whitespace
        if (/\s/.test(t[i])) { i++; continue; }

        // read token
        const start = i;
        while (i < t.length && !/\s/.test(t[i])) i++;
        let tok = t.slice(start, i);

        // ignore bracket tokens and move numbers/results crudely (PGNCore regexes exist, but keep minimal)
        if (!tok) continue;
        if (/^\[%.*]$/.test(tok)) continue;
        if (/^\d+\.+$/.test(tok)) continue; // "1." "1..." etc
        if (/^(1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(tok)) continue;

        const core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
        if (!ReaderPGNView.isSANCore(core)) continue;

        const isWhite = (ply % 2 === 0);
        const moveNum = Math.floor(ply / 2) + 1;

        // move number span (only for White moves, as requested)
        let numSpan = null;
        if (isWhite) {
          numSpan = this._mkSpan("pgn-movenum guess-num", moveNum + ". ");
          numSpan.style.display = "none";
          this.stream.appendChild(numSpan);
          this.numSpans.push(numSpan);
        } else {
          this.numSpans.push(null);
        }

        // make the move on chess to store resulting FEN
        const ok = chess.move(core, { sloppy: true });
        if (!ok) continue;

        // move span
        const moveSpan = this._mkSpan("pgn-move guess-move", tok + " ");
        moveSpan.dataset.fen = chess.fen();
        moveSpan.dataset.ply = String(ply);
        moveSpan.dataset.isWhite = isWhite ? "1" : "0";
        moveSpan.style.display = "none";
        this.stream.appendChild(moveSpan);

        this.moveSpans.push(moveSpan);
        ply++;
      }

      // mainline for this simplified progressive view
      this.mainlineMoves = this.moveSpans;
      this.mainlineIndex = -1;
    }

    initBoardAndControls() {
      safeChessboard(
        this.boardDiv,
        {
          position: "start",
          draggable: false,
          pieceTheme: C.PIECE_THEME_URL,
          appearSpeed: 200,
          moveSpeed: 200,
          snapSpeed: 25,
          snapbackSpeed: 50
        },
        30,
        (board) => (this.board = board)
      );

      const prevBtn = this.wrapper.querySelector(".pgn-guess-prev");
      const nextBtn = this.wrapper.querySelector(".pgn-guess-next");

      prevBtn && prevBtn.addEventListener("click", () => this.prev());
      nextBtn && nextBtn.addEventListener("click", () => this.next());
    }

    _hideAll() {
      if (this.numSpans) this.numSpans.forEach((n) => { if (n) n.style.display = "none"; });
      if (this.moveSpans) this.moveSpans.forEach((m) => { if (m) m.style.display = "none"; });
      if (this.moveSpans) this.moveSpans.forEach((s) => s.classList.remove("guess-move-active"));
    }

    _syncMoveContainerVisibility() {
      // Right pane should look empty until we reveal at least one move.
      const anyVisible =
        (this.numSpans && this.numSpans.some((n) => n && n.style.display !== "none")) ||
        (this.moveSpans && this.moveSpans.some((m) => m && m.style.display !== "none"));

      if (this.stream) this.stream.style.display = anyVisible ? "" : "none";
    }

    _revealIndex(idx) {
      const span = this.mainlineMoves[idx];
      if (!span) return;

      const ply = +span.dataset.ply;
      const isWhite = span.dataset.isWhite === "1";

      // show move number if it's a White move
      if (isWhite) {
        const numSpan = this.numSpans[ply];
        if (numSpan) numSpan.style.display = "";
      }

      // show move span
      span.style.display = "";
      this.moveSpans.forEach((s) => s.classList.remove("guess-move-active"));
      span.classList.add("guess-move-active");

      // board animation
      const apply = () => {
        if (!this.board || typeof this.board.position !== "function") {
          requestAnimationFrame(apply);
          return;
        }
        this.board.position(span.dataset.fen, true);
      };
      apply();

      // keep last revealed move in view (vertical scroll)
      if (this.movesCol) {
        const top = span.offsetTop - this.movesCol.offsetTop - this.movesCol.clientHeight / 3;
        this.movesCol.scrollTo({ top, behavior: "smooth" });
      }

      this._syncMoveContainerVisibility();
    }

    next() {
      if (!this.mainlineMoves || !this.mainlineMoves.length) return;
      if (this.mainlineIndex + 1 >= this.mainlineMoves.length) return;

      this.mainlineIndex++;
      this._revealIndex(this.mainlineIndex);
    }

    prev() {
      if (!this.mainlineMoves || !this.mainlineMoves.length) return;
      if (this.mainlineIndex < 0) return;

      const span = this.mainlineMoves[this.mainlineIndex];
      const ply = +span.dataset.ply;
      const isWhite = span.dataset.isWhite === "1";

      // hide current move
      span.style.display = "none";
      span.classList.remove("guess-move-active");

      // if we are hiding a White move, also hide its move number
      if (isWhite) {
        const numSpan = this.numSpans[ply];
        if (numSpan) numSpan.style.display = "none";
      }

      this.mainlineIndex--;

      // board goes to start or previous visible position
      const apply = () => {
        if (!this.board || typeof this.board.position !== "function") {
          requestAnimationFrame(apply);
          return;
        }

        if (this.mainlineIndex < 0) {
          this.board.position("start", true);
        } else {
          const prevSpan = this.mainlineMoves[this.mainlineIndex];
          this.board.position(prevSpan.dataset.fen, true);
          prevSpan.classList.add("guess-move-active");
        }
      };
      apply();

      this._syncMoveContainerVisibility();
    }

    bindMoveClicks() {
      // keep as-is for your “guess” flow: no click-to-jump
      // (If you later want: allow clicks only on revealed moves, tell me.)
    }
  }

  function init() {
    document.querySelectorAll("pgn-guess").forEach((el) => new ReaderPGNView(el));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
