/* ================================================================
   app.js ― 腹痛ピボットマップの「動き」
   ----------------------------------------------------------------
   data.js のデータを読んで、図（SVG）と右の説明欄を作る。
   勉強で軸や疾患を変えるだけなら、このファイルは触らなくていい。

   全体の流れ
     0. データの書き間違いチェック
     1. 共通の道具（小さな関数）
     2. モードA：選んだ軸からベン図を作る
     3. モードD：疾患を中心にした放射状の図を作る
     4. 操作（クリック・ホバー・タブ切り替え）をつなぐ
     5. 起動

   用語
     SVG … 図を描くための仕組み。<circle>（円）や <text>（文字）を並べて描く
     ビットマスク … 「どの軸に当てはまるか」を数字1つで表す方法。
       軸が3つのとき、軸1だけ=0b001(1)、軸1と軸3=0b101(5) のように、
       各ケタが「その軸に入っているか」を表す。領域の判定に使う。
   ================================================================ */


/* ================================================================
   0. データの書き間違いチェック
   data.js で存在しない軸IDを書いたり、IDが重複したりすると、
   画面の上に赤い警告を出す。勉強中の編集ミスに気づくための仕組み。
   ================================================================ */
function validateData() {
  const problems = [];
  const catIds = CATS.map(c => c[0]);

  for (const key in AX) {
    const ax = AX[key];
    if (!catIds.includes(ax.c)) problems.push(`軸「${key}」のグループ c:"${ax.c}" が CATS にない`);
    if (!ax.n) problems.push(`軸「${key}」に名前 n がない`);
  }

  const seen = new Set();
  for (const d of DIS) {
    if (seen.has(d.id)) problems.push(`疾患ID「${d.id}」が重複している`);
    seen.add(d.id);
    if (![1, 2, 3].includes(d.t)) problems.push(`疾患「${d.l}」の緊急度 t は 1・2・3 のどれか`);
    if (!Array.isArray(d.a) || d.a.length === 0) problems.push(`疾患「${d.l}」に軸 a が1つもない`);
    for (const k of d.a || []) {
      if (!AX[k]) problems.push(`疾患「${d.l}」の軸「${k}」が AX にない（綴りを確認）`);
    }
  }

  for (const p of PRESETS) {
    if (p.a.length > 4) problems.push(`プリセット「${p.n}」の軸は4つまで`);
    for (const k of p.a) if (!AX[k]) problems.push(`プリセット「${p.n}」の軸「${k}」が AX にない`);
  }

  if (problems.length) {
    const box = document.getElementById("errors");
    box.hidden = false;
    box.innerHTML = "<b>data.js に直すところがあります</b><ul>" +
      problems.map(p => `<li>${esc(p)}</li>`).join("") + "</ul>";
  }
  return problems.length === 0;
}


/* ================================================================
   1. 共通の道具
   ================================================================ */

// 図の大きさ（SVG内の座標系）。画面の大きさとは別で、自動で拡大縮小される
const W = 1000, H = 760;
const NS = "http://www.w3.org/2000/svg";

const svg = document.getElementById("map");
const panel = document.getElementById("panel");

// SVGの部品を作る関数。el("circle", {cx:10, cy:10, r:5}, 親) のように使う
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

// 文字をHTMLに安全に埋め込むための変換（< や & が壊れないように）
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// 緊急度の名前と色（1=致死的, 2=緊急, 3=準緊急）
const TIER_NAME = ["", "致死的", "緊急", "準緊急"];
const TIER_COLOR = ["", "var(--t1)", "var(--t2)", "var(--t3)"];

// ベン図の円の色。選んだ順に1番目〜4番目の色を使う（色は style.css で定義）
const SLOT = ["var(--s0)", "var(--s1)", "var(--s2)", "var(--s3)"];

// 疾患IDから疾患データを引く辞書  byId["app"] → 虫垂炎のデータ
const byId = Object.fromEntries(DIS.map(d => [d.id, d]));

