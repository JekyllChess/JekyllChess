// assets/js/chess/figurine.js
(function () {
  "use strict";

  const PIECE_MAP = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘" };

  const SAN_REGEX =
    /\b(O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[KQRBN]x[a-h][1-8](?:=[QRBN])?[+#]?)\b/g;

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "CODE", "PRE",
    "TEXTAREA", "INPUT", "SELECT", "OPTION", "NOSCRIPT"
  ]);

  function likelySAN(text) {
    return /[KQRBN]|O-O/.test(text);
  }

  function convertTextNode(node) {
    const text = node.nodeValue;
    if (!text || !likelySAN(text)) return;

    const replaced = text.replace(SAN_REGEX, match => {
      if (match === "O-O" || match === "O-O-O") return match;
      const p = match.charAt(0);
      return PIECE_MAP[p] ? PIECE_MAP[p] + match.slice(1) : match;
    });

    if (replaced !== text) node.nodeValue = replaced;
  }

  function walk(root) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentNode;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (SKIP_TAGS.has(parent.nodeName)) return NodeFilter.FILTER_REJECT;

          // 👇 IMPORTANT: SKIP raw PGN content
          if (parent.closest && parent.closest("pgn")) 
            return NodeFilter.FILTER_REJECT;

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let n;
    while ((n = walker.nextNode())) convertTextNode(n);
  }

  function init() {
    walk(document.body);

    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        m.addedNodes?.forEach(node => {
          if (node.nodeType === 1) walk(node);
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.ChessFigurine = { run: (r) => walk(r || document.body) };
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init)
    : init();
})();
