// ======================================================================
//   JekyllChess Puzzle Engine (FULL FILE)
//   - Multiple <puzzle> blocks → one board each
//   - ONE remote PGN pack per page → single-board trainer
//   - Supports:
//       FEN + Moves (SAN list)
//       FEN + PGN (inline PGN string)
//       PGN: https://url.pgn  (remote pack)
//   - Figurine-safe & Jekyll-safe
// ======================================================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("Puzzle engine loaded.");

  const puzzleNodes = Array.from(document.querySelectorAll("puzzle"));
  if (puzzleNodes.length === 0) {
    console.log("No <puzzle> blocks found.");
    return;
  }

  // ============================================================
  // FIRST PRIORITY: REMOTE PGN PACK (ONLY THE FIRST ONE)
  // ============================================================
  let remotePackInitialized = false;

  for (const node of puzzleNodes) {
    if (remotePackInitialized) break;

    const htmlRaw = node.innerHTML || "";
    const html = stripFigurines(htmlRaw);

    const pgnUrlMatch = html.match(/PGN:\s*(https?:\/\/[^\s<]+)/i);
    const fenMatch = html.match(/FEN:\s*([^<\n\r]+)/i);

    if (pgnUrlMatch && !fenMatch) {
      const url = pgnUrlMatch[1].trim();
      console.log("Remote PGN pack detected:", url);

      const wrapper = document.createElement("div");
      wrapper.style.margin = "20px 0";
      node.replaceWith(wrapper);

      initRemotePack(wrapper, url);
      remotePackInitialized = true;
    }
  }

  // ============================================================
  // SECOND PRIORITY: LOCAL PUZZLES (ONE BOARD PER BLOCK)
  // ============================================================
  for (const node of puzzleNodes) {
    if (!node.isConnected) continue;

    const htmlRaw = node.innerHTML || "";
    const html = stripFigurines(htmlRaw);

    const fenMatch = html.match(/FEN:\s*([^<\n\r]+)/i);
    if (!fenMatch) continue;

    const fen = fenMatch[1].trim();

    const movesMatch = html.match(/Moves:\s*([^<\n\r]+)/i);
    const pgnInlineMatch = html.match(/PGN:\s*([^<\n\r]+)/i);

    let sanMoves = null;

    // Moves: list
    if (movesMatch) {
      const movesLine = movesMatch[1].trim().replace(/\s+/g, " ");
      sanMoves = movesLine.split(" ");
    }

    // PGN: inline (NOT a URL)
    else if (pgnInlineMatch) {
      const pgnValue = pgnInlineMatch[1].trim();
      if (!/^https?:\/\//i.test(pgnValue)) {
        sanMoves = pgnToSanArray(pgnValue);
      }
    }

    if (!sanMoves || sanMoves.length === 0) {
      const wrapper = document.createElement("div");
      wrapper.style.margin = "20px 0";
      wrapper.innerHTML = "<div style='color:red'>Invalid puzzle block.</div>";
      node.replaceWith(wrapper);
      continue;
    }

    console.log("Local puzzle:", { fen, sanMoves });

    const wrapper = document.createElement("div");
    wrapper.style.margin = "20px 0";
    node.replaceWith(wrapper);

    renderSinglePuzzle(wrapper, fen, sanMoves);
  }
});

// ======================================================================
// Helper: strip unicode figurines (in case figurine.js touched content)
// ======================================================================
function stripFigurines(str) {
  return str.replace(/[♔♕♖♗♘♙]/g, "");
}

// ======================================================================
// Convert inline PGN into SAN list
// ======================================================================
function pgnToSanArray(pgnText) {
  let s = pgnText;

  s = s.replace(/\{[^}]*\}/g, " ");   // remove comments
  s = s.replace(/\([^)]*\)/g, " ");   // remove variations
  s = s.replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, " ");
  s = s.replace(/\d+\.(\.\.)?/g, " "); // remove move numbers

  s = s.replace(/\s+/g, " ").trim();
  if (!s) return [];

  return s.split(" ");
}

// ======================================================================
// Convert SAN list → UCI list (forward progression)
// ======================================================================
function buildUCISolution(fen, sanMoves) {
  const game = new Chess(fen);
  const solution = [];

  for (let san of sanMoves) {
    const clean = san.replace(/[!?]/g, "").trim();
    if (!clean) continue;

    const moveObj = game.move(clean, { sloppy: true });
    if (!moveObj) {
      console.error("Cannot parse SAN move:", san);
      break;
    }

    const uci = moveObj.from + moveObj.to + (moveObj.promotion || "");
    solution.push(uci);
  }

  return solution;
}

// ======================================================================
// LOCAL PUZZLE: one board per puzzle block
// ======================================================================
function renderSinglePuzzle(container, fen, sanMoves) {
  console.log("Rendering local puzzle with FEN:", fen);

  const solutionUCI = buildUCISolution(fen, sanMoves);
  const game = new Chess(fen);

  const boardDiv = document.createElement("div");
  boardDiv.style.width = "350px";

  const statusDiv = document.createElement("div");
  statusDiv.style.marginTop = "10px";
  statusDiv.style.fontSize = "16px";

  container.append(boardDiv, statusDiv);

  let step = 0;

  const board = Chessboard(boardDiv, {
    draggable: true,
    position: fen,
    pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",

    onDragStart: (_, piece) => {
      if (game.turn() === "w" && piece.startsWith("b")) return false;
      if (game.turn() === "b" && piece.startsWith("w")) return false;
    },

    onDrop: (source, target) => {
      const move = game.move({ from: source, to: target, promotion: "q" });
      if (!move) return "snapback";

      const played = move.from + move.to + (move.promotion || "");
      const expected = solutionUCI[step];

      if (played !== expected) {
        statusDiv.textContent = "❌ Wrong move";
        game.undo();
        return "snapback";
      }

      statusDiv.textContent = "✅ Correct";
      step++;

      if (step < solutionUCI.length) {
        const replySAN = sanMoves[step];
        const reply = game.move(replySAN, { sloppy: true });
        if (reply) step++;
        setTimeout(() => board.position(game.fen()), 150);
      }

      if (step >= solutionUCI.length) {
        statusDiv.textContent = "🎉 Puzzle solved!";
      }

      return true;
    },

    onSnapEnd: () => board.position(game.fen())
  });

  statusDiv.textContent = "Your move...";
}

