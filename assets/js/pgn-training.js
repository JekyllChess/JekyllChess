// ============================================================================
// pgn-training.js — strict mutual exclusivity for ❌ / ✅ / 🏆
// Inline move layout (matches simple-pgn-reader)
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
    let x = String(t || "")
      .replace(/\[%.*?]/g, "")
      .replace(/\[D\]/g, "")
      .replace(/\{[^}]*\}/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!x) return null;
    if (x.startsWith("(")) x = x.slice(1);
    if (x.endsWith(")")) x = x.slice(0, -1);
    return x.trim() || null;
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

  function captureVariation(raw, i) {
    let j = i, d = 0;
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
    const p = s.split(",").map(x => x.trim());
    return p.length === 2 ? `${p[1]} ${p[0]}` : s;
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
      this.rawText = (src.textContent || "").trim();
      this.headers = extractHeaders(this.rawText);

      this.flip = src.tagName.toLowerCase() === "pgn-training-black";
      this.userIsWhite = !this.flip;

      this.moves = [];
      this.index = -1;
      this.isSolved = false;

      this.game = new Chess();
      this.currentFen = "start";

      this.mainlineP = null;

      this.build(src);
      this.initBoard();
      this.parsePGNAsync();

      this.flowBroken = false;
    }

    // -------------------- STATUS CONTROLLER --------------------

    setStatus(type) {
      this.feedbackEl.textContent = "";
      this.solvedEl.hidden = true;

      if (type === "wrong") {
        this.feedbackEl.textContent = "❌";
      } else if (type === "correct") {
        this.feedbackEl.textContent = "✅";
      } else if (type === "solved") {
        this.solvedEl.hidden = false;
      }
    }

    // -----------------------------------------------------------

    build(src) {
      const wrap = document.createElement("div");
      wrap.className = "pgn-training-wrapper";

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
  if (!this.headers.White || !this.headers.Black) return null;

  const wrapper = document.createElement("div");

  // ---- Line 1: Players (h3) ----
  const h3 = document.createElement("h3");
  h3.className = "pgn-training-header";

  const line1 =
    `${formatPlayer(this.headers.White, this.headers.WhiteElo, this.headers.WhiteTitle)} – ` +
    `${formatPlayer(this.headers.Black, this.headers.BlackElo, this.headers.BlackTitle)}`;

  h3.textContent = line1;
  wrapper.appendChild(h3);

  // ---- Line 2: Event / Opening (h4) ----
  const line2 = [this.headers.Event, this.headers.Opening]
    .filter(Boolean)
    .join(", ");

  if (line2) {
    const h4 = document.createElement("h4");
    h4.className = "pgn-training-subheader";
    h4.textContent = line2;
    wrapper.appendChild(h4);
  }
  return wrapper;
}
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

          if (ch === "{") {
            let j = i + 1;
            while (j < raw.length && raw[j] !== "}") j++;
            const c = sanitizeComment(raw.slice(i + 1, j));
            if (c && this.moves.length) this.moves[this.moves.length - 1].comments.push(c);
            i = j + 1;
            continue;
          }

          if (ch === "(") {
            const cap = captureVariation(raw, i);
            const v = sanitizeVariationText(cap.text);
            if (v && this.moves.length) this.moves[this.moves.length - 1].variations.push(v);
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
        this.game.move(normalizeSAN(n.san), { sloppy: true });
        this.currentFen = n.fen;
        this.board.position(n.fen, true);
        this.appendMove();
      }
      this.updateTurn();
      this.updateButtons();
    }

    onUserDrop(source, target) {
      if (!this.isGuessTurn() || source === target) return "snapback";

      const expected = this.moves[this.index + 1];
      if (!expected) return "snapback";

      const legal = this.game.moves({ verbose: true });
      const ok = legal.some(m => {
        if (m.from !== source || m.to !== target) return false;
        const g = new Chess(this.game.fen());
        g.move(m);
        return g.fen() === expected.fen;
      });

      if (!ok) {
        this.setStatus("wrong");
        return "snapback";
      }

      this.setStatus("correct");

      this.index++;
      this.game.load(expected.fen);
      this.currentFen = expected.fen;
      this.board.position(expected.fen, false);
      this.appendMove();

      this.updateTurn();

      if (this.index === this.moves.length - 1 && !this.isSolved) {
        this.isSolved = true;
        this.setStatus("solved");
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
        this.game.move(normalizeSAN(this.moves[i].san), { sloppy: true });
      }

      this.currentFen = this.index >= 0 ? this.moves[this.index].fen : "start";
      this.board.position(this.currentFen, false);
      this.updateTurn();
      this.updateButtons();
      this.setStatus(null);
    }

    updateButtons() {
      this.btnPrev.disabled = this.index < 0;
      this.btnNext.disabled = this.index >= this.moves.length - 1;
    }

    // ------------------------------------------------------------------
    // INLINE MOVE RENDERING (reader-style)
    // ------------------------------------------------------------------

    appendMove() {
  const m = this.moves[this.index];
  if (!m) return;

  if (!this.mainlineP) {
    this.mainlineP = document.createElement("p");
    this.mainlineP.className = "pgn-mainline";
    this.rightPane.appendChild(this.mainlineP);
  }

  // ---- MOVE NUMBER LOGIC ----
  if (m.isWhite) {
    this.mainlineP.appendChild(
      document.createTextNode(m.moveNo + ". ")
    );
  } else if (this.flowBroken) {
    this.mainlineP.appendChild(
      document.createTextNode(m.moveNo + "... ")
    );
  }

  // move span
  const span = document.createElement("span");
  span.className = "pgn-move";
  span.textContent = m.san + "\u00A0";
  this.mainlineP.appendChild(span);

  // reset flowBroken once a move prints
  this.flowBroken = false;

  let brokeFlow = false;

  // comments
  m.comments.forEach(txt => {
    if (/^White resigns\.$/i.test(txt)) return;

    const p = document.createElement("p");
    p.className = "pgn-comment";
    p.textContent = txt;
    this.rightPane.appendChild(p);
    brokeFlow = true;
  });

  // variations
  m.variations.forEach(txt => {
    const p = document.createElement("p");
    p.className = "pgn-variation";
    p.textContent = txt;
    this.rightPane.appendChild(p);
    brokeFlow = true;
  });

  if (brokeFlow) {
    this.mainlineP = null;
    this.flowBroken = true;   // ⭐ key line
  }

  // result
  if (this.index === this.moves.length - 1) {
    const tail = this.result || "";
    if (tail) {
      const p = document.createElement("p");
      p.className = "pgn-result-line";
      p.textContent = tail;
      this.rightPane.appendChild(p);
    }
  }

  this.rightPane.scrollTop = this.rightPane.scrollHeight;
}
  }

})();
