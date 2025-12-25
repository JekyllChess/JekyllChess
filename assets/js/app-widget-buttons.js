document.addEventListener("DOMContentLoaded", () => {

  /* ======================================================
   * DOM
   * ====================================================== */

  const container = document.querySelector(".placeholder-controls");
  if (!container) return;

  container.innerHTML = "";

  function btn(icon, title) {
    const b = document.createElement("button");
    b.textContent = icon;
    b.title = title;
    return b;
  }

  const btnFen     = btn("📋", "Copy FEN");
  const btnPgn     = btn("📄", "Copy PGN");
  const btnComment = btn("➕", "Add comment");
  const btnPromote = btn("⬆️", "Promote variation");
  const btnDelete  = btn("🗑️", "Delete variation");

  container.append(btnFen, btnPgn, btnComment, btnPromote, btnDelete);


  /* ======================================================
   * HELPERS
   * ====================================================== */

  function getCursor() {
    return window.JC?.getCursor?.();
  }

  function isVariation(node) {
    return node && node.parent && node.parent.next !== node;
  }

  function writeClipboard(text) {
    navigator.clipboard.writeText(text);
  }

  function serializePGN() {
    return document.getElementById("moves").innerText.trim();
  }

  function updateButtonStates() {
    const n = getCursor();
    const v = isVariation(n);

    btnPromote.disabled = !v;
    btnDelete.disabled  = !v;
    btnComment.disabled = !n || n === window.JC.getRoot();
  }


  /* ======================================================
   * BUTTON ACTIONS
   * ====================================================== */

  // 1️⃣ COPY FEN
  btnFen.onclick = () => {
    writeClipboard(window.JC.getFEN());
  };

  // 2️⃣ COPY PGN (visual PGN)
  btnPgn.onclick = () => {
    writeClipboard(serializePGN());
  };

  // 3️⃣ ADD COMMENT
  btnComment.onclick = () => {
    const n = getCursor();
    if (!n || n === window.JC.getRoot()) return;

    const text = prompt("Comment for this move:");
    if (!text) return;

    // Insert as PGN-style comment node
    n.comment = `{ ${text} }`;
    window.JC.render();
  };

  // 4️⃣ PROMOTE VARIATION → MAINLINE
  btnPromote.onclick = () => {
    const n = getCursor();
    if (!isVariation(n)) return;

    const p = n.parent;

    // Remove from vars
    p.vars = p.vars.filter(v => v !== n);

    // Demote old mainline
    if (p.next) p.vars.unshift(p.next);

    // Promote
    p.next = n;

    window.JC.setCursor(n);
    window.JC.rebuildTo(n, true);
    window.JC.render();
  };

  // 5️⃣ DELETE VARIATION BRANCH
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
   * SELECTION TRACKING
   * ====================================================== */

  document.addEventListener("click", e => {
    if (e.target.classList.contains("move")) {
      setTimeout(updateButtonStates, 0);
    }
  });

  updateButtonStates();

});
