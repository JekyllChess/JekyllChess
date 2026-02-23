!function () {
  "use strict";

  const PIECE_THEME =
    "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png";

  let counter = 0;

  function chessboardReady() {
    return typeof window.Chessboard === "function";
  }

  function renderFen(el) {
    if (el.__fenRendered) return;

    const fen = el.textContent.trim();
    if (!fen || !chessboardReady()) return;

    const isBlack = el.tagName.toLowerCase() === "fen-black";
    const boardId = "fen-board-" + (++counter);

    const boardDiv = document.createElement("div");
    boardDiv.className = "fen-board";
    boardDiv.id = boardId;

    el.replaceWith(boardDiv);

    try {
      Chessboard(boardId, {
        position: fen,
        draggable: false,
        pieceTheme: PIECE_THEME,
        orientation: isBlack ? "black" : "white"
      });

      el.__fenRendered = true;
    } catch (e) {}
  }

  function scan(root = document) {
    root.querySelectorAll("fen, fen-black").forEach(renderFen);
  }

  function init() {
    scan();

    new MutationObserver(mutations => {
      for (const m of mutations) {
        m.addedNodes &&
          m.addedNodes.forEach(node => {
            if (node.nodeType === 1) scan(node);
          });
      }
    }).observe(document.body, {
      childList: true,
      subtree: true
    });

    window.FENRenderer = Object.freeze({
      run: root => scan(root || document.body)
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
}();