// 乱数（毎回同じ並びになるように種を固定）。配置が再読み込みで変わらないようにするため
function seededRandom(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ラベルの横幅を概算する（全角は約17px、半角は約10px）。文字が重ならないように使う
function labelWidth(s) {
  let w = 0;
  for (const ch of s) w += /[\x20-\x7e]/.test(ch) ? 9.6 : 17.2;
  return w;
}

/* --- 文字の重なり判定 ---
   箱は [左, 上, 右, 下] の4つの数で表す。
   overlaps   : 2つの箱が重なっているか
   boxDist    : 2つの箱のすき間の距離
   labelBox   : 点(x,y)の右(side=1)か左(side=-1)にラベルを置いたときの箱
   inCanvas   : 箱が図の中に収まっているか                                  */
const overlaps = (a, b, pad = 3) => !(a[2] + pad < b[0] || b[2] + pad < a[0] || a[3] + pad < b[1] || b[3] + pad < a[1]);
const boxDist = (a, b) => Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
const labelBox = (x, y, text, side) => {
  const w = labelWidth(text) + 6;
  return side > 0 ? [x - 8, y - 12, x + 12 + w, y + 12] : [x - 12 - w, y - 12, x + 8, y + 12];
};
const inCanvas = b => b[0] >= 4 && b[2] <= W - 4 && b[1] >= 4 && b[3] <= H - 4;

// 画面全体の状態。どのモードか、どの軸を選んでいるか、などをここにまとめる
const state = {
  mode: "axes",              // "axes"=軸を選ぶモード / "disease"=疾患中心モード
  sel: ["sud", "fev", "vom"], // 最初に選ばれている軸（好きに変えてよい）
  center: "ami",             // 疾患中心モードで最初に中心に置く疾患
  pinned: null               // タップで固定している対象（領域・疾患・軸）
};

// 図に描いた疾患の点を、疾患IDから引けるようにしておく
let dotNodes = {};

// 疾患の点（丸＋ラベル）を1つ描く
function drawDot(d, x, y, side, withLabel, parent) {
  const g = el("g", { class: "dg", tabindex: 0, role: "button", "aria-label": d.n }, parent);
  el("circle", { cx: x, cy: y, r: 16, class: "hit" }, g); // 指で押しやすいように透明な大きめの円
  if (d.t === 3) {
    el("circle", { cx: x, cy: y, r: 6.5, class: "m", fill: "var(--surface)", stroke: "var(--t3)", "stroke-width": 2.6 }, g);
  } else {
    el("circle", { cx: x, cy: y, r: 7.5, class: "m", fill: TIER_COLOR[d.t], stroke: "var(--surface)", "stroke-width": 2 }, g);
  }
  if (withLabel) {
    const t = el("text", { x: x + side * 12, y: y + 6, "text-anchor": side > 0 ? "start" : "end", class: "dl" }, g);
    t.textContent = d.l;
  } else {
    el("title", {}, g).textContent = d.n; // ラベルを置く場所がないときは、ホバーで名前が出るようにする
  }
  dotNodes[d.id] = g;
  return g;
}

// 条件に合わない疾患を薄くする
function dimExcept(keep) {
  for (const d of DIS) if (dotNodes[d.id]) dotNodes[d.id].classList.toggle("dim", !keep(d));
}
// 選んでいる疾患を太字にする
function markSelected(id) {
  for (const k in dotNodes) dotNodes[k].classList.toggle("on", k === id);
}

/* --- 右の説明欄に入れるHTMLの部品 --- */
const dotHTML = d => `<i class="dot d${d.t}"></i>`;

// 押せる疾患名の行
function diseaseButton(d, rightText = "") {
  return `<button class="dz" data-id="${d.id}">${dotHTML(d)}${esc(d.n)}<em>${rightText || TIER_NAME[d.t]}</em></button>`;
}

// 軸の「名前・聞き方・意味」のブロックを並べる
function questionBlocks(keys, colorOf) {
  return `<div class="qa">${keys.map(k => `
    <div style="--c:${colorOf ? colorOf(k) : "var(--line)"}">
      <b>${esc(AX[k].n)}</b><q>${esc(AX[k].q)}</q><span>${esc(AX[k].w)}</span>
    </div>`).join("")}</div>`;
}

/* --- 「次に聞くと分かれる問診」を探す ---
   候補の疾患リストを、YES と NO にできるだけ半々に分ける軸を選ぶ。
   半々に分かれる軸ほど、1つの質問で候補を大きく減らせる。
   致死的な疾患を含む側があれば少し優先する。                          */
function bestNextQuestions(list, exclude, howMany = 2) {
  if (list.length < 2) return [];
  const out = [];
  for (const k in AX) {
    if (exclude.includes(k)) continue;
    const yes = list.filter(d => d.a.includes(k));
    const no = list.filter(d => !d.a.includes(k));
    if (yes.length === 0 || no.length === 0) continue; // 全員YESか全員NOなら分けられない
    const score = Math.min(yes.length, no.length) + (yes.some(d => d.t === 1) ? 0.3 : 0);
    out.push({ k, yes, no, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, howMany);
}

function nextQuestionHTML(list, exclude, title = "次に聞くと分かれる問診") {
  const qs = bestNextQuestions(list, exclude);
  if (!qs.length) return "";
  return `<div class="sec"><h3>${title}</h3><div style="display:grid;gap:8px">${qs.map(o => `
    <div class="nq">
      <b>${esc(AX[o.k].n)}</b><span class="small">「${esc(AX[o.k].q)}」</span>
      <dl class="yn">
        <dt>YES</dt><dd>${o.yes.map(d => esc(d.l)).join("、")}</dd>
        <dt>NO</dt><dd>${o.no.map(d => esc(d.l)).join("、")}</dd>
      </dl>
    </div>`).join("")}</div></div>`;
}

function pinBar() {
  return state.pinned ? `<div class="pin"><span>固定中。もう一度タップで解除</span><button id="unpin">解除</button></div>` : "";
}

// 説明欄を書き換えたあと、中のボタンにクリック動作をつける
function bindPanel() {
  panel.querySelectorAll(".dz").forEach(b => b.onclick = () => onDiseaseClick(byId[b.dataset.id]));
  panel.querySelectorAll("[data-center]").forEach(b => b.onclick = () => goCenter(b.dataset.center));
  const u = document.getElementById("unpin");
  if (u) u.onclick = () => { state.pinned = null; refreshPanel(); };
}

// マウスの画面上の位置を、SVGの座標（0〜1000）に変換する
function toSvgPoint(e) {
  const p = svg.createSVGPoint();
  p.x = e.clientX; p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}


/* ================================================================
   2. モードA：選んだ軸からベン図を作る
   ================================================================ */

/* 軸の数ごとの図形。t:"c"=円, t:"e"=楕円（a は回転角度）
   4集合は円では全部の組み合わせを作れないので、楕円4つを使う          */
const SHAPES = {
  1: [{ t: "c", cx: 500, cy: 390, r: 320 }],
  2: [{ t: "c", cx: 370, cy: 390, r: 285 }, { t: "c", cx: 630, cy: 390, r: 285 }],
  3: [{ t: "c", cx: 500, cy: 282, r: 228 }, { t: "c", cx: 378, cy: 484, r: 228 }, { t: "c", cx: 622, cy: 484, r: 228 }],
  4: [
    { t: "e", cx: 392.8, cy: 331.2, rx: 380, ry: 180.8, a: -40 },
    { t: "e", cx: 473.2, cy: 437.6, rx: 380, ry: 180.8, a: -40 },
    { t: "e", cx: 526.8, cy: 437.6, rx: 380, ry: 180.8, a: 40 },
    { t: "e", cx: 607.2, cy: 331.2, rx: 380, ry: 180.8, a: 40 }
  ]
};

// 点(x,y)が図形の内側にあるか
function insideShape(s, x, y) {
  if (s.t === "c") return (x - s.cx) ** 2 + (y - s.cy) ** 2 < s.r * s.r;
  // 楕円：点を楕円の向きに回転させてから、楕円の式 (u/rx)²+(v/ry)² < 1 で判定
  const a = s.a * Math.PI / 180, dx = x - s.cx, dy = y - s.cy;
  const u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a);
  return (u / s.rx) ** 2 + (v / s.ry) ** 2 < 1;
}

// 図形をSVGに描く
function drawShape(s, attrs, parent) {
  if (s.t === "c") return el("circle", { cx: s.cx, cy: s.cy, r: s.r, ...attrs }, parent);
  return el("ellipse", { cx: s.cx, cy: s.cy, rx: s.rx, ry: s.ry, transform: `rotate(${s.a} ${s.cx} ${s.cy})`, ...attrs }, parent);
}

let venn = {}; // モードAの図の情報（図形、描いた疾患など）

// 点(x,y)がどの図形に入っているかをビットマスクで返す
function regionAt(x, y) {
  let m = 0;
  venn.shapes.forEach((s, i) => { if (insideShape(s, x, y)) m |= 1 << i; });
  return m;
}
// 疾患が選んだ軸のどれを持っているかをビットマスクで返す
function diseaseMask(d) {
  let m = 0;
  state.sel.forEach((k, i) => { if (d.a.includes(k)) m |= 1 << i; });
  return m;
}

function buildVenn() {
  svg.innerHTML = ""; dotNodes = {};
  const sel = state.sel, n = sel.length;
  if (!n) {
    el("text", { x: 500, y: 380, "text-anchor": "middle", class: "cnt" }, svg).textContent = "上の軸を選ぶとマップができる";
    venn = { shapes: [] };
    return;
  }
  const shapes = SHAPES[n];
  venn = { shapes };

  // ハイライト用に、各図形の形の「切り抜き型」を作っておく
  const defs = el("defs", {}, svg);
  shapes.forEach((s, i) => drawShape(s, {}, el("clipPath", { id: "cp" + i }, defs)));
  venn.defs = defs;
  venn.hlLayer = el("g", {}, svg);

  // 図形を描く
  const shapeLayer = el("g", {}, svg);
  shapes.forEach((s, i) => drawShape(s, { class: "shape", style: `--c:${SLOT[i]}` }, shapeLayer));

  /* 手順1：図全体を6px間隔の点で調べ、各点がどの領域かを記録する。
     境界に近すぎる点（11px以内）は、点を置くと線にかぶるので除く。
     deep は境界から24px以上離れた「領域の奥」の点。ここを優先して使う */
  const STEP = 6, pointsByRegion = {};
  const sameRegionAround = (x, y, m, r) => {
    for (let k = 0; k < 8; k++) {
      const xx = x + r * Math.cos(k * Math.PI / 4), yy = y + r * Math.sin(k * Math.PI / 4);
      if (regionAt(xx, yy) !== m) return false;
    }
    return true;
  };
  for (let y = 10; y < H - 10; y += STEP) {
    for (let x = 10; x < W - 10; x += STEP) {
      const m = regionAt(x, y);
      if (!m || !sameRegionAround(x, y, m, 11)) continue;
      (pointsByRegion[m] ||= []).push([x, y, sameRegionAround(x, y, m, 24)]);
    }
  }

  // すでに使った場所（箱）の一覧。左下の注記の場所は最初から予約しておく
  const used = [[10, H - 40, 330, H - 4]];

  /* 手順2：軸の名前を、その軸「だけ」の領域で、図の中心から一番遠い場所に置く */
  shapes.forEach((s, i) => {
    const text = AX[sel[i]].n, w = labelWidth(text) * 21 / 17.2 + 16;
    let best = null;
    for (const [x, y] of pointsByRegion[1 << i] || []) {
      const b = [x - w / 2, y - 16, x + w / 2, y + 8];
      if (!inCanvas(b) || used.some(u => overlaps(b, u, 6))) continue;
      const score = Math.hypot(x - 500, y - 390);
      if (!best || score > best.score) best = { score, x, y, b };
    }
    if (best) {
      used.push(best.b);
      el("text", { x: best.x, y: best.y, "text-anchor": "middle", class: "slab", style: `--c:${SLOT[i]}` }, svg).textContent = text;
    }
  });

  /* 手順3：疾患を置く。
     致死的な疾患から順に、その疾患の領域の候補点をランダムに試し、
     ほかのラベルから一番離れた場所を選ぶ。ラベルが入らなければ点だけ置く */
  const rand = seededRandom(42);
  const dotLayer = el("g", {}, svg);
  const members = DIS.filter(d => diseaseMask(d)).sort((a, b) => a.t - b.t || b.a.length - a.a.length);
  venn.members = members;
  venn.unplaced = [];

  for (const d of members) {
    const pts = pointsByRegion[diseaseMask(d)] || [];
    let best = null, bestDotOnly = null;
    for (let i = 0; i < Math.min(320, pts.length); i++) {
      const [x, y, deep] = pts[Math.floor(rand() * pts.length)];
      const dotBox = [x - 9, y - 9, x + 9, y + 9];
      if (used.some(u => overlaps(dotBox, u))) continue;
      const dotScore = Math.min(40, ...used.map(u => boxDist(dotBox, u))) + (deep ? 8 : 0);
      if (!bestDotOnly || dotScore > bestDotOnly.score) bestDotOnly = { score: dotScore, x, y, b: dotBox };
      for (const side of [1, -1]) {
        const b = labelBox(x, y, d.l, side);
        if (!inCanvas(b) || used.some(u => overlaps(b, u))) continue;
        const score = Math.min(40, ...used.map(u => boxDist(b, u))) + (deep ? 10 : 0);
        if (!best || score > best.score) best = { score, x, y, side, b };
      }
    }
    if (best) { used.push(best.b); drawDot(d, best.x, best.y, best.side, true, dotLayer); }
    else if (bestDotOnly) { used.push(bestDotOnly.b); drawDot(d, bestDotOnly.x, bestDotOnly.y, 1, false, dotLayer); }
    else venn.unplaced.push(d);
  }

  el("text", { x: 20, y: H - 16, class: "cnt" }, svg).textContent =
    `どの軸にも当てはまらない ${DIS.length - members.length}疾患は非表示`;

  // 点にマウス・タップ・キーボードの動作をつける
  for (const d of members) {
    const g = dotNodes[d.id];
    if (!g) continue;
    g.addEventListener("pointerenter", e => { if (e.pointerType === "mouse" && !state.pinned) showVennDisease(d); });
    g.addEventListener("click", e => { e.stopPropagation(); onDiseaseClick(d); });
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDiseaseClick(d); } });
  }
}

