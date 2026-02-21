/* ============================= */
/* MOBILE SCROLL LOCK            */
/* ============================= */

function lockScroll() {
  document.body.style.overflow = "hidden";
}

function unlockScroll() {
  document.body.style.overflow = "";
}

/* ============================= */
/* STORAGE KEYS                  */
/* ============================= */

const STORAGE_KEY = "worksheet_progress_v1";


/* ============================= */
/* GLOBAL REPORT CARD STATS      */
/* ============================= */

let REPORT = {
  attempted: 0,
  correct: 0,
  wrong: 0,
  currentStreak: 0,
  bestStreak: 0,
  pagesCompleted: 0
};


/* ============================= */
/* LOAD / SAVE                   */
/* ============================= */

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

function saveProgress(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}


/* ============================= */
/* DOM READY                     */
/* ============================= */

document.addEventListener("DOMContentLoaded", () => {

  const saved = loadProgress();

  const worksheets = document.querySelectorAll("worksheet");

  worksheets.forEach(ws => {

    const pgnLine = ws.innerText
      .split("\n")
      .find(l => l.trim().startsWith("PGN:"));

    if (!pgnLine) return;

    const url = pgnLine.replace("PGN:", "").trim();

    fetch(url)
      .then(r => r.text())
      .then(pgnText => {

        const puzzles = splitPGN(pgnText);

        if (saved) {
          REPORT = saved.report;
          ws._page = saved.page;
          puzzles.forEach((p, i) => {
            if (saved.puzzles[i]) {
              p.state = saved.puzzles[i];
            }
          });
        } else {
          ws._page = 0;
        }

        ws._puzzles = puzzles;

        renderPage(ws);

      });

  });

});


/* ============================= */
/* SPLIT PGN                     */
/* ============================= */

