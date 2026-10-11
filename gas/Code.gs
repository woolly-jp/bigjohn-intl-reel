/**
 * BIG JOHN INTL Instagram 自動投稿 — Google側の仕組み(Apps Script)
 *
 * 投稿(動画の文字とキャプション)は英語。確認画面、メール、管理シートは日本語。
 *
 * やること:
 *   1. サイトの商品を「商品」シートに読み込む。「フォルダを作る」にチェックした商品だけ、素材フォルダを作る
 *   2. 週3回、柱を順に回して「次の投稿」を組み立てる(商品・素材・文章)
 *   3. 動画づくり(GitHub側)に注文を渡し、できた動画を受け取る
 *   4. スタッフにメールで知らせ、確認画面の「投稿する」でInstagramに投稿する
 *   5. 失敗や確認忘れをメールで知らせる
 *
 * 最初に1回だけ setup を実行する。
 */

const ROOT_NAME = 'BIG JOHN INTL投稿素材';
const LIFE = '季節の着こなし';
const SUB = { unused: '未使用', next: '次に使う', used: '使用済み' };
const SHEETS = { conf: '設定', prod: '商品', log: '記録', facts: 'ヘリテージ', news: 'お知らせ' };
const HEAD = {
  conf: ['項目', '値', '説明'],
  prod: ['handle', '商品名', '分類', 'フォルダを作る', '次に投稿する', 'フォルダ名', 'フォルダID', '表示名', '品番', '色番号', '色・種類', '価格', '在庫', '季節',
    '寄りの写真番号', '使用シーンの写真番号', '最終投稿日', '全体写真URL', '写真URL一覧', '商品ページURL', '説明', 'タグ'],
  log: ['ID', '作成日時', '柱', 'テンプレート', '形式', 'handle', '商品名', '状態', '動画URL', '画像URL', 'キャプション', 'キャプション訳',
    '設定JSON', '素材ID', '確認URL', '通知日時', '投稿URL', 'メモ'],
  facts: ['テーマ', '事実(サイトに書いてある内容)', '使用日'],  // 事実は英語で書く(動画とキャプションに使う)
  news: ['タイトル(英語)', '1行目(英語)', '2行目(英語)', '関連商品名', '使用日'],
};
const PILLARS = [
  { name: '商品紹介', template: 'slide' },
  { name: '季節の着こなし', template: 'zoom' },
  { name: 'ヘリテージ', template: 'notice' },
  { name: '色落ちと経年変化', template: 'detail' },
  { name: '商品紹介', template: 'slide' },
];
// 柱ごとの書き方(AIへの注文。AIは英語で書く)
const PILLAR_NOTES = {
  '商品紹介': 'Open with the scene in the photo, then the silhouette, fabric, wash and construction.',
  '季節の着こなし': 'Write from the season and how the piece is worn or styled in the photo.',
  'ヘリテージ': 'Use ONLY the heritage fact given as "Theme". Tell it plainly, like a short piece of brand history.',
  '色落ちと経年変化': 'Write about fading, breaking in and how the piece changes with wear ONLY as far as the product description says. If the description says nothing about it, keep to the idea of wearing it for years, and do not describe specific changes.',
};
// 「色落ちと経年変化」の柱で優先する商品(説明にこの言葉がある商品)
const GROW_WORDS = /fad(e|es|ing)|break(s|ing)? in|broken[- ]in|patina|age(s|d)? (beautifully|with)|ageing|aging|better with (wear|age|time)|character|over time|rigid|raw denim|unwashed|one[- ]wash/i;
// キャプションに入れない表現(根拠のない最上級、機能・健康・環境の言い切り)。英語は語の区切りで判定する
const NG = [
  /\b(best|finest|greatest|unbeatable|unmatched|unrivall?ed|ultimate|perfect|flawless)\b/i,
  /(^|[^\w#])#1(?!\d)/,
  /\b(no\.?\s?1|number one|world[- ]class|highest[- ]quality|top[- ]quality|best[- ]in[- ]class)\b/i,
  /\b(water ?proof|water[- ]resistant|water[- ]repellent|stain[- ]?(proof|resistant)|wrinkle[- ]free|shrink[- ]?proof|non[- ]shrink)\b/i,
  /\b(anti[- ]?(bacterial|microbial|odou?r|static|viral)|odou?r[- ]free|deodori[sz]|uv[- ]?(protection|cut|block)|spf)\b/i,
  /\b(never fades?|won'?t fade|lasts? (forever|a lifetime)|lifetime guarantee|indestructible|guaranteed)\b/i,
  /\b(eco[- ]?friendly|sustainable|sustainably|environmentally friendly|planet[- ]friendly|green(er)? choice|carbon[- ]neutral|climate[- ]neutral|zero[- ]waste)\b/i,
  /\b(heal(s|ing)?|therapeutic|cure[sd]?|posture|circulation|medical)\b/i,
  /免疫|治[るりっ]|改善|効[くき果能]|予防|抗菌|防臭|消臭|日本一|世界一|最高品質|ナンバーワン/,
];
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
const ST = { wait: '動画待ち', making: '作成中', review: '確認待ち', posting: '投稿中',
  processing: '処理待ち', posted: '投稿済み', skipped: '見送り', failed: '失敗' };

/* ───────── 共通の道具 ───────── */

function props_() { return PropertiesService.getScriptProperties(); }
function ss_() { return SpreadsheetApp.openById(props_().getProperty('SHEET_ID')); }

function table_(key) {
  const sh = ss_().getSheetByName(SHEETS[key]);
  const v = sh.getDataRange().getValues();
  const head = v[0];
  const rows = v.slice(1).map(function (r, i) {
    const o = { _row: i + 2 };
    head.forEach(function (h, j) { o[h] = r[j]; });
    return o;
  });
  return { sh: sh, head: head, rows: rows };
}

function saveRow_(t, o) {
  t.sh.getRange(o._row, 1, 1, t.head.length)
    .setValues([t.head.map(function (h) { return o[h] === undefined ? '' : o[h]; })]);
}

function addRow_(key, o) {
  ss_().getSheetByName(SHEETS[key])
    .appendRow(HEAD[key].map(function (h) { return o[h] === undefined ? '' : o[h]; }));
}

const CONF_ROWS = [
  ['スタッフのメール', '', '投稿の確認メールを受け取る人。複数はカンマ区切り'],
  ['管理者のメール', '', '失敗の通知を一緒に受け取る人'],
  ['投稿曜日', '', '投稿候補を作る曜日(朝8時台に作る)。Instagramをつなぐまでは空のまま。つないだら「月,水,金」を入れる'],
  ['サイトURL', 'https://bigjohn-jeans.com', '商品情報を読むサイト'],
  ['ブランド名', 'BIG JOHN', '動画に入れる名前'],
  ['基本ハッシュタグ', '#bigjohnjeans #japanesedenim', '毎回入れるハッシュタグ。残りの枠は、商品に合わせてAIが英語で選ぶ'],
  ['AIモデル', 'claude-haiku-4-5-20251001', '文章づくりに使うモデル'],
  ['Instagram API版', 'v26.0', '通常は変更不要'],
  ['確認画面URL', '', 'ウェブアプリとして公開したあとのURL(…/exec)'],
  ['投稿の形式', '交互', '「交互」はリールとカルーセル(写真だけの通常投稿)を1本ずつ交互に。「リールのみ」「カルーセルのみ」も選べる'],
  ['ハッシュタグの上限', '5', 'Instagramで付けられるハッシュタグの数。超えた分は自動で削る'],
  ['動画に価格を入れる', 'いいえ', '「はい」にすると、動画の最後の画面に価格が出る'],
  ['文章の方針', 'Caption body: 3 to 5 short sentences in plain, confident English. Open with the scene in the photo, then fit, fabric, wash and construction. Include one or two facts from the product description. Readers are mainly in North America and Asia, many reading English as a second language: keep words simple, no slang, no idioms.',
    'AIへの注文(英語で書くと伝わりやすい。日本語でも可)。長さ、内容、言い回しを、ここを書き換えるだけで調整できる'],
];

/** プログラムの更新で増えた設定の項目を、「設定」シートの下に足す */
function ensureConf_() {
  const sh = ss_().getSheetByName(SHEETS.conf);
  const have = sh.getDataRange().getValues().map(function (r) { return r[0]; });
  CONF_ROWS.forEach(function (r) { if (have.indexOf(r[0]) < 0) sh.appendRow(r); });
}

/** プログラムの更新で増えた列を、既存のシートの右端に足す */
function ensureColumns_(key) {
  const sh = ss_().getSheetByName(SHEETS[key]);
  const head = sh.getDataRange().getValues()[0];
  HEAD[key].forEach(function (h) {
    if (head.indexOf(h) < 0) { head.push(h); sh.getRange(1, head.length).setValue(h); }
  });
}

function conf_() {
  const m = {};
  table_('conf').rows.forEach(function (r) { m[r['項目']] = String(r['値']).trim(); });
  return m;
}

function emails_(c, withOwner) {
  const list = (c['スタッフのメール'] || '').split(/[,\s、]+/).filter(String);
  if (withOwner || !list.length) (c['管理者のメール'] || '').split(/[,\s、]+/).filter(String).forEach(function (a) { list.push(a); });
  return list.filter(function (a, i) { return list.indexOf(a) === i; });
}

function notify_(subject, body, withOwner) {
  const to = emails_(conf_(), withOwner);
  if (!to.length) { Logger.log('メールの宛先が未設定: ' + subject); return; }
  MailApp.sendEmail(to.join(','), '【BIG JOHN INTL投稿】' + subject, body);
}

function now_() { return new Date(); }
function today_() { return Utilities.formatDate(now_(), 'Asia/Tokyo', 'yyyy/MM/dd'); }
function isTrue_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function strip_(html) { return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
function yen_(n) { return '¥' + String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function ensureSub_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function reviewBase_(c) { return c['確認画面URL'] || ScriptApp.getService().getUrl(); }

/* ───────── 最初の準備 ───────── */

/** 最初に1回だけ実行する。フォルダ、管理シート、定期実行をすべて用意する */
function setup() {
  const p = props_();
  let root;
  if (p.getProperty('ROOT_ID')) root = DriveApp.getFolderById(p.getProperty('ROOT_ID'));
  else { root = DriveApp.createFolder(ROOT_NAME); p.setProperty('ROOT_ID', root.getId()); }

  if (!p.getProperty('SHEET_ID')) {
    const ss = SpreadsheetApp.create('BIG JOHN INTL自動投稿 管理シート');
    p.setProperty('SHEET_ID', ss.getId());
    DriveApp.getFileById(ss.getId()).moveTo(root);
    Object.keys(SHEETS).forEach(function (k, i) {
      const sh = i === 0 ? ss.getSheets()[0].setName(SHEETS[k]) : ss.insertSheet(SHEETS[k]);
      sh.getRange(1, 1, 1, HEAD[k].length).setValues([HEAD[k]]);
      sh.setFrozenRows(1);
    });
    const me = Session.getActiveUser().getEmail();
    CONF_ROWS.forEach(function (r) {
      ss.getSheetByName(SHEETS.conf).appendRow(r[0] === '管理者のメール' ? [r[0], me, r[2]] : r);
    });
    [
      // サイト(About us)に書かれている事実。英語のまま入れる。足すときも、サイトや資料にある事実だけ
      ['創業', 'Founded in 1940 by Kotaro Osaki in Kojima, Japan, as a small sewing factory known as Maruo Clothing.', ''],
      ['国産初のジーンズ', 'In 1965, the company produced Japan\'s first domestically made jeans, released under the brand "CANTON."', ''],
      ['ワンウォッシュ', 'BIG JOHN pioneered what is now known as "one-wash denim."', ''],
      ['ブランドの誕生', 'In 1967, the company launched its original brand, BIG JOHN.', ''],
      ['100%国産', 'In 1973, BIG JOHN introduced Japan\'s first 100% domestically produced jeans.', ''],
      ['スラブ糸のセルビッジ', 'In 1983, BIG JOHN created the world\'s first selvedge denim made with slub yarn.', ''],
      ['レアジーンズ', 'The Rare Jeans, introduced in the 1980s, are made using traditional looms.', ''],
    ].forEach(function (r) { ss.getSheetByName(SHEETS.facts).appendRow(r); });
  }
  if (!p.getProperty('WEBAPP_KEY')) {
    p.setProperty('WEBAPP_KEY', (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''));
  }
  const life = ensureSub_(root, LIFE);
  Object.keys(SUB).forEach(function (k) { ensureSub_(life, SUB[k]); });
  p.setProperty('LIFE_ID', life.getId());

  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  // 朝8時台に作る → スタッフが午前中に投稿すると、北米は前日の夜、アジアは朝になる
  ScriptApp.newTrigger('scheduledCreate').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('dailyChores').timeBased().everyDays(1).atHour(6).create();

  const n = syncProducts();
  Logger.log('準備ができました。商品: ' + n + '件(フォルダは「商品」シートの「フォルダを作る」にチェックした商品だけ作られます)');
  Logger.log('素材フォルダ: ' + root.getUrl());
  Logger.log('管理シート: ' + ss_().getUrl());
  Logger.log('合言葉(GitHubの WEBAPP_KEY に入れる): ' + p.getProperty('WEBAPP_KEY'));
}

/* ───────── 商品ページとフォルダの同期 ───────── */

/**
 * 商品名から、動画に出す名前・品番・色番号・色や加工を取り出す。
 * BIG JOHN INTL の商品名は「品番 (色番号) 名前 / 加工」の形。区切りは「/」「|」、『』で型名を囲むこともある。
 *   「XX002 (001)『XXXX-EXTRA』MODEL SLIM STRAIGHT / ONE WASH」
 *      → 表示名「XXXX-EXTRA MODEL SLIM STRAIGHT」、品番「XX002」、色番号「001」、色・種類「ONE WASH」
 *   「MS003R (01EB) Selvedge Chambray Shirt | Navy Emb」→「Selvedge Chambray Shirt」「MS003R」「01EB」「Navy Emb」
 *   「M7014RC (77) WILD DUCK CANVAS SHORTS」→「WILD DUCK CANVAS SHORTS」「M7014RC」「77」「」
 * 色番号は動画に出さない(見る人には意味が伝わらないため)。動画には「品番 · 色・種類」を小さく出す。
 */
function folderNames_(products) {
  const used = {};
  const out = {};
  const tidy = function (t) {
    return String(t || '').replace(/[『「【\[]\s*([^』」】\]]+?)\s*[』」】\]]/g, ' $1 ').replace(/\s+/g, ' ').trim();
  };
  products.forEach(function (p) {
    const title = String(p.title || '').trim();
    const m = title.match(/^([A-Z0-9][A-Z0-9\-]*(?:\/[A-Z0-9][A-Z0-9\-]*)*)\s*\(([^)]*)\)\s*(.*)$/i);
    const rest = m ? m[3] : title;
    const parts = rest.split(/\s+[\/／|｜]\s+/);
    const display = tidy(parts[0]) || tidy(rest) || title;
    let folder = title;
    if (used[folder]) folder = folder + '(' + p.handle + ')';
    used[folder] = true;
    out[p.handle] = { folder: folder, display: display, code: m ? m[1].toUpperCase() : '',
      color: m ? m[2].trim() : '', variant: tidy(parts.slice(1).join(' / ')) };
  });
  return out;
}

/** 季節の初期値。北米・アジア北部(香港・韓国)の季節に合わせ、日本と同じ月で判定する */
function guessSeason_(title, category, tags) {
  const t = [title, category, [].concat(tags || []).join(' ')].join(' ');
  if (/shorts?\b|chambray|linen|breeze|seersucker|short[- ]sleeve|\bs\/s\b|summer/i.test(t)) return '春夏';
  if (/heavy ?weight|flannel|wool|corduroy|sherpa|quilt|down\b|parka|coat|knit|sweat|fleece|winter/i.test(t)) return '秋冬';
  return '通年';
}

/** vendor の空白のゆれをそろえる(「MEN/ WILD DUCK」→「MEN / WILD DUCK」) */
function category_(p) {
  return String(p.vendor || p.product_type || '').replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').trim();
}

/** サイトの商品ページを読み、フォルダと「商品」シートをそろえる(毎朝自動で実行) */
function syncProducts() {
  const c = conf_();
  const site = c['サイトURL'].replace(/\/$/, '');
  let all = [];
  for (let page = 1; page <= 10; page++) {
    const res = UrlFetchApp.fetch(site + '/products.json?limit=250&page=' + page, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('商品一覧を取得できません(' + res.getResponseCode() + ')');
    const ps = JSON.parse(res.getContentText()).products || [];
    all = all.concat(ps);
    if (ps.length < 250) break;
  }
  const names = folderNames_(all);
  ensureColumns_('prod');
  const t = table_('prod');
  const root = DriveApp.getFolderById(props_().getProperty('ROOT_ID'));
  const byHandle = {};
  t.rows.forEach(function (r) { byHandle[r.handle] = r; });

  all.forEach(function (p) {
    const info = names[p.handle];
    let r = byHandle[p.handle];
    const isNew = !r;
    if (isNew) r = { handle: p.handle, 'フォルダを作る': false, '次に投稿する': false, '季節': guessSeason_(p.title, p.vendor, p.tags), '寄りの写真番号': 2, '最終投稿日': '', '使用シーンの写真番号': '' };
    r['分類'] = category_(p);
    // フォルダは、「フォルダを作る」にチェックした商品だけ作る
    if (isTrue_(r['フォルダを作る']) && !r['フォルダID']) {
      const f = ensureSub_(root, info.folder);
      Object.keys(SUB).forEach(function (k) { ensureSub_(f, SUB[k]); });
      r['フォルダID'] = f.getId();
      r['フォルダ名'] = info.folder;
    }
    const prices = (p.variants || []).map(function (v) { return Number(v.price); }).filter(function (x) { return !isNaN(x); });
    const imgs = (p.images || []).map(function (i) { return i.src; });
    r['商品名'] = p.title;
    r['表示名'] = info.display;
    r['品番'] = info.code;
    r['色番号'] = info.color;
    r['色・種類'] = info.variant;
    r['タグ'] = [].concat(p.tags || []).join(', ');
    r['価格'] = prices.length ? yen_(Math.min.apply(null, prices)) : '';
    r['在庫'] = (p.variants || []).some(function (v) { return v.available; });
    r['全体写真URL'] = imgs[0] || '';
    r['写真URL一覧'] = imgs.join('\n');
    r['商品ページURL'] = site + '/products/' + p.handle;
    r['説明'] = strip_(p.body_html).slice(0, 1500);
    if (isNew) addRow_('prod', r); else saveRow_(t, r);
  });
  const live = {};
  all.forEach(function (p) { live[p.handle] = true; });
  t.rows.forEach(function (r) {
    if (!live[r.handle] && isTrue_(r['在庫'])) { r['在庫'] = false; saveRow_(t, r); }
  });
  checkboxes_();
  return all.length;
}

/** 「フォルダを作る」「次に投稿する」の列を、チェックボックスにする */
function checkboxes_() {
  try {
    const t = table_('prod');
    const n = t.sh.getLastRow() - 1;
    if (n < 1) return;
    ['フォルダを作る', '次に投稿する'].forEach(function (h) {
      const col = t.head.indexOf(h) + 1;
      const rng = col ? t.sh.getRange(2, col, n, 1) : null;
      if (rng && rng.insertCheckboxes) rng.insertCheckboxes();
    });
  } catch (e) { Logger.log('チェックボックスにできませんでした: ' + e); }
}

/* ───────── 素材を選ぶ ───────── */

function isVideo_(f) { return /^video\//.test(f.getMimeType()); }

function listFiles_(folder) {
  const out = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const mt = f.getMimeType();
    if (/^image\/(jpeg|png|webp)$/.test(mt) || /^video\//.test(mt)) out.push(f);
  }
  out.sort(function (a, b) { return a.getDateCreated() - b.getDateCreated(); });
  return out;
}

/**
 * フォルダから使用シーンの素材を選ぶ。
 * 「次に使う」が最優先、次に動画、残りは候補(最大6枚)を返してAIがトンマナで選ぶ。
 */
function pickWear_(folderId, exclude, imagesOnly) {
  const f = DriveApp.getFolderById(folderId);
  const ok = function (x) { return exclude.indexOf(x.getId()) < 0 && (!isVideo_(x) || (!imagesOnly && x.getSize() <= MAX_VIDEO_BYTES)); };
  const next = listFiles_(ensureSub_(f, SUB.next)).filter(ok);
  if (next.length) return { file: next[0] };
  const unused = listFiles_(ensureSub_(f, SUB.unused)).filter(ok);
  if (!unused.length) return null;
  const vids = unused.filter(isVideo_);
  if (vids.length) return { file: vids[0] };
  if (unused.length === 1) return { file: unused[0] };
  return { cands: unused.slice(0, 6) };
}

function photos_(r) { return String(r['写真URL一覧'] || '').split('\n').filter(String); }

/** 「商品」シートの「使用シーンの写真番号」で指定された、サイト上の写真のURL(なければ空) */
function siteWearUrl_(r) {
  const list = photos_(r);
  const n = parseInt(r['使用シーンの写真番号'], 10);
  return n >= 1 && n <= list.length ? list[n - 1] : '';
}

function seasonScore_(s) {
  const m = Number(Utilities.formatDate(now_(), 'Asia/Tokyo', 'M'));
  const cold = m >= 10 || m <= 3;
  if (s === '秋冬') return cold ? 2 : 0;
  if (s === '春夏') return cold ? 0 : 2;
  return 1;
}

/**
 * 投稿する商品の順番を決める。
 * 「次に投稿する」にチェックした商品が最優先。あとは、直近と同じ商品・同じ品番(色違い)・同じ分類を避け、
 * 最後の投稿から一番日が空いているもの、季節に合うものの順。フォルダのない商品も対象。
 */
function rankProducts_(avoid) {
  const all = table_('prod').rows;
  const rows = all.filter(function (r) { return isTrue_(r['在庫']); });
  const asked = function (r) { return isTrue_(r['次に投稿する']); };
  const inSeason = rows.filter(function (r) { return seasonScore_(r['季節']) > 0 || asked(r); });
  const pool = inSeason.length ? inSeason : rows;
  const cat = {}, code = {};
  all.forEach(function (r) { cat[r.handle] = String(r['分類'] || ''); code[r.handle] = String(r['品番'] || ''); });
  const recent = table_('log').rows.slice(-3);
  const recentCats = recent.map(function (r) { return cat[r.handle]; }).filter(String);
  const recentCodes = recent.map(function (r) { return code[r.handle]; }).filter(String);
  const time = function (r) { return r['最終投稿日'] ? new Date(r['最終投稿日']).getTime() : 0; };
  const rank = function (r) {
    return [asked(r) ? 0 : 1, avoid.indexOf(r.handle) >= 0 ? 1 : 0,
      recentCodes.indexOf(String(r['品番'] || '')) >= 0 && r['品番'] ? 1 : 0, recentCats.indexOf(String(r['分類'] || '')) >= 0 ? 1 : 0,
      time(r), -seasonScore_(r['季節'])];
  };
  const keyed = pool.map(function (r, i) { return { r: r, k: rank(r), i: i }; });
  keyed.sort(function (a, b) {
    for (let n = 0; n < a.k.length; n++) if (a.k[n] !== b.k[n]) return a.k[n] - b.k[n];
    return a.i - b.i;
  });
  return keyed.map(function (x) { return x.r; });
}

function driveImage_(file) {
  // AIに見せる用の小さめの画像
  try {
    const res = UrlFetchApp.fetch('https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w800',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    const type = String(res.getHeaders()['Content-Type'] || '');
    if (res.getResponseCode() === 200 && /^image\//.test(type)) {
      return { media_type: type.split(';')[0], data: Utilities.base64Encode(res.getContent()) };
    }
  } catch (e) { /* 下の方法に切り替える */ }
  if (/^image\//.test(file.getMimeType()) && file.getSize() < 4 * 1024 * 1024) {
    return { media_type: file.getMimeType(), data: Utilities.base64Encode(file.getBlob().getBytes()) };
  }
  return null;
}

function webImage_(url) {
  try {
    const res = UrlFetchApp.fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 'width=800', { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    const type = String(res.getHeaders()['Content-Type'] || 'image/jpeg').split(';')[0];
    return { media_type: type, data: Utilities.base64Encode(res.getContent()) };
  } catch (e) { return null; }
}

/* ───────── 文章をつくる(AI) ───────── */

function tagLimit_(c) { return Math.max(0, parseInt(c['ハッシュタグの上限'], 10) || 5); }
function hashtags_(text) { return String(text).match(/[#＃][^\s#＃]+/g) || []; }

/** ハッシュタグが上限を超えていたら、後ろのものから削る */
function limitHashtags_(text, limit) {
  let n = 0;
  return String(text).replace(/[ \t]*[#＃][^\s#＃]+/g, function (m) { return ++n <= limit ? m : ''; })
    .replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** AIが返した2〜3行を、行の配列にそろえる */
function lines_(v) {
  if (typeof v === 'string') v = v.split('\n');
  return (Array.isArray(v) ? v : []).map(function (x) { return String(x).trim(); }).filter(String).slice(0, 3);
}

function ngHits_(text) {
  return NG.filter(function (re) { return re.test(text); }).map(function (re) { return String(re); });
}

function claude_(c, content) {
  const key = props_().getProperty('ANTHROPIC_API_KEY');
  if (!key) return null;
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: c['AIモデル'], max_tokens: 1200, messages: [{ role: 'user', content: content }] }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('AIの呼び出しに失敗(' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 300));
  const text = JSON.parse(res.getContentText()).content
    .filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AIの返事を読めませんでした');
  return JSON.parse(m[0]);
}

// AIへの注文。投稿は英語なので、注文も英語で書く(英語のほうが文章が安定する)
const RULES = [
  'You run the Instagram account of BIG JOHN (@bigjohn.jeans_intl), the original Japanese denim brand, founded in 1940 in Kojima, Japan. The brand line is "QUALITY COMES FIRST." Readers are denim fans mainly in North America and Asia (Hong Kong, Korea, Thailand). Follow these rules strictly.',
  '- Write everything that will be posted (copy, lines, caption, hashtags) in English. Short, confident, plain sentences. No hype, no pushy sales words, no slang.',
  '- Talk about fit, silhouette, fabric, weight, wash, selvedge, stitching, construction, how it is worn, and wearing it for years. Function is never the main point.',
  '- Never claim functions or effects (waterproof, stain-resistant, antibacterial, odor, UV, wrinkle-free, shrink-proof, never fades, lasts forever), health effects, or environmental benefits (eco-friendly, sustainable, carbon neutral), even if the product description mentions them.',
  '- No unsupported superlatives: best, finest, No.1, world-class, highest quality, perfect, ultimate. Historical "firsts" may be used ONLY when they appear in the facts below.',
  '- Describe fading or aging ONLY as far as the product description says. Do not imagine changes that are not written there.',
  '- Use the product name exactly as given (do not translate it, do not include the color number in parentheses).',
  '- Do not write any effect, number, place, material or date that is not in the facts below. Never write the price.',
  '- At most one or two emoji, or none.',
  '- caption structure: line 1 = the scene or the season → body (length and content follow "Writing policy" below) → blank line → product name → "Shop via the link in our bio." → blank line → hashtags (put the base hashtags first; total number up to the hashtag limit).',
  '- Extra hashtags must be specific English words that describe the product itself (e.g. #selvedgedenim #rawdenim #madeinjapan #kojima #wideleg #workwear #chambray #ducktrousers). No engagement tags (#follow4follow, #instagood) and no trending words unrelated to the product.',
].join('\n');

/** 英語を語の切れ目で n 文字以内に切る(AIが使えないときの定型文用) */
function clip_(t, n) {
  t = String(t || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n + 1).replace(/\s+\S*$/, '');
  return cut || t.slice(0, n);
}

/**
 * 動画に載せるひとこと、キャプション(英語)、キャプションの日本語訳、(候補が複数あれば)使用シーンの素材の選択をAIに頼む。
 * AIが使えないときは、控えめな定型文にする。
 */
function writeText_(c, job) {
  const p = job.product;
  const facts = [
    'Product name: ' + (p ? p['表示名'] : '(none)') + (p && p['品番'] ? ' (style ' + p['品番'] + ')' : ''),
    'Full product title on the site: ' + (p ? p['商品名'] : ''),
    'Product description: ' + (p ? p['説明'] : ''),
    p && p['タグ'] ? 'Site tags: ' + p['タグ'] : '',
    job.fact ? 'Theme (heritage fact): ' + job.fact : '',
    job.news ? 'Announcement: ' + job.news.title + ' / ' + job.news.lines.join(' ') : '',
    'Content pillar: ' + job.pillar,
    PILLAR_NOTES[job.pillar] ? 'Pillar direction: ' + PILLAR_NOTES[job.pillar] : '',
    'Today: ' + today_(),
    'Base hashtags: ' + c['基本ハッシュタグ'],
    'Hashtag limit: ' + tagLimit_(c),
  ].filter(String).join('\n');

  const want = { caption: 'The Instagram caption in English',
    caption_ja: 'A natural Japanese translation of the caption, for Japanese staff to check the content (it is NOT posted). Keep hashtags as they are.',
    tagline: 'A short line shown small under the product name at the end of the video (max 34 characters, no period). Leaves a quiet impression. Stay within the facts and photos.' };
  if (job.format === 'carousel') {
    delete want.tagline;   // カルーセルは写真だけ。文字は載せない
  } else if (job.template === 'notice' && !job.news) {
    want.notice_title = 'Big headline on the screen (max 18 characters)';
    want.notice_lines = 'Array of 2 lines under the headline (each max 30 characters). Only the heritage fact.';
  } else if (job.template !== 'notice') {
    want.copy = 'The main line over the first photo (max 28 characters, ends with a period)';
    want.copy_lines = 'Array of 2-3 short lines shown small right under the main line (each max 32 characters, no period). The scene, fit, fabric or wash in that photo, concrete and calm.';
    if (job.template !== 'detail') {
      want.point = 'One line over the 2nd (close-up) photo about fabric, weave, stitching or construction (max 30 characters, no period, facts only)';
      want.point_lines = 'Array of 2-3 short lines under that line (each max 32 characters, no period). Fabric, weave, details, only what the facts say.';
    }
  }
  const content = [];
  const cands = job.cands || [];
  const show = function (label, img) {
    if (!img) return;
    content.push({ type: 'text', text: label + ':' });
    content.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } });
  };
  const onCopy = ' (the main line goes over this photo)';
  // 動画に使う写真そのものを見せて、写真に合った文章を書いてもらう
  if (cands.length) {
    want.pick = 'Number (1-based) of the candidate whose color and brightness are closest to the real product photo and whose tone is calm natural light';
    cands.forEach(function (f, i) { show('Scene candidate ' + (i + 1), driveImage_(f)); });
  } else if (job.wearFile) {
    show('Scene' + onCopy, driveImage_(job.wearFile));
  } else if (job.wearUrl) {
    show('Scene' + onCopy, webImage_(job.wearUrl));
  }
  if (p) show('Real product photo', webImage_(p['全体写真URL']));
  if (job.detailUrl) show('Close-up photo' + (job.template === 'detail' ? onCopy : (job.template === 'notice' ? '' : ' (the "point" line goes over this photo)')), webImage_(job.detailUrl));
  if (job.extraUrl) show('Another photo', webImage_(job.extraUrl));
  if (job.moreUrl) show('Another photo', webImage_(job.moreUrl));
  const photoRules = content.length ? [
    '',
    '[About the photos]',
    job.format === 'carousel' ? '- The photos above are posted as a carousel (a normal feed post, photos only, no text on them). Write only the caption.' : '- The photos above are used in the video (12 seconds, 3 photos).',
    '- The main line (copy) must match what is in the photo it goes over: the subject, light, scene and texture. If there are several candidates, match the one you pick.',
    '- The caption must also follow the photos. Do not write about things that are not in the photos (people, places, seasonal items) as if they were.',
  ].join('\n') : '';
  content.push({
    type: 'text',
    text: RULES + photoRules + '\n\n[Writing policy]\n' + (c['文章の方針'] || '') + '\n\n[Facts]\n' + facts + '\n\nReturn ONLY JSON with these keys:\n' + JSON.stringify(want, null, 1),
  });

  const name = p ? p['表示名'] : '';
  const fallback = {
    pick: 1,
    copy: 'Quality comes first.',
    point: '',
    tagline: '',
    caption: (name ? name + '\n' : '') + 'Shop via the link in our bio.\n\n' + c['基本ハッシュタグ'],
    caption_ja: '',
    notice_title: job.fact ? clip_(job.factTheme && /^[\x00-\x7F]+$/.test(job.factTheme) ? job.factTheme : 'Our Story', 18) : '',
    notice_lines: job.fact ? (function () { const a = clip_(job.fact, 30); const b = clip_(String(job.fact).slice(a.length), 30); return [a, b].filter(String); })() : [],
  };
  let out = null, note = '';
  try {
    out = claude_(c, content);
    if (out) {
      const check = function (o) { return ngHits_([o.caption, o.copy, o.point, o.tagline, lines_(o.copy_lines).join(' '), lines_(o.point_lines).join(' '), o.notice_title, (o.notice_lines || []).join(' ')].join(' ')); };
      if (check(out).length) {
        content.push({ type: 'text', text: 'Your previous draft contained banned expressions (' + check(out).join(' ') + '). Rewrite it without any banned expressions.' });
        out = claude_(c, content);
      }
      if (check(out).length) note = '要確認: 機能・効果・環境の言い切りや最上級の表現が残っている可能性があります';
    } else {
      note = 'AI未設定のため定型文です';
    }
  } catch (e) {
    note = 'AIが使えなかったため定型文です(' + e.message + ')';
    out = null;
  }
  const r = Object.assign({}, fallback, out || {});
  r.pick = Math.min(Math.max(1, parseInt(r.pick, 10) || 1), Math.max(1, cands.length));
  r.caption = limitHashtags_(String(r.caption || ''), tagLimit_(c));
  r.caption_ja = String(r.caption_ja || '');
  r.note = note;
  return r;
}

/* ───────── 次の投稿を組み立てる ───────── */

function recentHandles_() {
  const rows = table_('log').rows;
  return rows.slice(-2).map(function (r) { return r.handle; }).filter(String);
}

/** カルーセル(写真だけの通常投稿)の注文。写真は4:5に切り出す。文字は載せず、AI生成の写真にだけ札を付ける */
function carouselConfig_(c, job, p, wearFile) {
  return { template: 'carousel', brand: c['ブランド名'] || 'BIG JOHN', name: p['表示名'],
    ai_image: wearFile ? !/^実写/.test(wearFile.getName()) : false };
}

/**
 * 投稿候補を1つ組み立てて「記録」に追加する。
 * opt: { pillarIdx, format('reel'|'carousel'), excludeMaterials[], avoidHandles[], news{row,title,lines,related}, memo }
 */
function createJob_(opt) {
  ensureColumns_('prod');
  ensureConf_();
  const c = conf_();
  const pillar = PILLARS[opt.pillarIdx % PILLARS.length];
  const excl = opt.excludeMaterials || [];
  const ranked = rankProducts_((opt.avoidHandles || []).concat(recentHandles_()));
  if (!ranked.length) throw new Error('投稿できる商品がありません(在庫と「商品」シートを確認してください)');

  const job = { pillar: opt.news ? 'お知らせ' : pillar.name, template: opt.news ? 'notice' : pillar.template, memo: opt.memo || '',
    format: opt.news ? 'reel' : (opt.format === 'carousel' ? 'carousel' : 'reel') };  // お知らせは文字が要るので必ずリール
  const photoOnly = job.format === 'carousel';
  let wear = null;

  // 「次に投稿する」にチェックした商品があれば、その商品で作る
  const asked = isTrue_(ranked[0]['次に投稿する']) ? ranked[0] : null;
  const pool = asked ? [asked] : ranked;
  if (asked) job.memo = (job.memo + ' 「次に投稿する」の商品').trim();

  if (job.template === 'slide' || job.template === 'zoom') {
    if (job.template === 'zoom') {
      wear = pickWear_(props_().getProperty('LIFE_ID'), excl, photoOnly);
      if (wear) job.product = ranked[0];
    }
    for (let i = 0; !wear && i < pool.length; i++) {
      if (!pool[i]['フォルダID']) continue;
      wear = pickWear_(pool[i]['フォルダID'], excl, photoOnly);
      if (wear) job.product = pool[i];
    }
    for (let i = 0; !wear && !job.wearUrl && i < pool.length; i++) {
      // フォルダに素材がなければ、サイトの商品ページにある使用シーンの写真を使う
      job.wearUrl = siteWearUrl_(pool[i]);
      if (job.wearUrl) { job.product = pool[i]; job.memo = (job.memo + ' サイトの写真を使用').trim(); }
    }
    if (!wear && !job.wearUrl) {
      // 使用シーンの写真がひとつもない → 商品写真だけで作れるディテール型に切り替える
      job.template = 'detail';
      job.memo = (job.memo + ' 使用シーンの写真がないためディテール型に変更').trim();
    }
  }
  if (job.template === 'detail') {
    const many = function (r) { return photos_(r).length >= 2; };
    // 色落ち・経年変化の話がある商品を優先する。ただし直近に出した商品・品番(色違い)は続けない
    const recentRows = table_('log').rows.slice(-3);
    const recentH = (opt.avoidHandles || []).concat(recentRows.map(function (r) { return r.handle; }));
    const codeOf = {};
    table_('prod').rows.forEach(function (r) { codeOf[r.handle] = String(r['品番'] || ''); });
    const recentC = recentRows.map(function (r) { return codeOf[r.handle]; }).filter(String);
    const fresh_ = function (r) { return recentH.indexOf(r.handle) < 0 && (!r['品番'] || recentC.indexOf(String(r['品番'])) < 0); };
    const grow = pillar.name === '色落ちと経年変化' && !opt.news
      ? ranked.slice(0, 40).filter(function (r) { return many(r) && fresh_(r) && GROW_WORDS.test(String(r['説明'])); })[0] : null;
    job.product = asked || grow || ranked.filter(many)[0] || ranked[0];
  }
  if (job.template === 'notice') {
    if (opt.news) {
      job.news = opt.news;
      job.product = ranked.filter(function (r) { return opt.news.related && String(r['商品名']).indexOf(opt.news.related) >= 0; })[0] || ranked[0];
    } else {
      const ft = table_('facts');
      const facts = ft.rows.filter(function (r) { return r['事実(サイトに書いてある内容)']; });
      if (!facts.length) throw new Error('「ヘリテージ」シートが空です');
      facts.sort(function (a, b) { return (a['使用日'] ? new Date(a['使用日']).getTime() : 0) - (b['使用日'] ? new Date(b['使用日']).getTime() : 0); });
      job.fact = facts[0]['事実(サイトに書いてある内容)'];
      job.factTheme = facts[0]['テーマ'];
      job.factRow = facts[0]._row;
      job.product = ranked[0];
    }
  }

  const p = job.product;
  const imgs = photos_(p);
  // 3枚構成: 同じ写真が2回出ないように、まだ使っていない写真から順に割り当てる
  const same = function (a, b) { return !!a && !!b && String(a).trim() === String(b).trim(); };
  const taken = [p['全体写真URL']];
  if (job.wearUrl) taken.push(job.wearUrl);
  const fresh = function (prefer) {
    const free = function (u) { return u && !taken.some(function (t) { return same(t, u); }); };
    const u = free(prefer) ? prefer : imgs.filter(free)[0];
    if (u) taken.push(u);
    return u || '';
  };
  const detailNo = Math.min(Math.max(1, parseInt(p['寄りの写真番号'], 10) || 2), imgs.length);
  job.detailUrl = fresh(imgs[detailNo - 1]);
  if (job.template === 'detail') job.extraUrl = fresh('');
  if (!job.detailUrl || (job.template === 'detail' && !job.extraUrl)) {
    // サイトの写真が足りない商品は、やむをえず同じ写真を使い、メモに残す
    job.detailUrl = job.detailUrl || imgs[detailNo - 1] || imgs[0];
    if (job.template === 'detail') job.extraUrl = job.extraUrl || imgs[0];
    job.memo = (job.memo + ' サイトの写真が少ないため同じ写真を使用').trim();
  }
  if (job.format === 'carousel') {
    // カルーセル: 着用写真 → 寄り → 商品 → 別カット(最大5枚)。写真が2枚に満たない商品はリールにする
    if (job.template !== 'detail') job.extraUrl = fresh('');
    job.moreUrl = fresh('');
    const n = (wear || job.wearUrl ? 1 : 0) + [job.detailUrl, p['全体写真URL'], job.extraUrl, job.moreUrl]
      .filter(function (u, i, a) { return u && a.indexOf(u) === i; }).length;
    if (n < 2) { job.format = 'reel'; job.extraUrl = job.template === 'detail' ? job.extraUrl : ''; job.moreUrl = ''; job.memo = (job.memo + ' 写真が足りないためリールに変更').trim(); }
  }
  job.cands = wear && wear.cands ? wear.cands : [];
  job.wearFile = wear && wear.file ? wear.file : null;
  const text = writeText_(c, job);
  const wearFile = wear ? (wear.file || wear.cands[text.pick - 1] || wear.cands[0]) : null;

  const config = job.format === 'carousel' ? carouselConfig_(c, job, p, wearFile) : {
    template: job.template, brand: c['ブランド名'] || 'BIG JOHN',
    name: p['表示名'], variant: [p['品番'], p['色・種類']].filter(String).join(' · '), price: /^(はい|TRUE|yes)$/i.test(String(c['動画に価格を入れる'] || '').trim()) ? p['価格'] : '', copy: text.copy,
    point: (job.template === 'slide' || job.template === 'zoom') ? String(text.point || '') : '',
    tagline: String(text.tagline || ''),
    copy_lines: job.template === 'notice' ? [] : lines_(text.copy_lines),
    point_lines: (job.template === 'slide' || job.template === 'zoom') ? lines_(text.point_lines) : [],
    ai_image: wearFile ? !/^実写/.test(wearFile.getName()) : false,
    bgm_index: table_('log').rows.length,   // 何本目か。動画づくり側が、この番号で曲を順に切り替える
  };
  const files = { product_image: { url: p['全体写真URL'] } };
  if (wearFile) files.wear_image = { drive_id: wearFile.getId() };
  else if (job.wearUrl) files.wear_image = { url: job.wearUrl };
  files.detail_image = { url: job.detailUrl };
  if (job.extraUrl) files.extra_image = { url: job.extraUrl };
  if (job.format === 'carousel' && job.moreUrl) files.more_image = { url: job.moreUrl };
  if (job.format === 'carousel') config.images = ['wear_image', 'detail_image', 'product_image', 'extra_image', 'more_image'].filter(function (k) { return files[k]; });
  if (job.format === 'reel' && job.template === 'notice') {
    config.notice_title = job.news ? job.news.title : text.notice_title;
    config.notice_lines = [].concat(job.news ? job.news.lines : (text.notice_lines || [])).map(String).slice(0, 3);
  }

  const id = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 40);
  const stamp = Utilities.formatDate(now_(), 'Asia/Tokyo', 'yyyyMMdd');
  addRow_('log', {
    'ID': id, '作成日時': now_(), '柱': job.pillar, 'テンプレート': job.template, '形式': job.format === 'carousel' ? 'カルーセル' : 'リール',
    'handle': p.handle, '商品名': p['商品名'], '状態': ST.wait, 'キャプション': text.caption, 'キャプション訳': text.caption_ja,
    '設定JSON': JSON.stringify({ file_name: stamp + '-' + id + (job.format === 'carousel' ? '' : '.mp4'), format: job.format, config: config, files: files,
      pillarIdx: opt.pillarIdx, factRow: job.factRow || '', newsRow: opt.news ? opt.news.row : '' }),
    '素材ID': wearFile ? wearFile.getId() : '',
    '確認URL': reviewBase_(c) + '?t=' + id,
    'メモ': [job.memo, text.note].filter(String).join(' / '),
  });
  if (isTrue_(p['次に投稿する'])) {  // 指名は1回で外す
    const pt = table_('prod');
    const pr = pt.rows.filter(function (x) { return x.handle === p.handle; })[0];
    if (pr) { pr['次に投稿する'] = false; saveRow_(pt, pr); }
  }
  return id;
}

/** 「お知らせ」シートの1行を読む。row を省くと、まだ使っていない最初の行 */
function news_(row) {
  const t = table_('news');
  const r = t.rows.filter(function (x) { return row ? x._row === row : (x['タイトル(英語)'] && !x['使用日']); })[0];
  if (!r || !r['タイトル(英語)']) return null;
  return { row: r._row, title: String(r['タイトル(英語)']), lines: [r['1行目(英語)'], r['2行目(英語)']].filter(String).map(String), related: String(r['関連商品名'] || '') };
}

/** 毎日11時に動く。投稿曜日なら、次の柱で投稿候補を作る */
function scheduledCreate() {
  try {
    const c = conf_();
    const day = '日月火水木金土'.charAt(Number(Utilities.formatDate(now_(), 'Asia/Tokyo', 'u')) % 7);
    if ((c['投稿曜日'] || '').indexOf(day) < 0) return;
    makeNow();
  } catch (e) {
    notify_('投稿候補を作れませんでした', String(e && e.stack || e), true);
  }
}

/** 曜日に関係なく、いますぐ投稿候補を1つ作る(動作チェック用にも使う) */
function makeNow() {
  const p = props_();
  const news = news_();
  const idx = Number(p.getProperty('PILLAR_IDX') || 0);
  const mode = String(conf_()['投稿の形式'] || '交互');
  const fi = Number(p.getProperty('FORMAT_IDX') || 0);
  const format = /カルーセル/.test(mode) ? 'carousel' : (/リール/.test(mode) ? 'reel' : (fi % 2 ? 'carousel' : 'reel'));
  const id = createJob_({ pillarIdx: idx, news: news, format: format });
  // お知らせは1回だけ差し込む(柱の順番も、リール/カルーセルの順番も進めない)
  if (news) table_('news').sh.getRange(news.row, 5).setValue(now_());
  else {
    p.setProperty('PILLAR_IDX', String((idx + 1) % PILLARS.length));
    p.setProperty('FORMAT_IDX', String((fi + 1) % 2));
  }
  return id;
}

/* ───────── 動画づくり(GitHub側)とのやりとり ───────── */

function findJob_(id) {
  const t = table_('log');
  const r = t.rows.filter(function (x) { return x['ID'] === id; })[0];
  return r ? { t: t, r: r, spec: JSON.parse(r['設定JSON'] || '{}') } : null;
}

function doGet(e) {
  const q = (e && e.parameter) || {};
  if (!q.action) {
    const tpl = HtmlService.createTemplateFromFile('Review');
    tpl.token = q.t || '';
    return tpl.evaluate().setTitle('BIG JOHN INTL 投稿の確認').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (q.key !== props_().getProperty('WEBAPP_KEY')) return json_({ error: 'forbidden' });
  if (q.action === 'peek') {
    return json_({ pending: table_('log').rows.filter(function (r) { return r['状態'] === ST.wait; }).length });
  }
  if (q.action === 'job') {
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const t = table_('log');
      const r = t.rows.filter(function (x) { return x['状態'] === ST.wait; })[0];
      if (!r) return json_({});
      r['状態'] = ST.making;
      saveRow_(t, r);
      const spec = JSON.parse(r['設定JSON']);
      return json_({ id: r['ID'], file_name: spec.file_name, config: spec.config, files: spec.files });
    } finally { lock.releaseLock(); }
  }
  if (q.action === 'file') {
    try {
      const f = DriveApp.getFileById(q.id);
      if (f.getSize() > MAX_VIDEO_BYTES) return json_({ error: 'ファイルが大きすぎます(30MBまで)' });
      return json_({ name: f.getName(), mime: f.getMimeType(), b64: Utilities.base64Encode(f.getBlob().getBytes()) });
    } catch (err) { return json_({ error: String(err) }); }
  }
  return json_({ error: 'unknown action' });
}

function doPost(e) {
  let d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'bad request' }); }
  if (d.key !== props_().getProperty('WEBAPP_KEY')) return json_({ error: 'forbidden' });
  const j = findJob_(d.id);
  if (!j) return json_({ error: 'not found' });
  if (d.action === 'done') {
    if (d.image_urls) j.r['画像URL'] = [].concat(d.image_urls).join('\n');
    else j.r['動画URL'] = d.video_url;
    j.r['状態'] = ST.review;
    j.r['通知日時'] = now_();
    saveRow_(j.t, j.r);
    notify_('投稿候補ができました(' + j.r['柱'] + ')',
      '投稿候補ができました。' + (d.image_urls ? '写真' : '動画') + 'とキャプションを確認して、OKなら「投稿する」を押してください。\n\n' +
      '形式: ' + (j.r['形式'] || 'リール') + '\n柱: ' + j.r['柱'] + '\n商品: ' + j.r['商品名'] + '\n\n確認画面:\n' + j.r['確認URL'] + '\n\n' +
      '※動画や写真が表示されるまで、数分かかることがあります。', false);
    return json_({ ok: true });
  }
  if (d.action === 'failed') {
    j.r['状態'] = ST.failed;
    j.r['メモ'] = (j.r['メモ'] + ' / 動画を作れませんでした: ' + String(d.error || '').slice(0, 300)).replace(/^ \/ /, '');
    saveRow_(j.t, j.r);
    notify_('動画を作れませんでした', '商品: ' + j.r['商品名'] + '\n\nよくある原因: 画像の形式(JPEGかPNGにする)、動画が長すぎる・大きすぎる。\n' +
      '素材を入れ直すと、次の回で作り直されます。\n\n詳細:\n' + d.error, true);
    return json_({ ok: true });
  }
  return json_({ error: 'unknown action' });
}

/* ───────── 確認画面から呼ばれる処理 ───────── */

function getReview(token) {
  const j = findJob_(token);
  if (!j) return { state: 'なし' };
  return { state: j.r['状態'], pillar: j.r['柱'], product: j.r['商品名'], video: j.r['動画URL'],
    format: j.r['形式'] || 'リール', images: String(j.r['画像URL'] || '').split('\n').filter(String),
    caption: j.r['キャプション'], caption_ja: j.r['キャプション訳'] || '', memo: j.r['メモ'], permalink: j.r['投稿URL'] };
}

function ig_(c, method, path, params) {
  const token = props_().getProperty('IG_TOKEN');
  if (!token) throw new Error('Instagramとの接続が未設定です');
  const base = 'https://graph.instagram.com/' + (c['Instagram API版'] || 'v26.0') + '/' + path;
  const p = Object.assign({ access_token: token }, params || {});
  const qs = Object.keys(p).map(function (k) { return k + '=' + encodeURIComponent(p[k]); }).join('&');
  const res = method === 'get'
    ? UrlFetchApp.fetch(base + '?' + qs, { muteHttpExceptions: true })
    : UrlFetchApp.fetch(base, { method: 'post', payload: p, muteHttpExceptions: true });
  const body = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() >= 300 || body.error) {
    const er = body.error || {};
    throw new Error('Instagram: ' + (er.message || res.getContentText().slice(0, 300)) +
      (er.code ? '(code ' + er.code + (er.error_subcode ? '/' + er.error_subcode : '') + ')' : ''));
  }
  return body;
}

/** 投稿に使うアカウントの指定。diagInstagram が、通った指定を IG_PATH に保存する */
function igPath_() { return props_().getProperty('IG_PATH') || 'me'; }

function finishPublish_(c, j, containerId) {
  const media = ig_(c, 'post', igPath_() + '/media_publish', { creation_id: containerId });
  let link = '';
  try { link = ig_(c, 'get', media.id, { fields: 'permalink' }).permalink || ''; } catch (e) { /* 取得できなくても投稿は成功 */ }
  j.r['状態'] = ST.posted;
  j.r['投稿URL'] = link || media.id;
  saveRow_(j.t, j.r);

  // 使った素材を「使用済み」へ。商品の最終投稿日、ネタの使用日を記録
  const pt = table_('prod');
  const pr = pt.rows.filter(function (x) { return x.handle === j.r.handle; })[0];
  if (pr) { pr['最終投稿日'] = now_(); saveRow_(pt, pr); }
  if (j.r['素材ID']) {
    try {
      const f = DriveApp.getFileById(j.r['素材ID']);
      const parent = f.getParents().next();
      const home = parent.getName() === SUB.used ? null : parent.getParents().next();
      if (home) f.moveTo(ensureSub_(home, SUB.used));
    } catch (e) { Logger.log('素材を移動できませんでした: ' + e); }
  }
  if (j.spec.factRow) table_('facts').sh.getRange(j.spec.factRow, 3).setValue(now_());
  return link;
}

/** カルーセル: 写真ごとに箱を作り、まとめる箱を作る(写真はJPEG、公開URL) */
function carouselBox_(c, r, caption) {
  const urls = String(r['画像URL'] || '').split('\n').filter(String);
  if (urls.length < 2) throw new Error('カルーセルの写真が2枚未満です');
  const kids = urls.slice(0, 10).map(function (u) {
    return ig_(c, 'post', igPath_() + '/media', { image_url: u, is_carousel_item: 'true' }).id;
  });
  return ig_(c, 'post', igPath_() + '/media', { media_type: 'CAROUSEL', children: kids.join(','), caption: caption });
}

/** 「投稿する」ボタン */
function publish(token, caption) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let j;
  try {
    j = findJob_(token);
    if (!j) return { ok: false, message: '投稿候補が見つかりません' };
    if (j.r['状態'] !== ST.review) return { ok: false, message: 'この投稿は「' + j.r['状態'] + '」です' };
    const hits = ngHits_(caption);
    if (hits.length) return { ok: false, message: 'キャプションに使えない表現があります。直してからもう一度押してください: ' + hits.join(' ') };
    const lim = tagLimit_(conf_());
    if (hashtags_(caption).length > lim) {
      return { ok: false, message: 'ハッシュタグは' + lim + '個までです(今は' + hashtags_(caption).length + '個)。減らしてからもう一度押してください' };
    }
    j.r['状態'] = ST.posting;
    j.r['キャプション'] = caption;
    saveRow_(j.t, j.r);
  } finally { lock.releaseLock(); }

  const c = conf_();
  try {
    const box = j.r['形式'] === 'カルーセル' ? carouselBox_(c, j.r, caption)
      : ig_(c, 'post', igPath_() + '/media', { media_type: 'REELS', video_url: j.r['動画URL'], caption: caption, share_to_feed: 'true' });
    for (let i = 0; i < 24; i++) {  // 最長4分ほど待つ
      Utilities.sleep(10000);
      const st = ig_(c, 'get', box.id, { fields: 'status_code,status' });
      if (st.status_code === 'FINISHED') {
        const link = finishPublish_(c, j, box.id);
        return { ok: true, message: '投稿しました', permalink: link };
      }
      if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new Error('動画を受け付けてもらえませんでした: ' + (st.status || st.status_code));
    }
    // まだ処理中 → あとで自動的に仕上げる
    j.r['状態'] = ST.processing;
    j.r['メモ'] = (j.r['メモ'] + ' / container:' + box.id).replace(/^ \/ /, '');
    saveRow_(j.t, j.r);
    ScriptApp.newTrigger('finishPending').timeBased().after(5 * 60 * 1000).create();
    return { ok: true, message: 'Instagram側で処理中です。数分後に自動で投稿されます' };
  } catch (e) {
    j.r['状態'] = ST.review;
    saveRow_(j.t, j.r);
    notify_('投稿に失敗しました', '商品: ' + j.r['商品名'] + '\n原因: ' + e.message +
      '\n\n確認画面からもう一度「投稿する」を押せます:\n' + j.r['確認URL'] +
      '\n\n「接続」に関するエラーが続くときは、管理担当が手順書の「Instagramの再接続」を行ってください。', true);
    return { ok: false, message: '投稿に失敗しました: ' + e.message };
  }
}

/** Instagram側の処理が長引いた投稿を仕上げる */
function finishPending() {
  const c = conf_();
  const t = table_('log');
  t.rows.filter(function (r) { return r['状態'] === ST.processing; }).forEach(function (r) {
    const m = String(r['メモ']).match(/container:(\d+)/);
    const j = { t: t, r: r, spec: JSON.parse(r['設定JSON'] || '{}') };
    try {
      const st = ig_(c, 'get', m[1], { fields: 'status_code,status' });
      if (st.status_code === 'FINISHED') finishPublish_(c, j, m[1]);
      else if (st.status_code !== 'IN_PROGRESS') throw new Error(st.status || st.status_code);
    } catch (e) {
      r['状態'] = ST.review;
      saveRow_(t, r);
      notify_('投稿に失敗しました', '商品: ' + r['商品名'] + '\n原因: ' + e.message + '\n\n確認画面:\n' + r['確認URL'], true);
    }
  });
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'finishPending') ScriptApp.deleteTrigger(tr);
  });
}

