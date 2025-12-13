// ============================================================================
// pgn-guess.js — Guess-the-move PGN trainer (move list restored + all fixes)
// ============================================================================

(function () {
  "use strict";

  if (typeof Chess !== "function") return;
  if (typeof Chessboard !== "function") return;
  if (!window.PGNCore) return;

  const C = window.PGNCore;

  const AUTOPLAY_DELAY = 700;  // show "⚐/⚑ ... to move" first, then start autoplay
  const FEEDBACK_DELAY = 600;  // show "Correct! ✅" before autoplay continues

  // --------------------------------------------------------------------------
  // Styles
  // --------------------------------------------------------------------------

  function ensureGuessStylesOnce() {
    if (document.getElementById("pgn-guess-style")) return;

    const style = document.createElement("style");
    style.id = "pgn-guess-style";
    style.textContent = `
      .pgn-guess-cols {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
      }

      .pgn-guess-left { flex: 0 0 auto; }

      .pgn-guess-board {
        width: 320px;
        max-width: 100%;
        touch-action: manipulation;
      }
      @media (min-width: 480px) { .pgn-guess-board { width: 360px; } }
      @media (min-width: 768px) { .pgn-guess-board { width: 400px; } }

      .pgn-guess-status {
        margin-top: 0.4em;
        font-size: 0.95em;
        white-space: nowrap;
      }

      .pgn-guess-right {
        flex: 1 1 auto;
        max-height: 420px;
        overflow-y: auto;
      }

      .pgn-move-row { font-weight: 900; margin-top: 0.5em; }
      .pgn-move-no { margin-right: 0.3em; }
      .pgn-move-white { margin-right: 0.6em; }
      .pgn-move-black { margin-left: 0.3em; }

      .pgn-comment { font-weight: 400; margin: 0.35em 0 0.35em 0; }
    `;
    document.head.appendChild(style);
  }

  // --------------------------------------------------------------------------

  function safeChessboard(targetEl, options, tries = 30, onReady) {
    if (!targetEl) return;
    const r = targetEl.getBoundingClientRect();
    if ((r.width <= 0 || r.height <= 0) && tries > 0) {
      requestAnimationFrame(() =>
        safeChessboard(targetEl, options, tries - 1, onReady)
      );
      return;
    }
    try {
      const board = Chessboard(targetEl, options);
      onReady && onReady(board);
    } catch {
      if (tries > 0) {
        requestAnimationFrame(() =>
          safeChessboard(targetEl, options, tries - 1, onReady)
        );
      }
    }
  }

  function extractVariationDisplay(text) {
    return text
      .replace(/\[%.*?]/g, "")
      .replace(/\[D\]/g, "")
      .replace(/\{\s*\}/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Normalize SAN before feeding to chess.js (fixes exd5 etc.)
  function normalizeSAN(tok) {
    return tok
      .replace(/\[%.*?]/g, "")
      .replace(/[!?]+/g, "")
      .replace(/[+#]$/, "")
      .replace(/0/g, "O")
      .trim();
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
      this.flipBoard = src.tagName.toLowerCase() === "pgn-guess-black";
      this.userIsWhite = !this.flipBoard; // puzzles are always "guess this side's move"

      this.moves = [];
      this.index = -1;

      this.currentRow = null;
      this.game = new Chess();

      // authoritative FEN to force-sync after animations (fixes capture ghosts)
      this.currentFen = "start";

      // status suffix (Correct/Wrong/Solved)
      this.resultMessage = "";

      this.build(src);
      this.parsePGN();
      this.initBoard();
    }

    // ------------------------------------------------------------------------

    build(src) {
      const wrapper = document.createElement("div");
      wrapper.className = "pgn-guess-cols";

      wrapper.innerHTML = `
        <div class="pgn-guess-left">
          <div class="pgn-guess-board"></div>
          <div class="pgn-guess-status"></div>
        </div>
        <div class="pgn-guess-right"></div>
      `;

      src.replaceWith(wrapper);

      this.boardDiv = wrapper.querySelector(".pgn-guess-board");
      this.statusEl = wrapper.querySelector(".pgn-guess-status");
      this.rightPane = wrapper.querySelector(".pgn-guess-right");
    }

    // ------------------------------------------------------------------------
    // PGN parsing (restored: comments/variations attach + ply tracking)
    // ------------------------------------------------------------------------

    parsePGN() {
      const raw = C.normalizeFigurines(this.rawText);
      const chess = new Chess();

      let ply = 0;
      let i = 0;
      let pending = [];

      const attach = (t) => {
        const c = (t || "").replace(/\[%.*?]/g, "").trim();
        if (!c) return;
        if (this.moves.length) this.moves[this.moves.length - 1].comments.push(c);
        else pending.push(c);
      };

      while (i < raw.length) {
        const ch = raw[i];

        // Variations: ( ... )
        if (ch === "(") {
          let depth = 1, j = i + 1;
          while (j < raw.length && depth > 0) {
            if (raw[j] === "(") depth++;
            else if (raw[j] === ")") depth--;
            j++;
          }
          const v = extractVariationDisplay(raw.slice(i + 1, j - 1));
          if (v) attach(v);
          i = j;
          continue;
        }

        // Comments: { ... }
        if (ch === "{") {
          let j = i + 1;
          while (j < raw.length && raw[j] !== "}") j++;
          attach(raw.slice(i + 1, j));
          i = j + 1;
          continue;
        }

        if (/\s/.test(ch)) { i++; continue; }

        // read token
        const s = i;
        while (i < raw.length && !/\s/.test(raw[i]) && !"(){}".includes(raw[i])) i++;
        const tok = raw.slice(s, i);

        // skip move numbers
        if (/^\d+\.{1,3}$/.test(tok)) continue;

        const san = normalizeSAN(tok);
        if (!san) continue;

        // Try to play it; if illegal/unparseable, skip token
        if (!chess.move(san, { sloppy: true })) continue;

        const isWhite = ply % 2 === 0;
        const moveNo = Math.floor(ply / 2) + 1;

        this.moves.push({
          isWhite,
          moveNo,
          san: tok,          // keep original display token
          fen: chess.fen(),  // authoritative resulting fen
          comments: pending.splice(0)
        });

        ply++;
      }
    }

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

          onDragStart: () => this.isGuessTurn(),
          onDrop: (s, t) => this.onUserDrop(s, t),

          // After any animation (captures especially), force-sync to authoritative fen
          onSnapEnd: () => {
            if (!this.board) return;
            this.board.position(this.currentFen, false);
          }
        },
        30,
        (b) => {
          this.board = b;
          this.setBoard("start", false);
          this.updateStatus();

          // Delay: show turn indicator first, then autoplay opponent moves
          setTimeout(() => {
            this.autoplayOpponentMoves();
            this.updateStatus();
          }, AUTOPLAY_DELAY);
        }
      );
    }

    // ------------------------------------------------------------------------
    // Status + autoplay rules
    // ------------------------------------------------------------------------

    updateStatus() {
      const turn = this.game.turn() === "w" ? "White" : "Black";
      const flag = this.game.turn() === "w" ? "⚐" : "⚑";
      const suffix = this.resultMessage ? ` · ${this.resultMessage}` : "";
      this.statusEl.textContent = `${flag} ${turn} to move${suffix}`;
    }

    // Puzzle rule: user guesses a fixed side (white for <pgn-guess>, black for <pgn-guess-black>)
    isGuessTurn() {
      const next = this.moves[this.index + 1];
      return !!next && next.isWhite === this.userIsWhite;
    }

    // Autoplay while the next move belongs to the opponent (not the user's guessing side)
    autoplayOpponentMoves() {
      while (this.index + 1 < this.moves.length) {
        const next = this.moves[this.index + 1];
        if (next.isWhite === this.userIsWhite) break; // stop at puzzle move

        this.index++;
        this.game.move(normalizeSAN(next.san), { sloppy: true });

        // autoplay is animated
        this.setBoard(next.fen, true);
        this.appendMove();
      }

      // reset feedback once we reach a puzzle
      this.resultMessage = "";
    }

    setBoard(fen, animate) {
      this.currentFen = fen;
      this.board.position(fen, !!animate);
    }

    // ------------------------------------------------------------------------
    // Drag input handler
    // ------------------------------------------------------------------------

    onUserDrop(source, target) {
      if (!this.isGuessTurn()) return "snapback";

      const expected = this.moves[this.index + 1];
      const legal = this.game.moves({ verbose: true });

      // Validate by resulting FEN (supports alternative SANs and multiple correct moves that reach same fen)
      const ok = legal.some(m => {
        if (m.from !== source || m.to !== target) return false;
        const t = new Chess(this.game.fen());
        t.move(m);
        return t.fen() === expected.fen;
      });

      if (!ok) {
        this.resultMessage = "Wrong move ❌";
        this.updateStatus();
        return "snapback";
      }

      // Correct move: advance to expected position (NO animation for user moves)
      this.index++;
      this.game.load(expected.fen);
      this.setBoard(expected.fen, false);
      this.appendMove();

      // If that was the final move in the line, end training
      if (this.index === this.moves.length - 1) {
        this.resultMessage = "Training solved! 🏆";
        this.updateStatus();
        return;
      }

      // Show Correct! briefly, then autoplay opponent replies
      this.resultMessage = "Correct! ✅";
      this.updateStatus();

      setTimeout(() => {
        this.autoplayOpponentMoves();
        this.updateStatus();
      }, FEEDBACK_DELAY);

      return;
    }

    // ------------------------------------------------------------------------
    // Move list rendering (restored)
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
      } else if (this.currentRow) {
        const b = document.createElement("span");
        b.className = "pgn-move-black";
        b.textContent = m.san;
        this.currentRow.appendChild(b);
      }

      // comments / attached variations show as moves are revealed
      m.comments.forEach((c) => {
        const p = document.createElement("p");
        p.className = "pgn-comment";
        p.textContent = c;
        this.rightPane.appendChild(p);
      });

      this.rightPane.scrollTop = this.rightPane.scrollHeight;
    }
  }

  // --------------------------------------------------------------------------

  function init() {
    document.querySelectorAll("pgn-guess, pgn-guess-black")
      .forEach((el) => new ReaderPGNView(el));
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init, { once: true })
    : init();

})();
