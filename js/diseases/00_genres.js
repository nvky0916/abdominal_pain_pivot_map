/* ================================================================
   00_genres.js ― 疾患のジャンル（必ず一番最初に読み込む）
   ----------------------------------------------------------------
   疾患はジャンルごとのファイル（11_upper_gi.js など）に分けてある。
   各ファイルは addDiseases("ジャンルID", [疾患, 疾患, ...]) と書く。

   ★ 疾患1つの書式
     {id:"ID", l:"短い名前", n:"正式名", t:緊急度, a:["軸ID",...], k:"決め手", x:"検査"},

     id … 英数字の短い名前（全ファイルを通して重複不可）
     l  … 図の上に出す短い名前（長いと図が混む）
     n  … 右の欄に出す正式名
     t  … 緊急度  1=致死的（赤） 2=緊急（橙） 3=準緊急（白抜き）
     a  … この疾患が持つ軸。data.js の AX にあるIDを "" で囲んで並べる
           ← ここが Cluster の設定。どの軸を持たせるかを自分で考えるのが一番の勉強
     k  … 問診・身体所見の決め手（1行）
     x  … 診断の決め手になる検査（1行）

   ★ ジャンルを増やすとき
     1. 下の GENRES に1行足す
     2. diseases フォルダにファイルを作り、addDiseases("新しいID", [...]) と書く
     3. index.html に <script src="js/diseases/ファイル名.js"></script> を1行足す
   ================================================================ */

// group … 大きな分類（画面ではこの単位で見出しが付く）
// n     … ジャンルの名前
const GENRES = [
  { id: "upper_gi", group: "腹腔内", n: "食道・胃・十二指腸疾患" },
  { id: "hepatobiliary", group: "腹腔内", n: "肝胆道系・膵疾患" },
  { id: "bowel", group: "腹腔内", n: "腸疾患" },
  { id: "urinary", group: "腹腔内", n: "尿路系疾患" },
  { id: "gyn", group: "腹腔内", n: "婦人科疾患" },
  { id: "cardio", group: "腹腔外臓器", n: "心血管系" },
  { id: "resp", group: "腹腔外臓器", n: "呼吸器系" },
  { id: "esophagus", group: "腹腔外臓器", n: "食道疾患（胸部）" },
  { id: "msk", group: "腹腔外臓器", n: "筋骨格系" },
  { id: "inguinal", group: "腹腔外臓器", n: "鼠径部・陰部疾患" },
  { id: "immune", group: "全身疾患", n: "血液・アレルギー・膠原病" },
  { id: "endocrine", group: "全身疾患", n: "内分泌代謝疾患" },
  { id: "toxic", group: "全身疾患", n: "中毒" },
  { id: "infection", group: "全身疾患", n: "感染症" },
  { id: "other", group: "その他", n: "その他" }
];

// すべての疾患がここに集まる
const DIS = [];

// ジャンルのファイルから呼ばれる関数。疾患にジャンルIDを付けて DIS に追加する
function addDiseases(genreId, list) {
  if (!GENRES.some(g => g.id === genreId)) {
    DATA_PROBLEMS.push(`addDiseases("${genreId}") のジャンルIDが GENRES にない`);
  }
  for (const d of list) {
    d.g = genreId;
    DIS.push(d);
  }
}

// 読み込み中に見つかった問題をためておく（app.js が画面に表示する）
const DATA_PROBLEMS = [];
