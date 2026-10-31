// ver管理 1回目：クラウド同期（rule_ext・merge・deleted_rules）のテスト。
// Firestore・Authのエミュレーターと、ヘッドレスブラウザで流す。アプリは ?emu=1 でエミュレーターにつなぐ。
// 使い方は tests/ver/README.md を参照。
const path = require('path');
const http = require('http');
const fs = require('fs');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require(path.join(process.env.HOME, 'node_modules', 'playwright'))); }

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8890 + Math.floor(Math.random() * 100);
const STORAGE_KEY = 'mahjong_rules_pwa_v1';
const FS_EMU = 'http://localhost:8080';
const PROJECT = 'majan-rule';
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
// 途中で止まったときにどこか分かるよう、手順ごとに表示する（VERBOSE=1 のとき）
const step = (msg) => { if (process.env.VERBOSE) console.log('  …' + msg); };
function check(id, name, ok, detail) {
  results.push({ id, name, ok: !!ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${ok ? '' : '  → ' + (detail || '')}`);
}

// エミュレーターのデータを消す・管理者として読む（Firestoreのルールを通さない）
async function clearFirestore() {
  step('エミュレーターのデータを消す');
  await fetch(`${FS_EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}
async function listDocs(colPath) {
  const res = await fetch(`${FS_EMU}/v1/projects/${PROJECT}/databases/(default)/documents/${colPath}`, { headers: { Authorization: 'Bearer owner' } });
  const j = await res.json();
  return (j.documents || []).map(d => ({ id: d.name.split('/').pop(), fields: d.fields }));
}

function ownRule(id, name, extra) {
  return Object.assign({ id, mode: '四麻', name, base_rule: '', date: '2026/10/01 10:00:00', settings: { uma: '10-30' } }, extra || {});
}

// 1つの端末（ブラウザのデータが別）
async function device(browser, rules) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page._errors = [];
  page.on('pageerror', e => page._errors.push(e.message));
  await page.addInitScript(([key, rules]) => {
    if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('__seeded', '1');
    localStorage.setItem(key, JSON.stringify({ rules }));
    localStorage.setItem('mahjong_notice_ver1', '1');
  }, [STORAGE_KEY, rules || []]);
  return page;
}
async function open(page) {
  step('アプリを開く');
  await page.goto(`http://localhost:${PORT}/src/index.html?v=${VERSION}&emu=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window._renderReactHome && document.querySelector('#react-home-root h1'), null, { timeout: 30000 });
}
// エミュレーターのGoogleログイン（同じ sub なら同じアカウント）
async function login(page, sub) {
  step('ログイン ' + sub);
  await page.evaluate(async (sub) => {
    const cred = firebase.auth.GoogleAuthProvider.credential(JSON.stringify({ sub, email: sub + '@example.com', email_verified: true }));
    await fbAuth.signInWithCredential(cred);
  }, sub);
  await page.waitForFunction(() => window._fbUser && _fbUid, null, { timeout: 15000 });
  await page.waitForTimeout(1500);  // ログイン後のマージが終わるまで
}
const localRules = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)).rules.filter(r => !r.id.startsWith('preset_')), STORAGE_KEY);

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    // ---- 足した項目（verLabel）が rule_ext に保存され、別の端末に届く ----
    {
      await clearFirestore();
      const a = await device(browser, [ownRule('r1', '通常ルール', { verLabel: '2025秋' })]);
      await open(a); await login(a, 'user1');
      await a.evaluate(() => syncRulesToCloud());
      await a.waitForTimeout(1000);
      const ext = await listDocs('users/' + (await a.evaluate(() => _fbUid)) + '/rule_ext');
      const b = await device(browser, []);
      await open(b); await login(b, 'user1');
      const onB = (await localRules(b)).find(r => r.id === 'r1');
      const ok = ext.some(d => d.id === 'r1' && d.fields.verLabel.stringValue === '2025秋') && onB && onB.verLabel === '2025秋';
      check('S-01', 'verが rule_ext に保存され、同じアカウントの別の端末に届く', ok, JSON.stringify({ ext: ext.map(d => d.id), onB: onB && onB.verLabel }));
      await a.context().close(); await b.context().close();
    }

    // ---- V-90 ログインしてスマホで削除し、PCで同期 ----
    {
      await clearFirestore();
      const phone = await device(browser, [ownRule('r1', '消すルール', { verLabel: '1.0' }), ownRule('r2', '残すルール', { verLabel: '1.0' })]);
      await open(phone); await login(phone, 'user2');
      await phone.evaluate(() => syncRulesToCloud());
      await phone.waitForTimeout(1000);
      const pc = await device(browser, []);
      await open(pc); await login(pc, 'user2');
      const pcHadIt = (await localRules(pc)).some(r => r.id === 'r1');
      // スマホで削除
      await phone.evaluate(() => { deleteTargetId = 'r1'; confirmDelete(); });
      await phone.waitForTimeout(1500);
      const uid = await phone.evaluate(() => _fbUid);
      // PCで同期（開き直す）→ PCからも消え、PCの同期でクラウドに戻らない
      await open(pc); await pc.waitForTimeout(2500);
      await pc.evaluate(() => syncRulesToCloud());
      await pc.waitForTimeout(1000);
      const pcRules = await localRules(pc);
      const cloud = await listDocs(`users/${uid}/rules`);
      const deleted = await listDocs(`users/${uid}/deleted_rules`);
      const ok = pcHadIt && !pcRules.some(r => r.id === 'r1') && pcRules.some(r => r.id === 'r2')
        && !cloud.some(d => d.id === 'r1') && deleted.some(d => d.id === 'r1');
      check('V-90', 'スマホで削除すると、同じアカウントのPCの同期でPCからも消え、クラウドにも戻らない', ok,
        JSON.stringify({ pcHadIt, pc: pcRules.map(r => r.id), cloud: cloud.map(d => d.id), deleted: deleted.map(d => d.id) }));
      await phone.context().close(); await pc.context().close();
    }

    // ---- V-91 ログアウト中に削除して、その後ログイン ----
    {
      await clearFirestore();
      const p = await device(browser, [ownRule('r1', '消すルール', { verLabel: '1.0' })]);
      await open(p); await login(p, 'user3');
      await p.evaluate(() => syncRulesToCloud());
      await p.waitForTimeout(1000);
      const uid = await p.evaluate(() => _fbUid);
      await p.evaluate(() => fbAuth.signOut());
      await p.waitForTimeout(800);
      await p.evaluate(() => { deleteTargetId = 'r1'; confirmDelete(); });
      const pending = await p.evaluate(() => JSON.parse(localStorage.getItem('mahjong_pending_cloud_deletes') || '[]'));
      await login(p, 'user3');
      await p.waitForTimeout(1500);
      const back = (await localRules(p)).some(r => r.id === 'r1');
      const cloud = await listDocs(`users/${uid}/rules`);
      const pendingAfter = await p.evaluate(() => JSON.parse(localStorage.getItem('mahjong_pending_cloud_deletes') || '[]'));
      const ok = pending.length === 1 && !back && !cloud.some(d => d.id === 'r1') && pendingAfter.length === 0;
      check('V-91', 'ログアウト中に削除したルールは、ログインしても戻らず、クラウドからも消える', ok,
        JSON.stringify({ pending, back, cloud: cloud.map(d => d.id), pendingAfter }));
      await p.context().close();
    }

    // ---- 別のアカウントでログインしたときは、前のアカウントのルールを消さない ----
    {
      await clearFirestore();
      const p = await device(browser, [ownRule('r1', 'Aさんのルール', { verLabel: '1.0' })]);
      await open(p); await login(p, 'userA');
      await p.evaluate(() => syncRulesToCloud());
      await p.waitForTimeout(1000);
      const uidA = await p.evaluate(() => _fbUid);
      await p.evaluate(() => fbAuth.signOut());
      await p.waitForTimeout(800);
      await p.evaluate(() => { deleteTargetId = 'r1'; confirmDelete(); });
      await login(p, 'userB');
      await p.waitForTimeout(1500);
      const cloudA = await listDocs(`users/${uidA}/rules`);
      const pending = await p.evaluate(() => JSON.parse(localStorage.getItem('mahjong_pending_cloud_deletes') || '[]'));
      const ok = cloudA.some(d => d.id === 'r1') && pending.length === 1;
      check('S-02', '別のアカウントでログインしたときは、前のアカウントのクラウドから消さない（削除待ちに残る）', ok, JSON.stringify({ cloudA: cloudA.map(d => d.id), pending }));
      await p.context().close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length} 件成功 / ${bad.length} 件失敗`);
  fs.writeFileSync(path.join(__dirname, 'last_result_sync_phase1.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  process.exitCode = bad.length ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; })
  // 終わった後に通信などが残ってプロセスが抜けないことがあるので、結果を書いたら強制的に終える
  .finally(() => setTimeout(() => process.exit(process.exitCode || 0), 1000));
