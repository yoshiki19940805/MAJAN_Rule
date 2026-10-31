#!/bin/bash
# ver管理のテストをすべて流す（使い方は README.md）
#   bash tests/ver/run_all.sh          … 全部（エミュレーターを自動で起動する）
#   bash tests/ver/run_all.sh --auto   … Firestoreを使わないテストだけ
cd "$(dirname "$0")"
set -o pipefail
FAIL=0
# brew で入れた Java（openjdk@21）は、パスを通さなくても使えるようにする
[ -d /opt/homebrew/opt/openjdk@21/bin ] && export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"

echo "=== 今までの機能の回帰テスト（A〜Q、Firestoreを使わない） ==="
node regression.test.js || FAIL=1

echo ""
echo "=== 段階1：画面（Firestoreを使わない） ==="
node ver_phase1.test.js || FAIL=1

if [ "$1" != "--auto" ]; then
  if ! command -v java >/dev/null 2>&1 || ! java -version >/dev/null 2>&1; then
    echo ""
    echo "⚠️ Java がないため、Firestoreエミュレーターを使うテストは流せませんでした（README.md の準備を参照）"
    exit 2
  fi
  echo ""
  echo "=== Firestoreのルール・クラウド同期・verのリンク（エミュレーター） ==="
  # エミュレーターを起動し、その中でテストを流す（終わると止まる）
  FIREBASE="firebase"; command -v firebase >/dev/null 2>&1 || FIREBASE="npx -y firebase-tools@14"
  [ -d node_modules ] || npm install --no-audit --no-fund || FAIL=1
  (cd ../.. && $FIREBASE emulators:exec --only firestore,auth --project majan-rule \
    "node tests/ver/rules_phase1.test.js && node tests/ver/rules_phase2.test.js && node tests/ver/sync_phase1.test.js && node tests/ver/ver_phase2.test.js && node tests/ver/ver_phase3.test.js && node tests/ver/ver_rest.test.js") || FAIL=1
fi

echo ""
if [ $FAIL = 0 ]; then echo "✅ すべて成功"; else echo "❌ 失敗あり（上の ❌ を確認）"; fi
exit $FAIL
