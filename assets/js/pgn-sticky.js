<script src="pgn.js"></script>

if (!document.querySelector("pgn-sticky")) {
    return;
}

(function () {
    "use strict";

    if (typeof Chessboard === "undefined") {
        console.warn("stickyboard.js: chessboard.js missing");
        return;
    }

    var PIECE_THEME_URL =
        "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png";

    var StickyBoard = {
        board: null,
        moveSpans: [],
        currentIndex: -1,

        initBoard() {
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

        collectMoves(root) {
            this.moveSpans = Array.from(
                (root || document).querySelectorAll(".sticky-move")
            );
        },

        goto(index) {
            if (index < 0 || index >= this.moveSpans.length) return;

            this.currentIndex = index;
            var span = this.moveSpans[index];
            var fen = span.dataset.fen;
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
            this.initBoard();
            this.collectMoves(root);

            this.moveSpans.forEach((span, idx) => {
                span.style.cursor = "pointer";
                span.addEventListener("click", () => {
                    this.goto(idx);
                });
            });

            window.addEventListener("keydown", e => {
                var tag = (e.target.tagName || "").toLowerCase();
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

.sticky-move:hover {
    text-decoration: none !important;
    cursor: pointer;
}

.sticky-move-active {
    background: #ffe38a;
    border-radius: 4px;
    padding: 2px 4px;
}
`;
    document.head.appendChild(style);

    document.addEventListener("DOMContentLoaded", () => {
        if (window.PGNRenderer && window.PGNRenderer.run) {
            StickyBoard.activate(document);
        } else {
            setTimeout(() => StickyBoard.activate(document), 300);
        }
    });

})();