/* 領域のハイライト。
   「入っている図形すべての切り抜き型を重ね、入っていない図形の形を黒く塗った
    マスクをかける」と、ちょうどその領域だけが塗られる                    */
let maskCount = 0;
function highlightRegion(m) {
  if (!venn.hlLayer) return;
  venn.hlLayer.innerHTML = "";
  venn.defs.querySelectorAll("mask").forEach(x => x.remove());
  if (!m) return;
  const n = venn.shapes.length;
  let parent = venn.hlLayer;
  const outside = [...Array(n).keys()].filter(i => !(m >> i & 1));
  if (outside.length) {
    const mask = el("mask", { id: "mk" + (++maskCount) }, venn.defs);
    el("rect", { width: W, height: H, fill: "#fff" }, mask);
    outside.forEach(i => drawShape(venn.shapes[i], { fill: "#000" }, mask));
    parent = el("g", { mask: `url(#mk${maskCount})` }, parent);
  }
  for (let i = 0; i < n; i++) if (m >> i & 1) parent = el("g", { "clip-path": `url(#cp${i})` }, parent);
  el("rect", { width: W, height: H, class: "hlr" }, parent);
}

const slotColorOf = k => { const i = state.sel.indexOf(k); return i < 0 ? "var(--muted)" : SLOT[i]; };

