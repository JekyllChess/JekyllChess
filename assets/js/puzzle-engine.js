function renderLocalPuzzle(container, fen, allMoves) {
  const game = new Chess(fen);
  let moveIndex = 0;
  let solved = false;

  const boardDiv = document.createElement("div");
  boardDiv.className = "jc-board";

  const statusRow = document.createElement("div");
  statusRow.className = "jc-status-row";

  const turnDiv = document.createElement("span");
  turnDiv.className = "jc-turn";

  const feedback = document.createElement("span");
  feedback.className = "jc-feedback";

  statusRow.append(turnDiv, feedback);
  container.append(boardDiv, statusRow);

  const board = Chessboard(boardDiv, {
    draggable: true,
    position: fen,
    pieceTheme: "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
    onDrop: onDrop
  });

  function onDrop(src, dst) {
    if (solved) return "snapback";
    if (!isSolverTurn()) return "snapback";

    const expected = allMoves[moveIndex];
    if (typeof expected !== "string") return "snapback";

    const mv = game.move({ from: src, to: dst, promotion: "q" });
    if (!mv) return "snapback";

    if (normalizeSAN(mv.san) !== normalizeSAN(expected)) {
      game.undo();
      showWrong(feedback);
      updateTurn(turnDiv, game, solved);
      return "snapback";
    }

    moveIndex++;
    board.position(game.fen());
    showCorrect(feedback);

    setTimeout(autoPlayOpponent, 300);
    return;
  }

  function isSolverTurn() {
    const solverIsWhite = game.turn() === "w";
    return solverIsWhite === (moveIndex % 2 === 0);
  }

  function autoPlayOpponent() {
    if (moveIndex >= allMoves.length) {
      solved = true;
      showSolved(feedback);
      updateTurn(turnDiv, game, solved);
      return;
    }

    if (isSolverTurn()) {
      updateTurn(turnDiv, game, solved);
      return;
    }

    const san = allMoves[moveIndex];
    if (typeof san !== "string") {
      solved = true;
      showSolved(feedback);
      return;
    }

    const mv = game.move(san, { sloppy: true });
    if (!mv) {
      solved = true;
      showSolved(feedback);
      return;
    }

    moveIndex++;
    board.position(game.fen());
    updateTurn(turnDiv, game, solved);
  }

  updateTurn(turnDiv, game, solved);
}
