// ver管理 段階2・3の残りの項目（ver_phase2・ver_phase3 で流していないもの）のテスト。前のアプリ（docs/index.html）との互換も含む。
// Firestore・Authのエミュレーターと、ヘッドレスブラウザで流す。アプリは ?emu=1 でエミュレーターにつなぐ。
// 使い方は tests/ver/README.md を参照。
const path = require('path');
const http = require('http');
const fs = require('fs');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require(path.join(process.env.HOME, 'node_modules', 'playwright'))); }

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 9190 + Math.floor(Math.random() * 100);
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
  await page.goto(`${APP}?v=${VERSION}&emu=1${query || ''}`);
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

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  const pages = [];
  const dev = async (rules) => { const p = await device(browser, rules); pages.push(p); return p; };
  try {
    // ==== verの名前・変更内容・変更履歴の表 ====
    await block('verの名前と変更内容', async () => {
      await clearFirestore();
      const A = await dev([ownRule('r1', '名前のルール')]);
      await open(A);
      const unit = await A.evaluate(() => ({
        n1: nextVerLabel('1.0'), n2: nextVerLabel('2'), n3: nextVerLabel('2025秋'),
        v1: normalizeVerLabel('Ver1.2'), v2: normalizeVerLabel('VER1.2'), v3: normalizeVerLabel('1.0 '), v4: normalizeVerLabel('ｖｅｒ１.２'),
        u1: isVerLabelUsed('2025a', [{ label: '2025A' }]), u2: isVerLabelUsed('１.０', [{ label: '1.0' }]), u3: isVerLabelUsed('1.1', [{ label: '1.0' }])
      }));
      check('V-17', '公開の初期値：前の名前が「1.0」「2」「2025秋」なら「1.1」「3」と空欄', unit.n1 === '1.1' && unit.n2 === '3' && unit.n3 === '', JSON.stringify(unit));
      check('V-109', '「１.０」「1.0 」は「1.0」、「Ver1.2」「VER1.2」「ｖｅｒ１.２」は「1.2」、「2025A」の後の「2025a」は使用済み',
        unit.v1 === '1.2' && unit.v2 === '1.2' && unit.v3 === '1.0' && unit.v4 === '1.2' && unit.u1 && unit.u2 && !unit.u3, JSON.stringify(unit));
      const url1 = await makeLink(A, 'r1');
      // 変更内容は200文字まで
      await A.evaluate(() => { goEditMode(); onSettingChange('uma', '10-30'); onSavePublishButton(); });
      await A.waitForTimeout(1200);
      const over = await A.evaluate(() => { const t = document.getElementById('pub-note'); t.value = 'あ'.repeat(201); onPubNoteInput(t); return { len: [...t.value].length, count: document.getElementById('pub-note-count').textContent }; });
      await clickInSheet(A, 'キャンセル');
      check('V-18a', '変更内容は200文字まで入り、残りの文字数（200 / 200）が出る。201文字目は入らない', over.len === 200 && over.count === '200 / 200', JSON.stringify(over));
      // 絵文字20文字のver・HTMLの文字を入れた変更内容・空の変更内容
      const emoji = '😀'.repeat(20);
      await publishVer(A, emoji, '<script>window.__x=1</script><b>太字</b>\n2行目');
      const emojiSnack = await snack(A);
      await A.evaluate(() => { goEditMode(); onSettingChange('aka_dora', '4枚'); });
      await publishVer(A, '<b>x</b>', '');
      await A.evaluate(() => { goEditMode(); onSettingChange('kuitan_atoduke', 'なし'); });
      await publishVer(A, '2025秋', '最後');
      const badge = await A.evaluate(() => { goViewMode(); return document.getElementById('edit-ver-badge').textContent.replace(/ ▼$/, ''); });
      check('V-14', 'verの名前に絵文字20文字・記号・「2025秋」を使って公開でき（Firestoreに断られない）、そのまま表示される',
        emojiSnack.includes('ver' + emoji + ' として公開しました') && badge === 'ver2025秋', JSON.stringify({ emojiSnack, badge }));
      // 途中のver（絵文字のver）のリンクを開く
      const series = await getDoc('rule_series/' + (await ruleOf(A, 'r1')).link.seriesId);
      const ids = series.shareIds.arrayValue.values.map(v => v.stringValue);
      const B = await dev(null);
      await open(B, `&share=${ids[1]}`);
      await B.waitForTimeout(1500);
      const table = await B.evaluate(() => {
        const rows = [...document.querySelectorAll('.ver-history tbody tr')];
        return {
          rows: rows.map(tr => ({ cls: tr.className, cells: [...tr.children].map(td => td.textContent) })),
          html: !!document.querySelector('.ver-history b, .ver-history script'), x: window.__x || 0,
          noteInner: rows.map(tr => tr.children[2].innerText)
        };
      });
      const labels = table.rows.map(r => r.cells[0]);
      const ok99 = labels.join('|') === ['ver2025秋', 'ver<b>x</b>', 'ver' + emoji, 'ver1.0'].join('|')
        && table.rows.map(r => r.cls).join(',') === 'newer,newer,opened,' && table.rows[1].cells[2] === '—';
      check('V-99', '途中のverのリンクを開くと、すべてのverが新しい順に並び、開いたverより新しい行だけに色、開いたverは太字。変更内容が空のverは「—」、verの欄には名前だけ', ok99, JSON.stringify(table.rows));
      check('V-57/V-102', '変更内容・verの名前に入れた <script> <b> は、ポップアップで文字のまま表示され、HTMLとして解釈されない',
        !table.html && table.x === 0 && table.rows[2].cells[2].includes('<script>') && labels[1] === 'ver<b>x</b>', JSON.stringify({ html: table.html, x: table.x }));
      check('V-18b', '変更内容は、過去のverのポップアップで改行どおりに表示される', table.noteInner[2].includes('\n2行目'), JSON.stringify(table.noteInner[2]));
      await clickInSheet(B, 'ver' + emoji + ' のまま見る');
      const pastVer = await B.evaluate(() => exportVerText(getRule(editingId)));
      check('V-08', '過去のverを見ている状態の画像・PDFには、必ずそのverが入る', pastVer === 'ver' + emoji, pastVer);
      // 「まま見る」の後に、さらに新しいverが出るとまたポップアップが出る
      await view(A, 'r1');
      await A.evaluate(() => { goEditMode(); onSettingChange('uma', '5-15'); });
      await publishVer(A, '2026春', '');
      await open(B, `&share=${ids[1]}`);
      await B.waitForTimeout(1500);
      check('V-53', 'ver を「まま見る」にした後、さらに新しいverが公開されると、またポップアップが出る', (await sheet(B)).includes('このルールは新しいverに更新されています'), await sheet(B));
      await B.evaluate(() => { closeVerSheet(); goHome(); });
      // 最新verのリンク
      const latest = (await ruleOf(A, 'r1')).link.pubShareId;
      await open(B, `&share=${latest}`);
      await B.waitForTimeout(1500);
      check('V-51', '最新verのリンクを開くと、ポップアップは出ず「（最新）」付きで表示される', (await sheet(B)) === '' && (await text(B, '#edit-ver-badge')) === 'ver2026春（最新） ▼', await text(B, '#edit-ver-badge'));
      // パスワードがどこにも入らない
      const pw = (await ruleOf(A, 'r1')).link.password;
      const bStore = await B.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
      const docs = JSON.stringify([await getDoc('rule_series/' + (await ruleOf(A, 'r1')).link.seriesId), ...await Promise.all(ids.map(id => getDoc('shared_rules/' + id)))]);
      const shareUrl = await lastCopied(A);
      check('V-80', '共有リンク・shared_rules・rule_series・リンクを開いた側の端末のどこにも、作成者パスワードが入っていない',
        !bStore.includes(pw) && !docs.includes(pw) && !shareUrl.includes(pw), JSON.stringify({ inB: bStore.includes(pw), inDocs: docs.includes(pw) }));
    });

    // ==== 編集・下書き・公開の残り ====
    await block('編集・下書き・公開', async () => {
      await clearFirestore();
      const A = await dev([ownRule('r1', '公開のルール', { base_rule: 'preset_g0yy_4' }), ownRule('b1', '比較1', { settings: { uma: '10-30' } }), ownRule('b2', '比較2', { settings: { uma: '10-20' } })]);
      await open(A);
      const url1 = await makeLink(A, 'r1', 'b1');
      // V-23 公開の画面のキャンセル・下書き保存
      await A.evaluate(() => { goEditMode(); onSettingChange('uma', '10-30'); onSavePublishButton(); });
      await A.waitForTimeout(1200);
      await clickInSheet(A, 'キャンセル');
      const afterCancel = await A.evaluate(() => ({ view: isViewMode, uma: getRule('r1').settings.uma }));
      const storedUma = (await stored(A, 'r1')).settings.uma;
      await A.evaluate(() => onSavePublishButton());
      await A.waitForTimeout(1200);
      await clickInSheet(A, '下書き保存');
      const afterDraft = await A.evaluate(() => ({ view: isViewMode, draft: hasDraft(getRule('r1')) }));
      check('V-23', '「新しいverとして公開します」の［キャンセル］では何も保存されず編集画面に内容が残る。［下書き保存］では下書きとして保存される',
        !afterCancel.view && afterCancel.uma === '10-30' && storedUma === '5-15' && afterDraft.view && afterDraft.draft && (await stored(A, 'r1')).settings.uma === '10-30',
        JSON.stringify({ afterCancel, storedUma, afterDraft }));
      // V-26 設定を下書き保存した後、名前だけ変えて保存して公開 → 新しいverの画面
      await A.evaluate(() => { goEditMode(); onNameChange('公開のルールB'); onSavePublishButton(); });
      await A.waitForTimeout(1200);
      const sheet26 = await sheet(A);
      check('V-26', '設定を下書き保存した後に名前だけを変えて「保存して公開」：名前だけの公開にならず「新しいverとして公開します」が出る',
        sheet26.includes('新しいverとして公開します'), sheet26.slice(0, 60));
      check('V-25a', '名前と設定を変えたときの公開の画面に「ルール名：A → B」が出る', sheet26.includes('公開のルール → 公開のルールB'), sheet26);
      await clickInSheet(A, '公開する');
      const s25 = await getDoc('rule_series/' + (await ruleOf(A, 'r1')).link.seriesId);
      const v2 = await getDoc('shared_rules/' + (await ruleOf(A, 'r1')).link.pubShareId);
      check('V-25b', '公開すると名前も設定も変わる', val(s25.name) === '公開のルールB' && JSON.parse(v2.data.stringValue).s.uma === '10-30', val(s25.name));
      // V-41 設定と強調
      await A.evaluate(() => { goEditMode(); onSettingChange('aka_dora', '4枚'); toggleHighlight('kuitan_atoduke'); onSavePublishButton(); });
      await A.waitForTimeout(1200);
      const sheet41 = await sheet(A);
      await A.evaluate(() => { document.getElementById('pub-ver').value = '1.2'; });
      await clickInSheet(A, '公開する');
      const v3 = JSON.parse((await getDoc('shared_rules/' + (await ruleOf(A, 'r1')).link.pubShareId)).data.stringValue);
      const hl41 = ((v3.s.highlight_overrides || {}).preset_g0yy_4 || {}).kuitan_atoduke;
      check('V-41', '設定を変え、強調も直して「保存して公開」：「新しいverとして公開します」が出て、新しいverに直した強調も入る', sheet41.includes('新しいverとして公開します') && typeof hl41 === 'boolean', JSON.stringify({ hl41 }));
      // V-43 の残り：新しいverを公開した後も印は残る。特記事項の差分表示には印が付かない
      await A.evaluate(() => goEditMode());
      const markKept = await A.evaluate(() => !!document.querySelector('#edit-fields .swipe-item[data-id="kuitan_atoduke"] .manual-mark'));
      // 項目に付いた印だけを数える（一覧の上の説明の印は数えない）
      const memoMark = await A.evaluate(() => { const cat = getRuleCategories(getRule('r1')).find(c => c[2]); if (!cat) return 'nocat'; onMemoDiffToggle(catKeyOf(cat), true); const n = document.querySelectorAll('#edit-fields .swipe-item .manual-mark').length; onMemoDiffToggle(catKeyOf(cat), false); return n; });
      const draftAfterMemo = await A.evaluate(() => { onSaveDraftButton(); return hasDraft(getRule('r1')); });
      check('V-43', '（残り）新しいverを公開した後も「手動」の印は残り、特記事項の「差分として表示」には印が付かない',
        markKept && (memoMark === 1 || memoMark === 'nocat'), JSON.stringify({ markKept, memoMark }));
      check('V-29a', '差分表示を切り替えて元に戻してから保存しても「下書きあり」にならない', !draftAfterMemo, String(draftAfterMemo));
      const order = await A.evaluate(() => {
        const r = getRule('r1');
        const keys = Object.keys(r.settings).reverse();
        const reordered = {}; for (const k of keys) reordered[k] = r.settings[k];
        const backup = r.settings;
        r.settings = Object.assign(reordered, { extra_empty: '', extra_null: null, extra_list: [] });
        const d = hasDraft(r);
        r.settings = backup;
        return d;
      });
      check('V-29b', '項目の並び順だけが違うデータ・値が空（空の文字・null・空の一覧）と項目なしのデータで比べても「下書きあり」にならない', !order, String(order));
      // V-42 強調だけを下書き保存 → リンクで送る
      await A.evaluate(() => { goEditMode(); toggleHighlight('uma'); onSaveDraftButton(); });
      await sendLink(A);
      const sheet42 = await sheet(A);
      check('V-42', '強調を手で直して「下書き保存」した後の「リンクで送る」：「下書きあり」になっていて「下書きがあります」の画面が出る', sheet42.includes('下書きがあります'), sheet42.slice(0, 40));
      // V-97 の残り：強調だけのとき、「下書きを公開してから送る」でverは変わらず同じverのURL
      const before = (await ruleOf(A, 'r1')).link.pubShareId;
      await clickInSheet(A, '下書きを公開してから送る');
      await A.waitForTimeout(800);
      const after97 = await sheet(A);
      await clickInSheet(A, '送る');
      const url97 = await lastCopied(A);
      // 設定の下書きで、公開の画面の［下書き保存］ → 「下書きがあります」に戻る
      await A.evaluate(() => { goEditMode(); onSettingChange('uma', '5-15'); onSaveDraftButton(); });
      await sendLink(A, '下書きを公開してから送る', 'b2');
      await clickInSheet(A, '下書き保存');
      const back97 = await sheet(A);
      const backCmp = await A.evaluate(() => (document.getElementById('ver-cmp') || {}).value);
      await clickInSheet(A, 'キャンセル');
      check('V-97', '（残り）強調だけの下書きは、verが変わらず同じverのURLが送られる。公開の画面で［下書き保存］を押すと「下書きがあります」に戻り、選んだ比較対象が残る',
        after97.includes('のリンクを送る') && shareOf(url97) === before && back97.includes('下書きがあります') && backCmp === 'b2', JSON.stringify({ after97: after97.slice(0, 30), url97, before, back97: back97.slice(0, 20), backCmp }));
      // V-31 表示画面の帯の「公開する」
      const bannerBtn = await A.evaluate(() => { const b = [...document.querySelectorAll('#edit-banner button')].find(x => x.textContent === '公開する'); if (b) b.click(); return !!b; });
      await A.waitForTimeout(1200);
      await A.evaluate(() => { document.getElementById('pub-ver').value = '1.3'; });
      await clickInSheet(A, '公開する');
      check('V-31', '表示画面の帯の「公開する」で「保存して公開」と同じ流れで公開され、下書きがなくなると帯が消える',
        bannerBtn && (await snack(A)).includes('ver1.3 として公開しました') && (await text(A, '#edit-banner')) === '', JSON.stringify({ bannerBtn, snack: await snack(A) }));
      // V-32 の残り：名前だけを通信できない状態で
      await A.evaluate(() => { goEditMode(); onNameChange('公開のルールC'); });
      await A.context().setOffline(true);
      await A.evaluate(() => onSavePublishButton());
      await A.waitForTimeout(1500);
      const off = await snack(A);
      await A.context().setOffline(false);
      check('V-32', '（残り）名前だけの変更を通信できない状態で公開しても、下書きとして保存され失敗が表示される',
        off.includes('保存しましたが、公開に失敗しました') && (await stored(A, 'r1')).name === '公開のルールC', off);
      await A.evaluate(() => { goEditMode(); onNameChange('公開のルールB'); onSaveDraftButton(); });

      // ==== 送るときの比較対象 ====
      await sendLink(A, 'リンクを送る', '');
      const urlNone = await lastCopied(A);
      await sendLink(A, 'リンクを送る', 'b1');
      const urlB1 = await lastCopied(A);
      await sendLink(A, 'リンクを送る', 'b2');
      const urlB2 = await lastCopied(A);
      const seqNow = val((await getDoc('rule_series/' + (await ruleOf(A, 'r1')).link.seriesId)).latestSeq);
      const B = await dev(null);
      await openLink(B, urlNone);
      const baseNone = await text(B, '#standard-rule-display');
      await openLink(B, urlB1);
      const baseB1 = await text(B, '#standard-rule-display');
      await openLink(B, urlB2);
      const baseB2 = await text(B, '#standard-rule-display');
      check('V-36', '比較対象を「なし」にして送ると、URLに印が入らず、開くと比較対象なし', !urlNone.includes('cmp=') && baseNone === '-', JSON.stringify({ urlNone, baseNone }));
      check('V-35', '天鳳…ではなく自分のルール2つ（比較1・比較2）で送り分けると、それぞれのURLでその比較対象との差分が出る。同じverで新しいverは作られない',
        baseB1 === '比較1' && baseB2 === '比較2' && shareOf(urlB1) === shareOf(urlB2) && seqNow === '4', JSON.stringify({ baseB1, baseB2, seqNow }));
      // V-28・V-37・V-39 比較対象の中身を変える
      await B.evaluate(() => goHome());
      await A.evaluate(() => { const b = getRule('b1'); b.settings.uma = '5-15'; saveData(); });
      const draft28 = await A.evaluate(() => hasDraft(getRule('r1')));
      await view(A, 'r1');
      await sendLink(A, 'リンクを送る', 'b1');
      const urlB1b = await lastCopied(A);
      const baseDoc = await getDoc(`series_bases/${(await ruleOf(A, 'r1')).link.seriesId}_${cmpOf(urlB1)}`);
      check('V-28', '比較対象にしている別のルールの中身を変えても、リンクを作ったルールは「下書きあり」にならない', !draft28, String(draft28));
      check('V-37', '比較対象の中身を変えてから同じ比較対象で送ると、中身が保存し直される（印は同じ）',
        cmpOf(urlB1b) === cmpOf(urlB1) && JSON.parse(baseDoc.settings.stringValue).uma === '5-15', JSON.stringify({ mark: cmpOf(urlB1b) }));
      // B に前の写し（uma 10-30）を残しておいてから、前に送ったURLを開く
      await B.evaluate(() => { appData.rules.push({ id: 'b1', mode: '四麻', name: '比較1', settings: { uma: '10-30' }, date: '2026/10/01 10:00:00', readonly: true, isSharedPhantom: true }); saveData(); });
      await openLink(B, urlB1);
      const phantomUma = await B.evaluate(() => getRule('b1').settings.uma);
      check('V-39', '前に受け取った比較対象の古い写しが端末にあっても、新しい中身と比べ、写しも置き換わる', phantomUma === '5-15', phantomUma);
      // V-38 通信できないとき
      await A.evaluate(() => { appData.rules.push({ id: 'b3', mode: '四麻', name: '比較3', settings: { uma: '10-20' }, date: '2026/10/02 10:00:00', verLabel: '1.0' }); saveData(); });
      await A.context().setOffline(true);
      await sendLink(A, 'リンクを送る', 'b3');
      const err38 = await text(A, '#ver-sheet-error');
      await clickInSheet(A, 'キャンセル');
      await A.evaluate(() => { window.__copied = []; });
      await sendLink(A, 'リンクを送る', 'b1');
      const url38 = await lastCopied(A);
      // V-108 プリセット（通信できない状態でも）
      await sendLink(A, 'リンクを送る', 'preset_g0yy_4');
      const urlP = await lastCopied(A);
      await A.context().setOffline(false);
      check('V-38', '通信できない状態で、初めての比較対象は「通信できる場所で、もう一度送ってください」で送れず、保存済みで中身が同じものは送れる',
        err38 === '通信できる場所で、もう一度送ってください' && cmpOf(url38) === cmpOf(urlB1), JSON.stringify({ err38, url38 }));
      await openLink(B, urlP);
      const baseP = await text(B, '#standard-rule-display');
      check('V-108', '（残り）プリセットは通信できない状態でも送れ、開くと開いた人のアプリの天鳳ルールと比べる', cmpOf(urlP) === 'p:preset_g0yy_4' && baseP === '天鳳', JSON.stringify({ urlP, baseP }));
      // V-44 開いた人がプリセットを選ぶと、作成者がそのプリセットに対して直した強調
      await B.evaluate(() => onBaseRuleChange('preset_g0yy_4'));
      const bK = await changed(B, 'kuitan_atoduke');
      const aK = await A.evaluate(() => { const r = getRule('r1'); r.base_rule = 'preset_g0yy_4'; return applyHighlightOverride(r, 'kuitan_atoduke', autoItemDiff(r, 'kuitan_atoduke')); });
      check('V-44', 'リンクを開いた人が自分の端末にもあるプリセット（天鳳）を選ぶと、作成者が天鳳に対して直した強調が使われる', bK === aK, JSON.stringify({ bK, aK }));
      // V-46 比較対象にした自分のルールを削除した後
      await A.evaluate(() => { goHome(); askDelete('b2'); confirmDelete(); });
      await openLink(B, urlB2);
      check('V-46', '比較対象にした自分のルールを削除した後も、そのURLは保存済みの中身との差分で表示される', (await text(B, '#standard-rule-display')) === '比較2', await text(B, '#standard-rule-display'));
      await B.evaluate(() => goHome());

      // ==== コピー ====
      await view(A, 'r1');
      await A.evaluate(() => { goEditMode(); showSaveAsDialog(); document.getElementById('save-as-name').value = '別名のルール'; saveAsNewRule(); });
      await A.waitForTimeout(300);
      const saveAsId = await A.evaluate(() => editingId);
      const saveAs = await ruleOf(A, saveAsId);
      await A.evaluate(() => goEditMode());
      const saveAsBtns = await text(A, '#bottom-bar-content');
      const orig = await ruleOf(A, 'r1');
      check('V-71', 'リンクを作ったルールで「別のルールとして保存」：新しいルールにリンクは写らず、ボタンは「保存」1つ。元のルールのリンクは変わらない',
        !saveAs.link && saveAsBtns.includes('保存') && !saveAsBtns.includes('下書き') && !!orig.link, JSON.stringify({ link: !!saveAs.link, saveAsBtns, orig: !!orig.link }));
      await A.evaluate(() => { goHomeWithConfirm(); goHome(); duplicateRule('r1'); });
      const dup = await A.evaluate(() => JSON.parse(JSON.stringify(appData.rules.find(r => r.name === '公開のルールB（コピー）'))));
      check('V-74', 'リンクを作ったルールをホームの「コピー」で複製すると、コピーにはリンクの情報が写らない（verは1.0）', dup && !dup.link && dup.verLabel === '1.0', JSON.stringify({ link: dup && !!dup.link }));
    });

    // ==== 作成者パスワードがない端末 ====
    await block('作成者パスワードがない端末', async () => {
      await clearFirestore();
      const A = await dev([ownRule('r1', 'パスワードのルール'), ownRule('b1', '比較1', { settings: { uma: '10-30' } })]);
      await open(A);
      const url1 = await makeLink(A, 'r1', 'b1');
      const copy = await ruleOf(A, 'r1');
      delete copy.link.password;
      const N = await dev([copy, ownRule('b1', '比較1', { settings: { uma: '10-30' } })]);
      await open(N);
      await view(N, 'r1');
      await sendLink(N);
      const url50 = await lastCopied(N);
      const sheet50 = await sheet(N);
      check('V-50', '作成者パスワードがない端末の「リンクで送る」：画面は出ず、最後に使った比較対象で最新verのURLがコピーされる', sheet50 === '' && shareOf(url50) === shareOf(url1) && cmpOf(url50) === cmpOf(url1), JSON.stringify({ url50, sheet50 }));
      await N.evaluate(() => goEditMode());
      const note = await text(N, '#edit-ver-note');
      await N.evaluate(() => { onSettingChange('uma', '10-20'); onSavePublishButton(); });
      await N.waitForTimeout(500);
      const pubSnack = await snack(N);
      const banner = await N.evaluate(() => document.getElementById('edit-banner').innerHTML);
      check('V-79', '作成者パスワードがない端末：「ver」の欄に「この端末からは公開できません…」、帯に［公開する］が出ず、「保存して公開」で下書き保存と「この端末からは公開できません…」',
        note.includes('この端末からは公開できません（リンクを作った端末で公開してください）') && pubSnack.includes('この端末からは公開できません。リンクを作った端末で公開してください') && banner.includes('下書きの変更') && !banner.includes('公開する</button>'),
        JSON.stringify({ note, pubSnack, banner }));
      await sendLink(N);
      const sheet98 = await sheet(N);
      const btns98 = await N.evaluate(() => [...document.querySelectorAll('#ver-sheet-overlay .sheet-foot button')].map(b => b.textContent.trim()));
      const hasSelect = await N.evaluate(() => !!document.getElementById('ver-cmp'));
      await clickInSheet(N, '下書きは出さずに');
      const url98 = await lastCopied(N);
      check('V-98', '作成者パスワードがない端末で下書きがあるとき：「下書きがあります」に「この端末からは公開できません」、ボタンは［下書きは出さずに ver1.0 を送る］［キャンセル］だけで、最新verのURLが送られる',
        sheet98.includes('この端末からは公開できません') && btns98.join('|') === '下書きは出さずに ver1.0 を送る|キャンセル' && !hasSelect && shareOf(url98) === shareOf(url1), JSON.stringify({ btns98, hasSelect, url98 }));
      const delText = await N.evaluate(() => deleteConfirmText(getRule('r1')));
      await N.evaluate(() => { goHome(); askDelete('r1'); confirmDelete(); });
      const pending = await N.evaluate(() => localStorage.getItem('mahjong_pending_cloud_deletes'));
      const stillThere = await getDoc('rule_series/' + copy.link.seriesId);
      check('V-106', '作成者パスワードがない端末で削除：確認に「この端末からは作成したリンクを削除できません…」、端末からだけ消え、リンクは開けるまま、削除待ちに入らない',
        delText.includes('この端末からは作成したリンクを削除できません。リンクは開けるまま残ります。') && !(await ruleOf(N, 'r1')) && !!stillThere && (!pending || pending === '[]'), JSON.stringify({ delText, pending, still: !!stillThere }));
    });

    // ==== 複数の端末 ====
    await block('複数の端末', async () => {
      await clearFirestore();
      const A = await dev([ownRule('r1', '複数のルール', { base_rule: 'preset_g0yy_4' })]);
      await open(A);
      await makeLink(A, 'r1');
      const C = await dev([await ruleOf(A, 'r1')]);
      await open(C);
      // V-104 名前だけ
      await view(A, 'r1');
      await A.evaluate(() => { goEditMode(); onNameChange('複数のルール2'); onSavePublishButton(); });
      await A.waitForTimeout(1500);
      await view(C, 'r1');
      await C.waitForTimeout(1500);
      const c104 = await C.evaluate(() => ({ snapName: getRule('r1').link.pubSnapshot.name, draft: hasDraft(getRule('r1')) }));
      check('V-104', '（残り）PCで名前だけを公開した後、別の端末で開くと、公開している内容の控えが新しい名前になり、「下書きあり」が誤って出ない', c104.snapName === '複数のルール2' && !c104.draft, JSON.stringify(c104));
      await C.evaluate(() => loadPublishedContent());
      // V-49 の残り：名前だけ・名前と強調で先を越された
      await view(C, 'r1');
      await C.evaluate(() => { goEditMode(); onNameChange('Cの名前'); onSaveDraftButton(); });
      await view(A, 'r1');
      await A.evaluate(() => { goEditMode(); onSettingChange('uma', '10-30'); });
      await publishVer(A, '1.1');
      await C.evaluate(() => onSavePublishButton());   // 表示画面から（帯の公開と同じ）
      await C.waitForTimeout(1500);
      const s49a = await snack(C);
      // C を ver1.1 の内容にそろえてから、名前と強調を直す
      await view(C, 'r1');
      await C.waitForTimeout(1500);
      await C.evaluate(() => loadPublishedContent());
      await C.evaluate(() => { goEditMode(); onNameChange('Cの名前'); toggleHighlight('aka_dora'); onSaveDraftButton(); });
      await view(A, 'r1');
      await A.evaluate(() => { goEditMode(); onSettingChange('uma', '10-20'); });
      await publishVer(A, '1.2');
      // C は表示画面を開き直さずに公開する（控えは ver1.1 のまま）
      await C.evaluate(() => startPublish(getRule('r1'), {}));
      await C.waitForTimeout(1500);
      const s49b = await snack(C);
      const latest49 = await getDoc('rule_series/' + (await ruleOf(A, 'r1')).link.seriesId);
      check('V-49', '（残り）名前だけ・名前と強調を公開しようとして別の端末に先を越されたとき、下書きに残し「名前は／名前と強調は下書きに残しました」',
        /別の端末で ver1\.1 が公開されています。名前は下書きに残しました/.test(s49a) && /別の端末で ver1\.2 が公開されています。名前と強調は下書きに残しました/.test(s49b) && val(latest49.name) === '複数のルール2',
        JSON.stringify({ s49a, s49b, name: val(latest49.name) }));
      // V-105 下書きを直していた端末で、ほかの端末の公開を開く
      await view(C, 'r1');
      await C.waitForTimeout(1500);
      const b105 = await text(C, '#edit-banner');
      await C.evaluate(() => onSavePublishButton());
      await C.waitForTimeout(1200);
      const sheet105 = await sheet(C);
      await clickInSheet(C, 'キャンセル');
      let dialogMsg = '';
      C.once('dialog', d => { dialogMsg = d.message(); });
      await C.evaluate(() => loadPublishedContent());
      await C.waitForTimeout(300);
      const c105 = await ruleOf(C, 'r1');
      check('V-105', 'ver1.0（1.1）をもとに下書きを直していた端末：帯に「この端末の下書きは…をもとにしています」、公開の画面に「…の変更は消えます」、読み込むと確認の後に最新の中身になる',
        b105.includes('この端末の下書きは ver1.1 をもとにしています') && sheet105.includes('ver1.2 の変更は消えます') && dialogMsg.includes('この端末の下書きは消えます') && c105.settings.uma === '10-20' && c105.name === '複数のルール2',
        JSON.stringify({ b105, sheet105: sheet105.slice(0, 160), dialogMsg, uma: c105.settings.uma }));
      // V-34 の残り：削除の後に、削除前の状態の端末で「保存して公開」
      const D = await dev([await ruleOf(A, 'r1')]);
      await open(D);
      await A.evaluate(() => { goHome(); askDelete('r1'); confirmDelete(); });
      await A.waitForTimeout(3000);
      await D.evaluate(() => { editingId = 'r1'; isViewMode = true; isSharedMode = false; takeEditSnapshot(getRule('r1')); goEdit(); goEditMode(); onSettingChange('kuitan_atoduke', 'なし'); onSavePublishButton(); });
      await D.waitForTimeout(1500);
      const d34 = await ruleOf(D, 'r1');
      check('V-34', '（残り）PCで削除した後、削除前の状態の端末で「保存して公開」：「このルールのリンクは削除されています…」でリンクのないルールに戻り、編集した内容とverの名前は残る',
        (await snack(D)).includes('このルールのリンクは削除されています。リンクのないルールに戻しました') && !d34.link && d34.settings.kuitan_atoduke === 'なし' && d34.verLabel === '1.2',
        JSON.stringify({ snack: await snack(D), link: !!d34.link, verLabel: d34.verLabel }));
    });

    // ==== 削除の途中・アカウント ====
    await block('削除の途中・アカウント', async () => {
      await clearFirestore();
      const P = await dev([ownRule('r1', '止めるルール')]);
      await open(P);
      const url = await makeLink(P, 'r1');
      const r = await ruleOf(P, 'r1');
      const Q = await dev([r]);
      await open(Q);
      // 1回目の書き込み（削除済みの印）だけをして止める
      await P.evaluate(async () => {
        const link = getRule('r1').link;
        const op = await prepareSeriesOp(link, batch => { batch.delete(fbDb.collection('series_passwords').doc(link.seriesId)); const del = firebase.firestore.FieldValue.delete(); return { deleted: true, name: del, history: del }; });
        await op.commit();
      });
      const B = await dev(null);
      await openLink(B, url);
      const msg = await sheet(B);
      await Q.evaluate(() => { editingId = 'r1'; isViewMode = true; takeEditSnapshot(getRule('r1')); goEdit(); goEditMode(); onSettingChange('uma', '10-30'); onSavePublishButton(); });
      await Q.waitForTimeout(1500);
      const qSnack = await snack(Q);
      await P.evaluate(() => { const l = getRule('r1').link; recordCloudDelete('r1', { seriesId: l.seriesId, password: l.password }); });
      await P.waitForTimeout(3000);
      check('V-89', '削除の1回目の後で止めた状態では「このルールは作成者が削除しました」が出て、公開は断られる。「削除待ち」からやり直すと最後まで消える',
        msg.includes('このルールは作成者が削除しました。') && qSnack.includes('このルールのリンクは削除されています') && !(await getDoc('rule_series/' + r.link.seriesId)) && (await countDocs('shared_rules')) === 0,
        JSON.stringify({ msg, qSnack }));
      // V-94 ログアウト中に削除して、別のアカウントでログイン
      await clearFirestore();
      const E = await dev([ownRule('e1', 'アカウントのルール')]);
      await open(E); await login(E, 'acctX');
      await E.evaluate(() => syncRulesToCloud());
      await E.waitForTimeout(800);
      await makeLink(E, 'e1');
      const uidX = await E.evaluate(() => _fbUid);
      const sidE = (await ruleOf(E, 'e1')).link.seriesId;
      await E.evaluate(() => fbAuth.signOut());
      await E.waitForTimeout(800);
      await E.evaluate(() => { goHome(); askDelete('e1'); confirmDelete(); });
      await E.waitForTimeout(3000);
      await login(E, 'acctY');
      await E.waitForTimeout(1500);
      const cloudX = await getDoc(`users/${uidX}/rules/e1`);
      check('V-94', 'ログアウト中にリンクを作ったルールを削除し、別のアカウントでログインすると、別のアカウントのクラウドからは消さず、シリーズとリンクは削除される',
        !!cloudX && !(await getDoc('rule_series/' + sidE)), JSON.stringify({ cloudX: !!cloudX }));
    });

    // ==== ログインとパスワードの受け渡し ====
    await block('ログイン', async () => {
      await clearFirestore();
      const E = await dev([ownRule('e1', 'ログインのルール')]);
      await open(E); await login(E, 'user77');
      await view(E, 'e1');
      await sendLink(E);
      const sheet04 = await sheet(E);
      await clickInSheet(E, 'リンクを作って送る');
      check('V-04', 'ログインして「リンクで送る」：ログインを勧める一文のない「ver1.0 のリンクを作ります」が出て、ver1.0 のURLがコピーされる',
        sheet04.includes('ver1.0 のリンクを作ります') && !sheet04.includes('Googleでログインすると') && (await lastCopied(E)).includes('share='), sheet04);
      await E.evaluate(() => fbAuth.signOut());
      await E.waitForTimeout(800);
      await view(E, 'e1');
      await editSetting(E, 'uma', '10-30');
      await publishVer(E, '1.1');
      check('V-77', 'ログインしてリンクを作り、ログアウトしてから公開できる（リンクを作った端末）', (await snack(E)).includes('ver1.1 として公開しました'), await snack(E));
      // V-78 ログインせずに作った後でログイン
      const F = await dev([ownRule('f1', '後でログインのルール')]);
      await open(F);
      await makeLink(F, 'f1');
      await login(F, 'user78');
      await F.evaluate(() => syncRulesToCloud());   // ログインボタンからのログインでは、ログイン後に同期する（linkToGoogle）
      await F.waitForTimeout(1500);
      const G = await dev([]);
      await open(G); await login(G, 'user78');
      await view(G, 'f1');
      await G.waitForTimeout(1200);
      await editSetting(G, 'uma', '10-30');
      await publishVer(G, '1.1');
      check('V-78', 'ログインせずにリンクを作った後でログインすると、同じアカウントの別の端末からも公開できる', (await snack(G)).includes('ver1.1 として公開しました'), await snack(G));
      // V-81 古いアプリの同期の後でも、パスワードが届く
      const H = await dev([ownRule('h1', '古いアプリと同期するルール')]);
      await open(H); await login(H, 'user81');
      await makeLink(H, 'h1');
      await H.evaluate(() => syncRulesToCloud());
      await H.waitForTimeout(1500);
      const OLD = await dev([await ruleOf(H, 'h1')]);
      await openOld(OLD);
      await login(OLD, 'user81');
      await OLD.evaluate(() => syncRulesToCloud());
      await OLD.waitForTimeout(1500);
      const I = await dev([]);
      await open(I); await login(I, 'user81');
      await view(I, 'h1');
      await I.waitForTimeout(1200);
      await editSetting(I, 'uma', '10-30');
      await publishVer(I, '1.1');
      check('V-81', '新しいアプリでリンクを作った後に古いアプリが同期しても、別の端末に作成者パスワードが届き公開できる', (await snack(I)).includes('ver1.1 として公開しました'), await snack(I));
    });

    // ==== 前のアプリとの互換 ====
    await block('前のアプリとの互換', async () => {
      await clearFirestore();
      const A = await dev([ownRule('r1', '互換のルール'), ownRule('b1', '比較1', { settings: { uma: '10-30' } })]);
      await open(A);
      const url = await makeLink(A, 'r1', 'b1');
      await view(A, 'r1');
      await editSetting(A, 'uma', '10-20');
      await publishVer(A, '1.1');
      const latest = (await ruleOf(A, 'r1')).link.pubShareId;
      const OLD = await dev(null);
      await openOld(OLD, `&share=${latest}`);
      const oldName = await OLD.evaluate(() => (getRule(editingId) || {}).name);
      const oldUma = await OLD.evaluate(() => ((getRule(editingId) || {}).settings || {}).uma);
      check('V-55/V-116', '新しいverのリンクを、更新前（切り戻した状態）の前のアプリで開いても、今までの共有リンクと同じように表示され、エラーが出ない',
        oldName === '互換のルール' && oldUma === '10-20' && OLD._errors.length === 0, JSON.stringify({ oldName, oldUma, errs: OLD._errors }));
      // V-115 前のアプリでコピーした後、新しいアプリで開く
      const OLD2 = await dev([await ruleOf(A, 'r1')]);
      await openOld(OLD2);
      await OLD2.evaluate(() => duplicateRule('r1'));
      await OLD2.waitForTimeout(300);
      const copiedHasLink = await OLD2.evaluate(() => !!appData.rules.find(r => r.id !== 'r1' && r.link));
      await open(OLD2);
      const after = await OLD2.evaluate(() => ({ copy: appData.rules.filter(r => r.id !== 'r1' && r.link).length, orig: !!getRule('r1').link }));
      check('V-115', '前のアプリでリンクを作ったルールをコピーした後に新しいアプリで開くと、コピーからリンクが外れ、元のルールだけがリンクを持つ',
        copiedHasLink && after.copy === 0 && after.orig, JSON.stringify({ copiedHasLink, after }));
      // V-54 固定のリンク（プリセットの「リンクで送る」は固定のリンクを作る）
      await view(A, 'preset_g0yy_4');
      await sendLink(A);
      await A.waitForTimeout(1500);
      const fixed = await lastCopied(A);
      const B = await dev(null);
      await openLink(B, fixed);
      const fb = await B.evaluate(() => ({ name: getRule(editingId).name, badge: document.getElementById('edit-ver-badge').classList.contains('hidden'), popup: !!document.getElementById('ver-sheet-overlay') }));
      check('V-54', '固定のリンクを開くと、今と同じ表示で（verのラベル・ポップアップなし）、エラーが出ない', fb.name === '天鳳' && fb.badge && !fb.popup && B._errors.length === 0, JSON.stringify(fb));
    });

    // ==== 比較対象の件数の上限 ====
    await block('比較対象の件数', async () => {
      await clearFirestore();
      const bases = Array.from({ length: 36 }, (_, i) => ownRule('base' + i, '比較' + i, { settings: { uma: String(i) } }));
      const A = await dev([ownRule('r1', '件数のルール'), ...bases]);
      await open(A);
      await makeLink(A, 'r1');
      const sid = (await ruleOf(A, 'r1')).link.seriesId;
      const sendAll = (from, to) => A.evaluate(async ([from, to]) => {
        const r = getRule('r1'); const marks = [];
        for (let i = from; i < to; i++) { marks.push(await saveSendBase(r, getRule('base' + i))); await new Promise(res => setTimeout(res, 5)); }
        return marks;
      }, [from, to]);
      const marks = await sendAll(0, 31);
      const keys = (await getDoc('rule_series/' + sid)).baseKeys.arrayValue.values.map(v => v.stringValue);
      const firstGone = !(await getDoc(`series_bases/${sid}_${marks[0]}`));
      const B = await dev(null);
      await open(B, `&share=${(await ruleOf(A, 'r1')).link.pubShareId}&cmp=${marks[0]}`);
      await B.waitForTimeout(1200);
      const baseB = await text(B, '#standard-rule-display');
      check('V-45a', 'ログインしていないときに31件目の比較対象で送ると、最も長く使っていない比較対象が消え、そのURLは比較対象なしで表示される',
        keys.length === 30 && !keys.includes(marks[0]) && firstGone && baseB === '-', JSON.stringify({ n: keys.length, firstGone, baseB }));
      // ログインしているときは消さない
      await clearFirestore();
      const L = await dev([ownRule('r1', '件数のルール'), ...bases]);
      await open(L); await login(L, 'bases');
      await makeLink(L, 'r1');
      const sidL = (await ruleOf(L, 'r1')).link.seriesId;
      await L.evaluate(async () => { const r = getRule('r1'); for (let i = 0; i < 35; i++) await saveSendBase(r, getRule('base' + i)); });
      const nLogin = (await getDoc('rule_series/' + sidL)).baseKeys.arrayValue.values.length;
      await L.evaluate(() => fbAuth.signOut());
      await L.waitForTimeout(800);
      await L.evaluate(async () => { await saveSendBase(getRule('r1'), getRule('base35')); });
      const nAfter = (await getDoc('rule_series/' + sidL)).baseKeys.arrayValue.values.length;
      check('V-45b', 'ログインしているときは31件目以降も消さずに保存され（35件）、その後ログインせずに送ると1件だけ消えて35件のまま', nLogin === 35 && nAfter === 35, JSON.stringify({ nLogin, nAfter }));
    });

    // ==== verがとても多いルール ====
    await block('verが多いルール', async () => {
      await clearFirestore();
      const A = await dev([ownRule('r1', '多いルール')]);
      await open(A);
      const url = await makeLink(A, 'r1');
      // ver を100件まで公開する（画面を通さずに、公開の処理を直接呼ぶ）
      await A.evaluate(async () => {
        const r = getRule('r1');
        for (let i = 2; i <= 100; i++) {
          r.settings.uma = String(i);
          const s = await fetchSeries(r.link.seriesId);
          await publishNewVer(r, 'v' + i, 'ver ' + i + ' の変更', s.latestSeq);
        }
      });
      const B = await dev(null);
      await open(B);
      const t0 = Date.now();
      await open(B, `&share=${shareOf(url)}`);
      await B.waitForSelector('.ver-history', { timeout: 20000 });
      const tMany = Date.now() - t0;
      const scroll = await B.evaluate(() => { const h = document.querySelector('.ver-history'); const sh = document.querySelector('#ver-sheet-overlay .sheet'); return { inner: h.scrollHeight > h.clientHeight, top: h.scrollTop, rows: h.querySelectorAll('tbody tr').length, first: h.querySelector('tbody tr td').textContent, fits: sh.getBoundingClientRect().height <= window.innerHeight }; });
      check('V-100', '50ver以上あるルールの過去のverを開くと、表の中だけがスクロールし、開いたときは一番上（最新）が出ている',
        scroll.inner && scroll.top === 0 && scroll.rows === 100 && scroll.first === 'verv100' && scroll.fits, JSON.stringify(scroll));
      // ver が2つのルールと比べる
      await clearFirestore();
      const S = await dev([ownRule('s1', '少ないルール')]);
      await open(S);
      const url2 = await makeLink(S, 's1');
      await view(S, 's1');
      await editSetting(S, 'uma', '10-30');
      await publishVer(S, '1.1');
      const t1 = Date.now();
      await open(B, `&share=${shareOf(url2)}`);
      await B.waitForSelector('.ver-history', { timeout: 20000 });
      const tFew = Date.now() - t1;
      check('V-101', '100verあるシリーズのリンクを開いても、verが少ないときと比べて目立って遅くならない（2倍＋1秒以内）', tMany <= tFew * 2 + 1000, JSON.stringify({ tMany, tFew }));
    });

    // ==== 幅375px（実機の確認の前に、はみ出しだけを確かめる） ====
    await block('幅375px', async () => {
      await clearFirestore();
      const ctx = await browser.newContext({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true });
      const M = await ctx.newPage();
      M._errors = []; pages.push(M);
      M.on('pageerror', e => M._errors.push(e.message));
      await M.addInitScript(([key, rules]) => {
        if (localStorage.getItem('__seeded')) return;
        localStorage.setItem('__seeded', '1'); localStorage.setItem(key, JSON.stringify({ rules })); localStorage.setItem('mahjong_notice_ver1', '1');
        navigator.share = async () => {};
      }, [STORAGE_KEY, [ownRule('r1', 'とても長い名前のルールを入れて折り返しを確かめるためのルール')]]);
      await open(M);
      const overflow = () => M.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || [...document.querySelectorAll('#ver-sheet-overlay .sheet')].some(s => s.scrollWidth > s.clientWidth + 1));
      const res = {};
      await view(M, 'r1'); res.view = await overflow();
      await M.evaluate(() => goEditMode()); res.edit = await overflow();
      await M.evaluate(() => goViewMode());
      await M.evaluate(() => onSendLinkButton()); await M.waitForTimeout(300); res.create = await overflow();
      await clickInSheet(M, 'リンクを作って送る');
      await M.evaluate(() => { goEditMode(); onSettingChange('uma', '10-30'); onSavePublishButton(); });
      await M.waitForTimeout(1200); res.publish = await overflow();
      await M.evaluate(() => { document.getElementById('pub-ver').value = '1.1'; const t = document.getElementById('pub-note'); t.value = '長い変更内容'.repeat(30); onPubNoteInput(t); });
      await clickInSheet(M, '公開する');
      const first = (await getDoc('rule_series/' + (await ruleOf(M, 'r1')).link.seriesId)).shareIds.arrayValue.values[0].stringValue;
      await open(M, `&share=${first}`);
      await M.waitForTimeout(1500);
      // 自分のリンクなので自分のルールが開く。ポップアップは、作成者でない端末と同じものを直接出して確かめる
      await M.evaluate(() => { const r = makeSharedRule({ m: '四麻', n: 'x', s: {} }); r.sharedVer = { seriesId: 's', viewShareId: 'a', openedShareId: 'a', seq: 1, openedSeq: 1, openedLabel: '1.0', latestSeq: 2, latestShareId: 'b', latestLabel: '1.1', history: getRule('r1').link.history, hlSeqs: [] }; appData.rules.push(r); editingId = r.id; showOldVerPopup(r); });
      res.popup = await overflow();
      await M.evaluate(() => { closeVerSheet(); goHome(); askDelete('r1'); });
      res.del = await M.evaluate(() => { const b = document.querySelector('#modal-delete .modal-box'); return b.scrollWidth > b.clientWidth + 1; });
      check('V-95', '（一部・ヘッドレス）幅375pxで、表示画面・編集画面・リンクを作る画面・公開の画面・過去のverのポップアップ・削除確認が横にはみ出さない', Object.values(res).every(v => !v), JSON.stringify(res));
      await ctx.close();
    });

    const errs = pages.flatMap(p => p._errors || []);
    check('V-ERR4', '画面の操作でエラーが出ない', errs.length === 0, JSON.stringify(errs.slice(0, 5)));
  } finally {
    await browser.close();
    server.close();
  }
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length} 件成功 / ${bad.length} 件失敗`);
  fs.writeFileSync(path.join(__dirname, 'last_result_ver_rest.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  process.exitCode = bad.length ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; })
  // 終わった後に通信などが残ってプロセスが抜けないことがあるので、結果を書いたら強制的に終える
  .finally(() => setTimeout(() => process.exit(process.exitCode || 0), 1000));
