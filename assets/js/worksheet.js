/* ============================= */
/* STORAGE KEY                   */
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
/* MOBILE SCROLL LOCK            */
/* ============================= */

function lockScroll() {
  document.body.style.overflow = "hidden";
}

function unlockScroll() {
  document.body.style.overflow = "";
}

/* ============================= */
/* LOAD / SAVE                   */
/* ============================= */

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
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

  document.querySelectorAll("worksheet").forEach(ws => {

    const pgnLine = ws.innerText
      .split("\n")
      .find(l => l.trim().startsWith("PGN:"));

    if (!pgnLine) return;

    fetch(pgnLine.replace("PGN:", "").trim())
      .then(r => r.text())
      .then(text => {

        const puzzles = splitPGN(text);

        if (saved) {
          REPORT = saved.report;
          ws._page = saved.page || 0;
          puzzles.forEach((p, i) => {
            if (saved.puzzles[i]) p.state = saved.puzzles[i];
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

  return text.replace(/\r/g, "")
    .split(/\n\s*\n(?=\[)/g)
    .map(g => g.trim())
    .filter(Boolean)
    .map(extractPuzzle);

}

/* ============================= */
/* EXTRACT PUZZLE                */
/* ============================= */

function extractPuzzle(pgn) {

  const fenMatch = pgn.match(/\[FEN\s+"([^"]+)"\]/);
  const startFEN = fenMatch ? fenMatch[1] : "start";

  const moveLine = pgn.split("\n").find(l => /^[0-9]/.test(l));

  let solver = "white";
  let moves = [];

  if (moveLine) {

    if (/^[0-9]+\.\.\./.test(moveLine)) solver = "white";
    else if (/^[0-9]+\.\s/.test(moveLine)) solver = "black";

    moves = moveLine
      .replace(/[0-9]+\.(\.\.)?/g, "")
      .replace(/\*/g, "")
      .trim()
      .split(/\s+/);
  }

  const game = new Chess(startFEN === "start" ? undefined : startFEN);

  if (moves.length) {
    game.move(moves[0], { sloppy: true });
    moves.shift();
  }

  return {
    fen: game.fen(),
    orientation: solver === "black" ? "black" : "white",
    solution: moves,
    state: "new"
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

  slice.forEach(puzzle => {

    const cell = document.createElement("div");
    cell.className = "worksheet-item";

    const boardDiv = document.createElement("div");
    boardDiv.className = "worksheet-board";

    const feedback = document.createElement("div");
    feedback.className = "move-feedback";

    cell.append(boardDiv, feedback);
    grid.appendChild(cell);

    const game = new Chess(puzzle.fen);

    const board = Chessboard(boardDiv, {
      position: puzzle.fen,
      orientation: puzzle.orientation,
      draggable: puzzle.state === "new",
      moveSpeed: 0,
      snapSpeed: 0,
      pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",

      onDragStart: lockScroll,

      onDrop: (source, target) => {

        const move = game.move({
          from: source,
          to: target,
          promotion: "q"
        });

        if (!move) {
          unlockScroll();
          return "snapback";
        }

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
          updateNextButton(ws);
          unlockScroll();
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
        updateNextButton(ws);
        unlockScroll();

      }

    });

    if (puzzle.state !== "new") {
      cell.classList.add("disabled");
      feedback.textContent = puzzle.state === "solved" ? "✅" : "❌";
    }

  });

  const toolbar = document.createElement("div");
  toolbar.className = "worksheet-toolbar";

  const reportBtn = document.createElement("button");
  reportBtn.className = "report-btn";
  reportBtn.textContent = "Report Card";
  reportBtn.onclick = openReportCard;

  const resetBtn = document.createElement("button");
  resetBtn.className = "report-btn";
  resetBtn.textContent = "Reset Progress";
  resetBtn.onclick = () => resetProgress(ws);

  const nextBtn = document.createElement("button");
  nextBtn.className = "worksheet-next";
  nextBtn.textContent = "Next";
  ws._nextButton = nextBtn;

  nextBtn.onclick = () => {
    ws._page++;
    persist(ws);
    renderPage(ws);
  };

  toolbar.append(reportBtn, resetBtn);
  if (end < ws._puzzles.length) toolbar.appendChild(nextBtn);
  ws.appendChild(toolbar);

  updateNextButton(ws);

}

/* ============================= */
/* NEXT BUTTON LOGIC             */
/* ============================= */

function updateNextButton(ws) {

  const start = ws._page * 10;
  const end = start + 10;
  const slice = ws._puzzles.slice(start, end);

  const allDone = slice.every(
    p => p.state === "solved" || p.state === "wrong"
  );

  if (ws._nextButton)
    ws._nextButton.disabled = !allDone;

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
/* RESET                         */
/* ============================= */

function resetProgress(ws) {

  if (!confirm("Reset all progress?")) return;

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
/* REPORT CARD MODAL             */
/* ============================= */

function openReportCard() {

  const acc = REPORT.attempted
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
        <div class="report-box"><span>${acc}%</span>Accuracy</div>
        <div class="report-box"><span>${REPORT.currentStreak}</span>Streak</div>
        <div class="report-box"><span>${REPORT.bestStreak}</span>Best</div>
      </div>

      <div class="progress-bar">
        <div class="progress-fill" style="width:${acc}%"></div>
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
/* FIGURINE                      */
/* ============================= */

function applyFigurine(el) {
  if (window.ChessFigurine)
    window.ChessFigurine.run(el);
}