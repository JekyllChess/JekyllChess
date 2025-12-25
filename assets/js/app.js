document.addEventListener("DOMContentLoaded", () => {

  /* ======================================================
   * DOM REFERENCES
   * ====================================================== */

  const movesDiv = document.getElementById("moves");
  const promo = document.getElementById("promo");

  const btnStart = document.getElementById("btnStart");
  const btnEnd   = document.getElementById("btnEnd");
  const btnPrev  = document.getElementById("btnPrev");
  const btnNext  = document.getElementById("btnNext");
  const btnFlip  = document.getElementById("btnFlip");

  const boardEl  = document.getElementById("board");
  const card     = movesDiv.closest(".card");
  const cardHead = card.querySelector(".cardHead");
  const cardBody = card.querySelector(".cardBody");


  /* ======================================================
   * SAN / FIGURINES
   * ====================================================== */

  const FIG = { K:"♔", Q:"♕", R:"♖", B:"♗", N:"♘" };
  const figSAN = s =>
    s.replace(/^[KQRBN]/, p => FIG[p] || p)
     .replace(/=([QRBN])/, (_, p) => "=" + FIG[p]);


  /* ======================================================
   * TREE MODEL
   * ====================================================== */

  let ID = 1;
  class Node {
    constructor(san, parent, fen) {
      this.id = "n" + ID++;
      this.san = san;
      this.parent = parent;
      this.fen = fen;
      this.next = null;   // mainline
      this.vars = [];     // variations branching here
    }
  }


  /* ======================================================
   * CHESS STATE
   * ====================================================== */

  const chess = new Chess();
  const START_FEN = chess.fen();

  const root = new Node(null, null, START_FEN);
  let cursor = root;

  let pendingPromotion = null;
  let boardOrientation = localStorage.getItem("boardOrientation") || "white";


  /* ======================================================
   * BOARD
   * ====================================================== */

  const board = Chessboard("board", {
    position: "start",
    draggable: true,
    pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
    onDrop
  });

  board.orientation(boardOrientation);

  function rebuildTo(node, animate) {
    chess.load(node?.fen || START_FEN);
    board.position(chess.fen(), !!animate);
  }


  /* ======================================================
   * MOVE INPUT
   * ====================================================== */

  function onDrop(from, to) {
    const t = new Chess(chess.fen());
    const p = t.get(from);

    if (p?.type === "p" && (to[1] === "8" || to[1] === "1")) {
      pendingPromotion = { from, to };
      promo.style.display = "flex";
      return;
    }

    const m = t.move({ from, to, promotion: "q" });
    if (!m) return "snapback";

    applyMove(m.san, t.fen());
  }

  promo.onclick = e => {
    if (!e.target.dataset.p) return;
    promo.style.display = "none";
    const t = new Chess(chess.fen());
    const m = t.move({ ...pendingPromotion, promotion: e.target.dataset.p });
    pendingPromotion = null;
    if (m) applyMove(m.san, t.fen());
  };


  /* ======================================================
   * INSERTION (CORRECT & FINAL)
   * ====================================================== */

  function applyMove(san, fen) {
    if (cursor.next && cursor.next.san === san) {
      cursor = cursor.next;
      rebuildTo(cursor, false);
      render();
      return;
    }

    const n = new Node(san, cursor, fen);

    if (!cursor.next) {
      cursor.next = n;
    } else {
      cursor.vars.push(n);
    }

    cursor = n;
    rebuildTo(n, false);
    render();
  }


  /* ======================================================
   * RENDERING (PGN-CORRECT, FINAL)
   * ====================================================== */

  function render() {
    movesDiv.innerHTML = "";
    renderMainline(root.next, movesDiv, 1);
  }

  function renderMainline(w, container, moveNo) {
    let m = moveNo;

    while (w) {
      /* White mainline */
      container.appendChild(text(m + ".\u00A0"));
      appendMove(container, w);
      container.appendChild(text(" "));

      /* Black variations after White move */
      if (w.vars.length) {
        for (const v of w.vars) {
          renderVarBlock(container, v, m, "b");
        }
      }

      const b = w.next;
      if (!b) return;

      /* Black mainline */
      appendMove(container, b);
      container.appendChild(text(" "));

      /* White variations after Black move */
      if (b.vars.length) {
        for (const v of b.vars) {
          renderVarBlock(container, v, m + 1, "w");
        }
      }

      w = b.next;
      m++;
    }
  }

  function renderVarBlock(container, node, moveNo, startSide) {
    const span = document.createElement("span");
    span.className = "variation";

    const prefix =
      startSide === "w"
        ? moveNo + ".\u00A0"
        : (moveNo - 1) + "...\u00A0";

    span.appendChild(text("(" + prefix));
    renderVariation(node, span, moveNo, startSide);
    trim(span);
    span.appendChild(text(") "));
    container.appendChild(span);
  }

  function renderVariation(node, container, moveNo, side) {
    let cur = node;
    let m = moveNo;
    let s = side;

    while (cur) {
      if (s === "w") {
        container.appendChild(text(m + ".\u00A0"));
      }

      appendMove(container, cur);
      container.appendChild(text(" "));

      if (s === "b") m++;
      s = s === "w" ? "b" : "w";
      cur = cur.next;
    }
  }

  function appendMove(container, node) {
    const span = document.createElement("span");
    span.className = "move" + (node === cursor ? " active" : "");
    span.textContent = figSAN(node.san);
    span.onclick = () => {
      cursor = node;
      rebuildTo(node, true);
      render();
    };
    container.appendChild(span);
  }

  function trim(el) {
    const t = el.lastChild;
    if (t?.nodeType === 3) {
      t.nodeValue = t.nodeValue.replace(/\s+$/, "");
      if (!t.nodeValue) el.removeChild(t);
    }
  }

  function text(t) {
    return document.createTextNode(t);
  }


  /* ======================================================
   * NAVIGATION
   * ====================================================== */

  btnStart.onclick = () => { cursor = root; rebuildTo(root, true); render(); };
  btnEnd.onclick   = () => { let n=root; while(n.next) n=n.next; cursor=n; rebuildTo(n,true); render(); };
  btnPrev.onclick  = () => { if(cursor.parent){ cursor=cursor.parent; rebuildTo(cursor,true); render(); }};
  btnNext.onclick  = () => { if(cursor.next){ cursor=cursor.next; rebuildTo(cursor,true); render(); }};

  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "ArrowLeft")  btnPrev.onclick();
    if (e.key === "ArrowRight") btnNext.onclick();
    if (e.key === "ArrowUp")    btnStart.onclick();
    if (e.key === "ArrowDown")  btnEnd.onclick();
  });


  /* ======================================================
   * ORIENTATION
   * ====================================================== */

  btnFlip.onclick = () => {
    boardOrientation = boardOrientation === "white" ? "black" : "white";
    board.orientation(boardOrientation);
    localStorage.setItem("boardOrientation", boardOrientation);
  };


  /* ======================================================
   * INIT
   * ====================================================== */

  render();
  rebuildTo(root, false);

});
