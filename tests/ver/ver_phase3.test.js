// ver管理 段階3：強調だけの公開（ver_hl）・「手動」の印・別のverと比べる（cmp=v:）のテスト。
// Firestore・Authのエミュレーターと、ヘッドレスブラウザで流す。アプリは ?emu=1 でエミュレーターにつなぐ。
// 使い方は tests/ver/README.md を参照。
const path = require('path');
const http = require('http');
const fs = require('fs');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require(path.join(process.env.HOME, 'node_modules', 'playwright'))); }

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 9090 + Math.floor(Math.random() * 100);
const STORAGE_KEY = 'mahjong_rules_pwa_v1';
const FS_EMU = 'http://localhost:8080';
const PROJECT = 'majan-rule';
const VERSION = (fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8').match(/const currentVersion = "(v[\d.]+)"/) || [])[1];
const APP = `http://localhost:${PORT}/src/index.html`;

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


// 項目が強調されているか（表示画面・編集画面の is-changed）
const changed = (page, key) => page.evaluate(k => { const e = document.querySelector(`#edit-fields .swipe-item[data-id="${k}"]`); return e ? e.classList.contains('is-changed') : null; }, key);
// 表示画面で、比較対象の欄を選ぶ（別のverは読み込みを待つ）
async function chooseBase(page, id) { await page.evaluate(id => onBaseRuleChange(id), id); await page.waitForTimeout(1200); }
async function publishNewVer(page, label) {
  await page.evaluate(() => onSavePublishButton());
  await page.waitForTimeout(1200);
  await page.evaluate(l => { document.getElementById('pub-ver').value = l; }, label);
  await clickInSheet(page, '公開する');
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    await clearFirestore();
    const A = await device(browser, [ownRule('r1', '強調のルール', { base_rule: 'preset_g0yy_4' })]);
    await open(A);
    await view(A, 'r1');
    await sendLink(A, 'リンクを作って送る');
    const url1 = await lastCopied(A);
    const sid = (await ruleOf(A, 'r1')).link.seriesId;

    // ---- 「手動」の印 ----
    await A.evaluate(() => goEditMode());
    const autoUma = await changed(A, 'uma');
    await A.evaluate(() => toggleHighlight('uma'));
    const mark = await A.evaluate(() => !!document.querySelector('#edit-fields .swipe-item[data-id="uma"] .manual-mark'));
    const note = await text(A, '.manual-note');
    await A.evaluate(() => askRevertManual('uma'));
    await A.waitForTimeout(200);
    const confirmText = await sheet(A);
    await clickInSheet(A, '自動に戻す');
    const markAfter = await A.evaluate(() => !!document.querySelector('#edit-fields .swipe-item[data-id="uma"] .manual-mark'));
    const noteAfter = await text(A, '.manual-note');
    const draftAfterRevert = await A.evaluate(() => hasDraft(getRule('r1')));
    const expectWord = autoUma ? '違うので強調します。' : '同じなので強調しません。';
    check('V-43', '強調を手で直すと「手動」の印と一覧の上の説明が出る。押すと自動に戻したときの強調が書かれた確認が出て、「自動に戻す」で印・説明・「下書きあり」が消える',
      mark && note.includes('手動：強調表示を手動で設定した項目') && confirmText.includes('ウマの強調を自動に戻しますか？') && confirmText.includes(expectWord) && confirmText.includes('天鳳')
      && !markAfter && noteAfter === '' && !draftAfterRevert, JSON.stringify({ mark, note, confirmText, markAfter, noteAfter, draftAfterRevert }));

    // ---- 強調だけの公開（天鳳ルール・雀魂ルールのそれぞれ） ----
    await A.evaluate(() => toggleHighlight('uma'));
    await A.evaluate(() => onBaseRuleChange('preset_qhs2_4'));
    await A.evaluate(() => toggleHighlight('aka_dora'));
    await A.evaluate(() => onSavePublishButton());
    await A.waitForTimeout(1500);
    const hlSnack = await snack(A);
    const s1 = await getDoc('rule_series/' + sid);
    const hlDoc = await getDoc('ver_hl/' + shareOf(url1));
    check('V-40a', '2つの比較対象に対して強調を直して「保存して公開」：画面は出ず、verは変わらず「強調の変更を公開しました（verは変わりません）」',
      hlSnack.includes('強調の変更を公開しました（verは変わりません）') && val(s1.latestSeq) === '1' && !!hlDoc && (await sheet(A)) === '', JSON.stringify({ hlSnack, hlDoc: !!hlDoc }));
    const B = await device(browser, null);
    await open(B, `&share=${shareOf(url1)}&cmp=p:preset_g0yy_4`);
    await B.waitForTimeout(1200);
    const bUma = await changed(B, 'uma');
    await chooseBase(B, 'preset_qhs2_4');
    const bAka = await B.evaluate(() => { const r = getRule(editingId); return applyHighlightOverride(r, 'aka_dora', autoItemDiff(r, 'aka_dora')); });
    const aAka = await A.evaluate(() => { const r = getRule('r1'); return applyHighlightOverride(r, 'aka_dora', autoItemDiff(r, 'aka_dora')); });
    check('V-40b', '最新verのリンクでは、どちらの比較対象でも直した強調で表示される', bUma === !autoUma && bAka === aAka, JSON.stringify({ bUma, autoUma, bAka, aAka }));
    await B.evaluate(() => goHome());
    // 名前と強調を一緒に
    await view(A, 'r1');
    await A.evaluate(() => { goEditMode(); onNameChange('強調のルール2'); toggleHighlight('kuitan_atoduke'); onSavePublishButton(); });
    await A.waitForTimeout(1500);
    check('V-40c', '名前も一緒に変えたときは「名前と強調の変更を公開しました（verは変わりません）」', (await snack(A)).includes('名前と強調の変更を公開しました（verは変わりません）'), await snack(A));

    // ---- 強調だけを公開したverを、次のverの後に開く ----
    await view(A, 'r1');
    await editSetting(A, 'uma', '10-30');
    await publishNewVer(A, '1.1');
    await A.waitForTimeout(500);
    await open(B, `&share=${shareOf(url1)}&cmp=p:preset_g0yy_4`);
    await B.waitForTimeout(1200);
    await clickInSheet(B, 'ver1.0 のまま見る');
    const bUmaOld = await changed(B, 'uma');
    check('V-47', 'ver1.0 で強調だけを公開した後に ver1.1 を公開しても、ver1.0 のリンクは強調だけを公開したときの強調で表示される', bUmaOld === !autoUma, JSON.stringify({ bUmaOld, autoUma }));
    await B.evaluate(() => goHome());

    // ver_hl を読むのは hlSeqs にあるverだけ
    const r1now = await ruleOf(A, 'r1');
    const readsFor = async (shareId) => B.evaluate(async (q) => {
      history.replaceState({}, '', location.pathname + q);
      const orig = fbDb.collection.bind(fbDb);
      window.__cols = [];
      fbDb.collection = (n) => { window.__cols.push(n); return orig(n); };
      try { await checkSharedRule(); } finally { fbDb.collection = orig; }
      closeVerSheet(); goHome();
      return window.__cols;
    }, '?share=' + shareId);
    const colsNew = await readsFor(r1now.link.pubShareId);
    const colsOld = await readsFor(shareOf(url1));
    check('V-111', '強調だけを公開したことがないverでは ver_hl を読まない。あるverでは読む', !colsNew.includes('ver_hl') && colsOld.includes('ver_hl'), JSON.stringify({ colsNew, colsOld }));

    // ---- 別のverと比べる ----
    await B.evaluate(() => localStorage.removeItem('mahjong_keep_ver'));  // 前に「まま見る」を選んだ記録を消す
    await open(B, `&share=${shareOf(url1)}`);
    await B.waitForTimeout(1200);
    await clickInSheet(B, '最新のルールを見る');
    await B.waitForTimeout(800);
    const autoBase = await text(B, '#standard-rule-display');
    const umaChangedVsOpened = await changed(B, 'uma');
    check('V-52', '「最新のルールを見る」：比較対象に「ver1.0（開いたver）」が選ばれ、変わった項目が強調される', autoBase === 'ver1.0（開いたver）' && umaChangedVsOpened === true, JSON.stringify({ autoBase, umaChangedVsOpened }));
    await B.evaluate(() => goHome());

    // 選択肢
    await view(A, 'r1');
    await editSetting(A, 'aka_dora', '4枚');
    await publishNewVer(A, '2025秋');
    const series = await getDoc('rule_series/' + sid);
    const shareIds = series.shareIds.arrayValue.values.map(v => v.stringValue);
    await open(B, `&share=${shareIds[1]}`);
    await B.waitForTimeout(1200);
    await clickInSheet(B, 'ver1.1 のまま見る');
    const opts = await B.evaluate(() => [...document.querySelectorAll('#base-rule-select optgroup')].map(g => g.label + ':' + [...g.querySelectorAll('option')].map(o => o.textContent).join('|')));
    check('V-65', 'ver1.1 のリンクを開くと、比較対象の選択肢の先頭に「このルールの別のver」として ver2025秋（最新）と ver1.0 が並び、ver1.1 は出ない',
      opts.length === 2 && opts[0] === '― このルールの別のver ―:ver2025秋（最新）|ver1.0' && opts[1].startsWith('― ほかのルール ―'), JSON.stringify(opts));
    await chooseBase(B, 'ver:' + shareIds[0]);
    const bVsV10 = await changed(B, 'uma');
    check('V-66a', 'リンクを開いた人が比較対象に ver1.0 を選ぶと、ver1.0 と違う項目が強調表示される', bVsV10 === true && (await text(B, '#standard-rule-display')) === 'ver1.0', String(bVsV10));
    await B.evaluate(() => goHome());

    // 作成者：ver1.0 を選んで強調を直す
    await view(A, 'r1');
    await chooseBase(A, 'ver:' + shareIds[0]);
    const aVsV10 = await changed(A, 'uma');
    const draftByChoose = await A.evaluate(() => hasDraft(getRule('r1')));
    await A.evaluate(() => { goEditMode(); toggleHighlight('uma'); });
    const markVer = await A.evaluate(() => !!document.querySelector('#edit-fields .swipe-item[data-id="uma"] .manual-mark'));
    await A.evaluate(() => onSaveDraftButton());
    const stored = await A.evaluate(id => ((getRule('r1').settings.highlight_overrides || {})['ver:' + id] || {}).uma, shareIds[0]);
    const draftByHl = await A.evaluate(() => hasDraft(getRule('r1')));
    check('V-66b', '作成者が ver1.0 を選んで強調を手で直すと、ver1.0 に対して保存され、「手動」の印が付き、「下書きあり」になる（選んだだけでは下書きにならない）',
      aVsV10 === true && !draftByChoose && markVer && stored === false && draftByHl, JSON.stringify({ aVsV10, draftByChoose, markVer, stored, draftByHl }));
    // 公開中のverを選ぶ → 下書き（手元）と公開中の違い
    await A.evaluate(() => { goEditMode(); toggleHighlight('uma'); onSaveDraftButton(); });
    await chooseBase(A, 'ver:' + shareIds[2]);
    await A.evaluate(() => { goEditMode(); onSettingChange('kuitan_atoduke', 'なし'); onSaveDraftButton(); });
    const kuitanVsPub = await changed(A, 'kuitan_atoduke');
    await A.evaluate(() => goHome());
    await view(A, 'r1');
    const kept = await A.evaluate(() => getRule('r1').base_rule);
    check('V-67', '作成者が比較対象に公開中のverを選ぶと、手元の内容（下書き）と公開中の違いが強調され、次に開いたときも選んだverが引き継がれる',
      kuitanVsPub === true && kept === 'ver:' + shareIds[2], JSON.stringify({ kuitanVsPub, kept }));

    // ver1.0 と比べて見ている状態で送る（通信できない状態でも）
    await chooseBase(A, 'ver:' + shareIds[0]);
    await A.evaluate(() => { goEditMode(); onSettingChange('kuitan_atoduke', 'あり'); onSaveDraftButton(); });
    await A.context().setOffline(true);
    await sendLink(A);
    const sendDefault = await A.evaluate(() => document.getElementById('ver-cmp').value);
    await clickInSheet(A, 'リンクを送る');
    const vUrl = await lastCopied(A);
    await A.context().setOffline(false);
    check('V-48a', 'ver1.0 と比べて見ている状態で「リンクで送る」：初期値が ver1.0、URLに cmp=v: が入り、通信できなくても送れる',
      sendDefault === 'ver:' + shareIds[0] && cmpOf(vUrl) === 'v:' + shareIds[0], JSON.stringify({ sendDefault, vUrl }));
    await open(B, `&share=${shareOf(vUrl)}&cmp=${encodeURIComponent(cmpOf(vUrl))}`);
    await B.waitForTimeout(1500);
    check('V-48b', 'cmp=v: のURLを開くと、ver1.0 との差分が表示される', (await text(B, '#standard-rule-display')) === 'ver1.0' && (await changed(B, 'uma')) === true, await text(B, '#standard-rule-display'));
    await B.evaluate(() => goHome());

    // ---- verが11件以上 / verの履歴がないルール ----
    await A.evaluate(() => {
      const r = getRule('r1');
      r.link.history = Array.from({ length: 12 }, (_, i) => ({ seq: i + 1, label: 'x' + (i + 1), shareId: 'S' + i }));
    });
    await A.evaluate(() => { _showAllVers = false; renderEdit(); });
    const many = await A.evaluate(() => [...document.querySelectorAll('#base-rule-select optgroup')[0].querySelectorAll('option')].map(o => o.textContent));
    await A.evaluate(() => onBaseRuleChange('__more__'));
    const manyAll = await A.evaluate(() => document.querySelectorAll('#base-rule-select optgroup')[0].querySelectorAll('option').length);
    await A.evaluate(() => { _showAllVers = false; const r = getRule('r1'); delete r.link.history; });
    await view(A, 'r1');
    await A.waitForTimeout(800);
    await A.evaluate(() => { appData.rules.push({ id: 'nolink', mode: '四麻', name: 'リンクなし', settings: { uma: '5-15' }, date: '2026/10/01 10:00:00', verLabel: '1.0' }); });
    await view(A, 'nolink');
    const noGroup = await A.evaluate(() => document.querySelectorAll('#base-rule-select optgroup').length);
    check('V-68', 'verが11件以上あると新しい方から10件と「もっと見る」、押すと残りも出る。リンクのないルールでは「このルールの別のver」が出ない',
      many.length === 11 && many[0] === 'verx12' && many[10] === 'もっと見る…' && manyAll === 12 && noGroup === 0, JSON.stringify({ many, manyAll, noGroup }));

    // ---- 強調だけの公開が、同じルールを持つ別の端末に届く ----
    const r1copy = await ruleOf(A, 'r1');
    const C = await device(browser, [r1copy]);
    await open(C);
    await view(A, 'r1');
    await A.waitForTimeout(800);
    await A.evaluate(() => { goEditMode(); toggleHighlight('aka_dora'); onSavePublishButton(); });
    await A.waitForTimeout(1500);
    const aPub = await snack(A);
    await view(C, 'r1');
    await C.waitForTimeout(1500);
    const cDraft = await C.evaluate(() => hasDraft(getRule('r1')));
    const cBanner = await text(C, '#edit-banner');
    check('V-104', 'PCで強調だけを公開した後に、同じルールを持つ別の端末で開くと、公開している内容の控えが新しくなる（ほかの端末で公開された帯が出て、「下書きあり」は誤って出ない）',
      aPub.includes('強調の変更を公開しました') && cBanner.includes('ほかの端末で ver2025秋 が公開されています') && cBanner.includes('公開中の内容を読み込む'), JSON.stringify({ aPub, cDraft, cBanner }));
    check('V-104b', '（続き）別の端末では「下書きあり」が出ない', !cDraft, JSON.stringify({ cDraft, cBanner }));

    const errs = [A, B, C].flatMap(p => p._errors);
    check('V-ERR3', '画面の操作でエラーが出ない', errs.length === 0, JSON.stringify(errs.slice(0, 5)));
  } finally {
    await browser.close();
    server.close();
  }
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length} 件成功 / ${bad.length} 件失敗`);
  fs.writeFileSync(path.join(__dirname, 'last_result_ver_phase3.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  process.exitCode = bad.length ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; })
  // 終わった後に通信などが残ってプロセスが抜けないことがあるので、結果を書いたら強制的に終える
  .finally(() => setTimeout(() => process.exit(process.exitCode || 0), 1000));
