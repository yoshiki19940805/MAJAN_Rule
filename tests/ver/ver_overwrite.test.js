// ver管理 追加：verを上げずに最新のverを上書きして公開する（V-122〜V-127）のテスト。
// Firestore・Authのエミュレーターと、ヘッドレスブラウザで流す。アプリは ?emu=1 でエミュレーターにつなぐ。
// 使い方は tests/ver/README.md を参照。
const path = require('path');
const http = require('http');
const fs = require('fs');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require(path.join(process.env.HOME, 'node_modules', 'playwright'))); }

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 9390 + Math.floor(Math.random() * 100);
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

// 公開の画面で verの名前を入力する（入力のたびの処理も動かす）
async function typeVer(page, label) {
  await page.evaluate(l => { const i = document.getElementById('pub-ver'); i.value = l; i.dispatchEvent(new Event('input')); }, label);
  await page.waitForTimeout(200);
}
const pubSheet = page => page.evaluate(() => ({
  title: document.querySelector('#ver-sheet-overlay .sheet-title').textContent,
  ok: document.getElementById('pub-ok').textContent,
  warn: !document.getElementById('pub-overwrite-warn').hidden,
  hint: !document.getElementById('pub-ver-hint').hidden,
  note: document.getElementById('pub-note').value,
  err: document.getElementById('pub-ver-error').hidden ? '' : document.getElementById('pub-ver-error').textContent
}));
const openPublish = async page => { await page.evaluate(() => { if (isViewMode) goEditMode(); onSavePublishButton(); }); await page.waitForTimeout(1200); };

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  const pages = [];
  const dev = async (rules) => { const p = await device(browser, rules); pages.push(p); return p; };
  try {
    await clearFirestore();
    const A = await dev([ownRule('r1', '上書きのルール')]);
    await open(A);
    const url1 = await makeLink(A, 'r1');
    await view(A, 'r1'); await editSetting(A, 'uma', '10-30'); await publishVer(A, '1.1', 'ウマを10-30に変更。');
    const before = await ruleOf(A, 'r1');
    const url11 = url1.replace(shareOf(url1), before.link.pubShareId);

    await block('V-122', async () => {
      await view(A, 'r1'); await editSetting(A, 'uma', '10-20');
      await openPublish(A);
      const first = await pubSheet(A);
      await typeVer(A, '１．１');   // 全角でも同じ名前として扱う
      const over = await pubSheet(A);
      await clickInSheet(A, '上書きして公開する');
      const sn = await snack(A);
      const r = await ruleOf(A, 'r1');
      const s = await getDoc('rule_series/' + r.link.seriesId);
      const v = await getDoc('shared_rules/' + before.link.pubShareId);
      const data = JSON.parse(val(v.data));
      check('V-122', '公開の画面で今のver（1.1）を入力すると「ver1.1 を上書きして公開します」［上書きして公開する］と注意が出て、公開するとverを上げずに ver1.1 の中身が変わる（URL・verの数は同じ、下書きなし）',
        first.title === '新しいverとして公開します' && first.hint && !first.warn && first.ok === '公開する'
        && over.title === 'ver1.1 を上書きして公開します' && over.warn && !over.hint && over.ok === '上書きして公開する'
        && sn === 'ver1.1 の内容を上書きしました' && val(s.latestSeq) === '2' && s.history.arrayValue.values.length === 2
        && r.link.pubShareId === before.link.pubShareId && r.link.pubLabel === '1.1' && r.verLabel === '1.1' && data.s.uma === '10-20'
        && !(await A.evaluate(() => hasDraft(getRule('r1')))),
        JSON.stringify({ first, over, sn, latestSeq: val(s.latestSeq), uma: data.s.uma, pubShareId: r.link.pubShareId }));
    });

    await block('V-123', async () => {
      const B = await dev(null);
      await openLink(B, url11);
      const b = await B.evaluate(() => ({ uma: getRule(editingId).settings.uma, badge: document.getElementById('edit-ver-badge').textContent, banner: document.getElementById('edit-banner').textContent.trim(), popup: !!document.getElementById('ver-sheet-overlay') }));
      await B.evaluate(() => goHome());
      // 前のアプリ（切り戻した状態）で開いても、上書きした中身が出る
      const OLD = await dev(null);
      await openOld(OLD, `&share=${shareOf(url11)}`);
      const oldUma = await OLD.evaluate(() => ((getRule(editingId) || {}).settings || {}).uma);
      check('V-123', '上書きした ver1.1 のリンクを開くと、上書き後の中身が「ver1.1（最新）」で出る（前のアプリで開いても上書き後の中身）',
        b.uma === '10-20' && b.badge.startsWith('ver1.1（最新）') && b.banner === '' && !b.popup && oldUma === '10-20', JSON.stringify({ b, oldUma }));
    });

    await block('V-124', async () => {
      await view(A, 'r1'); await editSetting(A, 'uma', '5-15');
      await openPublish(A);
      await typeVer(A, '1.0');
      await A.evaluate(() => onPublishSubmit());
      await A.waitForTimeout(500);
      const ps = await pubSheet(A);
      await A.evaluate(() => closeVerSheet(true));
      const s = await getDoc('rule_series/' + (await ruleOf(A, 'r1')).link.seriesId);
      check('V-124', '最新より前のver（1.0）を入力すると、今までどおり「この名前は既に使っています」で公開しない（上書きできるのは最新のverだけ）',
        ps.err === 'この名前は既に使っています' && !ps.warn && val(s.latestSeq) === '2', JSON.stringify(ps));
    });

    await block('V-125', async () => {
      await openPublish(A);
      await typeVer(A, '1.1');
      const pre = await pubSheet(A);
      await typeVer(A, '1.2');
      const back = await pubSheet(A);
      await typeVer(A, '1.1');
      await A.evaluate(() => { const t = document.getElementById('pub-note'); t.value = 'ウマを5-15に変更。'; onPubNoteInput(t); });
      await clickInSheet(A, '上書きして公開する');
      const r = await ruleOf(A, 'r1');
      const s = await getDoc('rule_series/' + r.link.seriesId);
      const notes = s.history.arrayValue.values.map(x => val(x.mapValue.fields.note) || '');
      const labels = s.history.arrayValue.values.map(x => val(x.mapValue.fields.label));
      check('V-125', '上書きのときは変更内容の欄に今のverの変更内容が入り（新しいverに戻すと空に戻る）、直すとそのverの変更内容が置き換わる。verの一覧（名前・日付・数）は変わらない',
        pre.note === 'ウマを10-30に変更。' && back.note === '' && notes[1] === 'ウマを5-15に変更。' && labels.join(',') === '1.0,1.1' && r.link.history[1].note === 'ウマを5-15に変更。',
        JSON.stringify({ pre: pre.note, back: back.note, notes, labels }));
    });

    await block('V-127', async () => {
      // 強調だけを公開して ver_hl を作り、その後に設定と強調を変えて上書きする
      await view(A, 'r1');
      await A.evaluate(() => { goEditMode(); toggleHighlight('uma'); onSavePublishButton(); });
      await A.waitForTimeout(1500);
      const r0 = await ruleOf(A, 'r1');
      await view(A, 'r1');
      await A.evaluate(() => { goEditMode(); onSettingChange('aka_dora', '4枚'); toggleHighlight('uma'); toggleHighlight('aka_dora'); });
      await openPublish(A);
      await typeVer(A, '1.1');
      await clickInSheet(A, '上書きして公開する');
      const r = await ruleOf(A, 'r1');
      const h = await getDoc('ver_hl/' + r.link.pubShareId);
      const hl = JSON.parse(val(h.hl));
      const want = await A.evaluate(() => pubPartsOf(getRule('r1')).hl);
      const sameHl = await A.evaluate(([a, b]) => canonical(a) === canonical(b), [hl, want]);
      const B = await dev(null);
      await openLink(B, url11);
      const b = await B.evaluate(() => ({ aka: getRule(editingId).settings.aka_dora, hl: pubPartsOf(getRule(editingId)).hl }));
      await B.evaluate(() => goHome());
      check('V-127', '強調だけを公開したことのある最新のverを上書きすると、強調（ver_hl）も上書き後のものになり、リンクを開くと上書き後の設定と強調で出る',
        r0.link.hlSeqs.includes(2) && sameHl && b.aka === '4枚' && await A.evaluate(([a, b]) => canonical(a) === canonical(b), [b.hl, want]),
        JSON.stringify({ hlSeqs: r0.link.hlSeqs, hl, want, b }));
    });

    await block('V-126', async () => {
      // 作成者パスワードのない人は、verの中身を書き換えられない。最新でないver・固定のリンクは、作成者でも書き換えられない
      const r = await ruleOf(A, 'r1');
      const C = await dev(null);
      await open(C);
      const denied = await C.evaluate(async id => { try { await fbDb.collection('shared_rules').doc(id).update({ data: '{"n":"x"}' }); return 'ok'; } catch (e) { return e.code; } }, r.link.pubShareId);
      const oldVer = await A.evaluate(async ([sid, pw, id]) => {
        try {
          const s = (await fbDb.collection('rule_series').doc(sid).get()).data();
          const n = s.opCount + 1, b = fbDb.batch();
          b.set(fbDb.collection('series_ops').doc(sid + '_' + n), { seriesId: sid, password: pw, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
          b.update(fbDb.collection('rule_series').doc(sid), { opCount: n, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          b.update(fbDb.collection('shared_rules').doc(id), { data: '{"n":"x"}' });
          await b.commit(); return 'ok';
        } catch (e) { return e.code; }
      }, [r.link.seriesId, r.link.password, r.link.history[0].shareId]);
      const v0 = await getDoc('shared_rules/' + r.link.history[0].shareId);
      check('V-126', 'Firestoreのルール：作成者パスワードのない人は最新のverを書き換えられず、作成者でも最新でないver（ver1.0）は書き換えられない',
        denied === 'permission-denied' && oldVer === 'permission-denied' && JSON.parse(val(v0.data)).n === '上書きのルール', JSON.stringify({ denied, oldVer }));
    });

    const errs = pages.flatMap(p => p._errors || []);
    check('V-ERR6', '画面の操作でエラーが出ない', errs.length === 0, JSON.stringify(errs.slice(0, 5)));
  } finally {
    await browser.close();
    server.close();
  }
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length} 件成功 / ${bad.length} 件失敗`);
  fs.writeFileSync(path.join(__dirname, 'last_result_ver_overwrite.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  process.exitCode = bad.length ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; })
  // 終わった後に通信などが残ってプロセスが抜けないことがあるので、結果を書いたら強制的に終える
  .finally(() => setTimeout(() => process.exit(process.exitCode || 0), 1000));
