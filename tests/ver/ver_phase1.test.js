// ver管理 1回目（画面と土台）の自動テスト
// 計画書のテスト項目（tests/test_cases.md の「V. ver管理」）のうち、1回目で、Firestoreを使わずに確かめられるもの。
// 使い方は tests/ver/README.md を参照。
const path = require('path');
const http = require('http');
const fs = require('fs');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require(path.join(process.env.HOME, 'node_modules', 'playwright'))); }

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8790 + Math.floor(Math.random() * 100);
const NEW_APP = '/src/index.html';
// 前のアプリ（ver管理を出す前の v5.11。切り戻し用のタグ before-ver のものを /old/ で配る）
const { serveOldApp, oldAppExists, oldAppHtml, OLD_APP_PATH } = require('./old_app');
const OLD_APP = process.env.OLD_APP || OLD_APP_PATH;
const STORAGE_KEY = 'mahjong_rules_pwa_v1';

function appVersion(file) {
  const html = '/' + file.replace(/^\//, '') === OLD_APP_PATH && !process.env.OLD_APP ? oldAppHtml() : fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = html.match(/const currentVersion = "(v[\d.]+)"/);
  return m ? m[1] : '';
}

// リポジトリの中身をそのまま配る（src と docs を同じオリジンにして、端末の保存場所を共有する）
function startServer() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    if (!process.env.OLD_APP && serveOldApp(req, res, types)) return;
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, p);
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

// 自分のルール。verLabel を持たないものは、この機能より前に作ったルール
function ownRule(id, name, extra) {
  return Object.assign({ id, mode: '四麻', name, base_rule: '', date: '2026/10/01 10:00:00', settings: { uma: '10-30', aka_dora: '3枚' } }, extra || {});
}

async function newPage(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext(Object.assign({ permissions: ['clipboard-read', 'clipboard-write'] }, opts.context || {}));
  // 本番のFirestoreに書き込まないよう、Firestoreへの通信は止める
  await ctx.route(/firestore\.googleapis\.com/, r => r.abort());
  const page = await ctx.newPage();
  page._errors = [];
  page.on('pageerror', e => page._errors.push(e.message));
  if (opts.rules || opts.storage) {
    await page.addInitScript(([key, rules, storage]) => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      if (rules) localStorage.setItem(key, JSON.stringify({ rules }));
      for (const [k, v] of Object.entries(storage || {})) localStorage.setItem(k, v);
    }, [STORAGE_KEY, opts.rules || null, opts.storage || null]);
  }
  return page;
}

async function openApp(page, app) {
  app = app || NEW_APP;
  await page.goto(`http://localhost:${PORT}${app}?v=${appVersion(app.slice(1))}`);
  await page.waitForFunction(() => window._renderReactHome && document.querySelector('#react-home-root h1'), null, { timeout: 30000 });
  await page.waitForTimeout(300);
}

const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)).rules, STORAGE_KEY);
const bottomButtons = page => page.$$eval('#bottom-bar-content button', bs => bs.map(b => b.textContent.trim()));
const visible = (page, sel) => page.$eval(sel, el => !!(el.offsetWidth || el.offsetHeight) && !el.classList.contains('hidden')).catch(() => false);
const NO_NOTICE = { mahjong_notice_ver1: '1' };

