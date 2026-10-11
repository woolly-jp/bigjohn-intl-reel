// 動画づくり側(run_job.py)との通しテスト用: Google側の代役をHTTPで立てる
const http = require('http'), fs = require('fs'), path = require('path');
const { load, world, rootDrive } = require('./mock');
const { products } = require('./products');
const api = load();
const A = f => fs.readFileSync(path.join(__dirname, '../assets', f));
world.now = new Date('2026-10-12T02:00:00Z');
// SAMPLE_AI=1 のときは、AIの代わりに見本の英文を返す(見本動画用)
const SAMPLE = {
  copy: 'Cut loose. Built to last.', copy_lines: ['A wide, easy straight leg', 'Washed once, ready to wear'],
  point: 'Triple-stitched seams', point_lines: ['Copper rivets at stress points', 'Made in Kojima, Japan'],
  tagline: 'Quality comes first', notice_title: 'Born in Kojima', notice_lines: ['Founded in 1940', 'as a small sewing factory'],
  caption: 'Cool mornings, loose denim.\n\nLOOSE STRAIGHT\nShop via the link in our bio.\n\n#bigjohnjeans #japanesedenim #selvedgedenim #madeinjapan #kojima',
  caption_ja: '涼しい朝に、ゆったりデニム。', pick: 1 };
if (process.env.SAMPLE_AI) world.props.ANTHROPIC_API_KEY = 'sample';
world.fetch = (url, opt) => {
  if (url.includes('/products.json')) return { body: { products } };
  if (url.includes('api.anthropic.com')) { const want = JSON.parse(JSON.parse(opt.payload).messages[0].content.slice(-1)[0].text.split('Return ONLY JSON with these keys:\n')[1]);
    const o = {}; Object.keys(want).forEach(k => { o[k] = SAMPLE[k]; }); return { body: { content: [{ type: 'text', text: JSON.stringify(o) }] } }; }
  return { bytes: Buffer.from('x'), body: '', headers: { 'Content-Type': 'image/jpeg' } }; };
api.setup();
const root = rootDrive.folders[0];
{ const t = api.table_('prod'); const col = t.head.indexOf('フォルダを作る') + 1;   // 2商品だけフォルダを作る
  t.rows.filter(r => ['bjm113f-001', 'mj003-001'].includes(r.handle)).forEach(r => t.sh.getRange(r._row, col).setValue(true));
  api.syncProducts(); }
const un = n => root.folders.find(f => f.name.includes(n)).folders.find(f => f.name === '未使用');
un('LOOSE STRAIGHT').add('wear1.jpg', 'image/jpeg', A('wear_placeholder.jpg'));
un('季節の着こなし').add('life.jpg', 'image/jpeg', A('wear_placeholder.jpg'));
un('HEAVYWEIGHT').add('実写_clip.mp4', 'video/mp4', fs.readFileSync(process.argv[2]));
api.table_('news').sh.appendRow(['Holiday Shipping', 'Order by Dec 26 (JST)', 'to ship before the new year', '', '']);
api.makeNow();                       // お知らせ(告知型)
for (let i = 0; i < 5; i++) { world.props.PILLAR_IDX = String(i); if (i !== 2) api.makeNow(); }
console.log(api.table_('log').rows.map(r => r['柱'] + ':' + r['テンプレート'] + ':' + r['商品名']).join('\n'));
const reports = [];
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/img/')) { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(A(path.basename(u.pathname))); }
  if (req.method === 'POST') { let b = ''; req.on('data', d => b += d); req.on('end', () => { const out = api.doPost({ postData: { contents: b } }); reports.push(JSON.parse(b)); // Apps Script と同じく 302 で返す
      res.writeHead(302, { Location: '/echo?d=' + encodeURIComponent(out.text) }); res.end(); }); return; }
  if (u.pathname === '/echo') { res.writeHead(200); return res.end(u.searchParams.get('d')); }
  if (u.pathname === '/state') { res.writeHead(200); return res.end(JSON.stringify({ rows: api.table_('log').rows.map(r => [r['状態'], r['動画URL'], r['形式'], r['画像URL'], r['柱']]), mails: world.mails.map(m => m.subject) })); }
  const out = api.doGet({ parameter: Object.fromEntries(u.searchParams) }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(out.text);
}).listen(8765, () => { require('fs').writeFileSync(process.env.KEYFILE || '/dev/null', world.props.WEBAPP_KEY); console.log('合言葉: ' + world.props.WEBAPP_KEY); });
