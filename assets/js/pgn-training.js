// ============================================================================
// pgn-training.js — Guess-the-move PGN trainer (restored + no spoilers + clean tags)
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function") return;
  if (typeof Chessboard !== "function") return;
  if (!window.PGNCore) return;

  const C = window.PGNCore;
  const AUTOPLAY_DELAY = 700;
  const FEEDBACK_DELAY = 600;

  // --------------------------------------------------------------------------
  // Styles
  // --------------------------------------------------------------------------

  function ensureGuessStylesOnce() {
    if (document.getElementById("pgn-training-style")) return;

    const style = document.createElement("style");
    style.id = "pgn-training-style";
    style.textContent = `
      .pgn-training-wrapper { margin-bottom: 1rem; }
      .pgn-training-header { margin:0 0 .6rem 0; font-weight:600; }

      .pgn-training-cols { display:flex; gap:1rem; align-items:flex-start; }

      .pgn-training-board { width:360px; max-width:100%; touch-action:manipulation; }

      .pgn-training-status { margin-top:.4em; font-size:.95em; white-space:nowrap; }
      .pgn-training-status button { margin-left:.3em; font-size:1em; padding:0 .4em; }

      .pgn-training-right { flex:1; max-height:420px; overflow-y:auto; }

      .pgn-move-row { font-weight:900; margin-top:.5em; }
      .pgn-move-no { margin-right:.3em; }
      .pgn-move-white { margin-right:.6em; }
      .pgn-move-black { margin-left:.3em; }
      .pgn-comment { font-weight:400; }
    `;
    document.head.appendChild(style);
  }

  // --------------------------------------------------------------------------
  // Safe board init (prevents "stuck loading" due to 0-width containers)
  // --------------------------------------------------------------------------

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
    } catch (e) {
      if (tries > 0) {
        requestAnimationFrame(() =>
          safeChessboard(targetEl, options, tries - 1, onReady)
        );
      }
      return null;
    }
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

  function sanitizeComment(text) {
    const c = String(text || "")
      .replace(/\[%.*?]/g, "")   // eval/clk/etc
      .replace(/\[D\]/g, "")     // [D]
      .replace(/[{}]/g, "")      // NEVER show braces
      .replace(/\s+/g, " ")
      .trim();
    return c || null;
  }

  function extractVariationDisplay(text) {
    // Keep the content, strip tags/braces-ish artifacts as literature text
    return String(text || "")
      .replace(/\[%.*?]/g, "")
      .replace(/\[D\]/g, "")
      .replace(/[{}]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseHeaders(text) {
    const headers = {};
    String(text || "").replace(/\[(\w+)\s+"([^"]*)"\]/g, (_, k, v) => {
      headers[k] = v;
      return "";
    });
    return headers;
  }

  function flipNameSafe(name) {
    return typeof C.flipName === "function" ? C.flipName(name || "") : (name || "");
  }

  function extractYearSafe(date) {
    if (typeof C.extractYear === "function") return C.extractYear(date);
    const m = String(date || "").match(/(\d{4})/);
    return m ? m[1] : "";
  }

  // --------------------------------------------------------------------------
  // Main class
  // --------------------------------------------------------------------------

  class ReaderPGNView {
    constructor(src) {
      if (src.__pgnReaderRendered) return;
      src.__pgnReaderRendered = true;

      ensureGuessStylesOnce();

      this.rawText = (src.textContent || "").trim();
      this.headers = parseHeaders(this.rawText);

      this.flipBoard = src.tagName.toLowerCase() === "pgn-training-black";
      this.userIsWhite = !this.flipBoard;

      this.moves = [];
      this.index = -1;
      this.currentRow = null;

      this.game = new Chess();
      this.currentFen = "start";

      this.resultMessage = "";
      this.solved = false;

      // Tracks whether the current move-row had an intervening comment after White,
      // so Black reply should be rendered as "N... SAN" WHEN it is actually played.
      this.rowHasInterveningComment = false;

      this.build(src);
      this.parsePGN();
      this.initBoard();
    }

    // ------------------------------------------------------------------------
    // Header (players + event + opening) — outside 2-column layout
    // ------------------------------------------------------------------------

    renderHeader() {
      const h = this.headers || {};

      const W =
        (h.WhiteTitle ? h.WhiteTitle + " " : "") +
        flipNameSafe(h.White || "") +
        (h.WhiteElo ? " (" + h.WhiteElo + ")" : "");

      const B =
        (h.BlackTitle ? h.BlackTitle + " " : "") +
        flipNameSafe(h.Black || "") +
        (h.BlackElo ? " (" + h.BlackElo + ")" : "");

      const year = extractYearSafe(h.Date);
      const line2 = (h.Event || "") + (year ? ", " + year : "");
      const opening = (h.Opening || "").trim();

      if (!W && !B && !line2 && !opening) return;

      const H = document.createElement("h3");
      H.className = "pgn-training-header";

      if (W || B) {
        H.append(W || "?", " – ", B || "?");
        H.appendChild(document.createElement("br"));
      }
      if (line2) {
        H.append(line2);
        if (opening) H.appendChild(document.createElement("br"));
      }
      if (opening) H.append(opening);

      this.wrapper.appendChild(H);
    }

    // ------------------------------------------------------------------------

    build(src) {
      this.wrapper = document.createElement("div");
      this.wrapper.className = "pgn-training-wrapper";

      this.renderHeader();

      const cols = document.createElement("div");
      cols.className = "pgn-training-cols";
      cols.innerHTML = `
        <div>
          <div class="pgn-training-board"></div>
          <div class="pgn-training-status"></div>
        </div>
        <div class="pgn-training-right"></div>
      `;

      this.wrapper.appendChild(cols);
      src.replaceWith(this.wrapper);

      this.boardDiv = cols.querySelector(".pgn-training-board");
      this.statusEl = cols.querySelector(".pgn-training-status");
      this.rightPane = cols.querySelector(".pgn-training-right");
    }

    // ------------------------------------------------------------------------
    // PGN parsing (comments + variations as prose; engine tags stripped)
    // ------------------------------------------------------------------------

    parsePGN() {
      const raw = C.normalizeFigurines(this.rawText);
      const chess = new Chess();

      let ply = 0;
      let i = 0;
      let pending = [];

      const attach = (t) => {
        const c = sanitizeComment(t);
        if (!c) { pending.length = 0; return; }
        if (this.moves.length) this.moves[this.moves.length - 1].comments.push(c);
        else pending.push(c);
      };

      while (i < raw.length) {
        const ch = raw[i];

        // variation: treat as prose comment
        if (ch === "(") {
          let d = 1, j = i + 1;
          while (j < raw.length && d) {
            if (raw[j] === "(") d++;
            else if (raw[j] === ")") d--;
            j++;
          }
          const v = extractVariationDisplay(raw.slice(i + 1, j - 1));
          if (v) attach(v);
          i = j;
          continue;
        }

        // brace comment
        if (ch === "{") {
          let j = i + 1;
          while (j < raw.length && raw[j] !== "}") j++;
          attach(raw.slice(i + 1, j));
          i = j + 1;
          continue;
        }

        if (/\s/.test(ch)) { i++; continue; }

        const s = i;
        while (i < raw.length && !/\s/.test(raw[i]) && !"(){}".includes(raw[i])) i++;
        const tok = raw.slice(s, i);

        // move numbers
        if (/^\d+\.{1,3}$/.test(tok)) continue;

        const san = normalizeSAN(tok);
        if (!san) continue;

        // accept SAN-ish tokens
        if (C.SAN_CORE_REGEX && !C.SAN_CORE_REGEX.test(san)) {
          // If core regex exists, keep it strict-ish.
          // But don't reject too aggressively; chess.js will be the final validator.
        }

        if (!chess.move(san, { sloppy: true })) continue;

        this.moves.push({
          isWhite: ply % 2 === 0,
          moveNo: Math.floor(ply / 2) + 1,
          san: tok,         // display token as provided (figurines etc.)
          fen: chess.fen(),
          comments: pending.splice(0)
        });

        ply++;
      }
    }

    // ------------------------------------------------------------------------
    // Board init
    // ------------------------------------------------------------------------

    initBoard() {
      safeChessboard(
        this.boardDiv,
        {
          position: "start",
          orientation: this.flipBoard ? "black" : "white",
          draggable: true,
          pieceTheme: C.PIECE_THEME_URL,
          moveSpeed: 200,
          onDragStart: () => !this.solved && this.isGuessTurn(),
          onDrop: (s, t) => this.onUserDrop(s, t),
          // capture correctness: always sync to authoritative fen after any animation
          onSnapEnd: () => {
            if (this.board) this.board.position(this.currentFen, false);
          }
        },
        30,
        (b) => {
          this.board = b;
          this.updateStatus();

          // Delay, show turn indicator first, then autoplay opponent moves
          setTimeout(() => {
            this.autoplayOpponentMoves();
            this.updateStatus();
          }, AUTOPLAY_DELAY);
        }
      );
    }

    // ------------------------------------------------------------------------
    // Status / solved nav
    // ------------------------------------------------------------------------

    updateStatus() {
      this.statusEl.innerHTML = "";

      if (this.solved) {
        const s = document.createElement("span");
        s.textContent = "Training solved! 🏆";
        this.statusEl.appendChild(s);

        this.statusEl.append(
          this.navBtn("↻", () => this.goto(-1), this.index < 0),
          this.navBtn("◀", () => this.goto(this.index - 1), this.index < 0),
          this.navBtn("▶", () => this.goto(this.index + 1), this.index >= this.moves.length - 1)
        );
        return;
      }

      const flag = this.game.turn() === "w" ? "⚐" : "⚑";
      const side = this.game.turn() === "w" ? "White" : "Black";
      const msg = this.resultMessage ? ` · ${this.resultMessage}` : "";
      this.statusEl.textContent = `${flag} ${side} to move${msg}`;
    }

    navBtn(icon, cb, dis) {
      const b = document.createElement("button");
      b.textContent = icon;
      b.disabled = dis;
      b.onclick = cb;
      return b;
    }

    goto(i) {
      if (i < -1) i = -1;
      if (i >= this.moves.length) i = this.moves.length - 1;

      this.index = i;

      if (i === -1) {
        this.game.reset();
        this.currentFen = "start";
      } else {
        this.game.load(this.moves[i].fen);
        this.currentFen = this.moves[i].fen;
      }

      if (this.board) this.board.position(this.currentFen, false);
      this.resultMessage = "";
      this.updateStatus();
    }

    // ------------------------------------------------------------------------
    // Turn logic
    // ------------------------------------------------------------------------

    isGuessTurn() {
      const n = this.moves[this.index + 1];
      return !!n && n.isWhite === this.userIsWhite;
    }

    autoplayOpponentMoves() {
      while (this.index + 1 < this.moves.length) {
        const n = this.moves[this.index + 1];
        if (n.isWhite === this.userIsWhite) break;

        this.index++;
        this.game.move(normalizeSAN(n.san), { sloppy: true });
        this.currentFen = n.fen;

        // animate autoplayed moves
        if (this.board) this.board.position(n.fen, true);
        this.appendMove();
      }

      this.resultMessage = "";
    }

    // ------------------------------------------------------------------------
    // User input (drag-drop)
    // ------------------------------------------------------------------------

    onUserDrop(source, target) {
      // Only react to real drops
      if (source === target) return "snapback";
      if (this.solved) return "snapback";
      if (!this.isGuessTurn()) return "snapback";

      const expected = this.moves[this.index + 1];
      const legal = this.game.moves({ verbose: true });

      // Validate by resulting FEN to support alternative SANs / multiple correct moves
      const ok = legal.some((m) => {
        if (m.from !== source || m.to !== target) return false;
        const g = new Chess(this.game.fen());
        g.move(m);
        return g.fen() === expected.fen;
      });

      if (!ok) {
        this.resultMessage = "Wrong move ❌";
        this.updateStatus();
        return "snapback";
      }

      // correct move: advance WITHOUT animation
      this.index++;
      this.game.load(expected.fen);
      this.currentFen = expected.fen;
      if (this.board) this.board.position(expected.fen, false);
      this.appendMove();

      // solved?
      if (this.index === this.moves.length - 1) {
        this.solved = true;
        this.resultMessage = "";
        this.updateStatus();
        return;
      }

      this.resultMessage = "Correct! ✅";
      this.updateStatus();

      setTimeout(() => {
        this.autoplayOpponentMoves();
        this.updateStatus();
      }, FEEDBACK_DELAY);
    }

    // ------------------------------------------------------------------------
    // Move list rendering (literature-style, no spoilers)
    //
    // Critical rule:
    // - If a White move has inline comments, and Black reply is a PUZZLE move,
    //   we DO NOT show "N..." or SAN early.
    // - When the Black move is actually played (autoplay or traininged),
    //   if the row had an intervening comment, render as "N... SAN".
    // ------------------------------------------------------------------------

    appendMove() {
      const m = this.moves[this.index];
      if (!m) return;

      if (m.isWhite) {
        const row = document.createElement("div");
        row.className = "pgn-move-row";

        const no = document.createElement("span");
        no.className = "pgn-move-no";
        no.textContent = `${m.moveNo}.`;

        const w = document.createElement("span");
        w.className = "pgn-move-white";
        w.textContent = m.san;

        row.appendChild(no);
        row.appendChild(w);
        this.rightPane.appendChild(row);
        this.currentRow = row;

        // inline prose comments
        this.rowHasInterveningComment = false;
        if (m.comments && m.comments.length) {
          this.rowHasInterveningComment = true;
          m.comments.forEach((c) => {
            const span = document.createElement("span");
            span.className = "pgn-comment";
            span.textContent = " " + c;
            row.appendChild(span);
          });

          // NO SPOILERS: do NOT append "N..." or SAN for the upcoming black move.
          // We only use rowHasInterveningComment later when Black is actually played.
        }

      } else if (this.currentRow) {
        const b = document.createElement("span");
        b.className = "pgn-move-black";

        // If the immediately previous white move had an intervening comment in this row,
        // render black as "N... SAN" once it is actually played.
        if (this.rowHasInterveningComment) {
          b.textContent = ` ${m.moveNo}... ${m.san}`;
          this.rowHasInterveningComment = false; // consumed for this reply
        } else {
          b.textContent = ` ${m.san}`;
        }

        this.currentRow.appendChild(b);

        // inline comments after black (if any)
        if (m.comments && m.comments.length) {
          m.comments.forEach((c) => {
            const span = document.createElement("span");
            span.className = "pgn-comment";
            span.textContent = " " + c;
            this.currentRow.appendChild(span);
          });
        }
      }

      this.rightPane.scrollTop = this.rightPane.scrollHeight;
    }
  }

  // --------------------------------------------------------------------------
  // Init
  // --------------------------------------------------------------------------

  function init() {
    document
      .querySelectorAll("pgn-training, pgn-training-black")
      .forEach((el) => new ReaderPGNView(el));
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init, { once: true })
    : init();
})();
