/* 腹腔内 ― 腸疾患
   書式（項目の意味は 00_genres.js の説明を参照）
     {id:"ID", l:"短い名前", n:"正式名", t:緊急度, a:["軸ID",...], k:"決め手", x:"検査"},

   ★ 追加候補（自分で軸を考えて足してみる）
     虚血性大腸炎、腸重積、炎症性腸疾患、メッケル憩室炎、大網梗塞・腹膜垂炎
*/
addDiseases("bowel", [
{id:"ami",l:"腸間膜虚血",n:"急性腸間膜虚血",t:1,a:["eld", "sud", "writhe", "umb", "vom", "pfirst", "diar", "blood", "h48", "cont", "card"],k:"激痛なのに腹部は柔らかい",x:"乳酸・血ガス、ダイナミックCT"},
{id:"nomi",l:"NOMI",n:"非閉塞性腸管虚血",t:1,a:["eld", "grad", "diff", "cont", "card", "ckd", "drug"],k:"透析・心不全・術後、じわじわ進む",x:"乳酸、ダイナミックCT"},
{id:"str",l:"絞扼性イレウス",n:"絞扼性腸閉塞",t:1,a:["eld", "sud", "umb", "vom", "pfirst", "nogas", "h48", "cont", "surg"],k:"疝痛が持続痛に変わる、所見は初期に乏しい",x:"造影CT（closed loop・造影不良）、乳酸"},
{id:"vol",l:"腸軸捻転",n:"S状結腸軸捻転",t:1,a:["eld", "acu", "llq", "diff", "vom", "nogas", "h48", "cont"],k:"施設入所・慢性便秘、著明な膨満",x:"腹部X線（coffee bean）、CT（whirl sign）"},

/* 急性虫垂炎 */    
{id:"app",l:"虫垂炎",n:"急性虫垂炎",t:2,
 /* 小児・若年、食欲低下→gradually onset→心窩部痛、臍周囲部痛→悪心嘔吐→右下腹部痛に移動→発熱*/
 a:["yng", "grad", "move", "epi", "umb", "rlq", "mig", "vom", "pfirst", "fev", "h48", "cont","inter"],
 k:"食欲低下→心窩部痛→悪心嘔吐→右下腹部痛→発熱、間欠痛が持続に変わったら穿孔疑い",x:"CT・エコー",
 d:{patho:"虫垂の内腔がリンパ組織の肥厚や糞石などで閉塞する。\n　48時間以上経過した場合は穿孔の可能性を強く考える。\n 典型的には痛みの出現が悪心嘔吐に先行する。\n　穿孔性は汎発型と限局型に分けられる。", 
    exam:"CT：虫垂短軸径>6mm, 虫垂内腔の閉塞、壁の肥厚＞2mm、壁の造影効果、糞石の存在、周囲の脂肪組織のCT値上昇", 
    mgmt:"", 
    pit:"穿孔している場合は痛みがマシになることがあり、圧痛点が広がる。"}
},


{id:"div",l:"憩室炎",n:"大腸憩室炎",t:2,a:["eld", "grad", "move", "rlq", "llq", "fev", "cont", "rec"],k:"局所の圧痛、繰り返す",x:"CT（膿瘍・穿孔）"},
{id:"ent",l:"感染性腸炎",n:"感染性腸炎",t:3,a:["acu", "diff", "vom", "diar", "blood", "fev", "inter", "food", "trav"],k:"嘔吐が先行し下痢へ、同行者の発症",x:"多くは不要。血便・高熱なら便培養"},
{id:"sbo",l:"癒着性腸閉塞",n:"癒着性腸閉塞",t:2,a:["acu", "umb", "vom", "pfirst", "nogas", "inter", "rec", "surg"],k:"間欠的な疝痛",x:"CT（移行帯、絞扼所見の有無）"},
{id:"crc",l:"大腸癌閉塞",n:"大腸癌による閉塞",t:2,a:["eld", "grad", "llq", "vom", "blood", "nogas", "chr"],k:"体重減少・便柱狭小・貧血",x:"CT"},
{id:"ibs",l:"IBS",n:"過敏性腸症候群",t:3,a:["yng", "meal", "llq", "diar", "inter", "rec", "chr"],k:"排便で軽快、夜間症状なし",x:"警告徴候があれば大腸内視鏡"},
{id:"con",l:"便秘",n:"便秘症",t:3,a:["eld", "llq", "nogas", "inter", "chr", "drug"],k:"排便習慣の変化、オピオイド",x:"多くは不要"},
]);
