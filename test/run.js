const assert = require('assert');
const { load, world, rootDrive } = require('./mock');
const { products } = require('./products');
const api = load();
let igCalls = [], aiCalls = 0, aiReply = null;
world.now = new Date('2026-10-12T02:00:00Z'); // 月曜 11:00 JST
world.fetch = (url, opt) => {
  if (url.includes('/products.json')) return { body: { products } };
  if (url.includes('api.anthropic.com')) { aiCalls++; return { body: { content: [{ type: 'text', text: JSON.stringify(aiReply(JSON.parse(opt.payload))) }] } }; }
  if (url.includes('drive.google.com/thumbnail') || url.includes('/img/')) return { bytes: Buffer.from('img'), body: '', headers: { 'Content-Type': 'image/jpeg' } };
  if (url.includes('graph.instagram.com')) { igCalls.push(url.split('?')[0].replace(/.*v26\.0\//, '') + (opt.method ? ' POST' : ' GET'));
    if (url.includes('refresh_access_token')) return { body: { access_token: 'NEW', expires_in: 5184000 } };
    if (url.includes('/me?')) return { body: { id: '42', user_id: '1789', username: 'bigjohn.jeans_intl', account_type: 'BUSINESS' } };
    if (url.includes('content_publishing_limit')) return { body: { data: [{ quota_usage: 0 }] } };
    if (world.igDeny && /\/media$/.test(url) && !url.includes('/' + world.igDeny + '/')) return { code: 400, body: { error: { message: 'Application does not have permission for this action', code: 10 } } };
    if (/\/media$/.test(url)) { assert.strictEqual(opt.payload.media_type, 'REELS'); assert.ok(/^https:\/\/.+\.mp4$/.test(opt.payload.video_url)); return { body: { id: '555' } }; }
    if (url.includes('/555?')) return { body: { status_code: 'FINISHED' } };
    if (/media_publish$/.test(url)) return { body: { id: '999' } };
    if (url.includes('/999?')) return { body: { permalink: 'https://www.instagram.com/reel/abc/' } };
  }
  throw new Error('想定外のURL: ' + url);
};
const T = k => api.table_(k).rows;
const ok = m => console.log('  ✓ ' + m);
const P = h => T('prod').find(r => r.handle === h);
const setP = (h, o) => { const t = api.table_('prod'); const r = t.rows.find(x => x.handle === h); Object.assign(r, o); t.sh.getRange(r._row, 1, 1, t.head.length).setValues([t.head.map(k => r[k] === undefined ? '' : r[k])]); };
const setConf = (k, v) => { const t = api.table_('conf'); const r = t.rows.find(x => x['項目'] === k); r['値'] = v; t.sh.getRange(r._row, 1, 1, 3).setValues([[r['項目'], v, r['説明']]]); };
const subs = f => f.folders.map(x => x.name).sort();

assert.strictEqual(api.limitHashtags_('Body.\n\n#a #b ＃c #d #e #f #g', 5), 'Body.\n\n#a #b ＃c #d #e'); assert.strictEqual(api.limitHashtags_('no tags', 5), 'no tags');
console.log('1. 準備、商品名の読み取り、選んだ商品だけのフォルダ');
api.setup();
assert.strictEqual(api.conf_()['投稿の形式'], '交互', '初期値は交互');
setConf('投稿の形式', 'リールのみ');   // 1〜10はリールだけで確かめる。交互は11で
const root = rootDrive.folders[0];
assert.strictEqual(root.name, 'BIG JOHN INTL投稿素材');
assert.strictEqual(T('prod').length, 8);
assert.deepStrictEqual(root.folders.map(f => f.name), ['季節の着こなし'], '最初は商品フォルダを作らない');
assert.strictEqual(api.conf_()['投稿曜日'], '', 'Instagramをつなぐまでは投稿曜日が空');
assert.strictEqual(api.conf_()['基本ハッシュタグ'], '#bigjohnjeans #japanesedenim');
const show = h => [P(h)['表示名'], P(h)['品番'], P(h)['色番号'], P(h)['色・種類'], P(h)['季節'], P(h)['分類']];
assert.deepStrictEqual(show('xx002-001'), ['XXXX-EXTRA MODEL SLIM STRAIGHT', 'XX002', '001', 'ONE WASH', '通年', 'MEN / XX'], '『』を外し、/ の後ろは加工');
assert.deepStrictEqual(show('ms003r-01eb'), ['Selvedge Chambray Shirt', 'MS003R', '01EB', 'Navy Emb', '春夏', 'MEN / Denim Shirts'], '| の後ろも色・種類');
assert.deepStrictEqual(show('m7014rc-57'), ['WILD DUCK CANVAS SHORTS', 'M7014RC', '57', '', '春夏', 'MEN / WILD DUCK'], 'vendorの空白ゆれをそろえる、タグが文字列でも読む');
assert.deepStrictEqual(show('m1014rc-77').slice(5), ['MEN / WILD DUCK']);
assert.deepStrictEqual(show('bjm113f-001').slice(0, 3), ['LOOSE STRAIGHT', 'BJM113F/BJK113F', '001'], '品番が2つ並ぶ形');
assert.deepStrictEqual(show('m102sl-aw').slice(0, 3), ["SL VINTAGE 60's Classic Straight", 'M102SL', 'AW']);
assert.strictEqual(P('mj003-001')['季節'], '秋冬'); assert.strictEqual(P('mj003-001')['価格'], '¥33,300');
assert.strictEqual(P('m102sl-aw')['在庫'], false);
assert.strictEqual(api.guessSeason_('LINEN SHIRT', '', []), '春夏'); assert.strictEqual(api.guessSeason_('FLANNEL SHIRT', '', []), '秋冬'); assert.strictEqual(api.guessSeason_('REGULAR STRAIGHT', '', ['STRAIGHT']), '通年');
setP('mj003-001', { 'フォルダを作る': true }); setP('bjm113f-001', { 'フォルダを作る': 'TRUE' });
api.syncProducts();
assert.deepStrictEqual(root.folders.map(f => f.name).sort(), ['BJM113F/BJK113F (001) LOOSE STRAIGHT', 'MJ003 (001) HEAVYWEIGHT DENIM JACKET', '季節の着こなし'].sort());
root.folders.forEach(f => assert.deepStrictEqual(subs(f), ['使用済み', '未使用', '次に使う'].sort()));
api.syncProducts(); assert.strictEqual(T('prod').length, 8); assert.strictEqual(root.folders.length, 3);
assert.strictEqual(world.triggers.length, 2);
assert.ok(T('facts').length >= 5 && T('facts').every(r => /^[\x00-\x7F]+$/.test(r['事実(サイトに書いてある内容)'])), 'ヘリテージの事実は英語');
ok('商品8件、品番・色番号・加工の分解、季節、チェックした2商品だけフォルダ、再同期で増えない');

console.log('2. 素材も使用シーンの写真もない → ディテール型で静かに作る');
world.props.PILLAR_IDX = '0';
let id = api.makeNow();
let row = T('log').find(r => r.ID === id);
assert.strictEqual(row['テンプレート'], 'detail'); assert.strictEqual(row.handle, 'mj003-001', '10月は秋冬の商品から');
assert.ok(row['メモ'].includes('AI未設定') && row['メモ'].includes('ディテール型'));
assert.ok(row['キャプション'].includes('#bigjohnjeans') && row['キャプション'].includes('Shop via the link in our bio.'), 'AIなしでも英語の定型文');
assert.strictEqual(JSON.parse(row['設定JSON']).config.variant, 'MJ003', '動画には品番だけ(色番号は出さない)');
ok('フォルダが空でも止まらない');

console.log('2b. フォルダのない商品も、サイトの写真で作る');
{ setP('xx002-001', { '使用シーンの写真番号': 3, '寄りの写真番号': 3 });
  world.props.PILLAR_IDX = '0'; world.mails.length = 0;
  const jid = api.makeNow(); const jr = T('log').find(r => r.ID === jid); const sp = JSON.parse(jr['設定JSON']);
  assert.strictEqual(jr['テンプレート'], 'slide'); assert.strictEqual(jr.handle, 'xx002-001'); assert.ok(!P('xx002-001')['フォルダID']);
  assert.ok(sp.files.wear_image.url.includes('xx002-0012')); { const u = Object.values(sp.files).map(f => f.url); assert.strictEqual(new Set(u).size, u.length, '同じ写真は使わない'); }
  assert.strictEqual(sp.config.ai_image, false); assert.strictEqual(sp.config.name, 'XXXX-EXTRA MODEL SLIM STRAIGHT'); assert.strictEqual(sp.config.variant, 'XX002 · ONE WASH');
  assert.strictEqual(world.mails.length, 0); assert.ok(jr['メモ'].includes('サイトの写真'));
  setP('xx002-001', { '使用シーンの写真番号': '', '寄りの写真番号': 2 });
  world.props.ANTHROPIC_API_KEY = 'k'; let scenePrompt = '';
  aiReply = req => { const c = req.messages[0].content; scenePrompt = c[c.length - 1].text; return { n: c.filter(x => x.type === 'image').length >= 4 ? 2 : 0 }; };
  api.suggestScenePhotos();
  assert.ok(/wearing/.test(scenePrompt), '着用写真を選ばせる');
  assert.strictEqual(P('xx002-001')['使用シーンの写真番号'], 2); assert.strictEqual(P('m7014rc-57')['使用シーンの写真番号'], 0, '該当なしは0を入れ、次回は判定しない');
  const n = aiCalls; api.suggestScenePhotos(); assert.strictEqual(aiCalls, n, '判定済みはやり直さない');
  delete world.props.ANTHROPIC_API_KEY; }
ok('サイトの写真で作成(札なし)、AIによる着用写真の番号の提案');

console.log('3. 柱を順に回す(AIあり、素材あり)');
world.props.ANTHROPIC_API_KEY = 'k'; world.props.PILLAR_IDX = '0';
const fLoose = root.folders.find(f => f.name.includes('LOOSE STRAIGHT'));
const u = fLoose.folders.find(f => f.name === '未使用');
const a = u.add('a.jpg', 'image/jpeg'), b = u.add('b.png', 'image/png'); u.add('memo.heic', 'image/heic');
const fJacket = root.folders.find(f => f.name.includes('HEAVYWEIGHT'));
const vid = fJacket.folders.find(f => f.name === '未使用').add('実写_street.mp4', 'video/mp4');
fJacket.folders.find(f => f.name === '未使用').add('big.mov', 'video/quicktime', Buffer.alloc(31 * 1024 * 1024));
let sawImages = 0, sawPrompt = '';
aiReply = req => { const c = req.messages[0].content; sawImages = c.filter(x => x.type === 'image').length; sawPrompt = c[c.length - 1].text;
  return { pick: 2, copy: 'Cut loose. Built to last.', caption: 'Cool mornings, loose denim.\nA straight leg with room to move.\n\nLOOSE STRAIGHT\nShop via the link in our bio.\n\n#bigjohnjeans #japanesedenim #selvedgedenim #madeinjapan #kojima #workwear #denimhead',
    caption_ja: '涼しい朝に、ゆったりデニム。\n動きやすいストレート。\n\nLOOSE STRAIGHT\nプロフィールのリンクからどうぞ。', tagline: 'Made in Kojima since 1940',
    copy_lines: ['A wide, easy straight leg', 'Washed once, ready to wear', 'Room to move all day', 'fourth line is dropped'], point_lines: 'Triple-stitched seams\nCopper rivets at stress points', point: 'Triple-stitched, built to last',
    notice_title: 'Born in Kojima', notice_lines: ['Founded in 1940', 'as a small sewing factory'] }; };
const ids = [], seen = [];
for (let i = 0; i < 5; i++) { id = api.makeNow(); ids.push(id); row = T('log').find(r => r.ID === id); const spec = JSON.parse(row['設定JSON']);
  seen.push(row['柱'] + ':' + row['テンプレート'] + ':' + row.handle);
  { const u2 = Object.values(spec.files).map(f => f.url).filter(Boolean); assert.strictEqual(new Set(u2).size, u2.length, '同じ写真を2回使わない: ' + row['テンプレート']); }
  setP(row.handle, { '最終投稿日': new Date(world.now.getTime() + i * 1000) });
  if (i === 0) { assert.strictEqual(spec.config.price, '', '価格は出さない'); assert.deepStrictEqual(spec.config.copy_lines, ['A wide, easy straight leg', 'Washed once, ready to wear', 'Room to move all day']); assert.deepStrictEqual(spec.config.point_lines, ['Triple-stitched seams', 'Copper rivets at stress points']);
    assert.strictEqual((row['キャプション'].match(/#/g) || []).length, 5, 'ハッシュタグは5個に削る'); assert.ok(row['キャプション'].includes('#kojima') && !row['キャプション'].includes('#workwear'));
    assert.ok(row['キャプション訳'].startsWith('涼しい朝に'), '日本語訳が記録される');
    assert.ok(sawPrompt.includes('[Writing policy]') && sawPrompt.includes('3 to 5') && sawPrompt.includes('BJM113F/BJK113F (001) LOOSE STRAIGHT') && sawPrompt.includes('Pillar direction') && sawPrompt.includes('BIG JOHN') && sawPrompt.includes('caption_ja') && sawPrompt.includes('in English'), '方針と商品説明がAIに渡る');
    assert.strictEqual(row.handle, 'bjm113f-001', '直近に出した商品を避け、素材のある商品を選ぶ'); assert.strictEqual(spec.files.wear_image.drive_id, b.id, 'AIが2番を選ぶ'); assert.strictEqual(sawImages, 4, '候補2+商品+寄りを見て書く'); assert.strictEqual(spec.config.ai_image, true); assert.strictEqual(spec.config.brand, 'BIG JOHN'); }
  if (i === 1) { assert.strictEqual(spec.config.template, 'zoom'); assert.strictEqual(row['柱'], '季節の着こなし'); assert.strictEqual(spec.files.wear_image.drive_id, vid.id, '動画が優先される'); assert.strictEqual(spec.config.ai_image, false, '実写_は札なし'); assert.strictEqual(sawImages, 3); assert.ok(sawPrompt.includes('breaks in'), '商品説明がAIに渡る'); }
  if (i === 2) { assert.strictEqual(row['柱'], 'ヘリテージ'); assert.deepStrictEqual(spec.config.copy_lines, []); assert.deepStrictEqual(spec.config.notice_lines, ['Founded in 1940', 'as a small sewing factory']); assert.ok(!spec.files.wear_image); assert.ok(sawPrompt.includes('Kojima')); }
  if (i === 3) { assert.strictEqual(row['柱'], '色落ちと経年変化'); assert.ok(!spec.files.wear_image, 'AI画像は使わない'); assert.ok(/fades|breaks in/.test(P(row.handle)['説明']), '説明に色落ち・経年変化の話がある商品を選ぶ'); assert.strictEqual(sawImages, 3); assert.ok(spec.files.extra_image.url !== spec.files.detail_image.url && spec.files.extra_image.url !== spec.files.product_image.url); assert.ok(sawPrompt.includes('Do not imagine')); }
}
console.log('    ' + seen.join('\n    '));
{ const bi = ids.map(x => JSON.parse(T('log').find(r => r.ID === x)['設定JSON']).config.bgm_index); for (let i = 1; i < bi.length; i++) assert.strictEqual(bi[i], bi[i - 1] + 1, '曲の番号が1つずつ進む'); }
assert.deepStrictEqual(seen.map(s => s.split(':')[1]), ['slide', 'zoom', 'notice', 'detail', 'slide']);
assert.ok(!seen.some(s => s.includes('m102sl')), '在庫切れは選ばない'); assert.ok(!seen.some(s => /m7014rc|ms003r/.test(s)), '10月に春夏の商品(ショーツ、シャンブレー)は選ばない');
assert.strictEqual(world.props.PILLAR_IDX, '0');
ok('5つの柱が順に回る、動画優先、AIのトンマナ選択、HEICと30MB超は対象外、在庫切れと季節外を除外');

console.log('3b. AIの案に止める表現があれば書き直させ、残れば要確認');
{ let calls = 0; aiReply = () => { calls++; return { copy: 'The best denim.', caption: 'Our best jeans. Eco-friendly too.\n#bigjohnjeans', caption_ja: '最高のジーンズ' }; };
  world.props.PILLAR_IDX = '0'; const jid = api.makeNow(); const jr = T('log').find(r => r.ID === jid);
  assert.strictEqual(calls, 2, '1回だけ書き直させる'); assert.ok(jr['メモ'].includes('要確認')); }
ok('止める表現の書き直しと要確認メモ');

console.log('4. 動画づくりとの受け渡し');
const key = world.props.WEBAPP_KEY;
assert.strictEqual(JSON.parse(api.doGet({ parameter: { action: 'peek', key: 'x' } }).text).error, 'forbidden');
const pending = JSON.parse(api.doGet({ parameter: { action: 'peek', key } }).text).pending; assert.strictEqual(pending, 8);
const job = JSON.parse(api.doGet({ parameter: { action: 'job', key } }).text);
assert.ok(job.id && /^\d{8}-[0-9a-f]{40}\.mp4$/.test(job.file_name) && job.config.template);
assert.strictEqual(JSON.parse(api.doGet({ parameter: { action: 'peek', key } }).text).pending, 7);
const fileRes = JSON.parse(api.doGet({ parameter: { action: 'file', key, id: a.id } }).text); assert.strictEqual(fileRes.name, 'a.jpg');
world.mails.length = 0;
api.doPost({ postData: { contents: JSON.stringify({ key, action: 'done', id: ids[1], video_url: 'https://u.github.io/bigjohn-intl-reel/v/x.mp4' }) } });
assert.ok(world.mails[0].subject.includes('【BIG JOHN INTL投稿】') && world.mails[0].subject.includes('投稿候補ができました') && world.mails[0].body.includes('?t=' + ids[1]));
assert.strictEqual(api.doGet({ parameter: { t: ids[1] } }).token, ids[1]);
assert.ok(api.getReview(ids[1]).caption_ja.startsWith('涼しい朝に'), '確認画面に日本語訳');
ok('合言葉なしは拒否、注文の受け渡し、完了でスタッフにメール(日本語)、確認画面に訳');

console.log('5. 投稿する');
let r = api.publish(ids[1], 'test'); assert.ok(!r.ok && r.message.includes('未設定'));
assert.strictEqual(api.getReview(ids[1]).state, '確認待ち');
world.props.IG_TOKEN = 'T'; api.testInstagram(); assert.strictEqual(world.props.IG_USER_ID, '1789');
r = api.publish(ids[1], 'Good denim\n#a #b #c #d #e #f'); assert.ok(!r.ok && r.message.includes('5個まで'));
for (const bad of ['Our best jeans yet.', 'The finest selvedge.', 'Waterproof canvas for rainy days.', 'Eco-friendly denim.', 'Made sustainably in Japan.', "Japan's No.1 denim.", 'The #1 jeans in Japan.', 'Antibacterial finish.', 'It will never fade.', 'World-class quality.', 'Perfect fit.', 'UV protection built in.', 'A wrinkle-free shirt.']) {
  r = api.publish(ids[1], bad); assert.ok(!r.ok && r.message.includes('使えない表現'), bad); }
assert.strictEqual(api.ngHits_("Rigid selvedge denim that fades with wear. In 1965 the company produced Japan's first domestically made jeans. Triple-stitched seams. Made in Kojima. Breaks in over time and becomes your own. #bigjohnjeans #japanesedenim #selvedgedenim").length, 0, 'ふつうの文は止めない');
igCalls = [];
r = api.publish(ids[1], 'Cut loose. Built to last.\n#bigjohnjeans'); assert.ok(r.ok, r.message);
assert.deepStrictEqual(igCalls, ['me/media POST', '555 GET', 'me/media_publish POST', '999 GET']);
const rv = api.getReview(ids[1]); assert.strictEqual(rv.state, '投稿済み'); assert.strictEqual(rv.permalink, 'https://www.instagram.com/reel/abc/');
assert.strictEqual(vid.parent.name, '使用済み'); assert.strictEqual(vid.parent.parent, fJacket); assert.strictEqual(a.parent.name, '未使用'); assert.strictEqual(b.parent.name, '未使用');
r = api.publish(ids[1], 'again'); assert.ok(!r.ok, '二重投稿しない');
ok('未接続と止める表現(英語)は止める、Instagramへの4手順、素材を使用済みへ、二重投稿なし');

{ world.igDeny = '1789'; world.log = false; api.diagInstagram(); assert.strictEqual(world.props.IG_PATH, '1789');
  api.doPost({ postData: { contents: JSON.stringify({ key, action: 'done', id: ids[2], video_url: 'https://u.github.io/bigjohn-intl-reel/v/w.mp4' }) } });
  igCalls = []; const r2 = api.publish(ids[2], 'Born in Kojima.\n#bigjohnjeans'); assert.ok(r2.ok, r2.message); assert.strictEqual(igCalls[0], '1789/media POST');
  world.igDeny = 'none'; delete world.props.IG_PATH; api.diagInstagram(); assert.ok(!world.props.IG_PATH);
  const r3 = api.publish(ids[1], 'x'); assert.ok(!r3.ok);
  world.igDeny = ''; }
ok('診断で通る指定を見つけて保存');

console.log('6. 見送る → 別の素材で作り直し');
api.doPost({ postData: { contents: JSON.stringify({ key, action: 'done', id: ids[0], video_url: 'https://u.github.io/bigjohn-intl-reel/v/y.mp4' }) } });
const before = T('log').length;
r = api.skip(ids[0]); assert.ok(r.ok);
const remake = T('log')[before]; assert.strictEqual(remake['テンプレート'], 'slide'); assert.notStrictEqual(remake['素材ID'], b.id); assert.ok(remake['素材ID']); assert.ok(remake['メモ'].includes('見送りの作り直し'));
assert.strictEqual(b.parent.name, '未使用');
ok('見送った素材を避けて作り直す(素材は未使用に残る)');

console.log('7. 失敗の通知、催促、接続の自動延長、お知らせの差し込み、投稿曜日');
world.mails.length = 0;
api.doPost({ postData: { contents: JSON.stringify({ key, action: 'failed', id: ids[3], error: 'cannot identify image file' }) } });
assert.ok(world.mails[0].subject.includes('動画を作れませんでした') && world.mails[0].to.includes('owner@example.com'));
api.doPost({ postData: { contents: JSON.stringify({ key, action: 'done', id: ids[4], video_url: 'https://u.github.io/bigjohn-intl-reel/v/z.mp4' }) } });
world.now = new Date(world.now.getTime() + 26 * 3600000); world.mails.length = 0; igCalls = [];
api.dailyChores();
assert.ok(world.mails.some(m => m.subject.includes('確認をお願いします'))); assert.strictEqual(world.props.IG_TOKEN, 'NEW');
assert.ok(world.mails.some(m => m.body.includes('動画がまだできていません')));
world.mails.length = 0; api.dailyChores(); assert.ok(!world.mails.some(m => m.subject.includes('確認をお願いします')), '催促は1回だけ');
api.table_('news').sh.appendRow(['Holiday Shipping', 'Order by Dec 26 (JST)', 'to ship before the new year', 'WILD DUCK', '']);
const pi = world.props.PILLAR_IDX; id = api.makeNow(); row = T('log').find(x => x.ID === id); const sp = JSON.parse(row['設定JSON']);
assert.strictEqual(row['柱'], 'お知らせ'); assert.strictEqual(sp.config.notice_title, 'Holiday Shipping'); assert.ok(row['商品名'].includes('WILD DUCK')); assert.strictEqual(world.props.PILLAR_IDX, pi);
const nid2 = api.makeNow(); assert.notStrictEqual(T('log').find(x => x.ID === nid2)['柱'], 'お知らせ', 'お知らせは1回だけ');
api.doPost({ postData: { contents: JSON.stringify({ key, action: 'done', id, video_url: 'https://u.github.io/bigjohn-intl-reel/v/n.mp4' }) } });
const nb = T('log').length; assert.ok(api.skip(id).ok); assert.strictEqual(T('log')[nb]['柱'], 'お知らせ', '見送りの作り直しもお知らせ');
world.now = new Date('2026-10-16T02:00:00Z'); const n0 = T('log').length; api.scheduledCreate(); assert.strictEqual(T('log').length, n0, '投稿曜日が空なら作らない(Instagram接続前)');
setConf('投稿曜日', '月,水,金');
world.now = new Date('2026-10-15T02:00:00Z'); api.scheduledCreate(); assert.strictEqual(T('log').length, n0, '木曜は作らない');
world.now = new Date('2026-10-16T02:00:00Z'); api.scheduledCreate(); assert.strictEqual(T('log').length, n0 + 1, '金曜は作る');
world.now = new Date('2026-10-19T02:00:00Z'); api.scheduledCreate(); assert.strictEqual(T('log').length, n0 + 2, '月曜は作る');
ok('失敗メール、催促は1回、接続の延長、お知らせ優先、投稿曜日が空なら作らない、月・水・金だけ作成');

console.log('8. 「次に投稿する」で商品を指名する');
for (const idx of ['0', '2', '3']) {
  setP('m7014rc-77', { '次に投稿する': true }); world.props.PILLAR_IDX = idx;
  id = api.makeNow(); row = T('log').find(x => x.ID === id); const s8 = JSON.parse(row['設定JSON']);
  assert.strictEqual(row.handle, 'm7014rc-77', '季節外でもフォルダなしでも、指名した商品で作る(柱' + idx + ')'); assert.ok(row['メモ'].includes('次に投稿する'));
  if (idx === '0') { assert.strictEqual(row['テンプレート'], 'slide'); assert.ok(s8.files.wear_image.url.includes('m7014rc-77'), 'サイトの写真を使う'); }
  assert.strictEqual(P('m7014rc-77')['次に投稿する'], false, '指名は1回で外れる');
}
id = api.makeNow(); assert.notStrictEqual(T('log').find(x => x.ID === id).handle, 'm7014rc-77', '次の回は通常の順番に戻る');
ok('指名した商品が最優先、使ったらチェックが外れる');

console.log('9. 同じ分類が続かない');
{ const cat = h => (P(h) || {})['分類'];
  const seq = []; for (let i = 0; i < 4; i++) { world.props.PILLAR_IDX = '3'; id = api.makeNow(); const h = T('log').find(x => x.ID === id).handle; seq.push(cat(h)); setP(h, { '最終投稿日': new Date(world.now.getTime() + i * 1000) }); }
  for (let i = 1; i < seq.length; i++) assert.notStrictEqual(seq[i], seq[i - 1], '分類が連続: ' + seq.join(' → '));
  console.log('    ' + seq.join(' → ')); }
ok('直近と同じ分類を避ける');

console.log('10. 色違い(同じ品番)が続かない(春夏、ショーツ2色が対象の時期)');
{ world.now = new Date('2027-05-10T02:00:00Z');
  T('prod').forEach(x => setP(x.handle, { '最終投稿日': '' }));
  setP('m7014rc-57', { '分類': 'MEN / SHORTS' });   // 分類が違っても、品番が同じなら続けない
  const seq = []; for (let i = 0; i < 6; i++) { world.props.PILLAR_IDX = '3'; id = api.makeNow(); const h = T('log').find(x => x.ID === id).handle; seq.push(P(h)['品番']); setP(h, { '最終投稿日': new Date(world.now.getTime() + i * 1000) }); }
  for (let i = 1; i < seq.length; i++) assert.notStrictEqual(seq[i], seq[i - 1], '品番が連続: ' + seq.join(' → '));
  assert.ok(seq.some(c => c === 'M7014RC'), '5月はショーツも候補に入る'); assert.ok(!seq.includes('MJ003'), '5月に秋冬の商品は選ばない');
  console.log('    ' + seq.join(' → ')); }
ok('同じ品番の色違いを続けない、季節で入れ替わる');

console.log('11. リールとカルーセルを交互に');
{ setConf('投稿の形式', '交互'); world.props.FORMAT_IDX = '0'; world.props.PILLAR_IDX = '0';
  T('prod').forEach(x => setP(x.handle, { '最終投稿日': '' }));
  let lastPrompt = '', lastWant = null;
  aiReply = req => { const c = req.messages[0].content; lastPrompt = c[c.length - 1].text; lastWant = JSON.parse(lastPrompt.split('Return ONLY JSON with these keys:\n')[1]);
    return { caption: 'Washed once, ready for years.\n\nShop via the link in our bio.\n\n#bigjohnjeans #japanesedenim', caption_ja: '一度洗って、何年も。', copy: 'x.', tagline: 't' }; };
  const fm = []; const made = [];
  for (let i = 0; i < 4; i++) { const jid = api.makeNow(); made.push(jid); fm.push(T('log').find(x => x.ID === jid)['形式']); }
  assert.deepStrictEqual(fm, ['リール', 'カルーセル', 'リール', 'カルーセル'], '投稿ごとに交互: ' + fm.join(' → '));
  const cr = T('log').find(x => x.ID === made[3]); const cs = JSON.parse(cr['設定JSON']);
  assert.strictEqual(cs.format, 'carousel'); assert.strictEqual(cs.config.template, 'carousel'); assert.ok(!/\.mp4$/.test(cs.file_name));
  assert.ok(cs.config.images.length >= 3 && cs.config.images.length <= 5, '写真は3〜5枚: ' + cs.config.images.length);
  { const u2 = cs.config.images.map(k => cs.files[k].url || cs.files[k].drive_id); assert.strictEqual(new Set(u2).size, u2.length, '同じ写真を2回使わない'); }
  assert.ok(lastPrompt.includes('carousel') && !('copy' in lastWant) && !('tagline' in lastWant) && 'caption_ja' in lastWant, 'カルーセルはキャプションだけ頼む');
  // フォルダの素材が動画だけの商品は、カルーセルでは動画を使わない
  { const c2 = JSON.parse(T('log').find(x => x.ID === made[1])['設定JSON']); Object.values(c2.files).forEach(f => { if (f.drive_id) assert.notStrictEqual(f.drive_id, vid.id); }); }
  // お知らせは必ずリール、交互の順番は進めない
  api.table_('news').sh.appendRow(['New Season', 'Fall/Winter collection', 'now online', '', '']);
  const fi = world.props.FORMAT_IDX; const nj = api.makeNow(); assert.strictEqual(T('log').find(x => x.ID === nj)['形式'], 'リール'); assert.strictEqual(world.props.FORMAT_IDX, fi);
  // 動画づくり側の受け渡しと投稿
  const kjob = JSON.parse(api.doGet({ parameter: { action: 'job', key } }).text);
  let cjob = kjob; while (cjob.id && cjob.id !== made[3]) cjob = JSON.parse(api.doGet({ parameter: { action: 'job', key } }).text);
  assert.strictEqual(cjob.config.template, 'carousel');
  const urls = cjob.config.images.map((k, i) => `https://u.github.io/bigjohn-intl-reel/v/${cjob.file_name}-${i + 1}.jpg`);
  world.mails.length = 0;
  api.doPost({ postData: { contents: JSON.stringify({ key, action: 'done', id: made[3], image_urls: urls }) } });
  assert.ok(world.mails[0].body.includes('写真とキャプション') && world.mails[0].body.includes('形式: カルーセル'));
  const rv2 = api.getReview(made[3]); assert.strictEqual(rv2.format, 'カルーセル'); assert.deepStrictEqual([...rv2.images], urls); assert.strictEqual(rv2.caption_ja, '一度洗って、何年も。');
  igCalls = []; const posted = [];
  const orig = world.fetch; world.fetch = (url, opt) => { if (/\/media$/.test(url) && opt.payload && opt.payload.media_type !== 'REELS') { posted.push(opt.payload); igCalls.push('media POST');
      return { body: { id: opt.payload.media_type === 'CAROUSEL' ? '555' : 'k' + posted.length } }; } return orig(url, opt); };
  const pr = api.publish(made[3], cr['キャプション']); assert.ok(pr.ok, pr.message);
  world.fetch = orig;
  const kids = posted.filter(x => x.is_carousel_item === 'true'); assert.strictEqual(kids.length, urls.length); assert.deepStrictEqual(kids.map(x => x.image_url), urls);
  const box = posted.find(x => x.media_type === 'CAROUSEL'); assert.strictEqual(box.children, kids.map((x, i) => 'k' + (i + 1)).join(',')); assert.ok(box.caption.includes('#bigjohnjeans'));
  assert.strictEqual(api.getReview(made[3]).state, '投稿済み');
  // 見送りの作り直しも同じ形式
  api.doPost({ postData: { contents: JSON.stringify({ key, action: 'done', id: made[1], image_urls: urls }) } });
  const nb2 = T('log').length; assert.ok(api.skip(made[1]).ok); assert.strictEqual(T('log')[nb2]['形式'], 'カルーセル');
  setConf('投稿の形式', 'カルーセルのみ'); { const j1 = api.makeNow(); assert.strictEqual(T('log').find(x => x.ID === j1)['形式'], 'カルーセル'); }
  setConf('投稿の形式', 'リールのみ'); { const j2 = api.makeNow(); assert.strictEqual(T('log').find(x => x.ID === j2)['形式'], 'リール'); } }
ok('投稿ごとに交互、写真3〜5枚(動画素材は使わない)、キャプションだけ、お知らせはリール、カルーセルの投稿手順、見送りも同じ形式');
console.log('\nすべて通りました');