/** 「見送る」ボタン。別の素材で作り直す */
function skip(token) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const j = findJob_(token);
    if (!j) return { ok: false, message: '投稿候補が見つかりません' };
    if (j.r['状態'] !== ST.review) return { ok: false, message: 'この投稿は「' + j.r['状態'] + '」です' };
    j.r['状態'] = ST.skipped;
    saveRow_(j.t, j.r);
    // 同じ柱で見送った素材は、今回の作り直しでは使わない
    const skipped = j.t.rows.filter(function (r) { return r['状態'] === ST.skipped && r['素材ID']; }).slice(-6).map(function (r) { return r['素材ID']; });
    try {
      createJob_({ pillarIdx: Number(j.spec.pillarIdx || 0), format: j.spec.format || 'reel', excludeMaterials: skipped,
        avoidHandles: j.r['素材ID'] ? [] : [j.r.handle], memo: '見送りの作り直し',
        news: j.spec.newsRow ? news_(Number(j.spec.newsRow)) : null });
      return { ok: true, message: '見送りました。別の素材で作り直します(最長2時間ほどでメールが届きます)' };
    } catch (e) {
      return { ok: true, message: '見送りました。作り直しはできませんでした: ' + e.message };
    }
  } finally { lock.releaseLock(); }
}

/* ───────── 毎朝の見回り ───────── */

