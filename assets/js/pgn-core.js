!function(){"use strict";

const e = "undefined" != typeof window ? window : globalThis;
const t = e.PGNCore = e.PGNCore || {};

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

t.PIECE_THEME_URL = "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png";

t.SAN_CORE_REGEX =
/^([O0]-[O0](-[O0])?[+#]?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?|[a-h][1-8](=[QRBN])?[+#]?)$/;

t.RESULT_REGEX = /^(1-0|0-1|1\/2-1\/2|½-½|\*)$/;
t.MOVE_NUMBER_REGEX = /^(\d+)(\.+)$/;
t.NBSP = "\u00A0";

// ------------------------------------------------------------------
// Mobile layout helper
// Ensures header + board + movelist + latest move are visible
// ------------------------------------------------------------------

t.mobileEnsureVisible = function(wrapperEl, listEl, focusEl){

  if (!wrapperEl || !listEl) return;

  // Only act on mobile
  if (window.innerWidth > 767) return;

  const wrapperRect = wrapperEl.getBoundingClientRect();
  const viewportH = window.innerHeight;

  // If wrapper already fully visible, do nothing
  if (wrapperRect.top >= 0 && wrapperRect.bottom <= viewportH) return;

  // Scroll page so wrapper top is near top with small padding
  window.scrollTo({
    top: window.pageYOffset + wrapperRect.top - 8,
    behavior: "smooth"
  });

  // Then scroll move list internally (if focus element exists)
  if (focusEl && listEl.contains(focusEl)) {
    const top =
      focusEl.offsetTop -
      listEl.offsetTop -
      listEl.clientHeight / 2;

    listEl.scrollTo({
      top,
      behavior: "smooth"
    });
  }
};

  // 2️⃣ After slight delay, scroll move list
  setTimeout(()=>{
    if (childEl) t.scrollContainerToChild(listEl, childEl);
  }, 250);
};

t.NAG_MAP = Object.freeze({
  1:"!",2:"?",3:"‼",4:"⁇",5:"⁉",6:"⁈",
  13:"→",14:"↑",15:"⇆",16:"⇄",17:"⟂",
  18:"∞",19:"⟳",20:"⟲",
  36:"⩲",37:"⩱",38:"±",39:"∓",
  40:"+=",41:"=+",42:"±",43:"∓",
  44:"⨀",45:"⨁"
});

t.EVAL_MAP = Object.freeze({
  "=":"=","+/=":"⩲","=/+":"⩱",
  "+/-":"±","+/−":"±",
  "-/+":"∓","−/+":"∓",
  "+-":"+−","+−":"+−",
  "-+":"−+","−+":"−+",
  "∞":"∞","=/∞":"⯹"
});

// ------------------------------------------------------------------
// Utilities
// ------------------------------------------------------------------

t.normalizeFigurines = function(x){
  return x ? String(x)
    .replace(/[♔♚]/g,"K")
    .replace(/[♕♛]/g,"Q")
    .replace(/[♖♜]/g,"R")
    .replace(/[♗♝]/g,"B")
    .replace(/[♘♞]/g,"N")
  : "";
};

t.appendText = function(el, txt){
  if (el && txt && typeof document!="undefined") {
    el.appendChild(document.createTextNode(String(txt)));
  }
};

t.normalizeResult = function(x){
  return x ? String(x).replace(/1\/2-1\/2/g,"½-½") : "";
};

t.extractYear = function(d){
  if(!d) return "";
  const p = String(d).split(".");
  return /^\d{4}$/.test(p[0]) ? p[0] : "";
};

t.flipName = function(n){
  if(!n) return "";
  const s = String(n).trim();
  const i = s.indexOf(",");
  return i===-1 ? s : s.slice(i+1).trim()+" "+s.slice(0,i).trim();
};

t.makeCastlingUnbreakable = function(x){
  if(!x) return "";
  const s = String(x);
  return s
    .replace(/0-0-0|O-O-O/g, m => m[0]+"\u2011"+m[2]+"\u2011"+m[4])
    .replace(/0-0|O-O/g,   m => m[0]+"\u2011"+m[2]);
};

// ------------------------------------------------------------------
// ✅ Shared SAN normalizer
// ------------------------------------------------------------------

t.normalizeSAN = function(tok){
  return String(tok||"")
    .replace(/\[%.*?]/g,"")
    .replace(/\[D\]/g,"")
    .replace(/[{}]/g,"")
    .replace(/[!?]+/g,"")
    .replace(/[+#]$/,"")
    .replace(/0/g,"O")
    .trim();
};

// ------------------------------------------------------------------
// ✅ Shared comment sanitizer
// ------------------------------------------------------------------

t.sanitizeComment = function(txt){
  return String(txt||"")
    .replace(/\[%.*?]/g,"")
    .replace(/\[D\]/g,"")
    .replace(/[{}]/g,"")
    .replace(/\s+/g," ")
    .trim() || null;
};

// ------------------------------------------------------------------
// ✅ Shared player formatter
// ------------------------------------------------------------------

t.formatPlayer = function(name, elo, title){
  const n = t.flipName(name || "");
  const ti = String(title||"").trim();
  const e2 = String(elo||"").trim();
  return `${ti ? ti+" " : ""}${n}${e2 ? " ("+e2+")" : ""}`.trim();
};

// ------------------------------------------------------------------
// ✅ Shared header builder
// ------------------------------------------------------------------

t.buildGameHeader = function(opts){

  const wrap = document.createElement("div");

  const h3 = document.createElement("h3");
  h3.className = "pgn-game-header";
  h3.textContent = `${opts.white} – ${opts.black}`;
  wrap.appendChild(h3);

  if (opts.meta) {
    const h4 = document.createElement("h4");
    h4.className = "pgn-game-subheader";
    h4.textContent = opts.meta;
    wrap.appendChild(h4);
  }

  return wrap;
};

// ------------------------------------------------------------------
// ✅ Shared scroll helper
// ------------------------------------------------------------------

t.scrollContainerToChild = function(container, child){
  if(!container || !child) return;

  const top =
    child.offsetTop -
    container.offsetTop -
    container.clientHeight / 2;

  container.scrollTo({
    top,
    behavior:"smooth"
  });
};

// ------------------------------------------------------------------
// ✅ Shared safe chessboard init
// ------------------------------------------------------------------

t.safeChessboard = function(targetEl, options, tries=30, onReady){

  if(!targetEl){
    if(tries>0)
      requestAnimationFrame(()=>t.safeChessboard(targetEl,options,tries-1,onReady));
    return;
  }

  const r = targetEl.getBoundingClientRect();

  if((r.width<=0 || r.height<=0) && tries>0){
    requestAnimationFrame(()=>t.safeChessboard(targetEl,options,tries-1,onReady));
    return;
  }

  try{
    const b = Chessboard(targetEl, options);
    if(onReady) onReady(b);
    return b;
  }catch{
    if(tries>0)
      requestAnimationFrame(()=>t.safeChessboard(targetEl,options,tries-1,onReady));
  }
};

// ------------------------------------------------------------------

try { Object.freeze(t); } catch(e){}

}();
