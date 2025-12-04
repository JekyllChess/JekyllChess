// ======================================================
// pgn-sticky.js
// Renders <pgn-sticky> elements AND activates StickyBoard
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

    var PIECE_THEME_URL =
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
            var raw = this.src.textContent.trim();
            var split = this.splitPGN(raw);
            var headers = split.headers;
            var movetext = split.movetext;

            // Rebuild a proper PGN string for chess.js
            var pgn =
                (headers.length ? headers.join("\n") + "\n\n" : "") +
                movetext;

            var chess = new Chess();
            // NOTE: chess.js uses load_pgn, not loadPgn
            chess.load_pgn(pgn, { sloppy: true });

            var headerObj = chess.header();

            // 1. Heading
            this.buildHeader(headerObj);

            // 2. Sticky diagram (initial position = current chess.fen())
            this.buildStickyDiagram(chess.fen());

            // Reset to start for our own parsing/replay
            chess.reset();

            // 3. Moves (with variations + comments, but no [D] diagrams)
            var movesArea = document.createElement("div");
            movesArea.className = "pgn-sticky-moves";
            this.wrapper.appendChild(movesArea);

            this.parseMovetext(movetext, chess, movesArea);

            // Replace original <pgn-sticky> element
            this.src.replaceWith(this.wrapper);
        }

        splitPGN(raw) {
            var lines = raw.split(/\r?\n/);
            var headers = [];
            var moves = [];
            var inHeader = true;

            for (var idx = 0; idx < lines.length; idx++) {
                var L = lines[idx];
                var T = L.trim();
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
                headers: headers,
                movetext: moves.join(" ")
            };
        }

        buildHeader(h) {
            var title = document.createElement("h4");
            var W =
                (h.WhiteTitle ? h.WhiteTitle + " " : "") + (h.White || "");
            var B =
                (h.BlackTitle ? h.BlackTitle + " " : "") + (h.Black || "");
            var Y = (h.Date || "").split(".")[0];

            title.textContent = W + " \u2013 " + B; // "White – Black"

            var sub = document.createElement("div");
            sub.className = "pgn-sticky-sub";
            sub.textContent = (h.Event || "") + (Y ? ", " + Y : "");

            this.wrapper.appendChild(title);
            this.wrapper.appendChild(sub);
        }

        buildStickyDiagram(fen) {
            var d = document.createElement("div");
            d.className = "pgn-sticky-diagram";
            this.wrapper.appendChild(d);

            setTimeout(function () {
                Chessboard(d, {
                    position: fen,
                    draggable: false,
                    pieceTheme: PIECE_THEME_URL
                });
            }, 0);
        }

        // ------------------------------------------------------
        // PARSE MOVETEXT (keeps comments & variations, removes [D])
        // ------------------------------------------------------
        parseMovetext(text, chess, container) {
            var i = 0;
            var moveNumber = 1;
            var variationStack = [];

            function newLine() {
                var p = document.createElement("p");
                container.appendChild(p);
                return p;
            }

            var line = newLine();

            while (i < text.length) {
                var ch = text[i];

                // Skip whitespace
                if (/\s/.test(ch)) {
                    i++;
                    continue;
                }

                // ==========================================
                // Comments { ... }
                // ==========================================
                if (ch === "{") {
                    var j = i + 1;
                    while (j < text.length && text[j] !== "}") j++;
                    var comment = text.substring(i + 1, j).trim();

                    var p = document.createElement("p");
                    p.className = "pgn-comment";
                    p.textContent = comment;
                    container.appendChild(p);

                    i = j + 1;
                    continue;
                }

                // ==========================================
                // Variations ( ... )
                // ==========================================
                if (ch === "(") {
                    // Start new variation block
                    var varBlock = document.createElement("div");
                    varBlock.className = "pgn-variation";
                    container.appendChild(varBlock);

                    variationStack.push({ container: container, line: line });

                    container = varBlock;
                    line = newLine();

                    i++;
                    continue;
                }

                // Close variation
                if (ch === ")") {
                    var st = variationStack.pop();
                    if (st) {
                        container = st.container;
                        line = newLine();
                    }
                    i++;
                    continue;
                }

                // ==========================================
                // REMOVE [D] diagrams completely
                // ==========================================
                if (text.substring(i, i + 3) === "[D]") {
                    i += 3;
                    continue;
                }

                // ==========================================
                // Parse token (move, number, result...)
                // ==========================================
                var s = i;
                while (
                    i < text.length &&
                    !/\s/.test(text[i]) &&
                    !"(){}".includes(text[i])
                ) {
                    i++;
                }
                var tok = text.substring(s, i);

                if (!tok) continue;

                // Skip move numbers (e.g. 1. or 1...)
                if (/^\d+\.{1,3}$/.test(tok)) continue;

                // Game result
                if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) {
                    line.appendChild(
                        document.createTextNode(" " + tok + " ")
                    );
                    continue;
                }

                // Attempt SAN move
                var mv = chess.move(tok, { sloppy: true });
                if (!mv) {
                    line.appendChild(
                        document.createTextNode(tok + " ")
                    );
                    continue;
                }

                // White move number
                if (mv.color === "w") {
                    line.appendChild(
                        document.createTextNode(moveNumber + ". ")
                    );
                }

                var span = document.createElement("span");
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

    var StickyBoard = {
        board: null,
        moveSpans: [],
        currentIndex: -1,

        initBoard: function () {
            if (document.getElementById("sticky-chessboard")) return;

            var div = document.createElement("div");
            div.id = "sticky-chessboard";
            div.className = "sticky-chessboard";
            document.body.appendChild(div);

            this.board = Chessboard("sticky-chessboard", {
                position: "start",
                draggable: false,
                pieceTheme: PIECE_THEME_URL,
                moveSpeed: 200,
                snapSpeed: 20,
                snapbackSpeed: 20,
                appearSpeed: 150
            });
        },

        collectMoves: function (root) {
            this.moveSpans = Array.from(
                (root || document).querySelectorAll(".sticky-move")
            );
        },

        goto: function (index) {
            if (index < 0 || index >= this.moveSpans.length) return;

            this.currentIndex = index;
            var span = this.moveSpans[index];
            var fen = span.dataset.fen;
            if (!fen) return;

            this.board.position(fen, true);

            this.moveSpans.forEach(function (s) {
                s.classList.remove("sticky-move-active");
            });
            span.classList.add("sticky-move-active");

            span.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "nearest"
            });
        },

        next: function () {
            this.goto(this.currentIndex + 1);
        },

        prev: function () {
            this.goto(this.currentIndex - 1);
        },

        activate: function (root) {
            this.initBoard();
            this.collectMoves(root);

            var self = this;
            this.moveSpans.forEach(function (span, idx) {
                span.style.cursor = "pointer";
                span.addEventListener("click", function () {
                    self.goto(idx);
                });
            });

            window.addEventListener("keydown", function (e) {
                var tag = (e.target.tagName || "").toLowerCase();
                if (tag === "input" || tag === "textarea") return;

                if (e.key === "ArrowRight") {
                    e.preventDefault();
                    self.next();
                }
                if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    self.prev();
                }
            });
        }
    };

    // ========================================================================
    // CSS for sticky PGN + sticky board
    // ========================================================================
    var style = document.createElement("style");
    style.textContent = `
#sticky-chessboard {
    position: fixed;
    bottom: 1.2rem;
    right: 1.2rem;
    width: 300px !important;
    height: 300px !important;
    z-index: 9999;
    border: 2px solid #444;
    background: #fff;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    border-radius: 4px;
}

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
    // DOMContentLoaded: only do work if there are <pgn-sticky> elements
    // ========================================================================
    document.addEventListener("DOMContentLoaded", function () {
        var stickyEls = document.querySelectorAll("pgn-sticky");
        if (!stickyEls.length) return;

        stickyEls.forEach(function (el) {
            new StickyPGNView(el);
        });

        StickyBoard.activate(document);
    });
})();