function dailyChores() {
  const errors = [];
  try { syncProducts(); } catch (e) { errors.push('商品の同期: ' + e.message); }
  try { if (props_().getProperty('ANTHROPIC_API_KEY')) scenePhotos_(12, false); } catch (e) { Logger.log('使用シーンの写真の判定: ' + e); }
  try { refreshToken_(); } catch (e) { errors.push('Instagramの接続更新: ' + e.message + '(手順書の「Instagramの再接続」を行ってください)'); }
  try {
    const t = table_('log');
    const hours = function (d) { return d ? (now_().getTime() - new Date(d).getTime()) / 3600000 : 0; };
    t.rows.forEach(function (r) {
      if (r['状態'] === ST.review && hours(r['通知日時']) > 20 && String(r['メモ']).indexOf('催促済み') < 0) {
        notify_('確認をお願いします(まだボタンが押されていません)', '商品: ' + r['商品名'] + '\n確認画面:\n' + r['確認URL'], false);
        r['メモ'] = (r['メモ'] + ' / 催促済み').replace(/^ \/ /, '');
        saveRow_(t, r);
      }
      if ((r['状態'] === ST.wait || r['状態'] === ST.making) && hours(r['作成日時']) > 6 && String(r['メモ']).indexOf('遅延通知済み') < 0) {
        errors.push('動画がまだできていません(' + r['商品名'] + ')。GitHubの「Actions」が止まっていないか確認してください');
        r['状態'] = ST.wait;
        r['メモ'] = (r['メモ'] + ' / 遅延通知済み').replace(/^ \/ /, '');
        saveRow_(t, r);
      }
    });
  } catch (e) { errors.push('見回り: ' + e.message); }
  if (errors.length) notify_('確認が必要なことがあります', errors.join('\n\n'), true);
}

