// ============================================================================
// pgn-training.js — hardened, non-blocking, crash-proof
// ============================================================================

(function () {
  "use strict";

  // --------------------------------------------------------------------------
  // Guard: never block page load
  // --------------------------------------------------------------------------

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  onReady(init);

  function init() {
    try {
      if (typeof Chess !== "function") return;
      if (typeof Chessboard !== "function") return;
      if (!window.PGNCore) return;

      document
        .querySelectorAll("pgn-training, pgn-training-black")
        .forEach(el => new TrainingView(el));
    } catch (e) {
      console.error("pgn-training init failed:", e);
    }
  }

  // --------------------------------------------------------------------------
  // Styles (safe, injected once)
  // --------------------------------------------------------------------------

  function ensureStyles() {
    if (document.getElementById("pgn-training-style")) return;

    const s = document.createElement("style");
    s.id = "pgn-training-style";
    s.textContent = `
      .pgn-training-wrapper { margin-bottom:1.2rem; }
      .pgn-training-cols { display:flex; gap:1rem; align-items:flex-start; }
      .pgn-training-board { width:360px; max-width:100%; }
      .pgn-training-right { flex:1; max-height:420px; overflow-y:auto; }
      .pgn-move-row { font-weight:700; margin-top:.5em; }
      .pgn-move-no { margin-right:.3em; }
      .pgn-move-white { margin-right:.6em; }
      .pgn-move-black { margin-left:.3em; }
      .pgn-comment { font-weight:400; }
      .pgn-training-status { font-size:.9em; margin-top:.4em; }
    `;
    document.head.appendChild(s);
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  function normalizeSAN(tok) {
    return String(tok || "")
      .replace(/\[%.*?]/g, "")
      .replace(/\[D\]/g, "")
      .replace(/[{}]/g, "")
      .replace(/[!?]+/g, "")
      .replace(/[+#]$/, "")
      .replace(/0/g, "O")
      .trim();
  }

  function sanitizeComment(t) {
    const c = String(t || "")
      .replace(/\[%.*?]/g, "")
      .replace(/\[D\]/g, "")
      .replace(/[{}]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return c || null;
  }

  function stripHeaders(pgn) {
    return pgn.replace(/^\s*\[[^\]]*\]\s*$/gm, "");
  }

  function skipVariation(raw, i) {
    let depth = 0;
    while (i < raw.length) {
      if (raw[i] === "(") depth++;
      else if (raw[i] === ")") {
        depth--;
        if (depth <= 0) return i + 1;
      }
      i++;
    }
    return i;
  }

  // --------------------------------------------------------------------------
  // Main class
  // --------------------------------------------------------------------------

  class TrainingView {
    constructor(src) {
      ensureStyles();

      this.rawText = (src.textContent || "").trim();
      this.flip = src.tagName.toLowerCase() === "pgn-training-black";
      this.userIsWhite = !this.flip;

      this.moves = [];
      this.index = -1;
      this.currentRow = null;
      this.rowHasComment = false;

      this.game = new Chess();
      this.currentFen = "start";

      this.build(src);
      this.initBoard();
      this.parsePGNAsync();
    }

    // ----------------------------------------------------------------------

    build(src) {
      const wrap = document.createElement("div");
      wrap.className = "pgn-training-wrapper";

      const cols = document.createElement("div");
      cols.className = "pgn-training-cols";
      cols.innerHTML = `
        <div>
          <div class="pgn-training-board"></div>
          <div class="pgn-training-status">Loading…</div>
        </div>
        <div class="pgn-training-right"></div>
      `;

      wrap.appendChild(cols);
      src.replaceWith(wrap);

      this.boardDiv = cols.querySelector(".pgn-training-board");
      this.statusEl = cols.querySelector(".pgn-training-status");
      this.rightPane = cols.querySelector(".pgn-training-right");
    }

    // ----------------------------------------------------------------------

    initBoard() {
      const init = () => {
        try {
          this.board = Chessboard(this.boardDiv, {
            position: "start",
            orientation: this.flip ? "black" : "white",
            draggable: true,
            pieceTheme: PGNCore.PIECE_THEME_URL,
            onDragStart: () => this.isGuessTurn(),
            onDrop: (s, t) => this.onUserDrop(s, t),
            onSnapEnd: () => {
              if (this.board) this.board.position(this.currentFen, false);
            }
          });
        } catch (e) {
          console.error("board init failed:", e);
        }
      };

      requestAnimationFrame(init);
    }

    // ----------------------------------------------------------------------

    parsePGNAsync() {
      const raw = stripHeaders(
        PGNCore.normalizeFigurines(this.rawText)
      );

      const chess = new Chess();
      let i = 0, ply = 0;
      let pending = [];

      const step = () => {
        const start = performance.now();

        while (i < raw.length) {
          if (performance.now() - start > 8) {
            requestAnimationFrame(step);
            return;
          }

          const ch = raw[i];

          if (ch === "{") {
            let j = i + 1;
            while (j < raw.length && raw[j] !== "}") j++;
            const c = sanitizeComment(raw.slice(i + 1, j));
            if (c && this.moves.length)
              this.moves[this.moves.length - 1].comments.push(c);
            pending = [];
            i = j + 1;
            continue;
          }

          if (ch === "(") {
            i = skipVariation(raw, i);
            continue;
          }

          if (/\s/.test(ch)) {
            i++;
            continue;
          }

          const s = i;
          while (i < raw.length && !/\s/.test(raw[i]) && !"(){}".includes(raw[i])) i++;
          const tok = raw.slice(s, i);

          if (/^\d+\.{1,3}$/.test(tok)) continue;

          const san = normalizeSAN(tok);
          if (!san) continue;

          let moved = false;
          try {
            moved = chess.move(san, { sloppy: true });
          } catch (_) {
            moved = false;
          }
          if (!moved) continue;

          this.moves.push({
            isWhite: ply % 2 === 0,
            moveNo: Math.floor(ply / 2) + 1,
            san: tok,
            fen: chess.fen(),
            comments: pending.splice(0)
          });

          ply++;
        }

        this.statusEl.textContent = "Ready.";
        requestAnimationFrame(() => this.autoplayOpponentMoves());
      };

      requestAnimationFrame(step);
    }

    // ----------------------------------------------------------------------

    isGuessTurn() {
      const n = this.moves[this.index + 1];
      return n && n.isWhite === this.userIsWhite;
    }

    autoplayOpponentMoves() {
      if (!this.board) return;

      while (this.index + 1 < this.moves.length) {
        const n = this.moves[this.index + 1];
        if (n.isWhite === this.userIsWhite) break;

        this.index++;
        try {
          this.game.move(normalizeSAN(n.san), { sloppy: true });
        } catch (_) {}

        this.currentFen = n.fen;
        this.board.position(n.fen, true);
        this.appendMove();
      }
    }

    onUserDrop(source, target) {
      if (!this.isGuessTurn()) return "snapback";
      if (source === target) return "snapback";

      const expected = this.moves[this.index + 1];
      if (!expected) return "snapback";

      const legal = this.game.moves({ verbose: true });
      const ok = legal.some(m => {
        if (m.from !== source || m.to !== target) return false;
        try {
          const g = new Chess(this.game.fen());
          g.move(m);
          return g.fen() === expected.fen;
        } catch (_) {
          return false;
        }
      });

      if (!ok) return "snapback";

      this.index++;
      this.game.load(expected.fen);
      this.currentFen = expected.fen;
      this.board.position(expected.fen, false);
      this.appendMove();

      setTimeout(() => this.autoplayOpponentMoves(), 500);
    }

    // ----------------------------------------------------------------------

    appendMove() {
      const m = this.moves[this.index];
      if (!m) return;

      if (m.isWhite) {
        const row = document.createElement("div");
        row.className = "pgn-move-row";
        row.innerHTML =
          `<span class="pgn-move-no">${m.moveNo}.</span>` +
          `<span class="pgn-move-white">${m.san}</span>`;
        this.rightPane.appendChild(row);
        this.currentRow = row;
        this.rowHasComment = false;

        m.comments.forEach(c => {
          this.rowHasComment = true;
          const span = document.createElement("span");
          span.className = "pgn-comment";
          span.textContent = " " + c;
          row.appendChild(span);
        });
      } else if (this.currentRow) {
        const b = document.createElement("span");
        b.className = "pgn-move-black";
        b.textContent = this.rowHasComment
          ? ` ${m.moveNo}... ${m.san}`
          : ` ${m.san}`;
        this.currentRow.appendChild(b);
        this.rowHasComment = false;
      }

      this.rightPane.scrollTop = this.rightPane.scrollHeight;
    }
  }

})();
