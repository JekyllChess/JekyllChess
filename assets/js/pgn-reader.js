// ============================================================================
// pgn-reader.js — Interactive PGN viewer (uses PGNCore)
// Board starts at initial position
// Animated navigation
// Mobile safe
// ============================================================================

(function () {
"use strict";

if (typeof Chess !== "function") return;
if (typeof Chessboard !== "function") return;
if (!window.PGNCore) return;

const C = window.PGNCore;
const unbreak = C.makeCastlingUnbreakable || (x=>x);

// ------------------------------------------------------------

function safeChessboard(targetEl, options, tries=30, onReady){
  if(!targetEl){
    if(tries>0) requestAnimationFrame(()=>safeChessboard(targetEl,options,tries-1,onReady));
    return;
  }
  const r = targetEl.getBoundingClientRect();
  if((r.width<=0 || r.height<=0) && tries>0){
    requestAnimationFrame(()=>safeChessboard(targetEl,options,tries-1,onReady));
    return;
  }
  try{
    const b = Chessboard(targetEl,options);
    if(onReady) onReady(b);
    return b;
  }catch{
    if(tries>0) requestAnimationFrame(()=>safeChessboard(targetEl,options,tries-1,onReady));
  }
}

// ------------------------------------------------------------

function appendText(el,txt){
  if(el && txt) el.appendChild(document.createTextNode(txt));
}

function splitPGNText(text){
  const lines=text.split(/\r?\n/);
  const headers=[];
  const moves=[];
  let inHeaders=true;

  for(const line of lines){
    const t=line.trim();
    if(inHeaders && t.startsWith("[") && t.endsWith("]")) headers.push(line);
    else if(inHeaders && t==="") inHeaders=false;
    else{
      inHeaders=false;
      moves.push(line);
    }
  }
  return {headers, moveText:moves.join(" ").replace(/\s+/g," ").trim()};
}

// ============================================================

class ReaderPGNView {

constructor(src){
  if(src.__done) return;
  src.__done=true;

  this.src=src;
  this.wrapper=document.createElement("div");
  this.wrapper.className="pgn-reader-block";
  this.finalResultPrinted=false;

  this.build();
  this.applyFigurines();
  this.initBoardAndControls();
  this.bindMoveClicks();
}

// ------------------------------------------------------------

static isSANCore(tok){
  return C.SAN_CORE_REGEX.test(tok);
}

// ------------------------------------------------------------

build(){

  let raw=(this.src.textContent||"").trim();
  raw=C.normalizeFigurines(raw);

  const {headers,moveText}=splitPGNText(raw);
  const pgn=(headers.length?headers.join("\n")+"\n\n":"")+moveText;

  const chess=new Chess();
  try{ chess.load_pgn(pgn,{sloppy:true}); }catch{}

  let head={};
  try{ head=chess.header(); }catch{}

  const res=C.normalizeResult(head.Result||"");
  const hasResult=/ (1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(moveText);
  const movetext=hasResult?moveText:moveText+(res?" "+res:"");

  this.wrapper.innerHTML=
  '<div class="pgn-reader-header"></div>'+
  '<div class="pgn-reader-cols">'+
    '<div class="pgn-reader-left">'+
      '<div class="pgn-reader-board"></div>'+
      '<div class="pgn-reader-buttons">'+
        '<button class="pgn-reader-prev">◀</button>'+
        '<button class="pgn-reader-next">▶</button>'+
      '</div>'+
    '</div>'+
    '<div class="pgn-reader-right"></div>'+
  '</div>';

  this.src.replaceWith(this.wrapper);

  this.headerDiv=this.wrapper.querySelector(".pgn-reader-header");
  this.movesCol=this.wrapper.querySelector(".pgn-reader-right");
  this.boardDiv=this.wrapper.querySelector(".pgn-reader-board");

  const white=C.formatPlayer(head.White,head.WhiteElo,head.WhiteTitle);
  const black=C.formatPlayer(head.Black,head.BlackElo,head.BlackTitle);
  const y=C.extractYear(head.Date);
  const meta=(head.Event||"")+(y?", "+y:"");

  this.headerDiv.appendChild(
    C.buildGameHeader({white,black,meta})
  );

  this.parseMovetext(movetext);
}

// ------------------------------------------------------------

ensure(ctx,cls){
  if(!ctx.container){
    const p=document.createElement("p");
    p.className=cls;
    this.movesCol.appendChild(p);
    ctx.container=p;
  }
}

// ------------------------------------------------------------

parseComment(text,i,ctx){
  let j=i;
  while(j<text.length && text[j]!=="}") j++;
  let raw=text.substring(i,j).replace(/\[%.*?]/g,"").trim();
  if(text[j]==="}") j++;

  if(!raw) return j;

  if(ctx.type==="variation"){
    this.ensure(ctx,"pgn-variation");
    appendText(ctx.container," "+raw);
  }else{
    const p=document.createElement("p");
    p.className="pgn-comment";
    appendText(p,raw);
    this.movesCol.appendChild(p);
    ctx.container=null;
  }
  ctx.lastWasInterrupt=true;
  return j;
}

// ------------------------------------------------------------

handleSAN(tok,ctx){

  const core=tok.replace(/[^a-hKQRBN0-9=O0-]+$/g,"").replace(/0/g,"O");

  if(!ReaderPGNView.isSANCore(core)){
    appendText(ctx.container,tok+" ");
    return;
  }

  const base=ctx.baseHistoryLen||0;
  const count=ctx.chess.history().length;
  const ply=base+count;
  const white=ply%2===0;
  const num=Math.floor(ply/2)+1;

  if(white) appendText(ctx.container,num+"."+C.NBSP);
  else if(ctx.lastWasInterrupt) appendText(ctx.container,num+"..."+C.NBSP);

  ctx.prevFen=ctx.chess.fen();
  ctx.prevHistoryLen=ply;

  const mv=ctx.chess.move(core,{sloppy:true});
  if(!mv){
    appendText(ctx.container,tok+" ");
    return;
  }

  ctx.lastWasInterrupt=false;

  const span=document.createElement("span");
  span.className="pgn-move reader-move";
  span.dataset.fen=ctx.chess.fen();
  span.dataset.mainline=ctx.type==="main"?"1":"0";
  span.textContent=unbreak(tok)+" ";
  ctx.container.appendChild(span);

  return span;
}

// ------------------------------------------------------------

parseMovetext(t){

  const chess=new Chess();

  let ctx={
    type:"main",
    chess,
    container:null,
    parent:null,
    lastWasInterrupt:false,
    prevFen:chess.fen(),
    prevHistoryLen:0,
    baseHistoryLen:null
  };

  let i=0;

  while(i<t.length){

    const ch=t[i];

    if(/\s/.test(ch)){
      while(i<t.length && /\s/.test(t[i])) i++;
      this.ensure(ctx,ctx.type==="main"?"pgn-mainline":"pgn-variation");
      appendText(ctx.container," ");
      continue;
    }

    if(ch==="("){
      i++;
      const fen=ctx.prevFen;
      const len=ctx.prevHistoryLen;

      ctx={
        type:"variation",
        chess:new Chess(fen),
        container:null,
        parent:ctx,
        lastWasInterrupt:true,
        prevFen:fen,
        prevHistoryLen:len,
        baseHistoryLen:len
      };
      this.ensure(ctx,"pgn-variation");
      continue;
    }

    if(ch===")"){
      i++;
      if(ctx.parent){
        ctx=ctx.parent;
        ctx.lastWasInterrupt=true;
        ctx.container=null;
      }
      continue;
    }

    if(ch==="{"){
      i=this.parseComment(t,i+1,ctx);
      continue;
    }

    const start=i;
    while(i<t.length && !/\s/.test(t[i]) && !"(){}".includes(t[i])) i++;
    const tok=t.substring(start,i);
    if(!tok) continue;

    if(C.RESULT_REGEX.test(tok)){
      if(!this.finalResultPrinted){
        this.finalResultPrinted=true;
        this.ensure(ctx,"pgn-mainline");
        appendText(ctx.container,tok+" ");
      }
      continue;
    }

    if(C.MOVE_NUMBER_REGEX.test(tok)) continue;

    this.ensure(ctx,ctx.type==="main"?"pgn-mainline":"pgn-variation");
    this.handleSAN(tok,ctx);
  }
}

// ------------------------------------------------------------

applyFigurines(){
  const map={K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘"};
  this.wrapper.querySelectorAll(".pgn-move").forEach(span=>{
    const m=span.textContent.match(/^([KQRBN])(.+?)(\s*)$/);
    if(m) span.textContent=map[m[1]]+m[2]+(m[3]||"");
  });
}

// ------------------------------------------------------------

initBoardAndControls(){

  safeChessboard(this.boardDiv,{
    position:"start",
    draggable:false,
    pieceTheme:C.PIECE_THEME_URL,
    moveSpeed:"fast",
    snapSpeed:120,
    snapbackSpeed:120
  },30,(b)=>this.board=b);

  this.moveSpans=[...this.wrapper.querySelectorAll(".reader-move")];
  this.mainlineMoves=this.moveSpans.filter(s=>s.dataset.mainline==="1");
  this.mainlineIndex=-1;

  this.wrapper.querySelector(".pgn-reader-prev")
    .addEventListener("click",()=>this.prev());

  this.wrapper.querySelector(".pgn-reader-next")
    .addEventListener("click",()=>this.next());
}

// ------------------------------------------------------------

gotoSpan(span){
  if(!span) return;

  const fen=span.dataset.fen;

  if(this.board) this.board.position(fen,true);

  this.moveSpans.forEach(s=>s.classList.remove("reader-move-active"));
  span.classList.add("reader-move-active");

  span.scrollIntoView({behavior:"smooth",block:"center"});
}

// ------------------------------------------------------------

next(){
  if(!this.mainlineMoves.length) return;

  if(this.mainlineIndex<0) this.mainlineIndex=0;
  else this.mainlineIndex=Math.min(
    this.mainlineIndex+1,
    this.mainlineMoves.length-1
  );

  this.gotoSpan(this.mainlineMoves[this.mainlineIndex]);
}

prev(){
  if(!this.mainlineMoves.length) return;

  if(this.mainlineIndex<=0){
    this.mainlineIndex=-1;
    if(this.board) this.board.position("start",true);
    this.moveSpans.forEach(s=>s.classList.remove("reader-move-active"));
    return;
  }

  this.mainlineIndex--;
  this.gotoSpan(this.mainlineMoves[this.mainlineIndex]);
}

// ------------------------------------------------------------

bindMoveClicks(){
  this.moveSpans.forEach(span=>{
    span.style.cursor="pointer";
    span.addEventListener("click",()=>{
      const idx=this.mainlineMoves.indexOf(span);
      if(idx!==-1) this.mainlineIndex=idx;
      this.gotoSpan(span);
    });
  });
}

}

// ============================================================

function init(){
  document.querySelectorAll("pgn-reader")
    .forEach(el=>new ReaderPGNView(el));
}

if(document.readyState==="loading")
  document.addEventListener("DOMContentLoaded",init,{once:true});
else init();

})();