/** Instagramの接続は約60日で切れるため、週1回自動で延長する */
function refreshToken_() {
  const p = props_();
  const token = p.getProperty('IG_TOKEN');
  if (!token) return;
  const at = Number(p.getProperty('IG_TOKEN_AT') || 0);
  if (now_().getTime() - at < 7 * 24 * 3600 * 1000) return;
  const res = UrlFetchApp.fetch('https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=' +
    encodeURIComponent(token), { muteHttpExceptions: true });
  const body = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() !== 200 || !body.access_token) throw new Error((body.error && body.error.message) || '更新できませんでした');
  p.setProperty('IG_TOKEN', body.access_token);
  p.setProperty('IG_TOKEN_AT', String(now_().getTime()));
}

/* ───────── 接続の設定と動作チェック用 ───────── */

/** Instagramの接続を確かめ、アカウント番号を保存する(スクリプト プロパティ IG_TOKEN を入れたあとに実行) */
function testInstagram() {
  const me = ig_(conf_(), 'get', 'me', { fields: 'user_id,username,account_type' });
  props_().setProperty('IG_USER_ID', String(me.user_id || me.id));
  props_().setProperty('IG_TOKEN_AT', String(now_().getTime() - 6 * 24 * 3600 * 1000));
  Logger.log('接続できました: @' + me.username + '(' + me.account_type + ')');
}

