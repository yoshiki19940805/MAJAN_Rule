// 今までの機能の回帰テスト（tests/test_cases.md の A〜Q のうち「自動」の項目）
// ver管理の変更で、今までの動きが壊れていないかを確かめる。Firestoreは使わない（本番への通信は止める）。
// 使い方は tests/ver/README.md を参照。
const path = require('path');
const http = require('http');
const fs = require('fs');

let chromium;
try { ({ chromium } = require(path.join(process.env.HOME, 'node_modules', 'playwright'))); }
catch (e) { ({ chromium } = require('playwright')); }

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8990 + Math.floor(Math.random() * 100);
const APP = process.env.APP || '/src/index.html';
const STORAGE_KEY = 'mahjong_rules_pwa_v1';
const VERSION = (fs.readFileSync(path.join(ROOT, APP.slice(1)), 'utf8').match(/const currentVersion = "(v[\d.]+)"/) || [])[1];

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

let browser;
// 1つのテスト用の端末。answers に、prompt/confirm への答えを順に入れておく（なければOK）
async function device(opts) {
  opts = opts || {};
  const ctx = await browser.newContext(Object.assign({ permissions: ['clipboard-read', 'clipboard-write'] }, opts.context || {}));
  await ctx.route(/firestore\.googleapis\.com/, r => r.abort());
  const page = await ctx.newPage();
  page._errors = [];
  page._dialogs = [];
  page._answers = [];
  page.on('pageerror', e => page._errors.push(e.message));
  page.on('dialog', async d => {
    page._dialogs.push({ type: d.type(), message: d.message() });
    const a = page._answers.length ? page._answers.shift() : { accept: true };
    if (a.accept) await d.accept(a.text); else await d.dismiss();
  });
  if (opts.raw !== undefined || opts.rules || opts.storage !== false) {
    await page.addInitScript(([key, raw, rules, extra]) => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      if (raw !== null) localStorage.setItem(key, raw);
      else if (rules) localStorage.setItem(key, JSON.stringify({ rules }));
      localStorage.setItem('mahjong_notice_ver1', '1');
      for (const [k, v] of Object.entries(extra || {})) localStorage.setItem(k, v);
    }, [STORAGE_KEY, opts.raw === undefined ? null : opts.raw, opts.rules || null, opts.extra || null]);
  }
  return page;
}
async function open(page, query) {
  await page.goto(`http://localhost:${PORT}${APP}?v=${VERSION}${query || ''}`);
  await page.waitForFunction(() => window._renderReactHome && document.querySelector('#react-home-root h1'), null, { timeout: 30000 });
  await page.waitForTimeout(200);
}
const close = page => page.context().close();
const stored = page => page.evaluate(k => { try { return JSON.parse(localStorage.getItem(k)).rules; } catch (e) { return null; } }, STORAGE_KEY);
const homeNames = page => page.$$eval('#react-home-root h2', hs => hs.map(h => h.textContent.trim()));
const row = (page, id) => page.$(`#edit-fields .swipe-item[data-id="${id}"]`);
const rowClass = (page, id) => page.$eval(`#edit-fields .swipe-item[data-id="${id}"]`, el => el.className).catch(() => null);

function ownRule(id, name, extra) {
  return Object.assign({ id, mode: '四麻', name, base_rule: '', date: '2026/10/01 10:00:00', verLabel: '1.0', settings: {} }, extra || {});
}

