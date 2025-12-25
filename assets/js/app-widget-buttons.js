document.addEventListener("DOMContentLoaded", () => {

  if (!window.JC) {
    console.error("JC bridge not found");
    return;
  }

  const container = document.querySelector(".placeholder-controls");
  if (!container) return;

  // Clear placeholder buttons safely
  container.textContent = "";

  function makeButton(label, title) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.style.opacity = "1";
    b.style.cursor = "pointer";
    return b;
  }

  const btnFen     = makeButton("📋", "Copy FEN");
  const btnPgn     = makeButton("📄", "Copy PGN");
  const btnComment = makeButton("➕", "Add comment");
  const btnPromote = makeButton("⬆️", "Promote variation");
  const btnDelete  = makeButton("🗑️", "Delete variation");

  container.append(btnFen, btnPgn, btnComment, btnPromote, btnDelete);


  /* ======================================================
   * HELPERS
   * ====================================================== */

  function getCursor() {
    return window.JC.getCursor();
  }

  function isVariation(node) {
    return node && node.parent && node.parent.next !== node;
  }

  function copy(text) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function getPGNText() {
    const el = document.getElementById("moves");
    return el ? el.innerText.trim() : "";
  }

  function updateStates() {
    const n = getCursor();
    const isVar = isVariation(n);

    btnPromote.disabled = !isVar;
    btnDelete.disabled  = !isVar;
    btnComment.disabled = !n || n === window.JC.getRoot();
  }


  /* ======================================================
   * BUTTON ACTIONS
   * ====================================================== */

  // COPY FEN (correct source: cursor.fen)
  btnFen.onclick = () => {
    const n = getCursor();
    if (n && n.fen) copy(n.fen);
  };

  // COPY PGN (visual)
  btnPgn.onclick = () => {
    copy(getPGNText());
  };

  // ADD COMMENT (stored on node)
  btnComment.onclick = () => {
    const n = getCursor();
    if (!n || n === window.JC.getRoot()) return;

    const text = prompt("Comment for this move:");
    if (!text) return;

    n.comment = `{ ${text} }`;
    window.JC.render();
  };

  // PROMOTE VARIATION
  btnPromote.onclick = () => {
    const n = getCursor();
    if (!isVariation(n)) return;

    const p = n.parent;

    p.vars = p.vars.filter(v => v !== n);
    if (p.next) p.vars.unshift(p.next);
    p.next = n;

    window.JC.setCursor(n);
    window.JC.rebuildTo(n, true);
    window.JC.render();
  };

  // DELETE VARIATION BRANCH
  btnDelete.onclick = () => {
    const n = getCursor();
    if (!isVariation(n)) return;

    const p = n.parent;
    p.vars = p.vars.filter(v => v !== n);

    window.JC.setCursor(p);
    window.JC.rebuildTo(p, true);
    window.JC.render();
  };


  /* ======================================================
   * TRACK SELECTION CHANGES
   * ====================================================== */

  document.addEventListener("click", e => {
    if (e.target.classList.contains("move")) {
      setTimeout(updateStates, 0);
    }
  });

  updateStates();

});
