/* ===========================
   WORKSHEET STYLE (INJECTED)
=========================== */

const style = document.createElement("style");
style.textContent = `
worksheet{
  display:block;
  margin:2rem 0;
}

.worksheet-grid{
  display:grid;
  grid-template-columns:repeat(2,1fr);
  gap:20px;
}

.worksheet-item{
  border:1px solid #444;
  padding:10px;
  background:#111;
}

.worksheet-board{
  width:100%;
  max-width:320px;
  aspect-ratio:1/1;
}

.worksheet-item.solved{
  border:2px solid #00aa77;
}

worksheet button{
  margin-top:25px;
  padding:10px 18px;
  font-size:16px;
}
`;
document.head.appendChild(style);

/* ===========================
   MAIN
=========================== */

document.addEventListener("DOMContentLoaded", () => {

  document.querySelectorAll("worksheet").forEach(ws => {

    const m = ws.innerHTML.match(/PGN:\s*(.*)/);
    if(!m) return;

    const pgnURL = m[1].trim();
    ws.innerHTML = "";

    fetch(pgnURL)
      .then(r=>r.text())
      .then(pgn => initWorksheet(ws, pgn));

  });

});

function initWorksheet(container, pgnText){

  const games = pgnText
    .split(/\n\n(?=\[Event|\[FEN)/)
    .filter(g=>g.trim().length);

  let page = 0;
  const pageSize = 10;

  const grid = document.createElement("div");
  grid.className = "worksheet-grid";

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Next Page →";
  nextBtn.style.display = "none";

  container.append(grid,nextBtn);

  nextBtn.onclick = ()=>{
    page++;
    renderPage();
  };

  function renderPage(){

    grid.innerHTML="";
    nextBtn.style.display="none";

    const slice = games.slice(page*pageSize, page*pageSize+pageSize);

    let solved = 0;

    slice.forEach((pgn,i)=>{

      const wrapper=document.createElement("div");
      wrapper.className="worksheet-item";

      const boardDiv=document.createElement("div");
      boardDiv.className="worksheet-board";
      boardDiv.id=`board_${page}_${i}`;

      wrapper.append(boardDiv);
      grid.append(wrapper);

      /* ---------- PARSE FEN ---------- */

      let fenMatch = pgn.match(/\[FEN\s+"([^"]+)"\]/);
      if(!fenMatch){
        boardDiv.innerHTML="PGN missing FEN";
        return;
      }
      const startFen = fenMatch[1];

      /* ---------- PARSE SOLUTION MOVE ---------- */

      const temp = new Chess(startFen);
      temp.load_pgn(pgn);
      const solution = temp.history({verbose:true})[0];

      /* ---------- PLAYABLE GAME ---------- */

      const game = new Chess(startFen);

      const board = Chessboard(boardDiv.id,{
        position:startFen,
        draggable:true,
        pieceTheme:"/assets/img/chesspieces/wikipedia/{piece}.png",

        onDrop:(from,to)=>{

          const move = game.move({
            from,
            to,
            promotion:"q"
          });

          if(!move) return "snapback";

          if(move.from!==solution.from || move.to!==solution.to){
            game.undo();
            return "snapback";
          }

          board.position(game.fen());
          wrapper.classList.add("solved");
          solved++;

          if(solved===slice.length){
            if((page+1)*pageSize < games.length){
              nextBtn.style.display="block";
            }
          }
        }

      });

    });

  }

  renderPage();
}