// 領域の見出しタグ（入っている軸は色付き、入っていない軸は打ち消し線）
function regionTags(m) {
  return state.sel.map((k, i) => (m >> i & 1)
    ? `<span class="tag" style="--c:${SLOT[i]}">${esc(AX[k].n)}</span>`
    : `<span class="tag no">${esc(AX[k].n)}</span>`).join("");
}

// 説明欄：領域を選んだとき
function showVennRegion(m) {
  highlightRegion(m);
  const ds = venn.members.filter(d => diseaseMask(d) === m);
  dimExcept(d => diseaseMask(d) === m);
  markSelected(null);
  const inc = state.sel.filter((k, i) => m >> i & 1);
  const exc = state.sel.filter((k, i) => !(m >> i & 1));
  let h = `<div class="ptag">${regionTags(m)}</div>
    <h2>${esc(inc.map(k => AX[k].n).join(" × "))}${exc.length ? `<span class="sub">（${esc(exc.map(k => AX[k].n).join("・"))}なし）</span>` : ""}</h2>`;
  h += `<div class="sec"><h3>この領域の疾患 ${ds.length}</h3>${ds.length ? ds.map(d => diseaseButton(d)).join("") : `<p class="empty">この組み合わせに入る疾患はない。</p>`}</div>`;
  h += nextQuestionHTML(ds, state.sel);
  h += `<div class="sec"><h3>確認する問診</h3>${questionBlocks(state.sel, slotColorOf)}</div>`;
  panel.innerHTML = h + pinBar();
  bindPanel();
}

