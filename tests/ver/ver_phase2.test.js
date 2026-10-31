// ver管理 段階2：verのリンク（リンクの作成・送る・下書きと公開・過去のverのリンク・削除・複数の端末）のテスト。
// Firestore・Authのエミュレーターと、ヘッドレスブラウザで流す。アプリは ?emu=1 でエミュレーターにつなぐ。
// 使い方は tests/ver/README.md を参照。
const path = require('path');
const http = require('http');
const fs = require('fs');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require(path.join(process.env.HOME, 'node_modules', 'playwright'))); }

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8990 + Math.floor(Math.random() * 100);
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

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    await clearFirestore();
    // ---- リンクを作る（ログインしていない） ----
    const A = await device(browser, [ownRule('r1', '仲間内ルール'), ownRule('b1', '比較用ルール', { settings: { uma: '10-30', aka_dora: '3枚', kuitan_atoduke: 'あり' } })]);
    await open(A);
    await view(A, 'r1');
    await sendLink(A);
    const createSheet = await sheet(A);
    await A.evaluate(() => { document.getElementById('ver-cmp').value = 'b1'; });
    await clickInSheet(A, 'リンクを作って送る');
    await A.waitForTimeout(1500);
    const url1 = await lastCopied(A);
    const r1 = await ruleOf(A, 'r1');
    const sid = r1 && r1.link && r1.link.seriesId;
    const series1 = sid && await getDoc('rule_series/' + sid);
    check('V-03', 'ログインせずにリンクを作ると、ログインを勧める一文付きの画面が出て、ver1.0 のURL（比較対象の印入り）がコピーされる',
      createSheet.includes('ver1.0 のリンクを作ります') && createSheet.includes('Googleでログインすると')
      && url1.includes('share=') && cmpOf(url1).length === 4 && series1 && val(series1.latestSeq) === '1' && (await snack(A)).includes('ver1.0 のリンクをコピーしました'),
      JSON.stringify({ createSheet, url1, series: !!series1, snack: await snack(A) }));
    const base1 = sid && await getDoc(`series_bases/${sid}_${cmpOf(url1)}`);
    check('S2-01', '送るときに選んだ自分のルールの中身が series_bases に保存され、作成者パスワードは共有の中身に入らない',
      base1 && val(base1.baseId) === 'b1' && !(await getDoc('shared_rules/' + shareOf(url1))).data.stringValue.includes(r1.link.password),
      JSON.stringify({ base1: !!base1 }));
    await A.evaluate(() => goEditMode());
    const editBtns = await text(A, '#bottom-bar-content');
    const verField = await text(A, '#edit-ver-field');
    check('V-20', 'リンクを作ったルールの編集画面は「下書き保存」「保存して公開」の2つ', editBtns.includes('下書き保存') && editBtns.includes('保存して公開'), editBtns);
    check('V-13', 'リンクを作ったルールの「ver」の欄は「公開中：ver1.0」の表示だけ', verField.includes('公開中：ver1.0') && verField.includes('新しいverは「保存して公開」のときに付けます'), verField);
    await A.evaluate(() => goHomeWithConfirm());

    // ---- 下書きなしで送る ----
    await view(A, 'r1');
    await A.evaluate(() => onBaseRuleChange('b1'));
    await sendLink(A);
    const sendSheet = await sheet(A);
    const sendDefault = await A.evaluate(() => document.getElementById('ver-cmp').value);
    const opsBefore = await countDocs('series_ops');
    await clickInSheet(A, 'リンクを送る');
    const url1b = await lastCopied(A);
    check('V-05', '下書きがないリンク付きのルールで「リンクで送る」：「ver1.0 のリンクを送る」で、比較対象の初期値は表示画面のもの。同じverのURLが、保存済みの印のままコピーされる（保存し直さない）',
      sendSheet.includes('ver1.0 のリンクを送る') && sendDefault === 'b1' && shareOf(url1b) === shareOf(url1) && cmpOf(url1b) === cmpOf(url1) && (await countDocs('series_ops')) === opsBefore,
      JSON.stringify({ sendSheet, sendDefault, url1b }));
    await sendLink(A, 'リンクを送る', 'preset_g0yy_4');
    const urlPreset = await lastCopied(A);
    check('V-108', 'プリセットを選んで送ると cmp=p:プリセットのID（保存しない）', cmpOf(urlPreset) === 'p:preset_g0yy_4', urlPreset);

    // ---- 比較対象を選び直しても、何も変えずに保存しても下書きにならない ----
    await A.evaluate(() => onBaseRuleChange('preset_g0yy_4'));
    await A.evaluate(() => { goEditMode(); onSaveDraftButton(); });
    await A.waitForTimeout(300);
    const noDraft = await A.evaluate(() => hasDraft(getRule('r1')));
    const noDraftSnack = await snack(A);
    check('V-27/V-29', '比較対象を選び直す・何も変えずに保存しても「下書きあり」にならない', !noDraft && noDraftSnack.includes('保存しました'), noDraftSnack);
    await A.evaluate(() => { goEditMode(); onSavePublishButton(); });
    await A.waitForTimeout(800);
    check('V-30', '何も変えずに「保存して公開」：「変更はありません（公開中：ver1.0）」', (await snack(A)).includes('変更はありません（公開中：ver1.0）'), await snack(A));

    // ---- 下書き保存 ----
    await editSetting(A, 'uma', '10-30');
    await A.evaluate(() => onSaveDraftButton());
    await A.waitForTimeout(300);
    const draftSnack = await snack(A);
    const banner = await text(A, '#edit-banner');
    const draftBadge = await A.evaluate(() => !document.getElementById('edit-draft-badge').classList.contains('hidden'));
    const v1doc = await getDoc('shared_rules/' + shareOf(url1));
    check('V-21', '設定を変えて「下書き保存」：確認なしで保存され、リンクは変わらず、「下書きあり」と帯が出る',
      draftSnack.includes('下書き保存しました。下書きの変更は、まだリンクに出ていません（相手に表示されるのは ver1.0）') && draftBadge
      && banner.includes('下書きの変更は、まだリンクに出ていません（相手に表示されるのは ver1.0）') && JSON.parse(v1doc.data.stringValue).s.uma === '5-15',
      JSON.stringify({ draftSnack, banner, draftBadge }));
    const homeDraft = await A.evaluate(() => { goHome(); return document.getElementById('react-home-root').textContent.includes('下書きあり'); });
    await A.waitForTimeout(300);
    check('V-21b', 'ホームの一覧に「下書きあり」が出る', await A.evaluate(() => document.getElementById('react-home-root').textContent.includes('下書きあり')), String(homeDraft));
    await view(A, 'r1');
    const imgVer = await A.evaluate(() => exportVerText(getRule('r1')));
    check('V-08', '作成者が下書きのある状態で画像・PDFを作ると「ver1.0（下書き）」', imgVer === 'ver1.0（下書き）', imgVer);

    // ---- 下書きがあるときに送る ----
    await sendLink(A);
    const draftSheet = await sheet(A);
    await clickInSheet(A, '下書きは出さずに');
    const urlDraftSkip = await lastCopied(A);
    check('V-06a', '下書きがあるときの「リンクで送る」：「下書きがあります」画面が出て、「下書きは出さずに ver1.0 を送る」で ver1.0 のURL',
      draftSheet.includes('下書きがあります') && draftSheet.includes('相手に表示されるver') && draftSheet.includes('ver1.0（公開中）') && shareOf(urlDraftSkip) === shareOf(url1),
      JSON.stringify({ draftSheet, urlDraftSkip }));
    // 公開してから送る → 公開画面でキャンセル → 「下書きがあります」に戻る
    await sendLink(A, '下書きを公開してから送る', 'b1');
    const pubSheet = await sheet(A);
    await clickInSheet(A, 'キャンセル');
    const backSheet = await sheet(A);
    const backCmp = await A.evaluate(() => (document.getElementById('ver-cmp') || {}).value);
    check('V-97', '「下書きを公開してから送る」→ 公開の画面で［キャンセル］：何も送られず「下書きがあります」に戻り、選んだ比較対象が残る',
      pubSheet.includes('新しいverとして公開します') && backSheet.includes('下書きがあります') && backCmp === 'b1', JSON.stringify({ pubSheet: pubSheet.slice(0, 80), backSheet: backSheet.slice(0, 40), backCmp }));
    // 公開画面：初期値・使用済み・空欄
    await clickInSheet(A, '下書きを公開してから送る');
    const initVer = await A.evaluate(() => document.getElementById('pub-ver').value);
    await A.evaluate(() => { document.getElementById('pub-ver').value = '１.０'; });
    await clickInSheet(A, '公開する');
    const usedErr = await text(A, '#pub-ver-error');
    await A.evaluate(() => { document.getElementById('pub-ver').value = ''; });
    await clickInSheet(A, '公開する');
    const emptyErr = await text(A, '#pub-ver-error');
    check('V-16/V-109/V-17', '公開の画面：初期値は「1.1」、「１.０」は使用済み、空欄は理由が出て公開されない',
      initVer === '1.1' && usedErr === 'この名前は既に使っています' && emptyErr === 'verの名前を入力してください', JSON.stringify({ initVer, usedErr, emptyErr }));
    await A.evaluate(() => { document.getElementById('pub-ver').value = '1.1'; const t = document.getElementById('pub-note'); t.value = '赤ドラを3枚に変更。\nウマを10-30に変更。'; onPubNoteInput(t); });
    await clickInSheet(A, '公開する');
    await A.waitForTimeout(500);
    const sendAfter = await sheet(A);
    await clickInSheet(A, '送る');
    const url2 = await lastCopied(A);
    const series2 = await getDoc('rule_series/' + sid);
    check('V-06b/V-22', '「下書きを公開してから送る」：ver1.1 が公開され、公開後のURLに先に選んだ比較対象が入る',
      sendAfter.includes('ver1.1 のリンクを送る') && val(series2.latestSeq) === '2' && shareOf(url2) !== shareOf(url1) && cmpOf(url2) === cmpOf(url1),
      JSON.stringify({ sendAfter, url2, latestSeq: val(series2.latestSeq) }));
    const afterPub = await ruleOf(A, 'r1');
    check('V-22b', '公開すると下書きがなくなり、帯が消える', !(await A.evaluate(() => hasDraft(getRule('r1')))) && (await text(A, '#edit-banner')) === '' && afterPub.verLabel === '1.1', await text(A, '#edit-banner'));

    // ---- 過去のverのリンクを開く（別の人） ----
    const B = await device(browser, null);
    await open(B, `&share=${shareOf(url1)}&cmp=${encodeURIComponent(cmpOf(url1))}`);
    await B.waitForTimeout(1200);
    const popup = await sheet(B);
    const histRows = await B.evaluate(() => [...document.querySelectorAll('.ver-history tbody tr')].map(tr => tr.className + ':' + tr.textContent.replace(/\s+/g, ' ')));
    check('V-99', '過去のverのリンクを開くと、ポップアップに変更履歴の表（新しい順、開いたより新しい行に色）が出る',
      popup.includes('このルールは新しいverに更新されています') && popup.includes('ver1.0') && popup.includes('ver1.1') && histRows.length === 2 && histRows[0].startsWith('newer') && histRows[1].startsWith('opened'),
      JSON.stringify({ popup: popup.slice(0, 120), histRows }));
    const cmpName = await text(B, '#standard-rule-display');
    check('S2-03', 'URLの比較対象（作成者の自分のルール）と比べて表示される（開いた人の一覧になくても選択肢に出る）', cmpName.includes('比較用ルール'), cmpName);
    await clickInSheet(B, 'ver1.0 のまま見る');
    const keptBanner = await text(B, '#edit-banner');
    await sendLink(B);
    const urlB = await lastCopied(B);
    check('V-07', '作成者でない人の「リンクで送る」：画面は出ずに、開いたURLと同じ比較対象のまま、見ているverのURL',
      shareOf(urlB) === shareOf(url1) && cmpOf(urlB) === cmpOf(url1), urlB);
    await B.evaluate(() => goHome());
    await open(B, `&share=${shareOf(url1)}`);
    await B.waitForTimeout(1200);
    const popup2 = await sheet(B);
    const banner2 = await text(B, '#edit-banner');
    check('V-61', '「ver1.0 のまま見る」を選んだ後、同じリンクをもう一度開くと、ポップアップは出ずに帯だけ',
      keptBanner.includes('最新ではありません（最新：ver1.1）') && popup2 === '' && banner2.includes('最新ではありません'), JSON.stringify({ keptBanner, popup2, banner2 }));
    await B.evaluate(() => showLatestSharedVer());
    await B.waitForTimeout(1200);
    const latestBadge = (await text(B, '#edit-ver-badge')).replace(/ ▼$/, '');  // 履歴を開ける印「▼」は除いて比べる
    const latestUma = await B.evaluate(() => getRule(editingId).settings.uma);
    check('V-53', '「最新を見る」で最新のverが表示され、ルール名の横に「ver1.1（最新）」', latestBadge === 'ver1.1（最新）' && latestUma === '10-30', JSON.stringify({ latestBadge, latestUma }));
    const homeAfter = await B.evaluate(() => { goHome(); return appData.rules.filter(r => String(r.id).startsWith('shared_')).length; });
    check('V-59', 'ver付きのリンクを開いてからホームに戻ると、一覧に残らない', homeAfter === 0, String(homeAfter));

    // 過去のverのコピーの名前
    await open(B, `&share=${shareOf(url1)}`);
    await B.waitForTimeout(1200);
    await B.evaluate(() => { copySharedRule(); });
    const copyName = await B.evaluate(() => getRule(editingId).name);
    check('V-56', '過去のverをコピーすると「名前（ver1.0のコピー）」', copyName === '仲間内ルール（ver1.0のコピー）', copyName);
    await B.evaluate(() => goHomeWithConfirm());

    // ---- 名前だけの公開 ----
    await view(A, 'r1');
    await A.evaluate(() => { goEditMode(); onNameChange('仲間内ルール2025'); onSavePublishButton(); });
    await A.waitForTimeout(1500);
    const nameSnack = await snack(A);
    const series3 = await getDoc('rule_series/' + sid);
    check('V-24', '名前だけを変えて「保存して公開」：画面は出ず、verは変わらず名前が変わる',
      nameSnack.includes('作成したリンクの名前を変更しました（verは変わりません）') && val(series3.name) === '仲間内ルール2025' && val(series3.latestSeq) === '2' && (await sheet(A)) === '',
      JSON.stringify({ nameSnack, name: val(series3.name) }));
    await open(B, `&share=${shareOf(url1)}`);
    await B.waitForTimeout(1200);
    check('V-24b', '過去のver（ver1.0）のリンクでも新しい名前が表示される', (await B.evaluate(() => getRule(editingId).name)) === '仲間内ルール2025', await B.evaluate(() => getRule(editingId).name));
    await B.evaluate(() => goHome());

    // ---- 作成者が自分の過去のverのリンクを開く ----
    await open(A, `&share=${shareOf(url1)}&cmp=${encodeURIComponent(cmpOf(url1))}`);
    await A.waitForTimeout(1500);
    const ownBanner = await text(A, '#edit-banner');
    const ownId = await A.evaluate(() => editingId);
    const sharedCount = await A.evaluate(() => appData.rules.filter(r => String(r.id).startsWith('shared_')).length);
    const ownBaseBefore = await A.evaluate(() => getRule('r1').base_rule);
    await A.evaluate(() => goHome());
    const ownBaseAfter = await A.evaluate(() => getRule('r1').base_rule);
    check('V-107', '作成者が自分の過去のverのリンクを開くと、自分のルールの表示画面と「開いたリンクは ver1.0 です…」の帯。比較対象はその場だけ',
      ownId === 'r1' && sharedCount === 0 && ownBanner.includes('開いたリンクは ver1.0 です。表示しているのは自分のルール（公開中：ver1.1）です') && ownBaseBefore === 'b1' && ownBaseAfter === 'preset_g0yy_4',
      JSON.stringify({ ownId, sharedCount, ownBanner, ownBaseBefore, ownBaseAfter }));

    // ---- ほかの端末で公開されたとき（同じルールを持つ別の端末） ----
    const r1now = await ruleOf(A, 'r1');
    const C = await device(browser, [r1now, ownRule('b1', '比較用ルール', { settings: { uma: '10-30', aka_dora: '3枚', kuitan_atoduke: 'あり' } })]);
    await open(C);
    await view(C, 'r1');
    await editSetting(C, 'aka_dora', '4枚');
    await C.evaluate(() => onSavePublishButton());
    await C.waitForTimeout(1200);
    await C.evaluate(() => { document.getElementById('pub-ver').value = '1.2'; });
    await clickInSheet(C, '公開する');
    await view(A, 'r1');
    await A.waitForTimeout(1500);
    const otherBanner = await text(A, '#edit-banner');
    const draftWrong = await A.evaluate(() => hasDraft(getRule('r1')));
    check('V-75', 'ほかの端末で公開されたとき、「下書きあり」は出ず「ほかの端末で ver1.2 が公開されています［公開中の内容を読み込む］」',
      otherBanner.includes('ほかの端末で ver1.2 が公開されています') && otherBanner.includes('公開中の内容を読み込む') && !draftWrong, JSON.stringify({ otherBanner, draftWrong }));
    await A.evaluate(() => loadPublishedContent());
    await A.waitForTimeout(300);
    const loaded = await ruleOf(A, 'r1');
    check('V-75b', '［公開中の内容を読み込む］で手元が ver1.2 の内容になり、帯が消える',
      loaded.settings.aka_dora === '4枚' && (await text(A, '#edit-banner')) === '' && loaded.verLabel === '1.2', JSON.stringify({ aka: loaded.settings.aka_dora, banner: await text(A, '#edit-banner') }));

    // 新しいverの公開で先を越された
    await view(C, 'r1');
    await C.evaluate(() => { goEditMode(); onSettingChange('kuitan_atoduke', 'なし'); onSavePublishButton(); });
    await C.waitForTimeout(1200);
    // C が公開画面を開いている間に A が公開する
    await A.evaluate(() => { goEditMode(); onSettingChange('uma', '5-15'); onSavePublishButton(); });
    await A.waitForTimeout(1200);
    await A.evaluate(() => { document.getElementById('pub-ver').value = '1.3'; });
    await clickInSheet(A, '公開する');
    await C.evaluate(() => { document.getElementById('pub-ver').value = '1.3'; });
    await clickInSheet(C, '公開する');
    await C.waitForTimeout(800);
    const conflictSheet = await sheet(C);
    const conflictVer = await C.evaluate(() => (document.getElementById('pub-ver') || {}).value);
    check('V-33', '別の端末が先に公開していたとき、画面を出し直し「別の端末で ver1.3 が公開されています…ver1.4 になります」、初期値は「1.4」',
      conflictSheet.includes('別の端末で ver1.3 が公開されています。この端末の内容で公開すると ver1.4 になります。') && conflictVer === '1.4', JSON.stringify({ conflictSheet: conflictSheet.slice(0, 160), conflictVer }));
    await clickInSheet(C, 'キャンセル');

    // 名前・強調だけの公開で先を越された（強調だけ）
    await view(C, 'r1');
    await C.waitForTimeout(1200);
    await C.evaluate(() => loadPublishedContent());
    await C.evaluate(() => { goEditMode(); toggleHighlight('uma'); });
    await view(A, 'r1');
    await A.evaluate(() => { goEditMode(); onSettingChange('aka_dora', '3枚'); onSavePublishButton(); });
    await A.waitForTimeout(1200);
    await A.evaluate(() => { document.getElementById('pub-ver').value = '1.4'; });
    await clickInSheet(A, '公開する');
    await C.evaluate(() => onSavePublishButton());
    await C.waitForTimeout(1500);
    const hlSnack = await snack(C);
    check('V-49', '強調だけを公開しようとして、別の端末が先に新しいverを公開していたとき、下書きに残す',
      hlSnack.includes('別の端末で ver1.4 が公開されています。強調は下書きに残しました'), hlSnack);

    // ---- 通信できないときの公開 ----
    await view(A, 'r1');
    await A.evaluate(() => { goEditMode(); onSettingChange('uma', '10-20'); });
    await A.context().setOffline(true);
    await A.evaluate(() => onSavePublishButton());
    await A.waitForTimeout(1500);
    const offSnack = await snack(A);
    const offRule = await ruleOf(A, 'r1');
    await A.context().setOffline(false);
    check('V-32', '通信できないときに公開すると、下書きとして保存し「保存しましたが、公開に失敗しました…」',
      offSnack.includes('保存しましたが、公開に失敗しました') && offRule.settings.uma === '10-20', JSON.stringify({ offSnack, uma: offRule.settings.uma }));

    // ---- 削除 ----
    await A.waitForTimeout(500);
    const delText = await A.evaluate(() => deleteConfirmText(getRule('r1')));
    const latestShare = (await ruleOf(A, 'r1')).link.pubShareId;
    await A.evaluate(() => { goHome(); askDelete('r1'); confirmDelete(); });
    await A.waitForTimeout(4000);
    const seriesGone = await getDoc('rule_series/' + sid);
    const sharedLeft = await countDocs('shared_rules');
    const opsLeft = await countDocs('series_ops');
    const basesLeft = await countDocs('series_bases');
    check('V-86', 'リンクを作ったルールを削除すると、確認に「作成したリンク（ver1.0～ver1.4 の5件）も削除され…」が出て、サーバーのシリーズとすべてのverが消える',
      delText.includes('作成したリンク（ver1.0～ver1.4 の5件）も削除され、リンクを受け取った人は開けなくなります。元に戻せません。') && !seriesGone && sharedLeft === 0 && opsLeft === 0 && basesLeft === 0,
      JSON.stringify({ delText, seriesGone: !!seriesGone, sharedLeft, opsLeft, basesLeft }));
    await open(B, `&share=${latestShare}`);
    await B.waitForTimeout(1200);
    const goneMsg = await sheet(B);
    check('V-86b', '削除したルールのリンクを開くと「このリンクのルールは見つかりません。作成者が削除したか、リンクが間違っています。」',
      goneMsg.includes('このリンクのルールは見つかりません。作成者が削除したか、リンクが間違っています。') && goneMsg.includes('閉じる'), goneMsg);
    // 別の端末（C）でリンクが消えていたとき
    await view(C, 'r1');
    await C.waitForTimeout(1500);
    const cRule = await ruleOf(C, 'r1');
    check('V-34', '別の端末でリンクが削除されていたとき、表示画面を開くとリンクの情報を外して「このルールのリンクは削除されています…」',
      cRule && !cRule.link && (await snack(C)).includes('このルールのリンクは削除されています。リンクのないルールに戻しました'), JSON.stringify({ link: cRule && !!cRule.link, snack: await snack(C) }));

    // ---- 通信できないときに削除 → 通信できるようになったら削除 ----
    await clearFirestore();
    const D = await device(browser, [ownRule('d1', '消すルール')]);
    await open(D);
    await view(D, 'd1');
    await sendLink(D, 'リンクを作って送る');
    const dSid = (await ruleOf(D, 'd1')).link.seriesId;
    await D.context().setOffline(true);
    await D.evaluate(() => { goHome(); askDelete('d1'); confirmDelete(); });
    const offDelSnack = await snack(D);
    const pending = await D.evaluate(() => JSON.parse(localStorage.getItem('mahjong_pending_cloud_deletes') || '[]'));
    await D.context().setOffline(false);
    await D.evaluate(() => processPendingCloudDeletes());
    await D.waitForTimeout(3000);
    check('V-87', '通信できないときに削除すると「…通信できるようになってから削除します」、通信できるようになるとサーバーから消える',
      offDelSnack.includes('作成したリンクは、通信できるようになってから削除します') && pending.length === 1 && pending[0].seriesId === dSid && !(await getDoc('rule_series/' + dSid)),
      JSON.stringify({ offDelSnack, pending: pending.length }));

    // ---- ログインして作ったリンクが、同じアカウントの別の端末に届き、公開できる ----
    await clearFirestore();
    const E = await device(browser, [ownRule('e1', '同期するルール')]);
    await open(E); await login(E, 'syncUser');
    await view(E, 'e1');
    await sendLink(E, 'リンクを作って送る');
    await E.waitForTimeout(1500);
    const F2 = await device(browser, []);
    await open(F2); await login(F2, 'syncUser');
    const fRule = await ruleOf(F2, 'e1');
    await view(F2, 'e1');
    await F2.waitForTimeout(1200);
    await editSetting(F2, 'uma', '10-20');
    await F2.evaluate(() => onSavePublishButton());
    await F2.waitForTimeout(1200);
    await F2.evaluate(() => { document.getElementById('pub-ver').value = '1.1'; });
    await clickInSheet(F2, '公開する');
    const fSeries = await getDoc('rule_series/' + fRule.link.seriesId);
    check('V-76', 'ログインしてリンクを作ると、同じアカウントの別の端末に作成者パスワードが届き、そこから公開できる',
      fRule && fRule.link && fRule.link.password && val(fSeries.latestSeq) === '2' && (await snack(F2)).includes('ver1.1 として公開しました'),
      JSON.stringify({ hasLink: !!(fRule && fRule.link), latestSeq: fSeries && val(fSeries.latestSeq), snack: await snack(F2) }));

    // ---- ?v= が古いURLに share と cmp を付けて開く ----
    await clearFirestore();
    const G = await device(browser, [ownRule('g1', '比べるルール'), ownRule('g2', '比較の元', { settings: { uma: '10-30' } })]);
    await open(G);
    await view(G, 'g1');
    await sendLink(G, 'リンクを作って送る', 'g2');
    const gUrl = await lastCopied(G);
    const H = await device(browser, null);
    await H.goto(`${APP}?v=v0.0&emu=1&share=${shareOf(gUrl)}&cmp=${encodeURIComponent(cmpOf(gUrl))}`);
    await H.waitForTimeout(3000);
    const hCmp = await text(H, '#standard-rule-display');
    check('V-58', 'アプリのバージョン（?v=）が古いURLに share と cmp を付けて開いても、比較対象が残る', hCmp.includes('比較の元'), hCmp);

    const errs = [A, B, C, D, E, F2, G, H].flatMap(p => p._errors);
    check('V-ERR', '画面の操作でエラーが出ない', errs.length === 0, JSON.stringify(errs.slice(0, 5)));
  } finally {
    await browser.close();
    server.close();
  }
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length} 件成功 / ${bad.length} 件失敗`);
  fs.writeFileSync(path.join(__dirname, 'last_result_ver_phase2.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  process.exitCode = bad.length ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; })
  // 終わった後に通信などが残ってプロセスが抜けないことがあるので、結果を書いたら強制的に終える
  .finally(() => setTimeout(() => process.exit(process.exitCode || 0), 1000));