/**
 * 投稿が通らないときの診断。実際には投稿しない(下書きの箱を作るところまで)。
 * アカウントの指定のしかたを3通り試し、通ったものを保存する。
 */
function diagInstagram() {
  const c = conf_();
  const me = ig_(c, 'get', 'me', { fields: 'id,user_id,username,account_type' });
  Logger.log('アカウント: @' + me.username + '(' + me.account_type + ')');
  const tryIt = function (label, fn) {
    try { const r = fn(); Logger.log('○ ' + label + ': ' + JSON.stringify(r).slice(0, 160)); return r; }
    catch (e) { Logger.log('× ' + label + ': ' + e.message); return null; }
  };
  tryIt('投稿の許可があるか(投稿数の上限を読む)', function () { return ig_(c, 'get', 'me/content_publishing_limit', {}); });

  const row = table_('log').rows.filter(function (r) { return r['動画URL']; }).pop();
  if (!row) { Logger.log('試せる動画がありません。先に makeNow と動画づくりを済ませてください'); return; }
  let found = '';
  [['me', 'me'], ['user_id', String(me.user_id || '')], ['id', String(me.id || '')]].forEach(function (p) {
    if (!p[1] || found) return;
    const r = tryIt('下書きの箱を作る(指定: ' + p[0] + ')', function () {
      return ig_(c, 'post', p[1] + '/media', { media_type: 'REELS', video_url: row['動画URL'], caption: 'test' });
    });
    if (r && r.id) found = p[1];
  });
  if (found) {
    props_().setProperty('IG_PATH', found);
    Logger.log('結果: 投稿の準備まで通りました。確認画面の「投稿する」をもう一度押してください');
  } else {
    Logger.log('結果: どの指定でも通りませんでした。上の × の文面を確認してください');
  }
}