// 説明欄：疾患を選んだとき（モードA）
function showVennDisease(d) {
  const m = diseaseMask(d);
  highlightRegion(m);
  dimExcept(x => x.id === d.id || diseaseMask(x) === m);
  markSelected(d.id);
  panel.innerHTML = diseaseCard(d) + pinBar();
  bindPanel();
}

function diseaseCard(d) {
  const tags = d.a.map(k => {
    const i = state.sel.indexOf(k);
    return i >= 0 ? `<span class="tag" style="--c:${SLOT[i]}">${esc(AX[k].n)}</span>` : `<span class="tag ghost">${esc(AX[k].n)}</span>`;
  }).join("");
  return `<div class="ptag">${dotHTML(d)}<span class="small">${TIER_NAME[d.t]}</span></div>
    <h2>${esc(d.n)}</h2>
    <dl class="kv"><dt>決め手</dt><dd>${esc(d.k)}</dd><dt>検査</dt><dd>${esc(d.x)}</dd></dl>
    <div class="sec"><h3>この疾患の軸 ${d.a.length}</h3><div class="ptag">${tags}</div></div>
    <button class="btn" data-center="${d.id}">この疾患を中心にマップ →</button>`;
}

// 説明欄：何も選んでいないとき（モードA）
function showVennIntro() {
  highlightRegion(null); dimExcept(() => true); markSelected(null);
  const sel = state.sel;
  if (!sel.length) { panel.innerHTML = `<h2>軸を選ぶ</h2><p>プリセットか、上の軸を1〜4つ選ぶ。</p>`; return; }
  const all = (1 << sel.length) - 1; // すべての軸に入っている領域（例：3軸なら 0b111 = 7）
  const core = venn.members.filter(d => diseaseMask(d) === all);
  let h = `<div class="ptag">${regionTags(all)}</div><h2>全部そろうのは ${core.length} 疾患</h2>
    <p class="small">領域にカーソルを合わせる（スマホはタップ）と、その組み合わせの疾患と次の一問が出る。</p>
    <div class="sec"><h3>すべての軸に当てはまる</h3>${core.length ? core.map(d => diseaseButton(d)).join("") : `<p class="empty">なし。軸を減らすか入れ替える。</p>`}</div>`;
  h += nextQuestionHTML(core, sel);
  if (venn.unplaced.length) h += `<div class="sec"><h3>図に入りきらなかった疾患</h3>${venn.unplaced.map(d => diseaseButton(d)).join("")}</div>`;
  h += `<div class="sec"><h3>選んだ軸の問診</h3>${questionBlocks(sel, slotColorOf)}</div>`;
  panel.innerHTML = h;
  bindPanel();
}


/* ================================================================
   3. モードD：疾患を中心にした放射状の図
   中心の疾患が持つ軸を、時計の針のように放射状に並べる（スポーク）。
   ほかの疾患は
     ・共有する軸が多いほど中心に近い輪に置く
     ・共有する軸の方向（スポークの角度の平均）に寄せて置く
   ================================================================ */
let radial = {};