function splitPGN(text) {

  const games = text
    .replace(/\r/g, "")
    .split(/\n\s*\n(?=\[)/g)
    .map(g => g.trim())
    .filter(Boolean);

  return games.map(extractPuzzle);

}


/* ============================= */
/* EXTRACT PUZZLE                */
/* ============================= */

function extractPuzzle(pgn) {

  const fenMatch = pgn.match(/\[FEN\s+"([^"]+)"\]/);
  const startFEN = fenMatch ? fenMatch[1] : "start";

  const moveLine = pgn
    .split("\n")
    .find(l => /^[0-9]/.test(l));

  let solver = "white";
  let solutionMoves = [];

  if (moveLine) {

    if (/^[0-9]+\.\.\./.test(moveLine)) solver = "white";
    else if (/^[0-9]+\.\s/.test(moveLine)) solver = "black";

    const cleaned = moveLine
      .replace(/[0-9]+\.(\.\.)?/g, "")
      .replace(/\*/g, "")
      .trim();

    solutionMoves = cleaned.split(/\s+/);
  }

  const game = new Chess(startFEN === "start" ? undefined : startFEN);

  if (solutionMoves.length) {
    game.move(solutionMoves[0], { sloppy: true });
    solutionMoves.shift();
  }

  return {
    fen: game.fen(),
    orientation: solver === "black" ? "black" : "white",
    solution: solutionMoves,
    state: "new" // new | wrong | solved
  };

}


/* ============================= */
/* RENDER PAGE                   */
/* ============================= */

function renderPage(ws) {

  const start = ws._page * 10;
  const end = start + 10;
  const slice = ws._puzzles.slice(start, end);

  ws.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "worksheet-grid";
  ws.appendChild(grid);

  slice.forEach((puzzle, index) => {

    const cell = document.createElement("div");
    cell.className = "worksheet-item";

    const boardDiv = document.createElement("div");
    boardDiv.className = "worksheet-board";

    const feedback = document.createElement("div");
    feedback.className = "move-feedback";

    cell.appendChild(boardDiv);
    cell.appendChild(feedback);
    grid.appendChild(cell);

    const game = new Chess(puzzle.fen);

    const board = Chessboard(boardDiv, {
      position: puzzle.fen,
      orientation: puzzle.orientation,
      draggable: puzzle.state === "new",
      moveSpeed: 0,
      snapSpeed: 0,
      pieceTheme:
        "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",

      onDrop: (source, target) => {

        const move = game.move({
          from: source,
          to: target,
          promotion: "q"
        });

        if (!move) return "snapback";

        const expected = puzzle.solution[0];

        /* WRONG */
        if (!expected || move.san !== expected) {

          game.undo();
          feedback.textContent = move.san + " ❌";
          applyFigurine(feedback);

          puzzle.state = "wrong";

          REPORT.attempted++;
          REPORT.wrong++;
          REPORT.currentStreak = 0;

          cell.classList.add("disabled");
          board.draggable = false;

          persist(ws);
          return "snapback";
        }

        /* CORRECT */
        puzzle.solution.shift();
        feedback.textContent = move.san + " ✅";
        applyFigurine(feedback);
        board.position(game.fen(), false);

        if (puzzle.solution.length === 0) {

          puzzle.state = "solved";

          REPORT.attempted++;
          REPORT.correct++;
          REPORT.currentStreak++;
          REPORT.bestStreak = Math.max(REPORT.bestStreak, REPORT.currentStreak);

          cell.classList.add("disabled");
          board.draggable = false;
        }

        persist(ws);

      }

    });

    /* RESTORE STATE */

    if (puzzle.state === "wrong") {
      feedback.textContent = "❌";
      cell.classList.add("disabled");
    }

    if (puzzle.state === "solved") {
      feedback.textContent = "✅";
      cell.classList.add("disabled");
    }

  });

  /* TOOLBAR */

  const toolbar = document.createElement("div");
  toolbar.className = "worksheet-toolbar";

  const reportBtn = document.createElement("button");
  reportBtn.className = "report-btn";
  reportBtn.textContent = "Report Card";
  reportBtn.onclick = openReportCard;

  const nextBtn = document.createElement("button");
  nextBtn.className = "worksheet-next";
  nextBtn.textContent = "Next";

  const allDone = slice.every(p => p.state !== "new");
  nextBtn.disabled = !allDone;

  nextBtn.onclick = () => {
    ws._page++;
    persist(ws);
    renderPage(ws);
  };

  const resetBtn = document.createElement("button");
resetBtn.className = "report-btn";
resetBtn.textContent = "Reset Progress";
resetBtn.onclick = () => resetProgress(ws);

toolbar.appendChild(reportBtn);
toolbar.appendChild(resetBtn);
if (end < ws._puzzles.length) toolbar.appendChild(nextBtn);
ws.appendChild(toolbar);

}

function resetProgress(ws) {

  if (!confirm("Reset all worksheet progress?")) return;

  localStorage.removeItem(STORAGE_KEY);

  REPORT = {
    attempted: 0,
    correct: 0,
    wrong: 0,
    currentStreak: 0,
    bestStreak: 0,
    pagesCompleted: 0
  };

  ws._puzzles.forEach(p => p.state = "new");
  ws._page = 0;

  renderPage(ws);
}


/* ============================= */
/* PERSIST                       */
/* ============================= */

function persist(ws) {

  saveProgress({
    page: ws._page,
    report: REPORT,
    puzzles: ws._puzzles.map(p => p.state)
  });

}


/* ============================= */
/* REPORT CARD MODAL             */
/* ============================= */

function openReportCard() {

  const accuracy = REPORT.attempted
    ? Math.round((REPORT.correct / REPORT.attempted) * 100)
    : 0;

  const overlay = document.createElement("div");
  overlay.className = "report-overlay";

  overlay.innerHTML = `
    <div class="report-card">
      <div class="report-close">✖</div>
      <div class="report-title">♟ Training Report Card</div>

      <div class="report-grid">

        <div class="report-box"><span>${REPORT.attempted}</span>Attempted</div>
        <div class="report-box"><span>${REPORT.correct}</span>Correct</div>
        <div class="report-box"><span>${REPORT.wrong}</span>Wrong</div>
        <div class="report-box"><span>${accuracy}%</span>Accuracy</div>
        <div class="report-box"><span>${REPORT.currentStreak}</span>Current Streak</div>
        <div class="report-box"><span>${REPORT.bestStreak}</span>Best Streak</div>

      </div>

      <div class="progress-bar">
        <div class="progress-fill" style="width:${accuracy}%"></div>
      </div>

    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  overlay.onclick = e => { if (e.target === overlay) close(); };
  overlay.querySelector(".report-close").onclick = close;

  function close() {
    overlay.remove();
    document.body.style.overflow = "";
  }

}


/* ============================= */
/* FIGURINE APPLY                */
/* ============================= */

function applyFigurine(el) {
  if (window.ChessFigurine)
    window.ChessFigurine.run(el);
}