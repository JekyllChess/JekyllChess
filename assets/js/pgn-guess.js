// ============================================================================
// pgn-guess.js — Interactive PGN viewer (uses PGNCore)
// FINAL TYPOGRAPHIC FIX:
//   1) No "X..." for normal Black moves
//   2) "X..." ONLY after interruptions (comments / variations)
//   3) Move list wraps and scrolls vertically
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function") return;
  if (typeof Chessboard !== "function") return;
  if (!window.PGNCore) return;

  const C = window.PGNCore;

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
      const b = Chessboard(targetEl, options);
      onReady && onReady(b);
      return b;
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

      this.sourceEl = src;
      this.wrapper = document.createElement("div");
      this.wrapper.className = "pgn-guess-block";

      this.build();
      this.initBoardAndControls();
      this.hideAll();
    }

    build() {
      let raw = (this.sourceEl.textContent || "").trim();
      raw = C.normalizeFigurines(raw);

      this.wrapper.innerHTML =
        '<div class="pgn-guess-cols">' +
          '<div class="pgn-guess-left">' +
            '<div class="pgn-guess-board"></div>' +
            '<div class="pgn-guess-buttons">' +
              '<button class="pgn-guess-btn pgn-guess-prev">◀</button>' +
              '<button class="pgn-guess-btn pgn-guess-next">▶</button>' +
            '</div>' +
          '</div>' +
          '<div class="pgn-guess-right"></div>' +
        '</div>';

      this.sourceEl.replaceWith(this.wrapper);

      this.boardDiv = this.wrapper.querySelector(".pgn-guess-board");
      this.movesCol = this.wrapper.querySelector(".pgn-guess-right");

      /* FORCE WRAPPING + VERTICAL SCROLL */
      Object.assign(this.movesCol.style, {
        whiteSpace: "normal",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
        overflowY: "auto",
        overflowX: "hidden"
      });

      this.stream = document.createElement("div");
      this.stream.className = "pgn-guess-stream";
      this.movesCol.appendChild(this.stream);

      this.parsePGN(raw);
    }

    parsePGN(text) {
      const chess = new Chess();

      this.items = [];
      this.moveItems = [];

      let ply = 0;
      let i = 0;
      let inVariation = 0;
      let newParagraph = true;

      const makeMove = (label, san, fen) => {
        const span = document.createElement("span");
        span.className = "pgn-move guess-move";
        span.style.display = "none";
        span.dataset.fen = fen;

        if (label) {
          const n = document.createElement("span");
          n.className = "guess-num";
          n.textContent = label;
          span.appendChild(n);
        }

        span.appendChild(document.createTextNode(san + " "));
        this.stream.appendChild(span);
        this.items.push(span);
        this.moveItems.push(span);
        newParagraph = false;
      };

      const makeComment = (txt) => {
        const p = document.createElement("p");
        p.className = "pgn-comment";
        p.textContent = txt;
        p.style.display = "none";
        this.stream.appendChild(p);
        this.items.push(p);
        newParagraph = true;
      };

      while (i < text.length) {
        const ch = text[i];

        if (ch === "(") { inVariation++; i++; newParagraph = true; continue; }
        if (ch === ")" && inVariation) { inVariation--; i++; continue; }
        if (inVariation) { i++; continue; }

        if (ch === "{") {
          let j = i + 1;
          while (j < text.length && text[j] !== "}") j++;
          const raw = text.slice(i + 1, j).replace(/\[%.*?]/g, "").trim();
          if (raw) makeComment(raw);
          i = j + 1;
          continue;
        }

        if (/\s/.test(ch)) { i++; continue; }

        const start = i;
        while (i < text.length && !/\s/.test(text[i]) && !"(){}".includes(text[i])) i++;
        const tok = text.slice(start, i);

        if (/^\d+\.{1,3}$/.test(tok)) continue;
        if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) continue;

        const core = tok.replace(/[^a-hKQRBN0-9=O0-]+$/g, "").replace(/0/g, "O");
        if (!C.SAN_CORE_REGEX.test(core)) continue;

        const isWhite = ply % 2 === 0;
        const moveNum = Math.floor(ply / 2) + 1;

        const mv = chess.move(core, { sloppy: true });
        if (!mv) continue;

        let label = null;
        if (isWhite) label = moveNum + ". ";
        else if (newParagraph) label = moveNum + "... ";

        makeMove(label, tok, chess.fen());
        ply++;
      }

      this.mainlineIndex = -1;
    }

    initBoardAndControls() {
      safeChessboard(
        this.boardDiv,
        {
          position: "start",
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

    hideAll() {
      this.items.forEach((el) => (el.style.display = "none"));
    }

    revealThroughMoveIndex(idx) {
      let shown = 0;
      for (const el of this.items) {
        if (el.classList.contains("guess-move")) {
          if (shown > idx) break;
          shown++;
        }
        el.style.display = "";
      }
    }

    next() {
      if (this.mainlineIndex + 1 >= this.moveItems.length) return;
      this.mainlineIndex++;
      this.revealThroughMoveIndex(this.mainlineIndex);
      this.board.position(this.moveItems[this.mainlineIndex].dataset.fen, true);
    }

    prev() {
      if (this.mainlineIndex < 0) return;
      this.mainlineIndex--;
      this.revealThroughMoveIndex(this.mainlineIndex);
      this.board.position(
        this.mainlineIndex < 0
          ? "start"
          : this.moveItems[this.mainlineIndex].dataset.fen,
        true
      );
    }
  }

  function init() {
    document.querySelectorAll("pgn-guess")
      .forEach((el) => new ReaderPGNView(el));
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init, { once: true })
    : init();
})();
