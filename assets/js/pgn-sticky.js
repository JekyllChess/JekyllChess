// ======================================================
// pgn-sticky.js
// Renders <pgn-sticky> elements and embeds a single,
// playable, sticky diagram board under the PGN title.
// Moves update the board, variations & comments kept.
// No floating boards, no [D] diagrams.
// ======================================================

(function () {
    "use strict";

    // ------------------------------------------------------
    // Dependency check for chess.js
    // ------------------------------------------------------
    if (typeof Chess === "undefined") {
        console.warn("pgn-sticky.js: chess.js missing");
        return;
    }

    const PIECE_THEME_URL =
        "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png";

    // ========================================================================
    //                           Sticky PGN Renderer
    // ========================================================================

    class StickyPGNView {
        constructor(src) {
            this.src = src;
            this.wrapper = document.createElement("div");
            this.wrapper.className = "pgn-sticky-block";
            this.build();
        }

        build() {
            const raw = this.src.textContent.trim();
            const { headers, movetext } = this.splitPGN(raw);

            // Build PGN string for chess.js
            const pgn =
                (headers.length ? headers.join("\n") + "\n\n" : "") +
                movetext;

            const chess = new Chess();
            chess.load_pgn(pgn, { sloppy: true });

            const headerObj = chess.header();

            // 1. Title + subtitle
            this.buildHeader(headerObj);

            // 2. Sticky playable board (ONE board)
            this.buildStickyPlayableBoard(chess.fen());

            // Reset so we can replay moves for data-fen
            chess.reset();

            // 3. Moves + variations + comments
            const movesArea = document.createElement("div");
            movesArea.className = "pgn-sticky-moves";
            this.wrapper.appendChild(movesArea);

            this.parseMovetext(movetext, chess, movesArea);

            // Replace the <pgn-sticky> tag
            this.src.replaceWith(this.wrapper);
        }

        splitPGN(raw) {
            const lines = raw.split(/\r?\n/);
            let headers = [];
            let moves = [];
            let inHeader = true;

            for (const L of lines) {
                const T = L.trim();
                if (inHeader && T.startsWith("[") && T.endsWith("]")) {
                    headers.push(T);
                } else if (T === "") {
                    inHeader = false;
                } else {
                    inHeader = false;
                    moves.push(T);
                }
            }

            return {
                headers,
                movetext: moves.join(" ")
            };
        }

        buildHeader(h) {
            const title = document.createElement("h4");

            const W =
                (h.WhiteTitle ? h.WhiteTitle + " " : "") + (h.White || "");
            const B =
                (h.BlackTitle ? h.BlackTitle + " " : "") + (h.Black || "");
            const Y = (h.Date || "").split(".")[0];

            title.textContent = `${W} – ${B}`;

            const sub = document.createElement("div");
            sub.className = "pgn-sticky-sub";
            sub.textContent = (h.Event || "") + (Y ? ", " + Y : "");

            this.wrapper.appendChild(title);
            this.wrapper.appendChild(sub);
        }

        // --------------------------------------------------------------
        // This is now the ONE AND ONLY board, playable & sticky.
        // StickyBoard.board = this board.
        // --------------------------------------------------------------
        buildStickyPlayableBoard(fen) {
            const d = document.createElement("div");
            d.id = "pgn-sticky-board";
            d.className = "pgn-sticky-diagram";
            this.wrapper.appendChild(d);

            setTimeout(() => {
                StickyBoard.board = Chessboard(d, {
                    position: fen,
                    draggable: false,
                    pieceTheme: PIECE_THEME_URL,
                    moveSpeed: 200,
                    snapSpeed: 20,
                    snapbackSpeed: 20,
                    appearSpeed: 150
                });
            }, 0);
        }

        // ------------------------------------------------------
        // Movetext parser (keeps comments, keeps variations,
        // removes [D], generates clickable .sticky-move spans)
        // ------------------------------------------------------
        parseMovetext(text, chess, container) {
            let i = 0;
            let moveNumber = 1;
            let variationStack = [];

            const newLine = () => {
                const p = document.createElement("p");
                container.appendChild(p);
                return p;
            };

            let line = newLine();

            while (i < text.length) {
                const ch = text[i];

                // Skip whitespace
                if (/\s/.test(ch)) {
                    i++;
                    continue;
                }

                // ==========================================
                // Comments { ... }
                // ==========================================
                if (ch === "{") {
                    let j = i + 1;
                    while (j < text.length && text[j] !== "}") j++;
                    const comment = text.substring(i + 1, j).trim();

                    const p = document.createElement("p");
                    p.className = "pgn-comment";
                    p.textContent = comment;
                    container.appendChild(p);

                    i = j + 1;
                    continue;
                }

                // ==========================================
                // Variation open "("
                // ==========================================
                if (ch === "(") {
                    const varBlock = document.createElement("div");
                    varBlock.className = "pgn-variation";
                    container.appendChild(varBlock);

                    variationStack.push({ container, line });

                    container = varBlock;
                    line = newLine();

                    i++;
                    continue;
                }

                // Variation close ")"
                if (ch === ")") {
                    const st = variationStack.pop();
                    if (st) {
                        container = st.container;
                        line = newLine();
                    }
                    i++;
                    continue;
                }

                // ==========================================
                // Ignore [D] diagrams completely
                // ==========================================
                if (text.substring(i, i + 3) === "[D]") {
                    i += 3;
                    continue;
                }

                // ==========================================
                // Parse tokens (move, number, result)
                // ==========================================
                let s = i;
                while (
                    i < text.length &&
                    !/\s/.test(text[i]) &&
                    !"(){}".includes(text[i])
                ) {
                    i++;
                }
                const tok = text.substring(s, i);

                if (!tok) continue;

                // Skip move numbers: "1." or "1..." etc.
                if (/^\d+\.{1,3}$/.test(tok)) continue;

                // Game result
                if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) {
                    line.appendChild(document.createTextNode(" " + tok + " "));
                    continue;
                }

                // Try SAN move
                const mv = chess.move(tok, { sloppy: true });
                if (!mv) {
                    line.appendChild(document.createTextNode(tok + " "));
                    continue;
                }

                // White move number
                if (mv.color === "w") {
                    line.appendChild(document.createTextNode(moveNumber + ". "));
                }

                // The clickable SAN move
                const span = document.createElement("span");
                span.className = "sticky-move";
                span.dataset.fen = chess.fen();
                span.textContent = mv.san + " ";
                line.appendChild(span);

                if (mv.color === "b") moveNumber++;
            }
        }
    }

    // ========================================================================
    //                           StickyBoard Engine
    // ========================================================================
    // NO floating board. NO board creation here.
    // The board is created inside StickyPGNView.
    // StickyBoard only controls navigation.
    // ========================================================================

    const StickyBoard = {
        board: null,         // assigned by StickyPGNView
        moveSpans: [],
        currentIndex: -1,

        initBoard() {
            // no-op (board is created by StickyPGNView)
        },

        collectMoves(root) {
            this.moveSpans = Array.from(
                (root || document).querySelectorAll(".sticky-move")
            );
        },

        goto(index) {
            if (index < 0 || index >= this.moveSpans.length) return;

            this.currentIndex = index;
            const span = this.moveSpans[index];
            const fen = span.dataset.fen;
            if (!fen) return;

            this.board.position(fen, true);

            this.moveSpans.forEach(s =>
                s.classList.remove("sticky-move-active")
            );
            span.classList.add("sticky-move-active");

            span.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "nearest"
            });
        },

        next() {
            this.goto(this.currentIndex + 1);
        },

        prev() {
            this.goto(this.currentIndex - 1);
        },

        activate(root) {
            this.collectMoves(root);

            this.moveSpans.forEach((span, idx) => {
                span.style.cursor = "pointer";
                span.addEventListener("click", () => this.goto(idx));
            });

            window.addEventListener("keydown", e => {
                const tag = (e.target.tagName || "").toLowerCase();
                if (tag === "input" || tag === "textarea") return;

                if (e.key === "ArrowRight") {
                    e.preventDefault();
                    this.next();
                }
                if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    this.prev();
                }
            });
        }
    };

    // ========================================================================
    // CSS
    // ========================================================================
    const style = document.createElement("style");
    style.textContent = `
.pgn-sticky-block {
    position: relative;
    margin-bottom: 2rem;
}

.pgn-sticky-diagram {
    position: sticky;
    top: 1rem;
    width: 320px;
    max-width: 100%;
    margin: 1rem 0;
    z-index: 40;
}

.pgn-sticky-moves {
    margin-top: 1rem;
    line-height: 1.7;
    font-size: 1rem;
}

.pgn-sticky-sub {
    font-size: 0.9rem;
    color: #666;
}

.pgn-variation {
    margin-left: 1.5rem;
    padding-left: 0.5rem;
    border-left: 2px solid #ddd;
    margin-top: 0.5rem;
}

.pgn-comment {
    font-style: italic;
    margin: 0.3rem 0;
}

.sticky-move {
    cursor: pointer;
}

.sticky-move-active {
    background: #ffe38a;
    border-radius: 4px;
    padding: 2px 4px;
}
`;
    document.head.appendChild(style);

    // ========================================================================
    // DOMContentLoaded: render sticky PGN then activate board
    // ========================================================================
    document.addEventListener("DOMContentLoaded", () => {
        const stickyEls = document.querySelectorAll("pgn-sticky");
        if (!stickyEls.length) return;

        stickyEls.forEach(el => new StickyPGNView(el));

        StickyBoard.activate(document);
    });

})();