function buildRadial() {
  svg.innerHTML = ""; dotNodes = {};
  const c = byId[state.center], K = c.a, k = K.length, cx = 500, cy = 380;
  const R0 = 78, R1 = 318;                                  // 一番内側と外側の輪の半径
  const angleOf = i => -Math.PI / 2 + 2 * Math.PI * i / k;  // i番目のスポークの角度（真上から時計回り）

  // 周りの疾患：中心と共有する軸 S を計算し、共有が多い順に並べる
  const neighbours = DIS.filter(d => d.id !== c.id)
    .map(d => ({ d, S: d.a.filter(x => K.includes(x)) }))
    .filter(o => o.S.length > 0)
    .sort((a, b) => b.S.length - a.S.length || a.d.t - b.d.t);

  // 共有数 s → 輪の半径。実際にある最大の共有数を一番内側の輪にする
  const smax = Math.max(1, ...neighbours.map(o => o.S.length));
  const ringRadius = s => smax === 1 ? (R0 + R1) / 2 : R0 + 34 + (smax - s) / (smax - 1) * (R1 - R0 - 34);
  radial = { spokes: {}, cx, cy, neighbours };

  for (let s = 1; s <= smax; s++) el("circle", { cx, cy, r: ringRadius(s), class: "ring" }, svg);
  const ringLabelLayer = el("g", {}, svg);
  radial.connLayer = el("g", {}, svg);
  const spokeLayer = el("g", {}, svg);
  const used = [];

  // スポーク（中心の疾患の軸）を描く
  K.forEach((ax, i) => {
    const a = angleOf(i);
    const g = el("g", { class: "spk", tabindex: 0, role: "button", "aria-label": AX[ax].n }, spokeLayer);
    el("line", { x1: cx + 40 * Math.cos(a), y1: cy + 40 * Math.sin(a), x2: cx + (R1 + 12) * Math.cos(a), y2: cy + (R1 + 12) * Math.sin(a), class: "spoke" }, g);
    const lx = cx + (R1 + 26) * Math.cos(a), ly = cy + (R1 + 26) * Math.sin(a) + 6;
    const anchor = Math.abs(Math.cos(a)) < 0.3 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
    el("text", { x: lx, y: ly, "text-anchor": anchor }, g).textContent = AX[ax].n;
    const w = labelWidth(AX[ax].n), x0 = anchor === "middle" ? lx - w / 2 : anchor === "start" ? lx : lx - w;
    used.push([x0 - 4, ly - 18, x0 + w + 4, ly + 6]);
    radial.spokes[ax] = { g, a };
    g.addEventListener("pointerenter", e => { if (e.pointerType === "mouse" && !state.pinned) showRadialAxis(ax); });
    g.addEventListener("click", e => { e.stopPropagation(); state.pinned = state.pinned && state.pinned.ax === ax ? null : { ax }; refreshPanel(); });
    g.addEventListener("keydown", e => { if (e.key === "Enter") { state.pinned = { ax }; refreshPanel(); } });
  });

  // 輪のラベル「n軸」を、スポークとスポークの間に置く
  const ra = -Math.PI / 2 + Math.PI / k;
  for (let s = 1; s <= smax; s++) {
    const r = ringRadius(s), x = cx + r * Math.cos(ra), y = cy + r * Math.sin(ra);
    el("text", { x, y: y + 4, "text-anchor": "middle", class: "ringlab" }, ringLabelLayer).textContent = `${s}軸`;
    used.push([x - 22, y - 10, x + 22, y + 8]);
  }

  // 中心の疾患
  el("circle", { cx, cy, r: 12, class: "center-dot" }, svg);
  el("text", { x: cx, y: cy + 40, "text-anchor": "middle", class: "center-lab" }, svg).textContent = c.l;
  const cw = labelWidth(c.l) * 1.4;
  used.push([cx - 12, cy - 12, cx + 12, cy + 12], [cx - cw / 2, cy + 16, cx + cw / 2, cy + 46]);

  // 周りの疾患を置く
  const dotLayer = el("g", {}, svg);
  for (const o of neighbours) {
    const s = o.S.length;
    // 共有する軸のスポーク方向を足し合わせた向き＝置きたい角度
    let vx = 0, vy = 0;
    o.S.forEach(ax => { const a = angleOf(K.indexOf(ax)); vx += Math.cos(a); vy += Math.sin(a); });
    let base = Math.hypot(vx, vy) / s < 0.2 ? angleOf(K.indexOf(o.S[0])) + 0.18 : Math.atan2(vy, vx);
    if (s === 1) base += 0.1; // 1軸だけ共有する疾患は、スポークの線の真上を避ける
    const r0 = ringRadius(s);
    let placed = false;

    // 置きたい角度から少しずつ左右にずらして、ラベルが重ならない場所を探す
    search:
    for (let j = 0; j < 44; j++) {
      const off = (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 0.07;
      for (const dr of [0, 18, -18, 36, -36]) {
        const a = base + off, r = r0 + dr, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        const side = Math.cos(a) >= -0.05 ? 1 : -1; // 右半分ならラベルは右、左半分なら左
        const b = labelBox(x, y, o.d.l, side);
        if (!inCanvas(b) || used.some(u => overlaps(b, u))) continue;
        used.push(b); drawDot(o.d, x, y, side, true, dotLayer); o.x = x; o.y = y; placed = true;
        break search;
      }
    }
    // ラベルが入らなければ点だけ置く
    for (let j = 0; j < 60 && !placed; j++) {
      const a = base + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 0.06, x = cx + r0 * Math.cos(a), y = cy + r0 * Math.sin(a), b = [x - 9, y - 9, x + 9, y + 9];
      if (used.some(u => overlaps(b, u))) continue;
      used.push(b); drawDot(o.d, x, y, 1, false, dotLayer); o.x = x; o.y = y; placed = true;
    }
    if (placed) {
      const g = dotNodes[o.d.id];
      g.addEventListener("pointerenter", e => { if (e.pointerType === "mouse" && !state.pinned) showRadialNeighbour(o); });
      g.addEventListener("click", e => { e.stopPropagation(); onDiseaseClick(o.d); });
      g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDiseaseClick(o.d); } });
    }
  }
  el("text", { x: 20, y: H - 16, class: "cnt" }, svg).textContent = `軸を1つも共有しない ${DIS.length - 1 - neighbours.length}疾患は非表示`;
}

