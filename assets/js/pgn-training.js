// ============================================================================
// pgn-training.js — stable, non-blocking, full UI restored
// ============================================================================

(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else fn();
  }

  ready(init);

  function init() {
    if (typeof Chess !== "function") return;
    if (typeof Chessboard !== "function") return;
    if (!window.PGNCore) return;

    document
      .querySelectorAll("pgn-training, pgn-training-black")
      .forEach(el => new TrainingView(el));
  }

  // --------------------------------------------------------------------------
  // Styles
  // --------------------------------------------------------------------------

  function ensureStyles() {
    if (document.getElementById("pgn-training-style")) return;

    const s = document.createElement("style");
    s.id = "pgn-training-style";
    s.textContent = `
      .pgn-training-wrapper { margin-bottom:1.5rem; }
      .pgn-training-header { margin:0 0 .6rem 0; font-weight:600; }
      .pgn-training-cols { display:flex; gap:1rem; align-items:flex-start; }
      .pgn-training-board { width:360px; max-width:100%; }
      .pgn-training-right { flex:1; max-height:420px; overflow-y:auto; }
      .pgn-move-row { font-weight:700; margin-top:.5em; }
      .pgn-move-no { margin-right:.3em; }
      .pgn-move-white { margin-right:.6em; }
      .pgn-move-black { margin-left:.3em; }
      .pgn-comment { font-weight:400; }
      .pgn-training-status span { margin-right:.6em; }
      .pgn-training-actions button { margin-right:.4em; }
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

  function extractHeaders(pgn) {
    const h = {};
    pgn.replace(/^\s*\[(\w+)\s+"([^"]*)"\]\s*$/gm, (_, k, v) => {
      h[k] = v;
    });
    return h;
  }

  function skipVariation(raw, i) {
    let d = 0;
    while (i < raw.length) {
      if (raw[i] === "(") d++;
      else if (raw[i] === ")") {
        d--;
        if (d <= 0) return i + 1;
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
      this.headers = extractHeaders(this.rawText);

      this.flip = src.tagName.toLowerCase() === "pgn-training-black";
      this.userIsWhite = !this.flip;

      this.moves = [];
      this.index = -1;

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

      // ===== HEADING (requested format) =====
      if (this.headers.White && this.headers.Black) {
        const h = document.createElement("h3");
        h.className = "pgn-training-header";

        const year = this.headers.Date
          ? this.headers.Date.slice(0, 4)
          : "";

        const line1 = `${this.headers.White} – ${this.headers.Black}`;

        const line2Parts = [];
        if (this.headers.Event) line2Parts.push(this.headers.Event);
        if (this.headers.Site) line2Parts.push(this.headers.Site);
        if (year) line2Parts.push(year);

        const line2 = line2Parts.join(", ");
        const line3 = this.headers.Opening || "";

        h.innerHTML =
          line1 +
          (line2 ? `<br>${line2}` : "") +
          (line3 ? `<br>${line3}` : "");

        wrap.appendChild(h);
      }

      const cols = document.createElement("div");
      cols.className = "pgn-training-cols";
      cols.innerHTML = `
        <div>
          <div class="pgn-training-board"></div>
          <div class="pgn-training-status">
            <span class="turn"></span>
            <span class="feedback"></span>
            <span class="solved" hidden>🏆 Puzzle solved</span>
            <span class="pgn-training-actions" hidden>
              <button data-act="restart">Restart</button>
              <button data-act="solution">Show solution</button>
              <button data-act="copy">Copy PGN</button>
            </span>
          </div>
        </div>
        <div class="pgn-training-right"></div>
      `;

      wrap.appendChild(cols);
      src.replaceWith(wrap);

      this.boardDiv = cols.querySelector(".pgn-training-board");
      this.rightPane = cols.querySelector(".pgn-training-right");

      this.turnEl = cols.querySelector(".turn");
      this.feedbackEl = cols.querySelector(".feedback");
      this.solvedEl = cols.querySelector(".solved");
      this.actionsEl = cols.querySelector(".pgn-training-actions");
    }

    // ----------------------------------------------------------------------

    initBoard() {
      requestAnimationFrame(() => {
        this.board = Chessboard(this.boardDiv, {
          position: "start",
          orientation: this.flip ? "black" : "white",
          draggable: true,
          pieceTheme: PGNCore.PIECE_THEME_URL,
          onDragStart: () => this.isGuessTurn(),
          onDrop: (s, t) => this.onUserDrop(s, t),
          onSnapEnd: () => this.board.position(this.currentFen, false)
        });
      });
    }

    // ----------------------------------------------------------------------

    parsePGNAsync() {
      const rawAll = PGNCore.normalizeFigurines(this.rawText);
      const raw = stripHeaders(rawAll);

      const resultMatch = rawAll.match(/\b(1-0|0-1|1\/2-1\/2)\b\s*$/);
      this.result = resultMatch ? resultMatch[1] : "";

      const chess = new Chess();
      let i = 0, ply = 0, pending = [];

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
            if (c && this.moves.length) {
              this.moves[this.moves.length - 1].comments.push(c);
            }
            i = j + 1;
            continue;
          }

          if (ch === "(") {
            i = skipVariation(raw, i);
            continue;
          }

          if (/\s/.test(ch)) { i++; continue; }

          const s = i;
          while (i < raw.length && !/\s/.test(raw[i]) && !"(){}".includes(raw[i])) i++;
          const tok = raw.slice(s, i);

          if (/^\d+\.{1,3}$/.test(tok)) continue;

          const san = normalizeSAN(tok);
          if (!san) continue;

          let moved = false;
          try { moved = chess.move(san, { sloppy:true }); } catch {}
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

        this.updateTurn();
        requestAnimationFrame(() => this.autoplayOpponentMoves());
      };

      requestAnimationFrame(step);
    }

    // ----------------------------------------------------------------------

    updateTurn() {
      const n = this.moves[this.index + 1];
      if (!n) return;
      this.turnEl.textContent =
        n.isWhite === this.userIsWhite ? "Your move" : "Opponent thinking…";
    }

    isGuessTurn() {
      const n = this.moves[this.index + 1];
      return n && n.isWhite === this.userIsWhite;
    }

    autoplayOpponentMoves() {
      while (this.index + 1 < this.moves.length) {
        const n = this.moves[this.index + 1];
        if (n.isWhite === this.userIsWhite) break;

        this.index++;
        try { this.game.move(normalizeSAN(n.san), { sloppy:true }); } catch {}
        this.currentFen = n.fen;
        this.board.position(n.fen, true);
        this.appendMove();
      }
      this.updateTurn();
    }

    onUserDrop(source, target) {
      if (!this.isGuessTurn()) return "snapback";

      const expected = this.moves[this.index + 1];
      const legal = this.game.moves({ verbose:true });

      const ok = legal.some(m => {
        if (m.from !== source || m.to !== target) return false;
        const g = new Chess(this.game.fen());
        g.move(m);
        return g.fen() === expected.fen;
      });

      this.feedbackEl.textContent = ok ? "✓ Correct" : "✗ Try again";
      if (!ok) return "snapback";

      this.index++;
      this.game.load(expected.fen);
      this.currentFen = expected.fen;
      this.board.position(expected.fen, false);
      this.appendMove();

      if (this.index === this.moves.length - 1) {
        this.solvedEl.hidden = false;
        this.actionsEl.hidden = false;
      }

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

        m.comments.forEach(c => {
          const s = document.createElement("span");
          s.className = "pgn-comment";
          s.textContent = " " + c;
          row.appendChild(s);
        });
      } else if (this.currentRow) {
        const b = document.createElement("span");
        b.className = "pgn-move-black";
        b.textContent = ` ${m.san}`;
        this.currentRow.appendChild(b);

        if (this.index === this.moves.length - 1) {
          if (m.comments.length) {
            this.currentRow.append(" " + m.comments.join(" "));
          }
          if (this.result) {
            this.currentRow.append(" " + this.result);
          }
        }
      }

      this.rightPane.scrollTop = this.rightPane.scrollHeight;
    }
  }

})();