async function run() {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    // ---- V-01 表示画面のボタン ----
    {
      const page = await newPage(browser, { rules: [ownRule('r1', '自分のルール', { verLabel: '1.0' })], storage: NO_NOTICE });
      await openApp(page);
      await page.evaluate(() => editRule('r1'));
      const own = await bottomButtons(page);
      const shareIsBlue = await page.$eval('#bottom-bar-content button:nth-child(2)', b => b.className.includes('bg-theme-primary'));
      await page.evaluate(() => { goHome(); editRule('preset_qhs2_4'); });
      const preset = await bottomButtons(page);
      // 共有されたルール（リンクを開いたときと同じ状態を作る）
      await page.evaluate(() => {
        appData.rules.push({ id: 'shared_1', mode: '四麻', name: '受け取ったルール', base_rule: '', settings: {}, readonly: true });
        isSharedMode = true; isViewMode = true; editingId = 'shared_1'; renderEdit(); showScreen('edit');
      });
      const shared = await bottomButtons(page);
      const ok = [own, preset, shared].every(b => b.join(',') === '編集,共有') && shareIsBlue;
      check('V-01', '表示画面のボタンは「編集」「共有」の2つで、「共有」が青', ok, JSON.stringify({ own, preset, shared, shareIsBlue }));
      await page.context().close();
    }

    // ---- V-02 共有シート・画像 ----
    {
      const page = await newPage(browser, { rules: [ownRule('r1', '自分のルール', { verLabel: '2025秋' })], storage: NO_NOTICE });
      await openApp(page);
      // ホームの一覧と表示画面のルール名の横に、verのラベルが出る（V-10 の一部）
      const homeBadge = await page.$$eval('#react-home-root span.bg-theme-highlightBg', els => els.map(e => e.textContent));
      await page.evaluate(() => editRule('r1'));
      const viewBadge = await page.textContent('#edit-ver-badge');
      check('V-10', 'ホームの一覧と表示画面のルール名の横に「ver2025秋」が出る（リンクの部分は2回目）', homeBadge.join() === 'ver2025秋' && viewBadge === 'ver2025秋', JSON.stringify({ homeBadge, viewBadge }));
      await page.click('#bottom-bar-content button:has-text("共有")');
      await page.waitForTimeout(400);
      const items = await page.$$eval('#action-sheet button', bs => bs.map(b => b.textContent.replace(/link|image|picture_as_pdf/g, '').trim()));
      const title = await page.$eval('#action-sheet', el => el.textContent.includes('共有'));
      // 画像：html2canvas に渡す中身を取り出して、見出しにverが入っていることも確かめる（V-10 の一部）
      await page.evaluate(() => {
        window.__captured = null;
        window.html2canvas = async (el) => { window.__captured = el.innerHTML; const c = document.createElement('canvas'); c.width = 10; c.height = 10; return c; };
      });
      await page.click('#action-sheet button:has-text("画像で送る")');
      await page.waitForFunction(() => window.__captured, null, { timeout: 10000 }).catch(() => {});
      const captured = await page.evaluate(() => window.__captured || '');
      const ok = items.join(',') === 'リンクで送る,画像で送る,PDFで送る,キャンセル' && title && captured.includes('ver2025秋');
      check('V-02', '「共有」で「リンクで送る／画像で送る／PDFで送る」が出て、画像が作れる（見出しにver）', ok, JSON.stringify({ items, title, hasVer: captured.includes('ver2025秋') }));
      await page.context().close();
    }

    // ---- V-09 新規作成のver ----
    {
      const page = await newPage(browser, { storage: NO_NOTICE });
      await openApp(page);
      await page.click('text=新しいルールを作成する');
      await page.waitForTimeout(300);
      const fieldShown = await visible(page, '#edit-ver-field');
      const initial = await page.inputValue('#edit-ver');
      await page.fill('#edit-name', 'verテスト');
      await page.fill('#edit-ver', '');
      await page.click('#bottom-bar-content button');
      const err = await page.textContent('#edit-ver-error');
      const errShown = await visible(page, '#edit-ver-error');
      const stillEditing = await page.evaluate(() => !isViewMode && document.getElementById('screen-edit').classList.contains('active'));
      const saved = (await stored(page)).some(r => r.name === 'verテスト');
      // ルール名の欄の下に、verについての説明の文は出ない
      const noHint = !(await page.textContent('#screen-edit')).includes('ルール名に書く必要はありません');
      const ok = fieldShown && initial === '1.0' && errShown && err === 'verの名前を入力してください' && stillEditing && !saved && noHint;
      check('V-09', '新規作成でverの欄の初期値は「1.0」、空欄では保存できない', ok, JSON.stringify({ fieldShown, initial, err, errShown, stillEditing, saved, noHint }));
      await page.context().close();
    }

    // ---- V-11 複製したルールのverは「1.0」 ----
    {
      const page = await newPage(browser, { rules: [ownRule('r1', '元のルール', { verLabel: '2.0' })], storage: NO_NOTICE });
      await openApp(page);
      // ホームの「コピー」
      await page.evaluate(() => duplicateRule('r1'));
      // コピーして編集（プリセット）→ 保存
      await page.evaluate(() => { editRule('preset_qhs2_4'); });
      await page.click('#bottom-bar-content button:has-text("編集")');
      await page.click('#modal-copy-edit button:has-text("コピーして編集")');
      await page.click('#bottom-bar-content button');
      // 別のルールとして保存
      await page.evaluate(() => { editRule('r1'); goEditMode(); showSaveAsDialog(); });
      await page.fill('#save-as-name', '別ルール');
      await page.click('#save-as-overlay .sheet-done');
      const rules = await stored(page);
      const dup = rules.find(r => r.name === '元のルール（コピー）');
      const presetCopy = rules.find(r => r.name === '雀魂（コピー）');
      const saveAs = rules.find(r => r.name === '別ルール');
      const ok = dup && dup.verLabel === '1.0' && presetCopy && presetCopy.verLabel === '1.0' && saveAs && saveAs.verLabel === '1.0'
        && dup.copiedFrom && dup.copiedFrom.ruleId === 'r1' && saveAs.copiedFrom.ruleId === 'r1';
      check('V-11', 'コピー・コピーして編集・別のルールとして保存で、新しいルールのverは「1.0」', ok, JSON.stringify({ dup: dup && dup.verLabel, presetCopy: presetCopy && presetCopy.verLabel, saveAs: saveAs && saveAs.verLabel }));
      await page.context().close();
    }

    // ---- V-12（1回目の部分） この機能より前に作ったルール ----
    {
      const page = await newPage(browser, { rules: [ownRule('old1', '昔からあるルール')], storage: NO_NOTICE });
      await openApp(page);
      const homeNoBadge = (await page.$$eval('#react-home-root span.bg-theme-highlightBg', els => els.length)) === 0;
      await page.evaluate(() => { editRule('old1'); });
      const badgeHidden = !(await visible(page, '#edit-ver-badge'));
      await page.evaluate(() => goEditMode());
      const empty = await page.inputValue('#edit-ver');
      await page.click('#bottom-bar-content button');
      const viewAgain = await page.evaluate(() => isViewMode);
      const r = (await stored(page)).find(x => x.id === 'old1');
      const ok = homeNoBadge && badgeHidden && empty === '' && viewAgain && !('verLabel' in r);
      check('V-12', 'この機能より前のルールはverが表示されず、空欄のまま保存できる（リンクの部分は2回目）', ok, JSON.stringify({ homeNoBadge, badgeHidden, empty, viewAgain, verLabel: r.verLabel }));
      await page.context().close();
    }

    // ---- V-15・V-109（1回目の部分） verの名前のそろえ方 ----
    {
      const page = await newPage(browser, { rules: [ownRule('r1', 'ルールA', { verLabel: '1.0' })], storage: NO_NOTICE });
      await openApp(page);
      const results15 = {};
      for (const input of ['ver1.2', 'Ｖｅｒ１.２', 'VER1.2', '  1.2  ', '2025秋']) {
        await page.evaluate(() => { editRule('r1'); goEditMode(); });
        await page.fill('#edit-ver', input);
        await page.click('#bottom-bar-content button');
        results15[input] = { saved: (await stored(page)).find(x => x.id === 'r1').verLabel, badge: await page.textContent('#edit-ver-badge') };
      }
      const ok = ['ver1.2', 'Ｖｅｒ１.２', 'VER1.2', '  1.2  '].every(k => results15[k].saved === '1.2' && results15[k].badge === 'ver1.2')
        && results15['2025秋'].saved === '2025秋' && results15['2025秋'].badge === 'ver2025秋';
      check('V-15', '「ver1.2」「Ｖｅｒ１.２」「VER1.2」は「1.2」として保存され「ver1.2」と表示される', ok, JSON.stringify(results15));
      // 21文字は保存できない
      await page.evaluate(() => { editRule('r1'); goEditMode(); });
      await page.fill('#edit-ver', 'あ'.repeat(21));
      await page.click('#bottom-bar-content button');
      const err21 = await page.textContent('#edit-ver-error');
      await page.fill('#edit-ver', '😀'.repeat(20));
      await page.click('#bottom-bar-content button');
      const emoji = (await stored(page)).find(x => x.id === 'r1').verLabel;
      check('V-16', 'verの名前が21文字以上では保存できず、絵文字20文字は保存できる（使用済みの判定は2回目）', err21 === 'verの名前を20文字以内にしてください' && emoji === '😀'.repeat(20), JSON.stringify({ err21, emoji }));
      await page.context().close();
    }

    // ---- V-19（1回目の部分） ルール名は100文字まで ----
    {
      const page = await newPage(browser, { rules: [ownRule('r1', 'ルールA', { verLabel: '1.0' })], storage: NO_NOTICE });
      await openApp(page);
      await page.evaluate(() => { editRule('r1'); goEditMode(); });
      await page.fill('#edit-name', '名'.repeat(101));
      const len = await page.$eval('#edit-name', el => [...el.value].length);
      check('V-19', 'ルール名の入力欄は100文字で止まる（既に長いルールの扱いは2回目）', len === 100, 'len=' + len);
      await page.context().close();
    }

    // ---- V-69 別のルールとして保存 ----
    {
      const page = await newPage(browser, { rules: [ownRule('r1', '通常ルール', { verLabel: '1.1', base_rule: 'preset_g0yy_4' })], storage: NO_NOTICE });
      await openApp(page);
      await page.evaluate(() => { editRule('r1'); goEditMode(); onSettingChange('uma', '5-15'); });
      await page.click('#bottom-bar-sub button:has-text("別のルールとして保存")');
      const dialog = await page.$eval('#save-as-overlay', el => ({
        inputs: el.querySelectorAll('input').length,
        buttons: [...el.querySelectorAll('.sheet-foot button')].map(b => b.textContent.trim()),
        value: el.querySelector('input').value,
      }));
      await page.fill('#save-as-name', 'ドラ多めルール');
      await page.click('#save-as-overlay .sheet-done');
      const rules = await stored(page);
      const orig = rules.find(r => r.id === 'r1');
      const copy = rules.find(r => r.name === 'ドラ多めルール');
      const view = await page.evaluate(() => ({ isViewMode, editingId, name: document.getElementById('edit-name').value }));
      const snack = await page.textContent('#snackbar');
      const ok = dialog.inputs === 1 && dialog.buttons.join(',') === '保存,キャンセル' && dialog.value === '通常ルール（コピー）'
        && copy && copy.settings.uma === '5-15' && orig.settings.uma === '10-30' && orig.verLabel === '1.1'
        && copy.base_rule === 'preset_g0yy_4' && view.isViewMode && view.editingId === copy.id
        && snack === '「ドラ多めルール」として保存しました。元のルールは変わっていません';
      check('V-69', '別のルールとして保存：新しいルールは編集した内容、元のルールは保存した状態のまま', ok, JSON.stringify({ dialog, copyUma: copy && copy.settings.uma, origUma: orig.settings.uma, view, snack }));
      await page.context().close();
    }

    // ---- V-70 同じ名前・キャンセル ----
    {
      const page = await newPage(browser, { rules: [ownRule('r1', '通常ルール', { verLabel: '1.0' }), ownRule('r2', '大会用ルール', { verLabel: '1.0' })], storage: NO_NOTICE });
      await openApp(page);
      await page.evaluate(() => { editRule('r1'); goEditMode(); onSettingChange('uma', '5-15'); showSaveAsDialog(); });
      await page.fill('#save-as-name', '大会用ルール');
      await page.click('#save-as-overlay .sheet-done');
      const errDup = await page.textContent('#save-as-error');
      await page.fill('#save-as-name', '通常ルール');
      await page.click('#save-as-overlay .sheet-done');
      const errOrig = await page.textContent('#save-as-error');
      await page.click('#save-as-overlay .sheet-cancel');
      const closed = !(await page.$('#save-as-overlay'));
      const count = (await stored(page)).length;
      const stillEdited = await page.evaluate(() => getRule('r1').settings.uma === '5-15' && !isViewMode);
      const ok = errDup.includes('すでにあります') && errOrig.includes('すでにあります') && closed && stillEdited
        && !(await stored(page)).some(r => r.name === '大会用ルール' && r.id !== 'r2');
      check('V-70', '別のルールとして保存：同じ名前では保存できず、キャンセルでは何も保存されず編集内容は残る', ok, JSON.stringify({ errDup, errOrig, closed, count, stillEdited }));
      await page.context().close();
    }

    // ---- V-72 「別のルールとして保存」が出ない場面 ----
    {
      const page = await newPage(browser, { rules: [ownRule('r1', '通常ルール', { verLabel: '1.0' })], storage: NO_NOTICE });
      await openApp(page);
      await page.click('text=新しいルールを作成する');
      const onNew = (await page.textContent('#bottom-bar-sub')).includes('別のルールとして保存');
      await page.evaluate(() => goHome());
      await page.evaluate(() => editRule('preset_qhs2_4'));
      await page.click('#bottom-bar-content button:has-text("編集")');
      await page.click('#modal-copy-edit button:has-text("コピーして編集")');
      const onUnsavedCopy = (await page.textContent('#bottom-bar-sub')).includes('別のルールとして保存');
      await page.click('#bottom-bar-content button');  // 保存（ホームへ）
      const copyId = (await stored(page)).find(r => r.name === '雀魂（コピー）').id;
      await page.evaluate(id => { editRule(id); goEditMode(); }, copyId);
      const onSavedCopy = (await page.textContent('#bottom-bar-sub')).includes('別のルールとして保存');
      await page.evaluate(() => { goHome(); editRule('r1'); goEditMode(); });
      const onOwn = (await page.textContent('#bottom-bar-sub')).includes('別のルールとして保存');
      const ok = !onNew && !onUnsavedCopy && onSavedCopy && onOwn;
      check('V-72', '新規作成・保存前のコピーでは「別のルールとして保存」が出ず、保存した後の編集画面では出る', ok, JSON.stringify({ onNew, onUnsavedCopy, onSavedCopy, onOwn }));
      await page.context().close();
    }

    // ---- V-73 他人のルール・プリセットで「編集」 ----
    {
      const page = await newPage(browser, { storage: NO_NOTICE });
      await openApp(page);
      await page.evaluate(() => editRule('preset_qhs2_4'));
      await page.click('#bottom-bar-content button:has-text("編集")');
      const modalShown = await page.$eval('#modal-copy-edit', el => el.classList.contains('show'));
      const text = await page.textContent('#modal-copy-edit p');
      await page.click('#modal-copy-edit button:has-text("やめる")');
      const afterCancel = await page.evaluate(() => ({ isViewMode, editingId, shown: document.getElementById('modal-copy-edit').classList.contains('show') }));
      await page.click('#bottom-bar-content button:has-text("編集")');
      await page.click('#modal-copy-edit button:has-text("コピーして編集")');
      const afterCopy = await page.evaluate(() => ({ isViewMode, isCopy: editingId !== 'preset_qhs2_4', name: document.getElementById('edit-name').value }));
      const btns = await bottomButtons(page);
      // 共有されたルールでも同じ
      await page.evaluate(() => {
        goHome();
        appData.rules.push({ id: 'shared_1', mode: '四麻', name: '受け取ったルール', base_rule: '', settings: {}, readonly: true });
        isSharedMode = true; isViewMode = true; editingId = 'shared_1'; renderEdit(); showScreen('edit');
      });
      await page.click('#bottom-bar-content button:has-text("編集")');
      const sharedModal = await page.$eval('#modal-copy-edit', el => el.classList.contains('show'));
      const ok = modalShown && text.includes('コピーして、自分のルールとして編集しますか') && !afterCancel.shown && afterCancel.isViewMode
        && afterCancel.editingId === 'preset_qhs2_4' && !afterCopy.isViewMode && afterCopy.isCopy && afterCopy.name === '雀魂（コピー）'
        && btns.length === 1 && btns[0].includes('保存') && sharedModal;
      check('V-73', '他人のルール・プリセットの「編集」で確認が出て、「コピーして編集」でコピー、「やめる」では何も起きない', ok, JSON.stringify({ modalShown, afterCancel, afterCopy, btns, sharedModal }));
      await page.context().close();
    }

    // ---- V-93 リンクを作っていないルールの削除確認 ----
    {
      const page = await newPage(browser, { rules: [ownRule('r1', '消すルール', { verLabel: '1.0' })], storage: NO_NOTICE });
      await openApp(page);
      await page.evaluate(() => askDelete('r1'));
      const text = await page.textContent('#modal-delete p');
      await page.click('#modal-delete button:has-text("削除")');
      const gone = !(await stored(page)).some(r => r.id === 'r1');
      // ログインしたことのない端末では、削除待ちを作らない
      const pending = await page.evaluate(() => localStorage.getItem('mahjong_pending_cloud_deletes'));
      check('V-93', 'リンクを作っていないルールの削除確認は今の文面のまま', text === 'このルールを削除しますか？' && gone && !pending, JSON.stringify({ text, gone, pending }));
      await page.context().close();
    }

    // ---- V-112 「リンクで送る」（PC・スマホ） ----
    // 段階2から、リンクを作ったルールは「verX のリンクを送る」画面を通して送る。比較対象に保存の要らないもの（なし）を選べば通信しない
    {
      const linked = () => ownRule('r1', '通常ルール', { verLabel: '1.0', link: { seriesId: 'S1', password: 'p'.repeat(40), ruleId: 'r1', pubSeq: 1, pubLabel: '1.0', pubShareId: 'Abcd2345', pubOp: 0, basedOn: 0,
        pubSnapshot: { name: '通常ルール', settings: { uma: '5-15' }, hl: {} }, bases: {} }, settings: { uma: '5-15' } });
      // PC：コピー
      // テスト用のリンクは本番のサーバーにないので、開いた後は通信を止める（シリーズを読みに行かない）
      const page = await newPage(browser, { rules: [linked()], storage: NO_NOTICE });
      await openApp(page);
      await page.context().setOffline(true);
      // 読み込み時の移行で設定に足された項目も含めて、公開している内容の控えにする（下書きなしの状態）
      await page.evaluate(() => { const r = getRule('r1'); r.link.pubSnapshot = pubPartsOf(r); saveData(); editRule('r1'); });
      await page.click('#bottom-bar-content button:has-text("共有")');
      await page.waitForTimeout(400);
      await page.click('#action-sheet button:has-text("リンクで送る")');
      await page.waitForTimeout(500);
      await page.click('#ver-sheet-overlay button:has-text("リンクを送る")');
      await page.waitForTimeout(500);
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(e => 'ERR ' + e.message);
      const snack = await page.textContent('#snackbar');
      await page.context().close();
      // スマホ：共有シート
      const mob = await newPage(browser, { rules: [linked()], storage: NO_NOTICE, context: { hasTouch: true, isMobile: true, viewport: { width: 375, height: 740 } } });
      await mob.addInitScript(() => { window.__shared = null; navigator.share = async (d) => { window.__shared = d; }; });
      await openApp(mob);
      await mob.context().setOffline(true);
      await mob.evaluate(() => { const r = getRule('r1'); r.link.pubSnapshot = pubPartsOf(r); saveData(); editRule('r1'); });
      await mob.tap('#bottom-bar-content button:has-text("共有")');
      await mob.waitForTimeout(400);
      await mob.tap('#action-sheet button:has-text("リンクで送る")');
      await mob.waitForTimeout(400);
      await mob.tap('#ver-sheet-overlay button:has-text("リンクを送る")');
      await mob.waitForTimeout(300);
      const shared = await mob.evaluate(() => window.__shared);
      const ok = /\?share=Abcd2345$/.test(clip) && snack.includes('ver1.0 のリンクをコピーしました') && shared && /\?share=Abcd2345$/.test(shared.url);
      check('V-112', '「リンクで送る」：PCではコピー、スマホでは共有シートでverのリンクを渡す', ok, JSON.stringify({ clip, snack, shared }));
      await mob.context().close();
    }

    // ---- V-113 変わった点のお知らせ ----
    {
      const page = await newPage(browser, { rules: [ownRule('r1', '通常ルール')] });
      await openApp(page);
      const first = await page.$eval('#modal-notice', el => el.classList.contains('show'));
      await page.click('#modal-notice button:has-text("閉じる")');
      await page.reload();
      await page.waitForFunction(() => document.querySelector('#react-home-root h1'));
      await page.waitForTimeout(300);
      const second = await page.$eval('#modal-notice', el => el.classList.contains('show'));
      await page.context().close();
      const fresh = await newPage(browser, {});
      await openApp(fresh);
      const freshShown = await fresh.$eval('#modal-notice', el => el.classList.contains('show'));
      check('V-113', 'お知らせは1回だけ出て、閉じた後は出ない（初めて使う人には出さない）', first && !second && !freshShown, JSON.stringify({ first, second, freshShown }));
      await fresh.context().close();
    }

    // ---- V-114（1回目の部分） 前のアプリで開いても、足した項目が消えない ----
    {
      const oldExists = process.env.OLD_APP ? fs.existsSync(path.join(ROOT, OLD_APP.slice(1))) : oldAppExists();
      if (!oldExists) {
        check('V-114', '前のアプリで開いても足した項目が消えない', false, OLD_APP + ' がない');
      } else {
        const page = await newPage(browser, { rules: [ownRule('r1', '通常ルール', { verLabel: '2025秋', copiedFrom: { ruleId: 'x' } })], storage: NO_NOTICE });
        await openApp(page, OLD_APP);
        // 前のアプリで編集して保存する
        await page.evaluate(() => { editRule('r1'); goEditMode(); onNameChange('通常ルール改'); saveAndGoView(); });
        const afterOld = (await stored(page)).find(r => r.id === 'r1');
        await openApp(page, NEW_APP);
        await page.evaluate(() => editRule('r1'));
        const badge = await page.textContent('#edit-ver-badge');
        const ok = afterOld.name === '通常ルール改' && afterOld.verLabel === '2025秋' && afterOld.copiedFrom && badge === 'ver2025秋';
        check('V-114', '前のアプリ（before-ver の v5.11）で編集・保存しても、verが端末から消えない（リンクの部分は2回目）', ok, JSON.stringify({ name: afterOld.name, ver: afterOld.verLabel, badge }));
        await page.context().close();
      }
    }

    // ---- ページのエラー（Q-07 と同じ考え方） ----
    {
      const page = await newPage(browser, { rules: [ownRule('r1', '通常ルール', { verLabel: '1.0' })], storage: NO_NOTICE });
      await openApp(page);
      await page.evaluate(() => { editRule('r1'); goEditMode(); showSaveAsDialog(); closeSaveAsDialog(); goViewMode(); goHome(); });
      check('V-エラー', '1回目の画面を操作しても、ページのエラーが出ない', page._errors.length === 0, JSON.stringify(page._errors));
      await page.context().close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  const ng = results.filter(r => !r.ok);
  console.log(`\n${results.length - ng.length} 件成功 / ${ng.length} 件失敗`);
  fs.writeFileSync(path.join(__dirname, 'last_result_phase1.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  process.exitCode = ng.length ? 1 : 0;
}

run().catch(e => { console.error(e); process.exitCode = 1; });
