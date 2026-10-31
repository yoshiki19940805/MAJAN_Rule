// ver管理 1回目：Firestoreのルール（firestore.rules）のテスト。Firestoreエミュレーターで流す。
// 使い方は tests/ver/README.md を参照。
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, deleteDoc } = require('firebase/firestore');

const results = [];
function check(id, name, ok, detail) {
  results.push({ id, name, ok: !!ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${ok ? '' : '  → ' + (detail || '')}`);
}
async function ok(p) { try { await assertSucceeds(p); return true; } catch (e) { return false; } }
async function ng(p) { try { await assertFails(p); return true; } catch (e) { return false; } }

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'majan-rule',
    firestore: { rules: fs.readFileSync(path.resolve(__dirname, '..', '..', 'firestore.rules'), 'utf8'), host: 'localhost', port: 8080 },
  });
  try {
    await env.clearFirestore();
    const alice = env.authenticatedContext('alice').firestore();
    const bob = env.authenticatedContext('bob').firestore();
    const anon = env.unauthenticatedContext().firestore();

    for (const col of ['rule_ext', 'deleted_rules']) {
      const own = [
        await ok(setDoc(doc(alice, `users/alice/${col}/r1`), { verLabel: '1.0' })),
        await ok(getDoc(doc(alice, `users/alice/${col}/r1`))),
        await ok(deleteDoc(doc(alice, `users/alice/${col}/r1`))),
      ];
      await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), `users/alice/${col}/r2`), { verLabel: '1.0' }));
      const others = [
        await ng(getDoc(doc(bob, `users/alice/${col}/r2`))),
        await ng(setDoc(doc(bob, `users/alice/${col}/r3`), { x: 1 })),
        await ng(getDoc(doc(anon, `users/alice/${col}/r2`))),
        await ng(setDoc(doc(anon, `users/alice/${col}/r3`), { x: 1 })),
      ];
      check('R1-' + col, `${col}：本人だけが読み書きでき、ほかの人・ログインしていない人はできない`, own.every(Boolean) && others.every(Boolean), JSON.stringify({ own, others }));
    }
    // 今までの場所が変わっていないこと
    const rulesOwn = await ok(setDoc(doc(alice, 'users/alice/rules/r1'), { name: 'a' }));
    const rulesOther = await ng(getDoc(doc(bob, 'users/alice/rules/r1')));
    const sharedCreate = await ok(setDoc(doc(anon, 'shared_rules/ABCDEFGH'), { data: '{}', createdAt: new Date() }));
    const sharedUpdate = await ng(setDoc(doc(anon, 'shared_rules/ABCDEFGH'), { data: '{"x":1}', createdAt: new Date() }));
    const otherCol = await ng(setDoc(doc(alice, 'something/x'), { a: 1 }));
    check('R1-今まで', 'クラウド同期・固定のリンクの作成は今までどおりで、ほかの場所は書き込めない', rulesOwn && rulesOther && sharedCreate && sharedUpdate && otherCol,
      JSON.stringify({ rulesOwn, rulesOther, sharedCreate, sharedUpdate, otherCol }));
  } finally {
    await env.cleanup();
  }
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length} 件成功 / ${bad.length} 件失敗`);
  fs.writeFileSync(path.join(__dirname, 'last_result_rules_phase1.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  process.exitCode = bad.length ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