/** AIの接続を確かめる(スクリプト プロパティ ANTHROPIC_API_KEY を入れたあとに実行) */
function testAI() {
  const out = claude_(conf_(), [{ type: 'text', text: '次のJSONだけを返してください: {"ok": true}' }]);
  Logger.log(out ? 'AIに接続できました' : 'ANTHROPIC_API_KEY が未設定です');
}

/**
 * サイトの商品写真をAIが見て、「使用シーンの写真番号」が空の商品に番号を入れる。
 * 人が着ている場面(着用写真)がない商品には 0 が入る。入った番号は「商品」シートで直せる。
 * 商品が多いと1回では終わらない。「残り0件」と出るまで、くり返し実行する(毎朝、少しずつ自動でも進む)。
 */
function suggestScenePhotos() { scenePhotos_(1000, true); }

function scenePhotos_(limit, verbose) {
  ensureColumns_('prod');
  const c = conf_();
  const t = table_('prod');
  const start = new Date().getTime();
  const empty = function (r) { return r['使用シーンの写真番号'] === '' || r['使用シーンの写真番号'] === undefined; };
  const todo = t.rows.filter(empty);
  let done = 0;
  for (let k = 0; k < todo.length && done < limit; k++) {
    if (new Date().getTime() - start > 4 * 60 * 1000) break;   // 実行時間の上限の手前で止める
    const r = todo[k];
    const list = photos_(r).slice(0, 6);
    const content = [];
    list.forEach(function (u, i) {
      const img = webImage_(u);
      if (!img) return;
      content.push({ type: 'text', text: '写真' + (i + 1) + ':' });
      content.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } });
    });
    if (!content.length) continue;
    content.push({ type: 'text', text: 'Pick the photo where a person is wearing the product (full or upper body, a styled scene) that works best as the first shot of a vertical video. ' +
      'Do not pick product-only shots on a plain background, flat lays, or close-ups of details. If there is none, answer 0. Return ONLY this JSON: {"n": number}' });
    try {
      const out = claude_(c, content);
      if (!out) { Logger.log('ANTHROPIC_API_KEY が未設定です'); return; }
      const n = parseInt(out.n, 10);
      r['使用シーンの写真番号'] = n >= 1 && n <= list.length ? n : 0;
      saveRow_(t, r);
      done++;
      if (verbose) Logger.log(r['商品名'] + ': ' + (n >= 1 ? n + '番' : '使用シーンの写真なし'));
    } catch (e) { Logger.log(r['商品名'] + ': 判定できませんでした(' + e.message + ')'); }
  }
  Logger.log('今回 ' + done + '件、残り ' + (todo.length - done) + '件' + (todo.length - done > 0 ? '(もう一度実行してください)' : ''));
}

/** メールが届くか確かめる */
function testMail() { notify_('テスト', 'このメールが届けば、通知の設定はできています。', true); }