// 指定した軸のスポークを強調し、それ以外を薄くする
function highlightSpokes(axes) {
  for (const ax in radial.spokes) {
    const g = radial.spokes[ax].g;
    g.classList.toggle("on", !!axes && axes.includes(ax));
    g.classList.toggle("off", !!axes && !axes.includes(ax));
  }
}
// 周りの疾患から、共有するスポークへ点線を引く
function drawConnectors(o) {
  radial.connLayer.innerHTML = "";
  if (!o || o.x == null) return;
  const r = Math.hypot(o.x - radial.cx, o.y - radial.cy);
  o.S.forEach(ax => {
    const a = radial.spokes[ax].a;
    el("line", { x1: o.x, y1: o.y, x2: radial.cx + r * Math.cos(a), y2: radial.cy + r * Math.sin(a), class: "conn" }, radial.connLayer);
  });
}

// 説明欄：周りの疾患を選んだとき。共通しない軸＝見分けるための問診
function showRadialNeighbour(o) {
  const c = byId[state.center], d = o.d;
  highlightSpokes(o.S); drawConnectors(o); dimExcept(x => x.id === d.id); markSelected(d.id);
  const onlyCenter = c.a.filter(x => !d.a.includes(x));
  const onlyOther = d.a.filter(x => !c.a.includes(x));
  let h = `<div class="ptag">${dotHTML(d)}<span class="small">${TIER_NAME[d.t]} · ${o.S.length}/${c.a.length}軸を共有</span></div>
    <h2>${esc(c.l)} と ${esc(d.n)}</h2>
    <div class="sec"><h3>共通する軸</h3><div class="ptag">${o.S.map(k => `<span class="tag" style="--c:var(--acc)">${esc(AX[k].n)}</span>`).join("")}</div></div>
    <div class="note">見分けるには、共通しない軸を聞く。</div>`;
  if (onlyCenter.length) h += `<div class="sec"><h3>${esc(c.l)} にだけある</h3>${questionBlocks(onlyCenter, () => "var(--ink)")}</div>`;
  if (onlyOther.length) h += `<div class="sec"><h3>${esc(d.l)} にだけある</h3>${questionBlocks(onlyOther, () => "var(--t3)")}</div>`;
  h += `<dl class="kv" style="margin-top:14px"><dt>決め手</dt><dd>${esc(d.k)}</dd><dt>検査</dt><dd>${esc(d.x)}</dd></dl>
    <button class="btn" data-center="${d.id}">${esc(d.l)} を中心にする →</button>`;
  panel.innerHTML = h + pinBar();
  bindPanel();
}

// 説明欄：スポーク（軸）を選んだとき
function showRadialAxis(ax) {
  highlightSpokes([ax]); drawConnectors(null);
  dimExcept(d => d.a.includes(ax) || d.id === state.center); markSelected(null);
  const ds = radial.neighbours.filter(o => o.d.a.includes(ax)).map(o => o.d);
  panel.innerHTML = `<div class="ptag"><span class="tag" style="--c:var(--acc)">軸</span></div>
    <h2>${esc(AX[ax].n)}</h2>${questionBlocks([ax], () => "var(--acc)")}
    <div class="sec"><h3>この軸を持つ周りの疾患 ${ds.length}</h3>${ds.map(d => diseaseButton(d)).join("")}</div>` + pinBar();
  bindPanel();
}

// 説明欄：何も選んでいないとき（モードD）
function showRadialIntro() {
  const c = byId[state.center];
  highlightSpokes(null); drawConnectors(null); dimExcept(() => true); markSelected(null);
  const near = radial.neighbours.slice(0, 6);
  let h = `<div class="ptag">${dotHTML(c)}<span class="small">${TIER_NAME[c.t]}</span></div>
    <h2>${esc(c.n)}</h2>
    <dl class="kv"><dt>決め手</dt><dd>${esc(c.k)}</dd><dt>検査</dt><dd>${esc(c.x)}</dd></dl>
    <div class="sec"><h3>近い疾患（共有する軸の数）</h3>${near.map(o => diseaseButton(o.d, `${o.S.length}/${c.a.length}`)).join("")}</div>`;
  h += nextQuestionHTML(near.map(o => o.d).concat([c]), [], "近い疾患を分ける問診");
  h += `<div class="sec"><h3>この疾患の軸と問診</h3>${questionBlocks(c.a, () => "var(--acc)")}</div>`;
  panel.innerHTML = h;
  bindPanel();
}


/* ================================================================
   4. 操作をつなぐ
   ================================================================ */

// 今の状態に合わせて説明欄を描き直す
function refreshPanel() {
  const p = state.pinned;
  if (state.mode === "axes") {
    if (!p) showVennIntro();
    else if (p.m != null) showVennRegion(p.m);
    else if (p.d) showVennDisease(p.d);
  } else {
    if (!p) showRadialIntro();
    else if (p.ax) showRadialAxis(p.ax);
    else if (p.d) {
      const o = radial.neighbours.find(o => o.d.id === p.d.id);
      o ? showRadialNeighbour(o) : showRadialIntro();
    }
  }
}

