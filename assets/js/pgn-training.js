// ============================================================================
// pgn-training.js — stable + correct turn flag + richer comments/variations
// Fixes requested:
// 1) Show final variation text + "White resigns. 0-1" after last move
// 2) Triangle buttons not black: color inherits / #333
// 3) ◀ ▶ slightly smaller
// 4) Header format: "First Last (Elo) – GM First Last (Elo)" + "Event, Opening"
// 5) Header sits ABOVE the 2-column layout (outside flex row)
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

      /* move list slightly shorter */
      .pgn-training-right {
        flex:1;
        max-height:360px;
        overflow-y:auto;
      }

      .pgn-move-row { font-weight:700; margin-top:.5em; }
      .pgn-move-no { margin-right:.25em; }
      .pgn-move-white { margin-right:.5em; }
      .pgn-move-black { margin-left:.3em; }
      .pgn-comment { font-weight:400; }
      .pgn-result-line { margin-top:.6em; font-weight:400; }

      .pgn-training-status span {
        margin-right:.35em;
        font-size:1.1em;
        vertical-align:middle;
      }

      /* ◀ ▶ slightly smaller + not black */
      .pgn-training-actions button {
        font-size:0.85em;
        line-height:1;
        padding:0 .12em;
        margin-right:.15em;
        cursor:pointer;
        background:none;
        border:none;
        color:#333;
      }
      .pgn-training-actions button:disabled {
        opacity:.35;
        cursor:default;
      }
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

  function sanitizeVariationText(t) {
    // Keep move numbers + SAN text, drop engine tags / nested comments, normalize spaces.
    let x = String(t || "");
    x = x.replace(/\[%.*?]/g, "");
    x = x.replace(/\[D\]/g, "");
    x = x.replace(/\{[^}]*\}/g, ""); // remove braces blocks within variation
    x = x.replace(/\s+/g, " ").trim();
    if (!x) return null;

    // User wants closing ")" but not necessarily opening "(":
    // "(40. Kf1 ... Be6)" -> "40. Kf1 ... Be6)"
    if (x.startsWith("(")) x = x.slice(1).trim();
    if (!x.endsWith(")")) x = x + ")";

    return x;
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

  function captureVariation(raw, i) {
    // raw[i] is '('; capture "( ... )" including parentheses
    let j = i;
    let d = 0;
    while (j < raw.length) {
      if (raw[j] === "(") d++;
      else if (raw[j] === ")") {
        d--;
        if (d === 0) return { text: raw.slice(i, j + 1), next: j + 1 };
      }
      j++;
    }
    return { text: raw.slice(i), next: raw.length };
  }

  function resultFromRaw(rawAll) {
    const m = String(rawAll || "").match(/\b(1-0|0-1|1\/2-1\/2)\b\s*$/);
    return m ? m[1] : "";
  }

  function swapCommaName(name) {
    const s = String(name || "").trim();
    if (!s) return "";
    const parts = s.split(",").map(x => x.trim());
    if (parts.length === 2) return `${parts[1]} ${parts[0]}`.trim();
    return s;
  }

  function formatPlayer(name, elo, title) {
    const n = swapCommaName(name);
    const t = String(title || "").trim();
    const e = String(elo || "").trim();
    return `${t ? t + " " : ""}${n}${e ? " (" + e + ")" : ""}`.trim();
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
      this.isSolved = false;

      this.game = new Chess();
      this.currentFen = "start";

      this.currentRow = null;
      this.build(src);
      this.initBoard();
      this.parsePGNAsync();
    }

    // ----------------------------------------------------------------------

    build(src) {
      const wrap = document.createElement("div");
      wrap.className = "pgn-training-wrapper";

      // (5) Header is OUTSIDE the 2-column flex container (placed before it)
      const header = this.buildHeader();
      if (header) wrap.appendChild(header);

      const cols = document.createElement("div");
      cols.className = "pgn-training-cols";
      cols.innerHTML = `
        <div>
          <div class="pgn-training-board"></div>
          <div class="pgn-training-status">
            <span class="turn"></span>
            <span class="feedback"></span>
            <span class="solved" hidden>🏆</span>
            <span class="pgn-training-actions" hidden>
              <button data-act="prev">◀</button>
              <button data-act="next">▶</button>
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

      this.btnPrev = cols.querySelector('[data-act="prev"]');
      this.btnNext = cols.querySelector('[data-act="next"]');

      this.btnPrev.onclick = () => this.step(-1);
      this.btnNext.onclick = () => this.step(1);
    }

    buildHeader() {
      const w = this.headers.White;
      const b = this.headers.Black;
      if (!w || !b) return null;

      // (4) New header format
      const whiteLine = formatPlayer(w, this.headers.WhiteElo, this.headers.WhiteTitle);
      const blackLine = formatPlayer(b, this.headers.BlackElo, this.headers.BlackTitle);

      const line1 = `${whiteLine} – ${blackLine}`.trim();
      const line2 = [this.headers.Event, this.headers.Opening].filter(Boolean).join(", ");

      const h = document.createElement("h3");
      h.className = "pgn-training-header";
      h.innerHTML = line1 + (line2 ? `<br>${line2}` : "");
      return h;
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

      this.result = resultFromRaw(rawAll);

      const chess = new Chess();
      let i = 0, ply = 0;

      const step = () => {
        const start = performance.now();

        while (i < raw.length) {
          if (performance.now() - start > 8) {
            requestAnimationFrame(step);
            return;
          }

          const ch = raw[i];

          // Comments { ... } attach to last parsed move
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

          // Capture variation text as display-only annotation; skip its moves for parsing
          if (ch === "(") {
            const cap = captureVariation(raw, i);
            const v = sanitizeVariationText(cap.text);
            if (v && this.moves.length) {
              this.moves[this.moves.length - 1].variations.push(v);
            }
            i = cap.next;
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
          try { moved = chess.move(san, { sloppy: true }); } catch {}
          if (!moved) continue;

          this.moves.push({
            isWhite: ply % 2 === 0,
            moveNo: Math.floor(ply / 2) + 1,
            san: tok,
            fen: chess.fen(),
            comments: [],
            variations: []
          });

          ply++;
        }

        this.updateTurn();
        this.autoplayOpponentMoves();
      };

      requestAnimationFrame(step);
    }

    // ----------------------------------------------------------------------
    // Turn / training logic
    // ----------------------------------------------------------------------

    updateTurn() {
      this.turnEl.textContent = this.game.turn() === "w" ? "⚐" : "⚑";
    }

    isGuessTurn() {
      return this.game.turn() === (this.userIsWhite ? "w" : "b");
    }

    autoplayOpponentMoves() {
      while (this.index + 1 < this.moves.length) {
        const n = this.moves[this.index + 1];
        if (n.isWhite === this.userIsWhite) break;

        this.index++;
        try { this.game.move(normalizeSAN(n.san), { sloppy: true }); } catch {}
        this.currentFen = n.fen;
        this.board.position(n.fen, true);
        this.appendMove();
      }
      this.updateTurn();
      this.updateButtons();
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
        } catch {
          return false;
        }
      });

      this.feedbackEl.textContent = ok ? "✅" : "❌";
      if (!ok) return "snapback";

      this.index++;
      this.game.load(expected.fen);
      this.currentFen = expected.fen;
      this.board.position(expected.fen, false);
      this.appendMove();

      if (this.index === this.moves.length - 1 && !this.isSolved) {
        this.isSolved = true;
        this.solvedEl.hidden = false;
        this.actionsEl.hidden = false;
      }

      setTimeout(() => this.autoplayOpponentMoves(), 400);
    }

    step(dir) {
      const next = this.index + dir;
      if (next < -1 || next >= this.moves.length) return;

      this.index = next;
      this.game.reset();

      for (let i = 0; i <= this.index; i++) {
        try { this.game.move(normalizeSAN(this.moves[i].san), { sloppy: true }); } catch {}
      }

      this.currentFen = this.index >= 0 ? this.moves[this.index].fen : "start";
      this.board.position(this.currentFen, false);

      this.updateTurn();
      this.updateButtons();
      this.feedbackEl.textContent = "";
    }

    updateButtons() {
      this.btnPrev.disabled = this.index < 0;
      this.btnNext.disabled = this.index >= this.moves.length - 1;
    }

    // ----------------------------------------------------------------------
    // Right pane rendering (moves + comments + variation text + final result)
    // ----------------------------------------------------------------------

    appendMove() {
      const m = this.moves[this.index];
      if (!m) return;

      if (m.isWhite) {
        const row = document.createElement("div");
        row.className = "pgn-move-row";
        row.dataset.hasAnalysis = "false";

        // add space after move number: "40. ♔g1?"
        row.innerHTML =
          `<span class="pgn-move-no">${m.moveNo}. </span>` +
          `<span class="pgn-move-white">${m.san}</span>`;

        this.rightPane.appendChild(row);
        this.currentRow = row;

        // comments after this move
        if (m.comments && m.comments.length) {
          row.dataset.hasAnalysis = "true";
          m.comments.forEach(c => {
            // keep "White resigns." for final line instead of inline
            if (/^White resigns\.$/i.test(c.trim())) return;
            const sp = document.createElement("span");
            sp.className = "pgn-comment";
            sp.textContent = " " + c;
            row.appendChild(sp);
          });
        }

        // variations after this move (display-only)
        if (m.variations && m.variations.length) {
          row.dataset.hasAnalysis = "true";
          m.variations.forEach(v => {
            const sp = document.createElement("span");
            sp.className = "pgn-comment";
            sp.textContent = " " + v;
            row.appendChild(sp);
          });
        }

      } else if (this.currentRow) {
        const hasAnalysis = this.currentRow.dataset.hasAnalysis === "true";

        const b = document.createElement("span");
        b.className = "pgn-move-black";

        // (2) If [White move] [analysis/variation] [Black mainline], prefix with "7... "
        b.textContent = hasAnalysis
          ? ` ${m.moveNo}... ${m.san}`
          : ` ${m.san}`;

        this.currentRow.appendChild(b);

        // black move comments (except resign)
        if (m.comments && m.comments.length) {
          m.comments.forEach(c => {
            if (/^White resigns\.$/i.test(c.trim())) return;
            const sp = document.createElement("span");
            sp.className = "pgn-comment";
            sp.textContent = " " + c;
            this.currentRow.appendChild(sp);
          });
        }

        // black move variations (rare, but handle)
        if (m.variations && m.variations.length) {
          m.variations.forEach(v => {
            const sp = document.createElement("span");
            sp.className = "pgn-comment";
            sp.textContent = " " + v;
            this.currentRow.appendChild(sp);
          });
        }

        // (1) If this is the last move, append "White resigns. 0-1" as a separate line
        if (this.index === this.moves.length - 1) {
          const resign = (m.comments || []).find(c => /^White resigns\.$/i.test(String(c).trim()));
          const tail = [resign ? "White resigns." : "", this.result || ""].filter(Boolean).join(" ").trim();
          if (tail) {
            const line = document.createElement("div");
            line.className = "pgn-result-line";
            line.textContent = tail;
            this.rightPane.appendChild(line);
          }
        }
      }

      this.rightPane.scrollTop = this.rightPane.scrollHeight;
    }
  }

})();