// ======================================================================
// REMOTE PGN PACK: One trainer board per page
// ======================================================================
function initRemotePack(container, url) {
  console.log("Initializing remote PGN pack from:", url);

  // Shared state (IMPORTANT)
  let puzzles = [];
  let currentIndex = 0;
  let game = null;
  let board = null;
  let sanMoves = [];
  let solutionUCI = [];
  let step = 0;

  // UI
  const title = document.createElement("div");
  title.textContent = "Puzzle Pack";
  title.style.fontWeight = "bold";
  title.style.marginBottom = "5px";

  const infoDiv = document.createElement("div");
  infoDiv.style.marginBottom = "5px";

  const boardDiv = document.createElement("div");
  boardDiv.style.width = "350px";
  boardDiv.style.marginBottom = "10px";

  const statusDiv = document.createElement("div");
  statusDiv.style.marginBottom = "10px";

  const controlsDiv = document.createElement("div");
  controlsDiv.style.display = "flex";
  controlsDiv.style.gap = "8px";
  controlsDiv.style.marginBottom = "10px";

  const prevBtn = document.createElement("button");
  prevBtn.className = "btn btn-sm btn-secondary";
  prevBtn.textContent = "Previous";

  const nextBtn = document.createElement("button");
  nextBtn.className = "btn btn-sm btn-secondary";
  nextBtn.textContent = "Next";

  controlsDiv.append(prevBtn, nextBtn);

  container.append(title, infoDiv, boardDiv, statusDiv, controlsDiv);

  // Fetch PGN
  fetch(url)
    .then(r => r.text())
    .then(text => {
      puzzles = parsePGNPack(text);
      if (!puzzles.length) {
        statusDiv.textContent = "No puzzles found in PGN.";
        return;
      }

      console.log("Parsed remote PGN puzzles:", puzzles.length);

      initBoard();
      loadPuzzle(0);
    })
    .catch(err => {
      console.error(err);
      statusDiv.textContent = "Failed to load PGN file.";
    });

  // Create board once
  function initBoard() {
    board = Chessboard(boardDiv, {
      draggable: true,
      position: "start",
      pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",

      onDragStart: (_, piece) => {
        if (!game) return false;
        if (game.turn() === "w" && piece.startsWith("b")) return false;
        if (game.turn() === "b" && piece.startsWith("w")) return false;
      },

      onDrop: (source, target) => {
        if (!game) return "snapback";

        const move = game.move({ from: source, to: target, promotion: "q" });
        if (!move) return "snapback";

        const played = move.from + move.to + (move.promotion || "");
        const expected = solutionUCI[step];

        if (played !== expected) {
          statusDiv.textContent = "❌ Wrong move";
          game.undo();
          return "snapback";
        }

        statusDiv.textContent = "✅ Correct";
        step++;

        if (step < solutionUCI.length) {
          const replySAN = sanMoves[step];
          const reply = game.move(replySAN, { sloppy: true });
          if (reply) step++;
          setTimeout(() => board.position(game.fen()), 150);
        }

        if (step >= solutionUCI.length) {
          statusDiv.textContent = "🎉 Puzzle solved!";
        }

        return true;
      },

      onSnapEnd: () => {
        if (game) board.position(game.fen());
      }
    });

    prevBtn.onclick = () => {
      if (!puzzles.length) return;
      currentIndex = (currentIndex - 1 + puzzles.length) % puzzles.length;
      loadPuzzle(currentIndex);
    };

    nextBtn.onclick = () => {
      if (!puzzles.length) return;
      currentIndex = (currentIndex + 1) % puzzles.length;
      loadPuzzle(currentIndex);
    };
  }

  function loadPuzzle(index) {
    const p = puzzles[index];
    if (!p) return;

    infoDiv.textContent = `Puzzle ${index + 1} / ${puzzles.length}`;
    statusDiv.textContent = "Your move...";

    game = new Chess(p.fen);
    sanMoves = p.moves.slice();
    solutionUCI = buildUCISolution(p.fen, sanMoves);
    step = 0;

    board.position(p.fen);
  }
}

// ======================================================================
// Parse PGN text into puzzle objects from remote files
// ======================================================================
function parsePGNPack(text) {
  const puzzles = [];
  const cleaned = text.replace(/\r/g, "");
  const blocks = cleaned.split(/\n\n(?=\[FEN)/g);

  for (const blockRaw of blocks) {
    const block = blockRaw.trim();
    if (!block) continue;

    const fenMatch = block.match(/\[FEN\s+"([^"]+)"\]/i);
    if (!fenMatch) continue;

    const fen = fenMatch[1].trim();
    let moves = [];

    const tagMatch = block.match(/\[(Moves|Solution)\s+"([^"]+)"\]/i);
    if (tagMatch) {
      moves = pgnToSanArray(tagMatch[2]);
    } else {
      const body = block.replace(/\[[^\]]+\]/g, " ");
      moves = pgnToSanArray(body);
    }

    if (moves.length === 0) continue;

    puzzles.push({ fen, moves });
  }

  return puzzles;
}
