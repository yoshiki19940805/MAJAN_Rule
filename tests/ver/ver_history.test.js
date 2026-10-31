// ver管理 追加：表示画面で過去のverを見る（V-117〜V-121）のテスト。
// Firestore・Authのエミュレーターと、ヘッドレスブラウザで流す。アプリは ?emu=1 でエミュレーターにつなぐ。
// 使い方は tests/ver/README.md を参照。
const path = require('path');
const http = require('http');
const fs = require('fs');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require(path.join(process.env.HOME, 'node_modules', 'playwright'))); }

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 9290 + Math.floor(Math.random() * 100);
const STORAGE_KEY = 'mahjong_rules_pwa_v1';
const FS_EMU = 'http://localhost:8080';
const PROJECT = 'majan-rule';
const VERSION = (fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8').match(/const currentVersion = "(v[\d.]+)"/) || [])[1];
const APP = `http://localhost:${PORT}/src/index.html`;
// 前のアプリ（ver管理を出す前の v5.11。切り戻し用のタグ before-ver のもの）。切り戻した状態・更新前のアプリとして使う
const { serveOldApp, OLD_APP_PATH } = require('./old_app');
const OLD_APP = `http://localhost:${PORT}${OLD_APP_PATH}`;

function startServer() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    if (serveOldApp(req, res, types, { emulator: true })) return;
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(PORT, () => r(server)));
}