async function run() {
  const server = await startServer();
  browser = await chromium.launch();
  // テストで使う、実際の設定（プリセット「例」の設定）と項目のキー
  let SETTINGS, KEY, KEY_OPTS, PENALTY_KEY, CAT0;
  {
    const p = await device({ storage: false });
    await open(p);
    ({ SETTINGS, KEY, KEY_OPTS, PENALTY_KEY, CAT0 } = await p.evaluate(() => {
      const s = JSON.parse(JSON.stringify(getRule('preset_fpn_4').settings));
      const key = 'uma';
      const pk = getPenaltyMovableKeys('四麻').find(k => getItemOptions({ mode: '四麻', settings: s }, k).includes('チョンボ') && s[k] !== 'チョンボ');
      return { SETTINGS: s, KEY: key, KEY_OPTS: getItemOptions({ mode: '四麻', settings: s }, key), PENALTY_KEY: pk, CAT0: catKeyOf(getRuleCategories({ mode: '四麻', settings: s })[0]) };
    }));
    await close(p);
  }
  const otherVal = KEY_OPTS.find(v => v && v !== SETTINGS[KEY]);
  const mine = (id, name, extra) => ownRule(id, name, Object.assign({ settings: JSON.parse(JSON.stringify(SETTINGS)) }, extra || {}));

  try {
    // ================= A. 起動・データの読み込み =================
    {
      const p = await device({ storage: false });
      await open(p);
      const names = await homeNames(p);
      check('A-01', '初めて開くと、四麻のプリセットが表示され、エラーが出ない', ['例', '雀魂', '天鳳', 'Mリーグ'].every(n => names.includes(n)) && !p._errors.length, JSON.stringify({ names, errors: p._errors }));
      await close(p);
    }
    {
      const p = await device();
      await open(p);
      await p.evaluate(() => createRule('四麻'));
      await p.fill('#edit-name', '再読み込みテスト');
      await p.evaluate(k => onSettingChange(k, '5-15'), KEY);
      await p.click('#bottom-bar-content button');
      await p.reload(); await p.waitForFunction(() => document.querySelector('#react-home-root h1'));
      const r = (await stored(p)).find(x => x.name === '再読み込みテスト');
      check('A-02', 'ルールを保存して再読み込みしても、名前・設定が残る', r && r.settings[KEY] === '5-15' && (await homeNames(p)).includes('再読み込みテスト'), JSON.stringify(r && r.settings[KEY]));
      await close(p);
    }
    {
      const p = await device({ raw: '{壊れた' });
      await open(p);
      check('A-04', '保存データが壊れていても、初期状態で起動する', (await homeNames(p)).includes('雀魂') && !p._errors.length, JSON.stringify(p._errors));
      await close(p);
      const q = await device({ raw: '{"rules":[]}' });
      await open(q);
      check('A-05', '保存データが空でも、プリセットが補われる', (await homeNames(q)).includes('雀魂'), '');
      await close(q);
    }
    {
      const p = await device();
      const urls = [];
      p.on('framenavigated', f => { if (f === p.mainFrame()) urls.push(f.url()); });
      await p.goto(`http://localhost:${PORT}${APP}?v=v0.01`);
      await p.waitForFunction(() => document.querySelector('#react-home-root h1'), null, { timeout: 30000 });
      await p.waitForTimeout(500);
      const okA06 = p.url().includes('v=' + VERSION) && urls.length <= 3;
      check('A-06', '?v= が古いと最新のURLに切り替わり、繰り返し読み込まない', okA06, JSON.stringify(urls));
      urls.length = 0;
      p._answers.push({ accept: true });
      await p.goto(`http://localhost:${PORT}${APP}?v=v0.01&share=ABCDEFGH`);
      await p.waitForTimeout(2500);
      check('A-07', '?v= の切り替えで、share が消えない', urls.some(u => u.includes('v=' + VERSION) && u.includes('share=ABCDEFGH')), JSON.stringify(urls));
      await close(p);
    }

    // ================= B. ホーム画面 =================
    {
      const p = await device({ rules: [mine('r4', '四麻ルール', { date: '2026/10/02 10:00:00' }), mine('r4b', '古いルール', { date: '2026/09/01 10:00:00' }), Object.assign(mine('r3', '三麻ルール'), { mode: '三麻' })] });
      await open(p);
      const four = await homeNames(p);
      await p.click('text=三人麻雀');
      const three = await homeNames(p);
      check('B-01', '四麻・三麻のタブで、それぞれのルールだけが出る', four.includes('四麻ルール') && !four.includes('三麻ルール') && three.includes('三麻ルール') && !three.includes('四麻ルール'), JSON.stringify({ four, three }));
      await p.click('text=四人麻雀');
      const order = await homeNames(p);
      // 自分のルール（新しい順）→ プリセット。お気に入り（☆）は最初に
      const userFirst = order.indexOf('四麻ルール') < order.indexOf('古いルール') && order.indexOf('古いルール') < order.indexOf('例');
      check('B-02', '並び順：自分のルール（新しい順）→ プリセット', userFirst, JSON.stringify(order));
      await p.evaluate(() => toggleDefaultBaseRule('四麻', 'r4b'));
      await p.waitForTimeout(200);
      const favFirst = (await homeNames(p))[0] === '古いルール';
      await p.reload(); await p.waitForFunction(() => document.querySelector('#react-home-root h1'));
      const favKept = (await homeNames(p))[0] === '古いルール';
      await p.evaluate(() => toggleDefaultBaseRule('四麻', 'r4b'));
      check('B-03', '☆でお気に入りになり一番上に来て、再読み込み後も残る', favFirst && favKept, JSON.stringify({ favFirst, favKept }));
      await p.click('text=三人麻雀');
      await p.click('text=新しいルールを作成する');
      const mode = await p.evaluate(() => getRule(editingId).mode);
      check('B-04', '三麻のタブで新規作成すると三麻のルールになる', mode === '三麻', mode);
      await close(p);
    }
    {
      const p = await device({ rules: [mine('r1', '元ルール', { settings: Object.assign(JSON.parse(JSON.stringify(SETTINGS)), { user_cats: ['追加大項目'], custom_追加大項目: [{ id: 'i1', name: '追加項目', value: 'あり' }] }) })] });
      await open(p);
      await p.evaluate(() => duplicateRule('r1'));
      await p.evaluate(() => duplicateRule('r1'));  // 1秒以内の連続は無視（B-13）
      const rules = await stored(p);
      const copies = rules.filter(r => r.name.startsWith('元ルール（コピー'));
      const c = copies[0];
      check('B-05', 'コピーで「（コピー）」付きの名前で、大項目・項目の変更も複製される', c && c.name === '元ルール（コピー）' && c.settings.user_cats.includes('追加大項目') && c.settings['custom_追加大項目'][0].name === '追加項目', JSON.stringify(c && c.name));
      check('B-13', 'コピーを素早く2回押しても1つだけ複製される', copies.length === 1, 'copies=' + copies.length);
      await p.evaluate(() => askDelete('r1'));
      await p.click('#modal-delete button:has-text("キャンセル")');
      const kept = (await stored(p)).some(r => r.id === 'r1');
      await p.evaluate(() => askDelete('r1'));
      await p.click('#modal-delete button:has-text("削除")');
      await p.reload(); await p.waitForFunction(() => document.querySelector('#react-home-root h1'));
      const gone = !(await stored(p)).some(r => r.id === 'r1');
      check('B-06', '削除 → キャンセルでは消えない', kept, '');
      check('B-07', '削除すると消え、再読み込み後も消えている', gone, '');
      await close(p);
    }
    {
      const p = await device({ rules: [mine('base', '比較用'), mine('r1', '比べる側', { base_rule: 'base' })] });
      await open(p);
      await p.evaluate(() => { deleteTargetId = 'base'; confirmDelete(); editRule('r1'); });
      const br = await p.evaluate(() => getRule('r1').base_rule);
      const shown = await p.textContent('#standard-rule-display');
      check('B-08', '比較対象にしているルールを削除しても、比較対象が「-」に戻ってエラーが出ない', br === '' && shown === '-' && !p._errors.length, JSON.stringify({ br, shown, e: p._errors }));
      await p.evaluate(() => goHome());
      const presetDelete = await p.$$eval('#react-home-root [aria-label="削除"]', bs => bs.length);
      const userCount = (await stored(p)).filter(r => !r.id.startsWith('preset_')).length;
      check('B-09', 'プリセットには削除ボタンが出ない', presetDelete === userCount, JSON.stringify({ presetDelete, userCount }));
      await close(p);
    }
    {
      const nasty = '<b>太字</b> & "引用" \'記号\' 😀';
      const p = await device({ rules: [mine('r1', nasty)] });
      await open(p);
      const names = await homeNames(p);
      const bold = await p.$$eval('#react-home-root h2 b', b => b.length);
      await p.click(`#react-home-root div.cursor-pointer:has(h2:has-text("太字"))`, { position: { x: 20, y: 20 } });
      await p.waitForTimeout(300);
      const opened = await p.evaluate(() => editingId === 'r1' && isViewMode);
      check('B-10', '記号・絵文字を含むルール名が崩れず、HTMLとして解釈されない', names.includes(nasty) && bold === 0, JSON.stringify(names));
      check('B-12', 'ルールをタップすると表示画面が開く', opened, '');
      await close(p);
    }

    // ================= C. ルールの新規作成 =================
    {
      const p = await device();
      await open(p);
      await p.click('text=新しいルールを作成する');
      const initOk = await p.evaluate(() => Object.keys(getRule(editingId).settings).length > 10);
      await p.fill('#edit-name', '新規C');
      await p.click('#bottom-bar-content button');
      const home = await p.evaluate(() => document.getElementById('screen-home').classList.contains('active'));
      check('C-01', '新規作成で初期設定の値が入る', initOk, '');
      check('C-03', '名前を入れて保存すると、ホームに戻り一覧に出る', home && (await homeNames(p)).includes('新規C'), '');
      // C-04 何も変えずに戻る
      await p.click('text=新しいルールを作成する');
      await p.evaluate(() => goHomeWithConfirm());
      const c04 = (await stored(p)).filter(r => r.name === '新規ルール').length === 0 && !(await homeNames(p)).includes('新規ルール');
      check('C-04', '何も変えずに「戻る」と、ルールは作られない', c04, '');
      // C-05 変更して戻る → OK
      await p.click('text=新しいルールを作成する');
      await p.evaluate(k => onSettingChange(k, '5-15'), KEY);
      p._answers.push({ accept: true });
      await p.evaluate(() => goHomeWithConfirm());
      const c05 = !(await homeNames(p)).includes('新規ルール');
      check('C-05', '変更してから「戻る」→ OK で、ルールは作られない', c05, '');
      // C-06 変更して戻る → キャンセル
      await p.click('text=新しいルールを作成する');
      await p.evaluate(k => onSettingChange(k, '5-15'), KEY);
      p._answers.push({ accept: false });
      await p.evaluate(() => goHomeWithConfirm());
      const c06 = await p.evaluate(k => !isViewMode && document.getElementById('screen-edit').classList.contains('active') && getRule(editingId).settings[k] === '5-15', KEY);
      check('C-06', '変更してから「戻る」→ キャンセルで、編集画面のまま変更も残る', c06, '');
      // C-07 新規作成中に再読み込み
      await p.reload(); await p.waitForFunction(() => document.querySelector('#react-home-root h1'));
      check('C-07', '新規作成中にアプリを閉じても、保存していないルールは残らない', !(await stored(p)).some(r => r.name === '新規ルール'), '');
      // C-08 名前を空欄で保存
      await p.click('text=新しいルールを作成する');
      await p.fill('#edit-name', '');
      p._dialogs.length = 0;
      await p.click('#bottom-bar-content button');
      const c08 = p._dialogs.some(d => d.message.includes('ルール名を入力してください')) && await p.evaluate(() => !isViewMode);
      check('C-08', '名前を空欄にすると、警告が出て保存されない', c08, JSON.stringify(p._dialogs));
      await close(p);
    }
    {
      const p = await device({ rules: [mine('fav', 'お気に入り', { date: '2026/10/05 10:00:00', settings: Object.assign(JSON.parse(JSON.stringify(SETTINGS)), { [KEY]: '5-15' }) })], extra: { mahjong_default_base_4ma: JSON.stringify(['fav']) } });
      await open(p);
      // 初めて開いたときの初期設定でお気に入りが上書きされるため、開いた後に設定する
      await p.evaluate(() => localStorage.setItem('mahjong_default_base_4ma', JSON.stringify(['fav'])));
      await p.click('text=新しいルールを作成する');
      const v = await p.evaluate(k => getRule(editingId).settings[k], KEY);
      check('C-02', 'お気に入りがあると、その設定が新規作成の初期値になる', v === '5-15', v);
      await close(p);
    }

    // ================= D. ルール表示画面 =================
    {
      const s = JSON.parse(JSON.stringify(SETTINGS));
      s[KEY] = '';
      const p = await device({ rules: [mine('r1', '表示テスト', { settings: s, base_rule: 'preset_g0yy_4' })] });
      await open(p);
      await p.evaluate(() => editRule('r1'));
      const hiddenGone = !(await row(p, KEY));
      const nums = await p.$$eval('#edit-fields [data-cat-section] > h2', hs => hs.map(h => parseInt(h.textContent)));
      check('D-01', '表示画面では非表示の項目が出ず、大項目の番号が連番', hiddenGone && nums.every((n, i) => n === i + 1), JSON.stringify({ hiddenGone, nums: nums.slice(0, 5) }));
      const noTools = await p.evaluate(() => !document.querySelector('#edit-fields .swipe-actions') && !document.getElementById('edit-fields').textContent.includes('大項目の編集') && !document.querySelector('#edit-fields button'));
      check('D-08', '表示画面に、大項目の編集・追加ボタン・スワイプが出ない', noTools, '');
      const memoShown = await p.$$eval('#edit-fields [data-memo-key]', els => els.length);
      check('D-09', '特記事項が空の大項目では、表示画面に特記事項の枠が出ない', memoShown === 0, 'memo=' + memoShown);
      await p.evaluate(() => onBaseRuleChange('preset_qhs2_4'));
      await p.evaluate(() => { goHome(); editRule('r1'); });
      check('D-06', '表示画面で比較対象を変えると、次に開いたときも同じ比較対象', await p.evaluate(() => getRule('r1').base_rule === 'preset_qhs2_4'), '');
      await p.click('#bottom-bar-content button:has-text("編集")');
      check('D-03', '自分のルールで「編集」を押すと編集画面になる', await p.evaluate(() => !isViewMode), '');
      await p.evaluate(() => goHomeWithConfirm());
      await p.evaluate(() => goHomeWithConfirm());
      check('D-02', '「戻る」でホーム画面に戻る', await p.evaluate(() => document.getElementById('screen-home').classList.contains('active')), '');
      // D-05：コピーして編集（今は「編集」→ 確認 → コピーして編集）。保存せずに戻ると残らない
      await p.evaluate(() => editRule('preset_qhs2_4'));
      await p.click('#bottom-bar-content button:has-text("編集")');
      await p.click('#modal-copy-edit button:has-text("コピーして編集")');
      const baseIsSrc = await p.evaluate(() => getRule(editingId).base_rule === 'preset_qhs2_4');
      await p.evaluate(() => goHomeWithConfirm());
      const noCopy = !(await stored(p)).some(r => r.name === '雀魂（コピー）') && !(await homeNames(p)).includes('雀魂（コピー）');
      check('D-05', '「コピーして編集」で比較対象はコピー元。保存せずに戻るとコピーは残らない', baseIsSrc && noCopy, JSON.stringify({ baseIsSrc, noCopy }));
      await close(p);
    }

    // ================= E. 値の変更 =================
    {
      const p = await device({ rules: [mine('r1', '値テスト', { base_rule: 'preset_fpn_4' })] });
      await open(p);
      await p.evaluate(() => { editRule('r1'); goEditMode(); });
      await p.evaluate(([k, v]) => onSettingChange(k, v), [KEY, otherVal]);
      const e01 = (await rowClass(p, KEY) || '').includes('is-changed');
      check('E-01', '値を変えると、比較対象と違えば青くハイライトされる', e01, await rowClass(p, KEY));
      await p.evaluate(k => onSettingChange(k, ''), KEY);
      const e02edit = (await rowClass(p, KEY) || '').includes('is-hidden-item');
      // E-03 カスタム → 入力
      p._answers.push({ accept: true, text: '独自ウマ' });
      await p.evaluate(k => onSettingChange(k, 'カスタム'), KEY);
      await p.waitForTimeout(300);
      const e03 = await p.evaluate(k => getRule('r1').settings[k] === '独自ウマ' && getItemOptions(getRule('r1'), k).includes('独自ウマ'), KEY);
      check('E-03', '「カスタム」で入力した値が選択肢に足されて選ばれる', e03, '');
      // E-04 カスタム → キャンセル
      p._answers.push({ accept: false });
      await p.evaluate(k => onSettingChange(k, 'カスタム'), KEY);
      await p.waitForTimeout(300);
      check('E-04', '「カスタム」の入力をキャンセルすると、値は元のまま', await p.evaluate(k => getRule('r1').settings[k] === '独自ウマ', KEY), '');
      // E-06 途中流局
      await p.evaluate(() => onSettingChange('tochu_ryukyoku', 'なし'));
      const hiddenCat = await p.evaluate(() => ![...document.querySelectorAll('#edit-fields [data-cat-section] > h2')].some(h => h.textContent.includes('途中流局') && !h.textContent.includes('途中流局の')));
      await p.evaluate(() => onSettingChange('tochu_ryukyoku', 'あり'));
      const shownCat = await p.evaluate(() => [...document.querySelectorAll('#edit-fields [data-cat-section]')].some(s => s.dataset.catSection.includes('途中流局')));
      check('E-06', '途中流局を「なし」にすると大項目が隠れ、「あり」で戻る', hiddenCat && shownCat, JSON.stringify({ hiddenCat, shownCat }));
      // E-07 罰則の移動
      let e07 = true, e07d = 'no key';
      if (PENALTY_KEY) {
        await p.evaluate(k => onSettingChange(k, 'チョンボ'), PENALTY_KEY);
        e07d = await p.evaluate(k => { const el = document.querySelector(`.swipe-item[data-id="${k}"]`); return el ? el.dataset.catKey : null; }, PENALTY_KEY);
        e07 = e07d === 'チョンボ';
      }
      check('E-07', '罰則系の項目の値を「チョンボ」にすると、チョンボの大項目へ移る', e07, e07d);
      // E-09 名前の変更
      await p.fill('#edit-name', '値テスト改');
      await p.click('#bottom-bar-content button');
      await p.evaluate(() => goHome());
      check('E-09', 'ルール名を変えて保存すると、ホームに反映される', (await homeNames(p)).includes('値テスト改'), '');
      // E-02 の表示画面側
      await p.evaluate(k => { editRule('r1'); goEditMode(); onSettingChange(k, ''); saveAndGoView(); }, KEY);
      const e02view = !(await row(p, KEY));
      check('E-02', '「非表示」にすると灰色になり、表示画面には出ない', e02edit && e02view, JSON.stringify({ e02edit, e02view }));
      // E-10 比較対象を「-」にすると自動の青が消える（手動の強調は残る）
      await p.evaluate(([k, v]) => { goEditMode(); onSettingChange(k, v); }, [KEY, otherVal]);
      const someKey = await p.evaluate(() => [...document.querySelectorAll('#edit-fields .swipe-item[data-id]')].map(e => e.dataset.id).find(id => !id.startsWith('c:') && id !== 'uma'));
      await p.evaluate(() => onBaseRuleChange(''));
      await p.evaluate(k => toggleHighlight(k), someKey);
      const changed = await p.$$eval('#edit-fields .swipe-item.is-changed', els => els.map(e => e.dataset.id));
      check('E-10', '比較対象を「-」にすると自動の青が消え、手動の強調だけ残る', changed.length === 1 && changed[0] === someKey, JSON.stringify(changed));
      await close(p);
    }

    // ================= F. 小項目 =================
    {
      const p = await device({ rules: [mine('r1', '項目テスト', { base_rule: 'preset_fpn_4' })] });
      await open(p);
      await p.evaluate(() => { editRule('r1'); goEditMode(); });
      const swipeButtons = await p.$eval(`#edit-fields .swipe-item[data-id="${KEY}"] .swipe-actions`, el => [...el.querySelectorAll('button')].map(b => b.textContent.replace(/\w+_\w+|ink_highlighter|edit|delete/g, '').trim()));
      check('F-01', '項目に「強調・編集・削除」の3つのボタンがある', swipeButtons.join() === '強調,編集,削除' || swipeButtons.join() === '強調解除,編集,削除', JSON.stringify(swipeButtons));
      await p.evaluate(k => removeSettingKey(k), KEY);
      const goneEdit = !(await row(p, KEY));
      await p.evaluate(() => { saveAndGoView(); });
      const goneView = !(await row(p, KEY));
      check('F-04', '「削除」で項目が消え、表示画面にも出ない', goneEdit && goneView, '');
      await p.evaluate(() => goEditMode());
      // F-05 名前の変更（編集のシート）
      const k2 = await p.evaluate(() => [...document.querySelectorAll('#edit-fields .swipe-item[data-id]')].map(e => e.dataset.id).find(id => !id.startsWith('c:')));
      await p.evaluate(k => showEditOptionsDialog(k), k2);
      await p.fill('#item-label-input', '新しい名前');
      await p.press('#item-label-input', 'Enter');
      await p.waitForTimeout(200);
      const title = await p.textContent('#item-dialog-title');
      const sheetOpen = !!(await p.$('#edit-options-overlay'));
      const label = await p.evaluate(k => itemLabel(getRule('r1').settings, k), k2);
      check('F-05', '「編集」で項目名を変えると、名前とシートの見出しが変わり、シートは開いたまま', title === '新しい名前' && sheetOpen && label === '新しい名前', JSON.stringify({ title, sheetOpen, label }));
      // F-08 同じ名前の選択肢
      const opts = await p.evaluate(k => getItemOptions(getRule('r1'), k), k2);
      if (opts.length >= 1) {
        p._dialogs.length = 0;
        await p.fill('#option-add-input', opts[0]);
        await p.evaluate(k => addOptionFromDialog(k), k2);
        check('F-08', '同じ名前の選択肢を足そうとすると「すでにあります」と出る', p._dialogs.some(d => d.message.includes('すでにあります')), JSON.stringify(p._dialogs));
      }
      // F-20 追加
      await p.fill('#option-add-input', '新しい選択肢');
      await p.evaluate(k => addOptionFromDialog(k), k2);
      const f20 = await p.evaluate(k => getItemOptions(getRule('r1'), k).includes('新しい選択肢') && document.getElementById('option-add-input').value === '', k2);
      check('F-20', '追加欄で追加すると選択肢に加わり、追加欄が空になる', f20, '');
      // F-09 閉じる
      await p.click('#edit-options-overlay .sheet-done');
      check('F-09', '「完了」でシートが閉じる', !(await p.$('#edit-options-overlay')), '');
      // F-10 新しい項目を追加
      p._answers.push({ accept: true, text: '追加した項目' }, { accept: true, text: '値A' });
      await p.evaluate(c => addCustomPenaltyWithPrompt(c), CAT0);
      const f10 = await p.evaluate(c => { const sec = document.querySelector(`[data-cat-section="${c}"]`); const items = [...sec.querySelectorAll('.swipe-item .item-label')].map(e => e.textContent.trim()); return items[items.length - 1]; }, CAT0);
      check('F-10', '「新しい項目を追加」で、大項目の最後に追加される', f10 === '追加した項目', f10);
      // F-11 キャンセル
      const before = await p.evaluate(c => (getRule('r1').settings['custom_' + c] || []).length, CAT0);
      p._answers.push({ accept: false });
      await p.evaluate(c => addCustomPenaltyWithPrompt(c), CAT0);
      p._answers.push({ accept: true, text: '名前だけ' }, { accept: true, text: '' });
      await p.evaluate(c => addCustomPenaltyWithPrompt(c), CAT0);
      const after = await p.evaluate(c => (getRule('r1').settings['custom_' + c] || []).length, CAT0);
      check('F-11', '名前や値の入力をキャンセル・空欄にすると、追加されない', before === after, JSON.stringify({ before, after }));
      // F-14 記号・絵文字
      p._answers.push({ accept: true, text: '<img src=x onerror=alert(1)>&"\'😀' }, { accept: true, text: '<b>値</b>' });
      await p.evaluate(c => addCustomPenaltyWithPrompt(c), CAT0);
      const f14 = await p.evaluate(() => !document.querySelector('#edit-fields img') && !document.querySelector('#edit-fields .item-label b') && document.getElementById('edit-fields').textContent.includes('<b>値</b>'));
      check('F-14', '項目名・値の記号や絵文字がHTMLとして解釈されない', f14 && !p._dialogs.some(d => d.message === '1'), '');
      // F-15 同じ名前の追加項目
      p._answers.push({ accept: true, text: '同名' }, { accept: true, text: 'X' }, { accept: true, text: '同名' }, { accept: true, text: 'Y' });
      await p.evaluate(c => { addCustomPenaltyWithPrompt(c); addCustomPenaltyWithPrompt(c); }, CAT0);
      const ids = await p.evaluate(c => getRule('r1').settings['custom_' + c].filter(x => x.name === '同名').map(x => 'c:' + x.id), CAT0);
      const idx = await p.evaluate(c => getRule('r1').settings['custom_' + c].findIndex(x => x.name === '同名'), CAT0);
      await p.evaluate(([c, i]) => toggleCustomHighlight(c, i), [CAT0, idx]);
      const cls = await Promise.all(ids.map(id => rowClass(p, id)));
      const f15 = ids.length === 2 && cls[0].includes('is-changed') !== cls[1].includes('is-changed');
      check('F-15', '同じ名前の追加項目が2つあっても、強調は片方だけに効く', f15, JSON.stringify({ ids, cls }));
      await close(p);
    }

    // ================= G. 大項目 =================
    {
      const p = await device({ rules: [mine('r1', '大項目テスト')] });
      await open(p);
      await p.evaluate(() => { editRule('r1'); goEditMode(); openCategoryManager(); });
      p._answers.push({ accept: true, text: '新大項目' });
      await p.evaluate(() => addCategory());
      const last = await p.$$eval('#cat-manager-list .cat-manager-row', rs => rs[rs.length - 1].dataset.catKey);
      p._dialogs.length = 0;
      p._answers.push({ accept: true, text: '新大項目' });
      await p.evaluate(() => addCategory());
      const dupRejected = p._dialogs.some(d => d.message.includes('すでにあります'));
      check('G-01', '大項目を追加すると最後に入り、重複は拒否される', last === '新大項目' && dupRejected, JSON.stringify({ last, dupRejected }));
      // G-03・G-04 既存の大項目を削除 → キャンセル／OK → 元に戻す
      const target = await p.evaluate(() => catKeyOf(getRuleCategories(getRule('r1'))[0]));
      p._answers.push({ accept: false });
      await p.evaluate(k => deleteCategory(k), target);
      const keptCat = await p.evaluate(k => !(getRule('r1').settings.deleted_cats || []).includes(k), target);
      p._answers.push({ accept: true });
      await p.evaluate(k => deleteCategory(k), target);
      const deletedCat = await p.evaluate(k => (getRule('r1').settings.deleted_cats || []).includes(k), target);
      await p.evaluate(k => restoreCategory(k), target);
      const restored = await p.evaluate(k => !(getRule('r1').settings.deleted_cats || []).includes(k) && catKeyOf(getRuleCategories(getRule('r1'))[0]) === k, target);
      check('G-03', '大項目の削除：キャンセルでは残り、OKで削除される', keptCat && deletedCat, JSON.stringify({ keptCat, deletedCat }));
      check('G-04', '「元に戻す」で元の位置に戻る', restored, '');
      // G-05 名前の変更
      p._answers.push({ accept: true, text: '改名した大項目' });
      await p.evaluate(k => renameCategory(k), target);
      const renamed = await p.evaluate(k => catDisplayName(getRule('r1'), getRuleCategories(getRule('r1')).find(c => catKeyOf(c) === k)), target);
      check('G-05', '大項目の名前を変えられる', renamed === '改名した大項目', renamed);
      // G-07 罰則系は削除・名前変更のボタンがない
      const locked = await p.$$eval('#cat-manager-list .cat-manager-row', rs => rs.filter(r => ['チョンボ', '上がり放棄', '軽罰符', 'ノーペナルティ'].includes(r.dataset.catKey)).map(r => !r.querySelector('[aria-label="削除"]') && !r.querySelector('[aria-label="名前を変更"]')));
      check('G-07', '罰則系4つの大項目は、削除・名前変更ができない', locked.length === 4 && locked.every(Boolean), JSON.stringify(locked));
      // G-08 完了で閉じる
      await p.evaluate(() => closeCategoryManager());
      check('G-08', '「完了」でポップアップが閉じ、編集画面に反映される', !(await p.$('#cat-manager-overlay')) && await p.evaluate(() => !!document.querySelector('[data-cat-section="新大項目"]')), '');
      // G-12 保存せずに戻る → 大項目の変更が元に戻る
      p._answers.push({ accept: true });
      await p.evaluate(() => goHomeWithConfirm());
      const reverted = await p.evaluate(() => !(getRule('r1').settings.user_cats || []).includes('新大項目') && !(getRule('r1').settings.cat_names || {})[catKeyOf(getRuleCategories(getRule('r1'))[0])]);
      check('G-12', '大項目を変えた後に「保存せずに戻る」と、すべて元に戻る', reverted, '');
      await close(p);
    }

    // ================= H. ハイライト =================
    {
      const s = JSON.parse(JSON.stringify(SETTINGS));
      s[KEY] = otherVal;
      const p = await device({ rules: [mine('r1', '強調テスト', { settings: s, base_rule: 'preset_fpn_4' })] });
      await open(p);
      await p.evaluate(() => { editRule('r1'); goEditMode(); });
      check('H-01', '比較対象と値が違う項目は青い', (await rowClass(p, KEY) || '').includes('is-changed'), '');
      await p.evaluate(k => toggleHighlight(k), KEY);
      const offOnA = !(await rowClass(p, KEY)).includes('is-changed');
      await p.evaluate(() => onBaseRuleChange('preset_qhs2_4'));
      const onB = (await rowClass(p, KEY)).includes('is-changed') === await p.evaluate(k => isItemDiff(getRule('r1').settings, getRule('preset_qhs2_4').settings, k, getRule('r1').settings[k]), KEY);
      await p.evaluate(() => onBaseRuleChange('preset_fpn_4'));
      const stillOffOnA = !(await rowClass(p, KEY)).includes('is-changed');
      check('H-02', '「強調解除」は比較対象ごとに別々に保存される', offOnA && onB && stillOffOnA, JSON.stringify({ offOnA, onB, stillOffOnA }));
      // H-05・H-06 特記事項
      await p.evaluate(c => onSettingChange('memo_' + c, '特別ルール'), CAT0);
      const autoOn = await p.evaluate(c => !!getRule('r1').settings[memoDiffSettingKey('preset_fpn_4', c)], CAT0);
      const memoBlue = await p.$eval(`[data-memo-key="${CAT0}"]`, el => el.classList.contains('bg-theme-highlightBg'));
      check('H-06', '特記事項を書き換えると、差分表示が自動でONになる', autoOn && memoBlue, '');
      await p.evaluate(c => onMemoDiffToggle(c, false), CAT0);
      const offNow = await p.$eval(`[data-memo-key="${CAT0}"]`, el => !el.classList.contains('bg-theme-highlightBg'));
      await p.evaluate(() => onBaseRuleChange('preset_qhs2_4'));
      const otherBase = await p.evaluate(c => !getRule('r1').settings[memoDiffSettingKey('preset_qhs2_4', c)], CAT0);
      check('H-05', '特記事項の「差分として表示」は比較対象ごとに記憶する', offNow && otherBase, '');
      await close(p);
    }

    // ================= I. 保存・破棄 =================
    {
      const p = await device({ rules: [mine('r1', '保存テスト')] });
      await open(p);
      await p.evaluate(() => { editRule('r1'); goEditMode(); });
      const dateBefore = await p.evaluate(() => getRule('r1').date);
      await p.evaluate(([k, v]) => onSettingChange(k, v), [KEY, otherVal]);
      await p.click('#bottom-bar-content button');
      await p.click('#bottom-bar-content button:has-text("編集")').catch(() => {});
      await p.evaluate(() => goViewMode());
      await p.reload(); await p.waitForFunction(() => document.querySelector('#react-home-root h1'));
      const r = (await stored(p)).find(x => x.id === 'r1');
      check('I-01', '編集して保存すると、変更が残る（再読み込み後も）', r.settings[KEY] === otherVal, r.settings[KEY]);
      check('I-05', '保存すると更新日時が新しくなる', r.date !== dateBefore, JSON.stringify([dateBefore, r.date]));
      // I-02 保存せずに戻る
      await p.evaluate(() => { editRule('r1'); goEditMode(); });
      await p.evaluate(() => { onSettingChange('uma', '5-15'); onNameChange('変えた名前'); toggleHighlight('uma'); });
      p._answers.push({ accept: true });
      await p.evaluate(() => goHomeWithConfirm());
      const r2 = await p.evaluate(() => getRule('r1'));
      check('I-02', '「保存せずに戻る」で、値・名前・ハイライトが編集前に戻る', r2.settings.uma === otherVal && r2.name === '保存テスト' && !JSON.stringify(r2.settings.highlight_overrides || {}).includes('uma'), JSON.stringify({ uma: r2.settings.uma, name: r2.name }));
      // I-03 編集中に再読み込み
      await p.evaluate(() => { goEditMode(); onSettingChange('uma', '5-15'); });
      await p.reload(); await p.waitForFunction(() => document.querySelector('#react-home-root h1'));
      check('I-03', '編集中に保存せずアプリを閉じると、編集前の状態が残る', (await stored(p)).find(x => x.id === 'r1').settings.uma === otherVal, '');
      // I-04 保存の連打
      await p.evaluate(() => { editRule('r1'); goEditMode(); onSettingChange('uma', '5-15'); });
      await p.evaluate(() => { const b = document.querySelector('#bottom-bar-content button'); b.click(); b.click(); });
      await p.waitForTimeout(300);
      check('I-04', '保存ボタンを連打しても、エラーにならない', !p._errors.length && (await stored(p)).filter(x => x.id === 'r1').length === 1, JSON.stringify(p._errors));
      await close(p);
    }

    // ================= J. スクロール位置（J-04） =================
    {
      const p = await device({ rules: [mine('r1', 'スクロール')] });
      await open(p);
      await p.evaluate(() => { editRule('r1'); window.scrollTo(0, 800); goHome(); editRule('r1'); });
      const y1 = await p.evaluate(() => window.scrollY);
      await p.evaluate(() => { goHome(); createRule('四麻'); });
      const y2 = await p.evaluate(() => window.scrollY);
      check('J-04', '新規作成・ホームから開いたときは一番上から表示', y1 === 0 && y2 === 0, JSON.stringify({ y1, y2 }));
      await close(p);
    }

    // ================= K. 共有（旧形式のURLで、Firestoreを使わずに確かめる） =================
    {
      const p = await device({ rules: [mine('r1', '手元のルール')] });
      await open(p);
      const s = JSON.parse(JSON.stringify(SETTINGS)); s[KEY] = otherVal;
      const bs = JSON.parse(JSON.stringify(SETTINGS));
      const share = await p.evaluate(([s, bs]) => LZString.compressToEncodedURIComponent(JSON.stringify({ m: '四麻', n: '共有されたルール', b: 'someone_base', bn: '相手の比較対象', bs, s, o: 'origin1' })), [s, bs]);
      await p.goto(`http://localhost:${PORT}${APP}?v=${VERSION}&share=${share}`);
      await p.waitForFunction(() => typeof isSharedMode !== 'undefined' && isSharedMode, null, { timeout: 30000 });
      await p.waitForTimeout(300);
      const k03 = await p.evaluate(k => document.getElementById('standard-rule-display').textContent === '相手の比較対象' && document.querySelector(`.swipe-item[data-id="${k}"]`).className.includes('is-changed'), KEY);
      check('K-03', '共有URLを開いた側に比較対象がなくても、共有データの比較対象で差分が出る', k03, '');
      check('H-07', '共有されたルールを、共有元の比較対象との差分で表示する', k03, '');
      // K-05 コピーして編集 → 保存せずに戻る
      const sharedId = await p.evaluate(() => editingId);
      await p.click('#bottom-bar-content button:has-text("編集")');
      await p.click('#modal-copy-edit button:has-text("コピーして編集")');
      await p.evaluate(() => goHomeWithConfirm());
      const k05 = !(await homeNames(p)).some(n => n.includes('共有されたルール'));
      check('K-05', '共有ルールで「コピーして編集」→ 保存せず戻ると、何も残らない', k05, JSON.stringify(await homeNames(p)));
      check('K-06', '共有ルールを見てから戻ると、共有ルールは一覧に残らない', k05 && !(await stored(p)).some(r => r.id === sharedId), '');
      // K-04 コピーして編集 → 保存
      await p.goto(`http://localhost:${PORT}${APP}?v=${VERSION}&share=${share}`);
      await p.waitForFunction(() => typeof isSharedMode !== 'undefined' && isSharedMode, null, { timeout: 30000 });
      await p.click('#bottom-bar-content button:has-text("編集")');
      await p.click('#modal-copy-edit button:has-text("コピーして編集")');
      await p.click('#bottom-bar-content button');
      const k04 = (await stored(p)).some(r => r.name === '共有されたルール（コピー）' && !r.readonly);
      check('K-04', '共有ルールで「コピーして編集」→ 保存すると、自分のルールになる', k04, '');
      await close(p);
    }

    // ================= L. 出力（中身） =================
    {
      const s = JSON.parse(JSON.stringify(SETTINGS));
      s[`memo_${CAT0}`] = '出力用の特記事項';
      s[`custom_${CAT0}`] = [{ id: 'x1', name: '出力用の追加項目', value: 'あり' }];
      const p = await device({ rules: [mine('r1', '出力テスト', { settings: s, verLabel: '3.0' })] });
      await open(p);
      await p.evaluate(() => {
        window.__img = null; window.__pdf = null;
        window.html2canvas = async (el) => { window.__img = el.innerHTML; const c = document.createElement('canvas'); c.width = c.height = 4; return c; };
        window.html2pdf = () => { const o = { set() { return o; }, from(el) { window.__pdf = el.innerHTML; return o; }, save() { return Promise.resolve(); }, output() { return Promise.resolve(new Blob()); } }; return o; };
      });
      await p.evaluate(() => { editRule('r1'); exportImage(); });
      await p.waitForFunction(() => window.__img, null, { timeout: 10000 }).catch(() => {});
      await p.evaluate(() => exportPDF());
      await p.waitForFunction(() => window.__pdf, null, { timeout: 10000 }).catch(() => {});
      const out = await p.evaluate(() => ({ img: window.__img || '', pdf: window.__pdf || '' }));
      const has = h => ['出力テスト', 'ver3.0', '出力用の特記事項', '出力用の追加項目'].every(t => h.includes(t));
      check('L-02', '画像に、ルール名・ver・追加項目・特記事項が入る', has(out.img), '');
      check('L-01', 'PDFに、ルール名・ver・追加項目・特記事項が入る', has(out.pdf), '');
      // L-06 プリセットから出力
      await p.evaluate(() => { window.__img = null; goHome(); editRule('preset_qhs2_4'); exportImage(); });
      await p.waitForFunction(() => window.__img, null, { timeout: 10000 }).catch(() => {});
      check('L-06', 'プリセットからも出力できる', await p.evaluate(() => !!window.__img) && !p._errors.length, JSON.stringify(p._errors));
      await close(p);
    }

    // ================= N. 三人麻雀 =================
    {
      const p = await device({ rules: [Object.assign(mine('r3', '三麻A'), { mode: '三麻', settings: {} }), mine('r4', '四麻A')] });
      await open(p);
      await p.evaluate(() => editRule('r3'));
      const opts = await p.$$eval('#base-rule-select option', os => os.map(o => o.textContent));
      const only3 = !opts.includes('四麻A') && !opts.includes('雀魂');
      check('N-02', '三麻のルールの比較対象には、三麻のルールだけが出る', only3, JSON.stringify(opts));
      await close(p);
    }

    // ================= O. 画面幅 =================
    {
      for (const w of [320, 768]) {
        const p = await device({ rules: [mine('r1', 'とても長いルール名がここに入ってもはみ出さないかを確かめるためのルール')], context: { viewport: { width: w, height: 700 } } });
        await open(p);
        const home = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
        await p.evaluate(() => { editRule('r1'); goEditMode(); });
        const edit = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
        check('O-05', `画面幅${w}pxで、ホーム・編集画面に横スクロールが出ない`, home && edit, JSON.stringify({ home, edit }));
        await close(p);
      }
    }

    // ================= P. メタ情報 =================
    {
      const p = await device();
      await open(p);
      const meta = await p.evaluate(() => ({
        title: document.title,
        desc: (document.querySelector('meta[name="description"]') || {}).content || '',
        // 画面に見える文字にJanRuleが残っていないこと（検索用の別名 alternateName には意図して入れている）
        janrule: document.body.innerText.includes('JanRule') || document.title.includes('JanRule'),
        ld: (() => { try { return [...document.querySelectorAll('script[type="application/ld+json"]')].every(s => JSON.parse(s.textContent)); } catch (e) { return false; } })(),
        gsv: !!document.querySelector('meta[name="google-site-verification"]'),
      }));
      check('P-01', 'タイトル・説明文が「雀カルテ」で、JanRuleが残っていない', meta.title.includes('雀カルテ') && !meta.janrule, JSON.stringify(meta));
      check('P-02', '構造化データ（JSON-LD）が正しいJSON', meta.ld, '');
      check('P-03', 'Search Console の所有権確認タグがある', meta.gsv, '');
      await close(p);
    }

    // ================= Q. 異常系 =================
    {
      const p = await device({ rules: [mine('r1', '容量テスト')] });
      await open(p);
      await p.evaluate(() => { editRule('r1'); goEditMode(); onNameChange('容量テスト改'); });
      await p.evaluate(() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'mahjong_rules_pwa_v1') throw new Error('QuotaExceeded'); return orig.call(this, k, v); }; });
      p._dialogs.length = 0;
      await p.click('#bottom-bar-content button');
      const q02 = p._dialogs.some(d => d.message.includes('保存容量')) && await p.evaluate(() => !isViewMode);
      check('Q-02', '保存容量がいっぱいのときは警告が出て、編集画面のまま', q02, JSON.stringify(p._dialogs));
      await close(p);
    }
  } finally {
    await browser.close();
    server.close();
  }
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length} 件成功 / ${bad.length} 件失敗`);
  fs.writeFileSync(path.join(__dirname, 'last_result_regression.json'), JSON.stringify({ at: new Date().toISOString(), app: APP, results }, null, 2));
  process.exitCode = bad.length ? 1 : 0;
}

run().catch(e => { console.error(e); process.exitCode = 1; });
