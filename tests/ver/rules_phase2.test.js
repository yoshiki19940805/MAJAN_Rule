// ver管理 段階2・3：Firestoreのルール（シリーズ・パスワード・公開の記録・比較対象・強調）のテスト。
// Firestoreエミュレーターで流す。使い方は tests/ver/README.md を参照。
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, deleteDoc, writeBatch, serverTimestamp } = require('firebase/firestore');

const results = [];
function check(id, name, ok, detail) {
  results.push({ id, name, ok: !!ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${ok ? '' : '  → ' + (detail || '')}`);
}
async function ok(p) { try { await assertSucceeds(p); return true; } catch (e) { return 'NG: ' + e.message.split('\n')[0]; } }
async function ng(p) { try { await assertFails(p); return true; } catch (e) { return 'OK(通ってしまった)'; } }
const allTrue = arr => arr.every(x => x === true);

const PW = 'p'.repeat(40);
const sharedData = (sid, shareId, seq, label, extra) => Object.assign({ data: JSON.stringify({ m: '四麻', n: 'ルール', s: {} }), createdAt: new Date(), seriesId: sid, seq, label, note: '' }, extra || {});

// アプリと同じ形の書き込み（計画書「書き込みの流れ」）
function createSeries(db, sid, opts) {
  opts = opts || {};
  const b = writeBatch(db);
  if (!opts.noPassword) b.set(doc(db, `series_passwords/${sid}`), { password: opts.password || PW });
  b.set(doc(db, `rule_series/${sid}`), {
    mode: '四麻', name: opts.name || 'テストルール', latestSeq: 1, latestShareId: `${sid}v1`,
    history: [{ seq: 1, label: '1.0', shareId: `${sid}v1`, note: '', createdAt: new Date() }],
    hlSeqs: [], baseKeys: [], shareIds: [`${sid}v1`], opCount: 0, updatedAt: new Date(),
  });
  if (!opts.noVer) b.set(doc(db, `shared_rules/${sid}v1`), sharedData(sid, `${sid}v1`, 1, '1.0'));
  return b.commit();
}
function publishVer(db, sid, cur, opts) {
  opts = opts || {};
  const seq = cur.latestSeq + 1, op = cur.opCount + 1, shareId = `${sid}v${seq}`;
  const b = writeBatch(db);
  if (!opts.noOp) b.set(doc(db, `series_ops/${sid}_${opts.opNo || op}`), { seriesId: sid, password: opts.password || PW, createdAt: new Date() });
  b.update(doc(db, `rule_series/${sid}`), {
    latestSeq: opts.seq || seq, latestShareId: shareId, opCount: op, updatedAt: new Date(),
    history: [...cur.history, { seq, label: String(seq), shareId, note: '', createdAt: new Date() }],
    shareIds: [...cur.shareIds, shareId],
  });
  if (!opts.noVer) b.set(doc(db, `shared_rules/${shareId}`), sharedData(sid, shareId, seq, opts.label || String(seq)));
  return b.commit();
}
function publishNameHl(db, sid, cur, opts) {
  opts = opts || {};
  const op = cur.opCount + 1;
  const b = writeBatch(db);
  b.set(doc(db, `series_ops/${sid}_${op}`), { seriesId: sid, password: opts.password || PW, createdAt: new Date() });
  const upd = { name: opts.name || cur.name, opCount: op, updatedAt: new Date() };
  if (opts.hl) upd.hlSeqs = opts.hlSeqs || [...(cur.hlSeqs || []), cur.latestSeq];
  if (opts.extra) Object.assign(upd, opts.extra);
  b.update(doc(db, `rule_series/${sid}`), upd);
  if (opts.hl) b.set(doc(db, `ver_hl/${opts.hlShareId || cur.latestShareId}`), { seriesId: sid, hl: {}, updatedAt: new Date() });
  return b.commit();
}
function saveBase(db, sid, cur, mark, newKeys, opts) {
  opts = opts || {};
  const op = cur.opCount + 1;
  const b = writeBatch(db);
  b.set(doc(db, `series_ops/${sid}_${op}`), { seriesId: sid, password: opts.password || PW, createdAt: new Date() });
  b.update(doc(db, `rule_series/${sid}`), { baseKeys: newKeys, opCount: op, updatedAt: new Date() });
  if (mark) b.set(doc(db, `series_bases/${sid}_${mark}`), { seriesId: sid, mark, baseId: 'b', name: '比較', settings: '{}', usedAt: new Date() });
  for (const m of (opts.remove || [])) b.delete(doc(db, `series_bases/${sid}_${m}`));
  return b.commit();
}
function deleteSeries(db, sid, cur, opts) {
  opts = opts || {};
  const op = cur.opCount + 1;
  const b = writeBatch(db);
  b.set(doc(db, `series_ops/${sid}_${op}`), { seriesId: sid, password: opts.password || PW, createdAt: new Date() });
  const { name, history, ...rest } = cur;
  b.set(doc(db, `rule_series/${sid}`), Object.assign({}, rest, { deleted: true, opCount: op, updatedAt: new Date() }));
  b.delete(doc(db, `series_passwords/${sid}`));
  return b.commit();
}

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'majan-rule',
    firestore: { rules: fs.readFileSync(path.resolve(__dirname, '..', '..', 'firestore.rules'), 'utf8'), host: 'localhost', port: 8080 },
  });
  const admin = async (fn) => { let r; await env.withSecurityRulesDisabled(async c => { r = await fn(c.firestore()); }); return r; };
  const series = sid => admin(async db => (await getDoc(doc(db, `rule_series/${sid}`))).data());
  try {
    await env.clearFirestore();
    const anon = env.unauthenticatedContext().firestore();
    const user = env.authenticatedContext('alice').firestore();

    // ---- 正しい流れは通る ----
    {
      const r = [];
      r.push(await ok(createSeries(anon, 'S1')));
      r.push(await ok(publishVer(anon, 'S1', await series('S1'))));
      r.push(await ok(publishNameHl(anon, 'S1', await series('S1'), { name: '新しい名前' })));
      r.push(await ok(publishNameHl(anon, 'S1', await series('S1'), { hl: true })));
      r.push(await ok(saveBase(anon, 'S1', await series('S1'), 'AAAA', ['AAAA'])));
      r.push(await ok(getDoc(doc(anon, 'rule_series/S1'))));
      r.push(await ok(getDoc(doc(anon, 'series_bases/S1_AAAA'))));
      r.push(await ok(getDoc(doc(anon, 'ver_hl/S1v2'))));
      check('R2-01', 'リンクの作成・新しいver・名前だけ・強調だけ・比較対象の保存が、正しいパスワードで通り、誰でも読める', allTrue(r), JSON.stringify(r));
    }

    // ---- V-82 パスワードなし・違うパスワード ----
    {
      const cur = await series('S1');
      const r = [
        await ng(publishVer(anon, 'S1', cur, { password: 'x'.repeat(40) })),
        await ng(publishVer(anon, 'S1', cur, { noOp: true })),
        await ng(publishNameHl(anon, 'S1', cur, { name: '乗っ取り', password: 'x'.repeat(40) })),
        await ng(setDoc(doc(anon, 'rule_series/S1'), Object.assign({}, cur, { name: '乗っ取り' }))),
      ];
      check('V-82', 'パスワードなし・違うパスワードでは、verの追加も名前の変更も断られる', allTrue(r), JSON.stringify(r));
    }

    // ---- V-83 通し番号を飛ばす・一部だけ・記録の使い回し ----
    {
      const cur = await series('S1');
      const r = [
        await ng(publishVer(anon, 'S1', cur, { seq: cur.latestSeq + 2 })),  // 通し番号を飛ばす
        await ng(publishVer(anon, 'S1', cur, { noVer: true })),              // verを作らない
        await ng(publishVer(anon, 'S1', cur, { opNo: cur.opCount })),        // 使い終わった記録の番号
        await ng(setDoc(doc(anon, `series_ops/S1_${cur.opCount + 5}`), { seriesId: 'S1', password: PW, createdAt: new Date() })),  // 記録だけ
        await ng(setDoc(doc(anon, 'shared_rules/S1v9'), sharedData('S1', 'S1v9', 9, '9'))),  // verだけ
        await ng(createSeries(anon, 'S2', { noPassword: true })),            // 控えなしでシリーズ
        await ng(createSeries(anon, 'S1')),                                   // 既にあるシリーズを作り直す
        await ng(publishNameHl(anon, 'S1', cur, { extra: { latestSeq: 99 } })),  // 名前の公開でほかの項目を変える
        await ng(publishNameHl(anon, 'S1', cur, { hl: true, hlSeqs: [1, 2, 3, 4] })),  // hlSeqs を勝手に変える
        await ng(publishNameHl(anon, 'S1', cur, { hl: true, hlShareId: 'S1v1' })),  // 最新でないverの強調
        await ng(setDoc(doc(anon, 'shared_rules/X1'), sharedData('S1', 'X1', 3, 'x'.repeat(41)))),  // verの名前が長すぎる
      ];
      check('V-83', '通し番号を飛ばす・一部だけ・記録の使い回し・余計な項目の変更は、どれも断られる', allTrue(r), JSON.stringify(r));
    }

    // ---- V-84 読めない場所 ----
    {
      const r = [
        await ng(getDoc(doc(anon, 'series_passwords/S1'))),
        await ng(getDoc(doc(user, 'series_passwords/S1'))),
        await ng(getDoc(doc(anon, 'series_ops/S1_1'))),
        await ng(getDoc(doc(user, 'users/bob/deleted_rules/r1'))),
        await ng(setDoc(doc(anon, 'series_passwords/S1'), { password: 'y'.repeat(40) })),
      ];
      check('V-84', 'series_passwords・series_ops・他人の deleted_rules は読めず、パスワードは書き換えられない', allTrue(r), JSON.stringify(r));
    }

    // ---- V-85 パスワードなしで比較対象を触る ----
    {
      const r = [
        await ng(setDoc(doc(anon, 'series_bases/S1_BBBB'), { seriesId: 'S1', mark: 'BBBB', settings: '{}' })),
        await ng(setDoc(doc(anon, 'series_bases/S1_AAAA'), { seriesId: 'S1', mark: 'AAAA', settings: '{"x":1}' })),
        await ng(deleteDoc(doc(anon, 'series_bases/S1_AAAA'))),
        await ng(saveBase(anon, 'S1', await series('S1'), 'CCCC', ['AAAA', 'CCCC'], { password: 'z'.repeat(40) })),
      ];
      check('V-85', 'パスワードなし・違うパスワードでは、比較対象を作る・書き換える・消すことができない', allTrue(r), JSON.stringify(r));
    }

    // ---- V-103 比較対象の印を減らす ----
    {
      // 30件の印を持つシリーズを作る
      await admin(async db => {
        await setDoc(doc(db, 'series_passwords/S3'), { password: PW });
        const keys = Array.from({ length: 30 }, (_, i) => 'K' + String(i).padStart(3, '0'));
        await setDoc(doc(db, 'rule_series/S3'), { mode: '四麻', name: 'x', latestSeq: 1, latestShareId: 'S3v1', history: [], shareIds: ['S3v1'], hlSeqs: [], baseKeys: keys, opCount: 0 });
        for (const k of keys) await setDoc(doc(db, `series_bases/S3_${k}`), { seriesId: 'S3', mark: k, settings: '{}' });
      });
      const keys = (await series('S3')).baseKeys;
      const r = [];
      r.push(await ng(saveBase(user, 'S3', await series('S3'), 'NEW1', [...keys.slice(1), 'NEW1'], { remove: [keys[0]] })));  // ログインしていると減らせない
      r.push(await ng(saveBase(anon, 'S3', await series('S3'), 'NEW1', [...keys.slice(2), 'NEW1'], { remove: [keys[0], keys[1]] })));  // 2件は減らせない
      r.push(await ok(saveBase(anon, 'S3', await series('S3'), 'NEW1', [...keys.slice(1), 'NEW1'], { remove: [keys[0]] })));  // ログインせず30件以上から1件
      r.push(await ok(saveBase(user, 'S3', await series('S3'), 'NEW2', [...(await series('S3')).baseKeys, 'NEW2'])));  // ログインしていれば足すだけ
      // 30件未満から減らす
      await createSeries(anon, 'S4');
      await saveBase(anon, 'S4', await series('S4'), 'AAAA', ['AAAA']);
      r.push(await ng(saveBase(anon, 'S4', await series('S4'), 'BBBB', ['BBBB'], { remove: ['AAAA'] })));
      check('V-103', '比較対象の印を減らせるのは、ログインしていないときに30件以上から1件だけ', allTrue(r), JSON.stringify(r));
    }

    // ---- V-88 削除の確認と片付け ----
    {
      await createSeries(anon, 'S5');
      await publishVer(anon, 'S5', await series('S5'));
      await saveBase(anon, 'S5', await series('S5'), 'AAAA', ['AAAA']);
      const r = [
        await ng(deleteSeries(anon, 'S5', await series('S5'), { password: 'x'.repeat(40) })),  // 違うパスワードで削除済みにする
        await ng(deleteDoc(doc(anon, 'shared_rules/S5v1'))),     // 印のないシリーズのverを消す
        await ng(deleteDoc(doc(anon, 'rule_series/S5'))),       // 印のないシリーズを消す
        await ng(deleteDoc(doc(anon, 'series_bases/S5_AAAA'))),
      ];
      // 固定のリンクは消せない
      await setDoc(doc(anon, 'shared_rules/FIXED001'), { data: '{}', createdAt: new Date() });
      r.push(await ng(deleteDoc(doc(anon, 'shared_rules/FIXED001'))));
      check('V-88', 'パスワードなしでは削除済みにできず、印のないシリーズ・固定のリンクは消せない', allTrue(r), JSON.stringify(r));

      // 正しいパスワードで1回目 → 誰でも片付けられる
      const r2 = [];
      r2.push(await ok(deleteSeries(anon, 'S5', await series('S5'))));
      const after = await series('S5');
      r2.push(after.deleted === true && !('name' in after) && !('history' in after));
      r2.push(await ng(publishVer(anon, 'S5', Object.assign({ history: [] }, after))));  // 削除済みには公開できない
      const b = writeBatch(anon);
      for (const id of after.shareIds) b.delete(doc(anon, `shared_rules/${id}`));
      b.delete(doc(anon, 'series_bases/S5_AAAA'));
      for (let i = 1; i <= after.opCount; i++) b.delete(doc(anon, `series_ops/S5_${i}`));
      b.delete(doc(anon, 'rule_series/S5'));
      r2.push(await ok(b.commit()));
      r2.push(!(await series('S5')));
      check('V-88b', '正しいパスワードで削除済みにした後は、公開できず、誰でも最後まで片付けられる', allTrue(r2), JSON.stringify(r2));
    }

    // ---- 段階1のルールが変わっていないこと ----
    {
      const r = [
        await ok(setDoc(doc(user, 'users/alice/rule_ext/r1'), { verLabel: '1.0' })),
        await ok(setDoc(doc(anon, 'shared_rules/FIXED002'), { data: '{}', createdAt: new Date() })),
        await ng(setDoc(doc(anon, 'shared_rules/FIXED002'), { data: '{"a":1}', createdAt: new Date() })),
      ];
      check('R2-02', 'クラウド同期・固定のリンクの作成は今までどおり', allTrue(r), JSON.stringify(r));
    }
  } finally {
    await env.cleanup();
  }
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length} 件成功 / ${bad.length} 件失敗`);
  fs.writeFileSync(path.join(__dirname, 'last_result_rules_phase2.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  process.exitCode = bad.length ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