const results = [];
const step = (msg) => { if (process.env.VERBOSE) console.log('  …' + msg); };
function check(id, name, ok, detail) {
  results.push({ id, name, ok: !!ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${ok ? '' : '  → ' + (detail || '')}`);
}

// エミュレーターのデータを消す・管理者として読む（Firestoreのルールを通さない）
async function clearFirestore() {
  await fetch(`${FS_EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}
async function getDoc(docPath) {
  const res = await fetch(`${FS_EMU}/v1/projects/${PROJECT}/databases/(default)/documents/${docPath}`, { headers: { Authorization: 'Bearer owner' } });
  if (res.status === 404) return null;
  return (await res.json()).fields || null;
}
async function countDocs(col) {
  const res = await fetch(`${FS_EMU}/v1/projects/${PROJECT}/databases/(default)/documents/${col}?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  const j = await res.json();
  return (j.documents || []).length;
}
const val = f => f && (f.stringValue ?? f.integerValue ?? f.booleanValue);

function ownRule(id, name, extra) {
  return Object.assign({ id, mode: '四麻', name, base_rule: '', date: '2026/10/01 10:00:00', verLabel: '1.0', settings: { uma: '5-15', aka_dora: '3枚', kuitan_atoduke: 'あり' } }, extra || {});
}

// 1つの端末（ブラウザのデータが別）。コピーしたURLは window.__copied に入る
async function device(browser, rules) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page._errors = [];
  page.on('pageerror', e => page._errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(([key, rules]) => {
    window.__copied = [];
    try {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__copied.push(t); return Promise.resolve(); } } });
    } catch (e) {}
    if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('__seeded', '1');
    if (rules) localStorage.setItem(key, JSON.stringify({ rules }));
    localStorage.setItem('mahjong_notice_ver1', '1');
  }, [STORAGE_KEY, rules]);
  return page;
}
async function open(page, query) {
  step('アプリを開く ' + (query || ''));
  await page.goto(`${APP}?v=${VERSION}&emu=1${query || ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window._renderReactHome && document.querySelector('#react-home-root'), null, { timeout: 30000 });
  await page.waitForTimeout(800);
}
async function login(page, sub) {
  await page.evaluate(async (sub) => {
    const cred = firebase.auth.GoogleAuthProvider.credential(JSON.stringify({ sub, email: sub + '@example.com', email_verified: true }));
    await fbAuth.signInWithCredential(cred);
  }, sub);
  await page.waitForFunction(() => window._fbUser && _fbUid, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
}
const ruleOf = (page, id) => page.evaluate(id => JSON.parse(JSON.stringify(getRule(id) || null)), id);
const text = (page, sel) => page.evaluate(sel => { const e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; }, sel);
const snack = page => text(page, '#snackbar');
const sheet = page => text(page, '#ver-sheet-overlay');
const lastCopied = page => page.evaluate(() => window.__copied[window.__copied.length - 1] || '');
async function view(page, id) { await page.evaluate(id => editRule(id), id); await page.waitForTimeout(400); }
// 表示画面で「リンクで送る」→ シートのボタンを押す
async function sendLink(page, buttonText, cmp) {
  await page.evaluate(() => onSendLinkButton());
  await page.waitForTimeout(300);
  if (cmp !== undefined) await page.evaluate(v => { document.getElementById('ver-cmp').value = v; }, cmp);
  if (buttonText) await clickInSheet(page, buttonText);
}
async function clickInSheet(page, label) {
  await page.evaluate(label => {
    const b = [...document.querySelectorAll('#ver-sheet-overlay button')].find(x => x.textContent.trim().startsWith(label));
    if (!b) throw new Error('ボタンがありません: ' + label);
    b.click();
  }, label);
  await page.waitForTimeout(1500);
}
// 編集画面で設定を変える
async function editSetting(page, key, value) {
  await page.evaluate(([k, v]) => { goEditMode(); onSettingChange(k, v); }, [key, value]);
}
const shareOf = url => (url.match(/share=([^&]+)/) || [])[1];
const cmpOf = url => decodeURIComponent((url.match(/cmp=([^&]+)/) || [])[1] || '');


const changed = (page, key) => page.evaluate(k => { const e = document.querySelector(`#edit-fields .swipe-item[data-id="${k}"]`); return e ? e.classList.contains('is-changed') : null; }, key);
const stored = (page, id) => page.evaluate(([k, id]) => (JSON.parse(localStorage.getItem(k)).rules || []).find(r => r.id === id) || null, [STORAGE_KEY, id]);
async function makeLink(page, id, cmp) {
  await view(page, id);
  await sendLink(page, 'リンクを作って送る', cmp === undefined ? '' : cmp);
  await page.waitForTimeout(500);
  return lastCopied(page);
}
// 編集画面で「保存して公開」→ 公開の画面で verの名前・変更内容を入れて「公開する」
async function publishVer(page, label, note) {
  await page.evaluate(() => { if (isViewMode) goEditMode(); onSavePublishButton(); });
  await page.waitForTimeout(1200);
  await page.evaluate(([l, n]) => { document.getElementById('pub-ver').value = l; const t = document.getElementById('pub-note'); t.value = n || ''; onPubNoteInput(t); }, [label, note || '']);
  await clickInSheet(page, '公開する');
}
async function openLink(page, url) {
  await open(page, `&share=${shareOf(url)}${cmpOf(url) ? '&cmp=' + encodeURIComponent(cmpOf(url)) : ''}`);
  await page.waitForTimeout(1200);
}
async function openOld(page, query) {
  await page.goto(`${OLD_APP}?v=${VERSION}${query || ''}`);
  await page.waitForTimeout(3000);
}
const BASE_SETTINGS = { uma: '5-15', aka_dora: '3枚', kuitan_atoduke: 'あり' };
// 1つのまとまりを流す。途中で止まっても、次のまとまりに進む
async function block(name, fn) {
  step(name);
  try { await fn(); }
  catch (e) { check('ERR', name + ' の途中で止まった', false, String(e && e.message || e).slice(0, 300)); }
}


const histRows = page => page.evaluate(() => [...document.querySelectorAll('#ver-sheet-overlay .ver-history tbody tr')].map(tr => (tr.classList.contains('opened') ? '*' : '') + tr.children[0].textContent));
const pickVer = async (page, seq) => { await page.evaluate(seq => selectHistoryVer(seq), seq); await page.waitForTimeout(1500); };

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  const pages = [];
  const dev = async (rules) => { const p = await device(browser, rules); pages.push(p); return p; };
  try {
    await clearFirestore();
    const A = await dev([ownRule('r1', '履歴のルール'), ownRule('n1', 'リンクなしのルール')]);
    await open(A);
    const url1 = await makeLink(A, 'r1');
    await view(A, 'r1'); await editSetting(A, 'uma', '10-30'); await publishVer(A, '1.1', '特記事項を追記');
    await view(A, 'r1'); await editSetting(A, 'uma', '10-20'); await publishVer(A, '1.2', 'ウマを10-20に変更。');
    // 下書きを作っておく
    await view(A, 'r1');
    await A.evaluate(() => { goEditMode(); onSettingChange('aka_dora', '4枚'); onSaveDraftButton(); });

    await block('V-117', async () => {
      const badge = await text(A, '#edit-ver-badge');
      await A.evaluate(() => document.getElementById('edit-ver-badge').click());
      await A.waitForTimeout(300);
      const head = await text(A, '#ver-sheet-overlay .sheet-title');
      const rows = await histRows(A);
      await A.evaluate(() => closeVerSheet());
      await view(A, 'n1');
      const nBadge = await text(A, '#edit-ver-badge');
      await A.evaluate(() => document.getElementById('edit-ver-badge').click());
      const nSheet = await sheet(A);
      const B = await dev(null);
      await openLink(B, url1);
      await clickInSheet(B, 'ver1.0 のまま見る');
      const bBadge = await text(B, '#edit-ver-badge');
      await B.evaluate(() => document.getElementById('edit-ver-badge').click());
      await B.waitForTimeout(300);
      const bRows = await histRows(B);
      await B.evaluate(() => { closeVerSheet(); goHome(); });
      check('V-117', 'ver のラベルに「▼」があり、押すと「verの履歴」（新しい順、最新に「（最新）」、表示中が太字）が出る。リンクのないルールでは「▼」がなく何も出ない',
        badge === 'ver1.2 ▼' && head === 'verの履歴' && rows.join('|') === '*ver1.2（最新）|ver1.1|ver1.0' && nBadge === 'ver1.0' && nSheet === ''
        && bBadge === 'ver1.0 ▼' && bRows.join('|') === 'ver1.2（最新）|ver1.1|*ver1.0', JSON.stringify({ badge, head, rows, nBadge, nSheet, bBadge, bRows }));
    });

    await block('V-118', async () => {
      await view(A, 'r1');
      await pickVer(A, 1);
      const shown = await A.evaluate(() => { const r = getRule(editingId); return { owner: r.ownerRuleId, uma: r.settings.uma, aka: r.settings.aka_dora, name: r.name, mode: isSharedMode, inputDisabled: document.getElementById('edit-name').disabled }; });
      const banner = await text(A, '#edit-banner');
      const badge = await text(A, '#edit-ver-badge');
      await A.evaluate(() => { const b = [...document.querySelectorAll('#edit-banner button')].find(x => x.textContent === '最新に戻る'); b.click(); });
      await A.waitForTimeout(500);
      const back = await A.evaluate(() => ({ id: editingId, mode: isSharedMode, aka: getRule('r1').settings.aka_dora, draft: hasDraft(getRule('r1')), temps: appData.rules.filter(r => r.ownerRuleId).length }));
      // 戻るボタンでも自分のルールに戻る
      await pickVer(A, 2);
      await A.evaluate(() => goHomeWithConfirm());
      await A.waitForTimeout(300);
      const back2 = await A.evaluate(() => ({ id: editingId, mode: isSharedMode }));
      check('V-118', '自分のルール（下書きあり）で ver1.0 を選ぶと、ver1.0 の設定と今のルール名が書き換えられない状態で出て、帯「ver1.0 を表示しています（最新：ver1.2）」。［最新に戻る］・「戻る」で手元の内容に戻り、下書きは消えない',
        shown.owner === 'r1' && shown.uma === '5-15' && shown.aka === '3枚' && shown.name === '履歴のルール' && shown.mode && shown.inputDisabled
        && banner.includes('ver1.0 を表示しています（最新：ver1.2）') && banner.includes('最新に戻る') && badge === 'ver1.0 ▼'
        && back.id === 'r1' && !back.mode && back.aka === '4枚' && back.draft && back.temps === 0 && back2.id === 'r1' && !back2.mode,
        JSON.stringify({ shown, banner, badge, back, back2 }));
    });

    await block('V-119', async () => {
      await view(A, 'r1');
      await pickVer(A, 1);
      await A.evaluate(() => onEditButton());
      const modal = await A.evaluate(() => ({ show: document.getElementById('modal-copy-edit').classList.contains('show'), text: document.getElementById('modal-copy-edit-text').textContent }));
      await A.evaluate(() => closeCopyEditConfirm());
      const afterCancel = await A.evaluate(() => ({ owner: getRule(editingId).ownerRuleId, n: appData.rules.filter(r => !String(r.id).startsWith('shared_') && !r.readonly).length }));
      await A.evaluate(() => { closeCopyEditConfirm(); copySharedRule(); });
      const copy = await A.evaluate(() => { const r = getRule(editingId); return { name: r.name, ver: r.verLabel, link: !!r.link, uma: r.settings.uma, view: isViewMode }; });
      await A.evaluate(() => saveAndGoView());
      const orig = await ruleOf(A, 'r1');
      check('V-119', '自分のルールで ver1.0 を表示して「編集」：「過去のverは編集できません…」の確認、［やめる］では何も起きず、［コピーして編集］で「名前（ver1.0のコピー）」（ver1.0、リンクなし）。元のルールは変わらない',
        modal.show && modal.text.startsWith('過去のverは編集できません。このverの内容をコピーして、別のルールとして編集しますか？') && afterCancel.owner === 'r1' && afterCancel.n === 2
        && copy.name === '履歴のルール（ver1.0のコピー）' && copy.ver === '1.0' && !copy.link && copy.uma === '5-15' && !copy.view && !!orig.link && orig.settings.aka_dora === '4枚',
        JSON.stringify({ modal, afterCancel, copy }));
    });

    await block('V-120', async () => {
      const B = await dev(null);
      await openLink(B, url1);
      await clickInSheet(B, 'ver1.0 のまま見る');
      const keepBefore = await B.evaluate(() => localStorage.getItem('mahjong_keep_ver'));
      await pickVer(B, 2);
      const mid = await B.evaluate(() => ({ uma: getRule(editingId).settings.uma, badge: document.getElementById('edit-ver-badge').textContent, banner: document.getElementById('edit-banner').textContent }));
      await pickVer(B, 3);
      const top = await B.evaluate(() => ({ uma: getRule(editingId).settings.uma, badge: document.getElementById('edit-ver-badge').textContent, banner: document.getElementById('edit-banner').textContent }));
      const keepAfter = await B.evaluate(() => localStorage.getItem('mahjong_keep_ver'));
      check('V-120', 'リンクを開いた人が履歴から ver1.1 を選ぶと内容が変わり「最新ではありません」の帯、ver1.2 を選ぶと「（最新）」。「まま見る」の記録は変わらない',
        mid.uma === '10-30' && mid.badge === 'ver1.1 ▼' && mid.banner.includes('最新ではありません（最新：ver1.2）') && top.uma === '10-20' && top.badge === 'ver1.2（最新） ▼' && top.banner.trim() === '' && keepBefore === keepAfter,
        JSON.stringify({ mid, top, keepBefore, keepAfter }));
      await B.evaluate(() => goHome());
    });

    await block('V-121', async () => {
      await view(A, 'r1');
      await pickVer(A, 2);
      await A.evaluate(() => { window.__copied = []; onSendLinkButton(); });
      await A.waitForTimeout(300);
      const url = await lastCopied(A);
      const img = await A.evaluate(() => exportVerText(getRule(editingId)));
      const ids = (await ruleOf(A, 'r1')).link.history.map(h => h.shareId);
      await A.evaluate(() => backToOwnerRule());
      await A.context().setOffline(true);
      await A.evaluate(() => selectHistoryVer(1));
      await A.waitForTimeout(800);
      const off = await A.evaluate(() => ({ snack: document.getElementById('snackbar').textContent, id: editingId }));
      await A.context().setOffline(false);
      check('V-121', '過去のver（ver1.1）を表示して「リンクで送る」でそのverのURL、画像・PDFにそのverが入る。通信できないときは「verを読み込めませんでした…」で表示は変わらない',
        shareOf(url) === ids[1] && img === 'ver1.1' && off.snack.includes('verを読み込めませんでした。通信できる場所で、もう一度選んでください') && off.id === 'r1',
        JSON.stringify({ url, img, off }));
    });

    const errs = pages.flatMap(p => p._errors || []);
    check('V-ERR5', '画面の操作でエラーが出ない', errs.length === 0, JSON.stringify(errs.slice(0, 5)));
  } finally {
    await browser.close();
    server.close();
  }
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length} 件成功 / ${bad.length} 件失敗`);
  fs.writeFileSync(path.join(__dirname, 'last_result_ver_history.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  process.exitCode = bad.length ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; })
  // 終わった後に通信などが残ってプロセスが抜けないことがあるので、結果を書いたら強制的に終える
  .finally(() => setTimeout(() => process.exit(process.exitCode || 0), 1000));
