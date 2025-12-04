// ======================================================
// pgn-sticky.js — FINAL WORKING VERSION
// ======================================================
// • Row 1: Sticky (title + subtitle + board + buttons)
// • Row 2: Scrollable moves only
// • Keeps figurines / SAN / variations / comments identical to pgn.js
// • Buttons centered to board, board not centered
// ======================================================

(function () {
    "use strict";

    if (typeof Chess === "undefined") {
        console.warn("pgn-sticky.js: chess.js missing");
        return;
    }
    if (typeof Chessboard === "undefined") {
        console.warn("pgn-sticky.js: chessboard.js missing");
        return;
    }

    const PIECE_THEME_URL =
        "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png";

    const SAN_CORE_REGEX =
        /^([O0]-[O0](-[O0])?[+#]?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?|[a-h][1-8](=[QRBN])?[+#]?)$/;
    const RESULT_REGEX = /^(1-0|0-1|1\/2-1\/2|½-½|\*)$/;
    const MOVE_NUMBER_REGEX = /^(\d+)(\.+)$/;
    const NBSP = "\u00A0";

    const EVAL_MAP = {
        "=": "=",
        "+/=": "⩲",
        "=/+": "⩱",
        "+/-": "±",
        "+/−": "±",
        "-/+": "∓",
        "−/+": "∓",
        "+-": "+−",
        "+−": "+−",
        "-+": "−+",
        "−+": "−+",
        "∞": "∞",
        "=/∞": "⯹"
    };

    const NAG_MAP = {
        1: "!",
        2: "?",
        3: "‼",
        4: "⁇",
        5: "⁉",
        6: "⁈",
        13: "→",
        14: "↑",
        15: "⇆",
        16: "⇄",
        17: "⟂",
        18: "∞",
        19: "⟳",
        20: "⟲",
        36: "⩲",
        37: "⩱",
        38: "±",
        39: "∓",
        40: "+=",
        41: "=+",
        42: "±",
        43: "∓",
        44: "⨀",
        45: "⨁"
    };

    function normalizeResult(r) {
        return r ? r.replace(/1\/2-1\/2/g, "½-½") : "";
    }

    function extractYear(d) {
        if (!d) return "";
        const p = d.split(".");
        return /^\d{4}$/.test(p[0]) ? p[0] : "";
    }

    function flipName(n) {
        if (!n) return "";
        const i = n.indexOf(",");
        return i === -1
            ? n.trim()
            : n.slice(i + 1).trim() + " " + n.slice(0, i).trim();
    }

    function appendText(el, txt) {
        if (txt) el.appendChild(document.createTextNode(txt));
    }

    class StickyPGNView {
        constructor(src) {
            this.sourceEl = src;
            this.wrapper = document.createElement("div");
            this.wrapper.className = "pgn-sticky-block";
            this.build();
            this.applyFigurines();
        }

        build() {
            const raw = this.sourceEl.textContent.trim();
            const { headers, moveText } = this.split(raw);

            const pgn =
                (headers.length ? headers.join("\n") + "\n\n" : "") + moveText;

            const chess = new Chess();
            chess.load_pgn(pgn, { sloppy: true });

            const head = chess.header();
            const res = normalizeResult(head.Result || "");
            const needsResult =
                / (1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(moveText);
            const finalMoveText = needsResult
                ? moveText
                : moveText + (res ? " " + res : "");

            // ROW 1 — sticky region
            this.headerBlock = document.createElement("div");
            this.headerBlock.className = "pgn-sticky-headerblock";
            this.wrapper.appendChild(this.headerBlock);

            this.buildHeader(head);
            this.buildBoard();
            this.buildButtons();

            chess.reset();

            // ROW 2 — scrollable region
            this.scrollBox = document.createElement("div");
            this.scrollBox.className = "pgn-sticky-scrollbox";
            this.wrapper.appendChild(this.scrollBox);

            this.parse(finalMoveText, chess, this.scrollBox);

            this.sourceEl.replaceWith(this.wrapper);
        }

        split(t) {
            const lines = t.split(/\r?\n/);
            let H = [];
            let M = [];
            let inH = true;

            for (let L of lines) {
                let T = L.trim();
                if (inH && T.startsWith("[") && T.endsWith("]")) H.push(L);
                else if (inH && T === "") inH = false;
                else {
                    inH = false;
                    M.push(L);
                }
            }

            return {
                headers: H,
                moveText: M.join(" ").replace(/\s+/g, " ").trim()
            };
        }

        buildHeader(h) {
            const W =
                (h.WhiteTitle ? h.WhiteTitle + " " : "") +
                flipName(h.White || "") +
                (h.WhiteElo ? " (" + h.WhiteElo + ")" : "");
            const B =
                (h.BlackTitle ? h.BlackTitle + " " : "") +
                flipName(h.Black || "") +
                (h.BlackElo ? " (" + h.BlackElo + ")" : "");
            const Y = extractYear(h.Date);

            const H = document.createElement("h4");
            H.textContent = W + " – " + B;

            const sub = document.createElement("div");
            sub.className = "pgn-sticky-sub";
            sub.textContent = (h.Event || "") + (Y ? ", " + Y : "");

            this.headerBlock.appendChild(H);
            this.headerBlock.appendChild(sub);
        }

        buildBoard() {
            this.boardDiv = document.createElement("div");
            this.boardDiv.className = "pgn-sticky-diagram";
            this.headerBlock.appendChild(this.boardDiv);

            setTimeout(() => {
                StickyBoard.board = Chessboard(this.boardDiv, {
                    position: "start",
                    draggable: false,
                    pieceTheme: PIECE_THEME_URL
                });
            }, 0);
        }

        buildButtons() {
            const wrap = document.createElement("div");
            wrap.className = "pgn-sticky-buttons";

            const prev = document.createElement("button");
            prev.className = "pgn-sticky-btn";
            prev.textContent = "◀";
            prev.addEventListener("click", () => StickyBoard.prev());

            const next = document.createElement("button");
            next.className = "pgn-sticky-btn";
            next.textContent = "▶";
            next.addEventListener("click", () => StickyBoard.next());

            wrap.appendChild(prev);
            wrap.appendChild(next);
            this.headerBlock.appendChild(wrap);
        }

        parse(t, chess, container) {
            let i = 0;
            let ctx = {
                type: "main",
                chess,
                container: null,
                parent: null,
                lastWasInterrupt: false,
                prevFen: chess.fen(),
                prevHistoryLen: 0,
                baseHistoryLen: null
            };

            const ensure = cls => {
                if (!ctx.container) {
                    const p = document.createElement("p");
                    p.className = cls;
                    container.appendChild(p);
                    ctx.container = p;
                }
            };

            const makeCast = s =>
                s
                    .replace(/0-0-0|O-O-O/g, m => m[0] + "\u2011" + m[2] + "\u2011" + m[4])
                    .replace(/0-0|O-O/g, m => m[0] + "\u2011" + m[2]);

            const isSAN = core => SAN_CORE_REGEX.test(core);

            for (; i < t.length; ) {
                let ch = t[i];

                if (/\s/.test(ch)) {
                    while (i < t.length && /\s/.test(t[i])) i++;
                    ensure("pgn-mainline");
                    appendText(ctx.container, " ");
                    continue;
                }

                if (ch === "(") {
                    i++;
                    let fen = ctx.prevFen || ctx.chess.fen();
                    let len =
                        typeof ctx.prevHistoryLen === "number"
                            ? ctx.prevHistoryLen
                            : ctx.chess.history().length;
                    ctx = {
                        type: "variation",
                        chess: new Chess(fen),
                        container: null,
                        parent: ctx,
                        lastWasInterrupt: true,
                        prevFen: fen,
                        prevHistoryLen: len,
                        baseHistoryLen: len
                    };
                    ensure("pgn-variation");
                    continue;
                }

                if (ch === ")") {
                    i++;
                    if (ctx.parent) {
                        ctx = ctx.parent;
                        ctx.lastWasInterrupt = true;
                        ctx.container = null;
                    }
                    continue;
                }

                if (ch === "{") {
                    let j = i + 1;
                    while (j < t.length && t[j] !== "}") j++;
                    let raw = t.substring(i + 1, j).trim();
                    i = j + 1;

                    if (!raw.length) continue;

                    let p = document.createElement("p");
                    p.className = "pgn-comment";
                    appendText(p, raw);
                    container.appendChild(p);
                    ctx.container = null;
                    ctx.lastWasInterrupt = false;
                    continue;
                }

                if (t.substring(i, i + 3) === "[D]") {
                    i += 3;
                    continue;
                }

                let s = i;
                while (
                    i < t.length &&
                    !/\s/.test(t[i]) &&
                    !"(){}".includes(t[i])
                )
                    i++;
                let tok = t.substring(s, i);
                if (!tok) continue;

                if (MOVE_NUMBER_REGEX.test(tok)) continue;

                if (RESULT_REGEX.test(tok)) {
                    ensure(
                        ctx.type === "main" ? "pgn-mainline" : "pgn-variation"
                    );
                    appendText(ctx.container, tok + " ");
                    continue;
                }

                let core = tok
                    .replace(/[^a-hKQRBN0-9=O0-]+$/g, "")
                    .replace(/0/g, "O");
                let sanOK = isSAN(core);

                if (!sanOK) {
                    if (EVAL_MAP[tok]) {
                        ensure(
                            ctx.type === "main"
                                ? "pgn-mainline"
                                : "pgn-variation"
                        );
                        appendText(ctx.container, EVAL_MAP[tok] + " ");
                        continue;
                    }

                    if (tok[0] === "$") {
                        let code = +tok.slice(1);
                        if (NAG_MAP[code]) {
                            ensure(
                                ctx.type === "main"
                                    ? "pgn-mainline"
                                    : "pgn-variation"
                            );
                            appendText(ctx.container, NAG_MAP[code] + " ");
                        }
                        continue;
                    }

                    if (/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(tok)) {
                        if (ctx.type === "variation") {
                            ensure("pgn-variation");
                            appendText(ctx.container, " " + tok);
                        } else {
                            let p = document.createElement("p");
                            p.className = "pgn-comment";
                            appendText(p, tok);
                            container.appendChild(p);
                            ctx.container = null;
                            ctx.lastWasInterrupt = false;
                        }
                    } else {
                        ensure(
                            ctx.type === "main"
                                ? "pgn-mainline"
                                : "pgn-variation"
                        );
                        appendText(ctx.container, tok + " ");
                    }
                    continue;
                }

                ensure(
                    ctx.type === "main" ? "pgn-mainline" : "pgn-variation"
                );
                ctx.prevFen = ctx.chess.fen();
                ctx.prevHistoryLen =
                    ctx.baseHistoryLen + ctx.chess.history().length;

                let mv = ctx.chess.move(core, { sloppy: true });
                if (!mv) {
                    appendText(
                        ctx.container,
                        makeCast(tok) + " "
                    );
                    continue;
                }

                ctx.lastWasInterrupt = false;

                let span = document.createElement("span");
                span.className = "sticky-move";
                span.dataset.fen = ctx.chess.fen();
                span.textContent = makeCast(tok) + " ";
                ctx.container.appendChild(span);
            }
        }

        applyFigurines() {
            const map = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };
            this.wrapper.querySelectorAll(".sticky-move").forEach(span => {
                let m = span.textContent.match(/^([KQRBN])(.+?)(\s*)$/);
                if (m)
                    span.textContent =
                        map[m[1]] + m[2] + (m[3] || "");
            });
        }
    }

    const StickyBoard = {
        board: null,
        moveSpans: [],
        currentIndex: -1,

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

            this.moveSpans.forEach((span, i) => {
                span.addEventListener("click", () => this.goto(i));
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

    // ======================================================
    // CSS
    // ======================================================

    const css = document.createElement("style");
    css.textContent = `
/* Full block */
.pgn-sticky-block {
    position: relative;
    margin-bottom: 2rem;
    background: white;
}

/* Sticky header (title+board+buttons) */
.pgn-sticky-headerblock {
    position: sticky;
    top: 1rem;
    z-index: 100;
    background: white;
    padding-bottom: 1rem;
}

/* Title */
.pgn-sticky-headerblock h4 {
    margin: 0 0 0.25rem 0;
}

/* Subtitle */
.pgn-sticky-sub {
    font-size: 0.9rem;
    color: #666;
}

/* Board (NOT centered) */
.pgn-sticky-diagram {
    width: 320px;
    max-width: 100%;
    margin-top: 0.5rem;
}

/* Buttons centered relative to board */
.pgn-sticky-buttons {
    width: 320px;
    max-width: 100%;
    display: flex;
    justify-content: center;
    gap: 1rem;
    margin-top: 0.3rem;
}

.pgn-sticky-btn {
    font-size: 1.2rem;
    line-height: 1;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 4px;
}

.pgn-sticky-btn:hover {
    background: #f3f3f3;
}

/* Scrollable row-2 content */
.pgn-sticky-scrollbox {
    max-height: calc(100vh - 420px);
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 0.5rem;
    margin-top: 1rem;
}

/* Moves */
.pgn-mainline,
.pgn-variation {
    line-height: 1.7;
    font-size: 1rem;
}

/* Variation formatting */
.pgn-variation {
    margin-left: 1.5rem;
    padding-left: 0.5rem;
    border-left: 2px solid transparent;
}

/* Comments */
.pgn-comment {
    font-style: italic;
    margin: 0.3rem 0;
}

/* Move highlighting */
.sticky-move {
    cursor: pointer;
}

.sticky-move-active {
    background: #ffe38a;
    border-radius: 4px;
    padding: 2px 4px;
}
`;
    document.head.appendChild(css);

    document.addEventListener("DOMContentLoaded", () => {
        const els = document.querySelectorAll("pgn-sticky");
        if (!els.length) return;
        els.forEach(el => new StickyPGNView(el));
        StickyBoard.activate(document);
    });
})();
