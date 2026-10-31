// 本番での確認（2026-11-01）で見つかった、見た目・使いやすさの点（U-01〜U-05）のテスト。
// Firestoreを使わない（リンク付きのルールを端末の保存場所に直接入れ、通信を止めて開く）。使い方は tests/ver/README.md を参照。
const path = require('path');
const http = require('http');
const fs = require('fs');

let pw;
try { pw = require('playwright'); }
catch (e) { pw = require(path.join(process.env.HOME, 'node_modules', 'playwright')); }

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 9690 + Math.floor(Math.random() * 100);
const STORAGE_KEY = 'mahjong_rules_pwa_v1';
const VERSION = (fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8').match(/const currentVersion = "(v[\d.]+)"/) || [])[1];

function startServer() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(PORT, () => r(server)));
}
const results = [];
function check(id, name, ok, detail) {
  results.push({ id, name, ok: !!ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${ok ? '' : '  → ' + (detail || '')}`);
}

// 長いルール名・長いverの名前・下書きありの、リンク付きのルール
const LONG_NAME = '【テスト】とても長い名前の仲間内ルール';
const hist = [{ seq: 1, label: '1.0', shareId: 'S1', note: '', date: '2026/10/01' }, { seq: 2, label: '1.1', shareId: 'S2', note: '赤ドラを4枚に変更。', date: '2026/10/20' }, { seq: 3, label: '2025秋大会用', shareId: 'S3', note: 'ウマを10-30に変更。', date: '2026/10/31' }];
const RULE = { id: 'r1', mode: '四麻', name: LONG_NAME, base_rule: '', date: '2026/10/31 10:00:00', verLabel: '2025秋大会用', settings: { uma: '10-30' },
  link: { seriesId: 'X', password: 'p'.repeat(40), ruleId: 'r1', pubSeq: 3, pubLabel: '2025秋大会用', pubShareId: 'S3', pubOp: 3, basedOn: 3, firstLabel: '1.0', pubSnapshot: null, bases: {}, history: hist, hlSeqs: [] } };

async function openPage(browser, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const p = await ctx.newPage();
  p._errors = [];
  p.on('pageerror', e => p._errors.push(e.message));
  await p.addInitScript(([key, r]) => {
    if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('__seeded', '1'); localStorage.setItem('mahjong_notice_ver1', '1'); localStorage.setItem(key, JSON.stringify({ rules: [r] }));
  }, [STORAGE_KEY, RULE]);
  await p.goto(`http://localhost:${PORT}/src/index.html?v=${VERSION}`);
  await p.waitForFunction(() => window._renderReactHome && document.querySelector('#react-home-root h1'), null, { timeout: 30000 });
  await p.waitForTimeout(500);
  // テスト用のリンクは本番のサーバーにないので、通信を止める。公開している内容の控えは読み込み後の内容にして、下書きを1つ作る
  await ctx.setOffline(true);
  await p.evaluate(() => { const r = getRule('r1'); r.link.pubSnapshot = pubPartsOf(r); r.settings = Object.assign({}, r.settings, { uma: '5-15' }); saveData(); renderHome(); });
  await p.waitForTimeout(300);
  return p;
}
// 要素の文字が切れていないか（「…」で省略されたり、はみ出したりしていない）
const notCut = (p, sel) => p.evaluate(sel => { const e = document.querySelector(sel); return !!e && e.scrollWidth <= e.clientWidth + 1; }, sel);

(async () => {
  const server = await startServer();
  const webkit = await pw.webkit.launch();
  const chromium = await pw.chromium.launch();
  const pages = [];
  try {
    const sp = await openPage(webkit, { ...pw.devices['iPhone 14'] }); pages.push(sp);
    // U-03 ホームの一覧：ラベルはルール名の下の行
    const home = await sp.evaluate(() => {
      const h2 = [...document.querySelectorAll('#react-home-root h2')].find(h => h.textContent.includes('とても長い'));
      const card = h2.parentElement;
      const badges = [...card.querySelectorAll('span')].filter(s => /ver2025秋大会用|下書きあり/.test(s.textContent));
      const hr = h2.getBoundingClientRect();
      return { badges: badges.length, below: badges.every(b => b.getBoundingClientRect().top >= hr.bottom - 1), nameW: Math.round(hr.width), cardW: Math.round(card.getBoundingClientRect().width) };
    });
    // U-03 表示画面
    await sp.evaluate(() => editRule('r1'));
    await sp.waitForTimeout(300);
    const view = await sp.evaluate(() => {
      const name = document.getElementById('edit-name').getBoundingClientRect();
      const badge = document.getElementById('edit-ver-badge'), draft = document.getElementById('edit-draft-badge');
      return { badge: badge.textContent, draftShown: !draft.classList.contains('hidden'), below: badge.getBoundingClientRect().top >= name.bottom - 1, nameW: Math.round(name.width), screenW: window.innerWidth };
    });
    check('U-03', 'スマホで、verのラベルと「下書きあり」がルール名の下の行に出て、ルール名の幅が狭くならない（ホームの一覧・表示画面）',
      home.badges === 2 && home.below && home.nameW >= home.cardW - 20 && view.below && view.draftShown && view.nameW >= view.screenW - 60, JSON.stringify({ home, view }));
    // U-02 自分のルールの過去のver
    await sp.evaluate(() => { const o = getRule('r1'); showOwnerPastVer(o, o.link.history[0], JSON.parse(JSON.stringify(o.settings))); });
    await sp.waitForTimeout(300);
    const title = await sp.evaluate(() => document.getElementById('edit-mode-label').textContent);
    check('U-02', '自分のルールの過去のverを見ているときの題は「ルール表示」', title === 'ルール表示', title);
    // U-01 過去のverのポップアップの見出し
    await sp.evaluate(() => { const r = getRule(editingId); r.ownerRuleId = null; showOldVerPopup(r); });
    await sp.waitForTimeout(300);
    const popTitle = await sp.evaluate(() => document.querySelector('#ver-sheet-overlay .sheet-title').textContent);
    check('U-01', '幅375px前後でも、過去のverのポップアップの見出しが切れずに全部出る', popTitle === 'このルールは新しいverに更新されています' && await notCut(sp, '#ver-sheet-overlay .sheet-title'), popTitle);
    await sp.evaluate(() => { closeVerSheet(); goHome(); editRule('r1'); goEditMode(); });
    // U-04 画面の下のボタンの帯の背景
    const bg = await sp.evaluate(() => getComputedStyle(document.getElementById('bottom-bar')).backgroundColor);
    const alpha = (bg.match(/rgba?\(([^)]+)\)/) || [])[1];
    const a = alpha ? (alpha.split(',')[3] === undefined ? 1 : parseFloat(alpha.split(',')[3])) : 0;
    check('U-04', '画面の下のボタンの帯に背景の色があり、後ろの項目の文字が透けて重ならない', a >= 0.9, bg);
    // U-05 PCで帯の幅
    const pc = await openPage(chromium, { viewport: { width: 1280, height: 800 } }); pages.push(pc);
    await pc.evaluate(() => editRule('r1'));
    await pc.waitForTimeout(300);
    const bar = await pc.evaluate(() => { const b = document.getElementById('bottom-bar').getBoundingClientRect(), m = document.querySelector('#screen-edit main').getBoundingClientRect(); return { barL: Math.round(b.left), barR: Math.round(b.right), mainL: Math.round(m.left), mainR: Math.round(m.right) }; });
    check('U-05', 'PC（幅1280px）で、画面の下のボタンの帯の左右の端が本文とそろう', Math.abs(bar.barL - bar.mainL) <= 2 && Math.abs(bar.barR - bar.mainR) <= 2, JSON.stringify(bar));
    // U-06 Firestoreへの通信が止められたとき（iOS 26 の Safari の「高度なプライバシー保護」）。何も出ずにホームのままにならず、案内が出る
    const bctx = await webkit.newContext({ ...pw.devices['iPhone 14'] });
    await bctx.route(/firestore\.googleapis\.com/, r => r.abort());
    const bp = await bctx.newPage();
    await bp.addInitScript(() => localStorage.setItem('mahjong_notice_ver1', '1'));
    await bp.goto(`http://localhost:${PORT}/src/index.html?v=${VERSION}&share=BLOCKED1`);
    const msg = await bp.waitForFunction(() => { const o = document.getElementById('ver-sheet-overlay'); return o && o.textContent.includes('リンクのルールを読み込めませんでした') && o.textContent; }, null, { timeout: 30000 }).then(h => h.jsonValue()).catch(() => '');
    const longPoll = await bp.evaluate(() => { try { return !!fbDb._delegate._settings.experimentalForceLongPolling; } catch (e) { return null; } });
    check('U-06', 'Firestoreへの通信が止められたとき、共有リンクを開くと「リンクのルールを読み込めませんでした…［保護を緩和］…」が出る（Firestoreはロングポーリングで通信する）',
      msg.includes('保護を緩和') && longPoll !== false, JSON.stringify({ msg: msg.slice(0, 80), longPoll }));
    await bctx.close();
    const errs = pages.flatMap(p => p._errors);
    check('U-ERR', '画面の操作でエラーが出ない', errs.length === 0, JSON.stringify(errs.slice(0, 5)));
  } finally {
    await webkit.close(); await chromium.close();
    server.close();
  }
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length} 件成功 / ${bad.length} 件失敗`);
  fs.writeFileSync(path.join(__dirname, 'last_result_ui_fix.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  process.exitCode = bad.length ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; })
  // 終わった後に通信などが残ってプロセスが抜けないことがあるので、結果を書いたら強制的に終える
  .finally(() => setTimeout(() => process.exit(process.exitCode || 0), 1000));