// 疾患を押したとき：同じものをもう一度押すと固定を解除する
function onDiseaseClick(d) {
  if (state.mode === "disease") {
    if (d.id === state.center) return;
    const o = radial.neighbours.find(o => o.d.id === d.id);
    if (!o) { goCenter(d.id); return; } // 図にない疾患なら、その疾患を中心にする
  } else if (!dotNodes[d.id]) { goCenter(d.id); return; }
  const same = state.pinned && state.pinned.d && state.pinned.d.id === d.id;
  state.pinned = same ? null : { d };
  refreshPanel();
}

function goCenter(id) {
  state.center = id;
  diseaseSelect.value = id;
  setMode("disease");
}

// マウスを動かしたとき：その場所の領域を説明欄に出す（モードAのみ）
let lastRegion = null;
svg.addEventListener("pointermove", e => {
  if (state.mode !== "axes" || state.pinned || e.pointerType !== "mouse" || !venn.shapes.length) return;
  if (e.target.closest(".dg")) return;
  const { x, y } = toSvgPoint(e), m = regionAt(x, y);
  if (m !== lastRegion) { lastRegion = m; m ? showVennRegion(m) : showVennIntro(); }
});
svg.addEventListener("pointerleave", () => { lastRegion = null; if (!state.pinned) refreshPanel(); });

// 図をタップしたとき：領域を固定する。同じ領域や余白なら解除
svg.addEventListener("click", e => {
  if (e.target.closest(".dg,.spk")) return;
  if (state.mode === "axes" && venn.shapes.length) {
    const { x, y } = toSvgPoint(e), m = regionAt(x, y);
    state.pinned = (!m || (state.pinned && state.pinned.m === m)) ? null : { m };
  } else {
    state.pinned = null;
  }
  refreshPanel();
});

// モード切り替え
const tabAxes = document.getElementById("tabA");
const tabDisease = document.getElementById("tabD");
function setMode(mode) {
  state.mode = mode; state.pinned = null; lastRegion = null;
  tabAxes.setAttribute("aria-selected", mode === "axes");
  tabDisease.setAttribute("aria-selected", mode === "disease");
  document.getElementById("ctrlA").hidden = mode !== "axes";
  document.getElementById("ctrlD").hidden = mode !== "disease";
  mode === "axes" ? buildVenn() : buildRadial();
  refreshPanel();
}
tabAxes.onclick = () => setMode("axes");
tabDisease.onclick = () => setMode("disease");

// 軸の選択ボタンを、CATS のグループごとに並べる
const axisButtons = {};
const axisPicker = document.getElementById("axpick");
for (const [catId, catName] of CATS) {
  const row = document.createElement("div");
  row.className = "cat";
  row.innerHTML = `<span class="rowlab">${esc(catName)}</span>`;
  const box = document.createElement("div");
  box.className = "row";
  for (const k in AX) {
    if (AX[k].c !== catId) continue;
    const b = document.createElement("button");
    b.className = "ax";
    b.innerHTML = `<span class="n"></span>${esc(AX[k].n)}`;
    b.title = AX[k].q;
    b.onclick = () => {
      const i = state.sel.indexOf(k);
      if (i >= 0) state.sel.splice(i, 1);          // 選択済みなら外す
      else { state.sel.push(k); if (state.sel.length > 4) state.sel.shift(); } // 5つ目なら最初のを外す
      syncAxisButtons(); state.pinned = null; buildVenn(); refreshPanel();
    };
    axisButtons[k] = b;
    box.appendChild(b);
  }
  row.appendChild(box);
  axisPicker.appendChild(row);
}
function syncAxisButtons() {
  for (const k in axisButtons) {
    const i = state.sel.indexOf(k);
    axisButtons[k].setAttribute("aria-pressed", i >= 0);
    if (i >= 0) {
      axisButtons[k].style.setProperty("--c", SLOT[i]);
      axisButtons[k].querySelector(".n").textContent = i + 1;
    }
  }
}

// プリセットのボタン
const presetBox = document.getElementById("presets");
for (const p of PRESETS) {
  const b = document.createElement("button");
  b.className = "pre";
  b.textContent = p.n;
  b.onclick = () => { state.sel = p.a.slice(0, 4); syncAxisButtons(); state.pinned = null; buildVenn(); refreshPanel(); };
  presetBox.appendChild(b);
}

// 疾患の選択リスト（緊急度ごとにまとめる）
const diseaseSelect = document.getElementById("dsel");
for (const t of [1, 2, 3]) {
  const group = document.createElement("optgroup");
  group.label = TIER_NAME[t];
  DIS.filter(d => d.t === t).forEach(d => {
    const o = document.createElement("option");
    o.value = d.id; o.textContent = d.n;
    group.appendChild(o);
  });
  diseaseSelect.appendChild(group);
}
diseaseSelect.onchange = () => { state.center = diseaseSelect.value; state.pinned = null; buildRadial(); refreshPanel(); };


/* ================================================================
   5. 起動
   データに誤りがあっても、正しい部分だけで動くようにしておく
   ================================================================ */
validateData();
for (const d of DIS) d.a = (d.a || []).filter(k => AX[k]); // 存在しない軸は無視して続ける
state.sel = state.sel.filter(k => AX[k]);
if (!byId[state.center]) state.center = DIS[0].id;
diseaseSelect.value = state.center;
syncAxisButtons();
setMode("axes");
