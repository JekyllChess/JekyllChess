document.addEventListener("DOMContentLoaded", () => {

  if (!window.JC) return;

  const container = document.querySelector(".placeholder-controls");
  if (!container) return;

  container.textContent = "";

  /* ======================================================
   * BUTTON FACTORY
   * ====================================================== */

  function makeButton(label, title) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    return b;
  }

  const btnFen     = makeButton("📋", "Copy FEN");
  const btnPgn     = makeButton("📄", "Copy PGN");
  const btnComment = makeButton("➕", "Add comment");
  const btnPromote = makeButton("⬆️", "Promote variation");
  const btnDelete  = makeButton("🗑️", "Delete variation");
  const btnUndo    = makeButton("↶", "Undo");

  container.append(btnFen, btnPgn, btnComment, btnPromote, btnDelete, btnUndo);


  /* ======================================================
   * COMMENT MODAL
   * ====================================================== */

  const modal = document.createElement("div");
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.6);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  `;

  modal.innerHTML = `
    <div style="
      background:#161a24;
      padding:16px;
      border-radius:12px;
      width:min(90vw,400px);
      box-shadow:0 10px 30px rgba(0,0,0,.5)
    ">
      <textarea id="jc-comment-text"
        style="width:100%;min-height:100px;padding:10px;border-radius:8px"></textarea>
      <div style="margin-top:10px;text-align:right">
        <button id="jc-comment-done">Done</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const commentBox  = modal.querySelector("#jc-comment-text");
  const commentDone = modal.querySelector("#jc-comment-done");


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

  function serializePGN() {
    const el = document.getElementById("moves");
    return el ? el.innerText.trim() : "";
  }


  /* ======================================================
   * UNDO STACK (single-level)
   * ====================================================== */

  let undoAction = null;

  function setUndo(action) {
    undoAction = action;
    btnUndo.disabled = false;
  }

  function clearUndo() {
    undoAction = null;
    btnUndo.disabled = true;
  }


  /* ======================================================
   * BUTTON ACTIONS
   * ====================================================== */

  // COPY FEN
  btnFen.onclick = () => {
    const n = getCursor();
    if (n?.fen) copy(n.fen);
  };

  // COPY PGN
  btnPgn.onclick = () => {
    copy(serializePGN());
  };

  // ADD COMMENT (modal)
  btnComment.onclick = () => {
    const n = getCursor();
    if (!n || n === window.JC.getRoot()) return;

    commentBox.value = n.comment || "";
    modal.style.display = "flex";

    commentDone.onclick = () => {
      n.comment = commentBox.value.trim();
      modal.style.display = "none";
      window.JC.render();
    };
  };

  // PROMOTE VARIATION
  btnPromote.onclick = () => {
    const n = getCursor();
    if (!isVariation(n)) return;

    const p = n.parent;
    const oldMain = p.next;

    setUndo({
      type: "promote",
      parent: p,
      promoted: n,
      previousMain: oldMain
    });

    p.vars = p.vars.filter(v => v !== n);
    if (oldMain) p.vars.unshift(oldMain);
    p.next = n;

    window.JC.setCursor(n);
    window.JC.rebuildTo(n, true);
    window.JC.render();
  };

  // DELETE VARIATION
  btnDelete.onclick = () => {
    const n = getCursor();
    if (!isVariation(n)) return;

    const p = n.parent;

    setUndo({
      type: "delete",
      parent: p,
      deleted: n
    });

    p.vars = p.vars.filter(v => v !== n);

    window.JC.setCursor(p);
    window.JC.rebuildTo(p, true);
    window.JC.render();
  };

  // UNDO
  btnUndo.onclick = () => {
    if (!undoAction) return;

    const a = undoAction;

    if (a.type === "promote") {
      const { parent, promoted, previousMain } = a;
      parent.next = previousMain;
      parent.vars = parent.vars.filter(v => v !== previousMain);
      parent.vars.unshift(promoted);
      window.JC.setCursor(promoted.parent);
    }

    if (a.type === "delete") {
      a.parent.vars.push(a.deleted);
      window.JC.setCursor(a.deleted);
    }

    window.JC.rebuildTo(window.JC.getCursor(), true);
    window.JC.render();
    clearUndo();
  };


  /* ======================================================
   * VISIBILITY / STATE MANAGEMENT
   * ====================================================== */

  function updateStates() {
    const n = getCursor();
    const varMove = isVariation(n);

    btnPromote.style.display = varMove ? "" : "none";
    btnDelete.style.display  = varMove ? "" : "none";

    btnComment.disabled = !n || n === window.JC.getRoot();
  }

  document.addEventListener("click", e => {
    if (e.target.classList.contains("move")) {
      setTimeout(updateStates, 0);
    }
  });

  clearUndo();
  updateStates();

});
