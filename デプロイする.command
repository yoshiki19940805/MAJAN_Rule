#!/bin/bash
# MAJAN_Rule: src の最新版を docs（公開用フォルダ）へ反映し、GitHubにpushして
# GitHub Pages (https://yoshiki19940805.github.io/MAJAN_Rule/) に公開する
#
# バージョン管理:
#   表示は "vX.YY" 形式。
#   X（メジャー）  : 機能追加など。デプロイ時に上げるか確認し、上げた場合 YY は 00 にリセット。
#   YY（マイナー） : 軽微な変更・バグ修正。デプロイのたびに自動で +1。
#   デプロイ時刻   : デプロイ実行時の日時を自動で埋め込む。
set -e
cd "$(dirname "$0")"

echo "==================================="
echo " MAJAN_Rule デプロイスクリプト"
echo "==================================="
echo ""

echo "[1/5] デプロイする変更があるか確認しています..."
NEEDS_DEPLOY=0
for f in index.html style.css sw.js; do
  if ! diff -q "src/$f" "docs/$f" > /dev/null 2>&1; then
    NEEDS_DEPLOY=1
  fi
done
if [ -n "$(git status --porcelain --untracked-files=all)" ]; then
  NEEDS_DEPLOY=1
fi
UNPUSHED=$(git log origin/main..HEAD --oneline 2>/dev/null | wc -l | tr -d ' ')
if [ "$UNPUSHED" != "0" ]; then
  NEEDS_DEPLOY=1
fi

if [ "$NEEDS_DEPLOY" = "0" ]; then
  echo "  デプロイする変更はありません。"
  read -n 1 -s -r -p "何かキーを押すと終了します..."
  exit 0
fi
echo "  変更を検出しました。"
echo ""

echo "[2/5] バージョンを更新しています..."
CURRENT_LINE=$(grep -m1 'const currentVersion = "v' src/index.html)
CURRENT_VERSION=$(echo "$CURRENT_LINE" | sed -E 's/.*"v([0-9]+\.[0-9]+)".*/\1/')
CUR_X=$(echo "$CURRENT_VERSION" | cut -d. -f1)
CUR_YY=$(echo "$CURRENT_VERSION" | cut -d. -f2)
echo "  現在のバージョン: v${CUR_X}.${CUR_YY}"

read -p "  機能追加など、メジャーバージョン(X)を上げますか？ [y/N]: " BUMP_MAJOR
if [[ "$BUMP_MAJOR" =~ ^[Yy]$ ]]; then
  NEW_X=$((10#$CUR_X + 1))
  NEW_YY="00"
  BUMP_KIND="メジャー"
else
  NEW_X=$CUR_X
  NEW_YY_NUM=$((10#$CUR_YY + 1))
  NEW_YY=$(printf "%02d" "$NEW_YY_NUM")
  BUMP_KIND="マイナー"
fi
NEW_VERSION="v${NEW_X}.${NEW_YY}"
NEW_DEPLOY_DATE=$(date '+%Y-%m-%d %H:%M')
echo "  新しいバージョン: ${NEW_VERSION}（${BUMP_KIND}更新） / デプロイ時刻: ${NEW_DEPLOY_DATE}"

sed -i '' -E "s/const currentVersion = \"v[0-9]+\.[0-9]+\";/const currentVersion = \"${NEW_VERSION}\";/" src/index.html
sed -i '' -E "s/appVersion: \"v[0-9]+\.[0-9]+\",/appVersion: \"${NEW_VERSION}\",/" src/index.html
sed -i '' -E "s/deployDate: \"[^\"]*\",/deployDate: \"${NEW_DEPLOY_DATE}\",/" src/index.html
echo ""

echo "[3/5] src の最新ファイルを docs へコピーしています..."
cp src/index.html docs/index.html
cp src/style.css docs/style.css
cp src/sw.js docs/sw.js
echo "  done."
echo ""

echo "[4/5] コミットしています..."
git add -A
if git diff --cached --quiet; then
  echo "  (コミット対象の変更はありませんでした)"
else
  read -p "  コミットメッセージ（空欄でEnter＝自動生成）: " MSG
  if [ -z "$MSG" ]; then
    FULL_MSG="${NEW_VERSION}: $(date '+%Y-%m-%d %H:%M:%S') デプロイ"
  else
    FULL_MSG="${NEW_VERSION}: ${MSG}"
  fi
  git commit -m "$FULL_MSG"
fi
echo ""

echo "[5/5] GitHub にプッシュしています..."
git push origin main
echo ""

echo "✅ デプロイが完了しました！（${NEW_VERSION}）"
echo "数分後に反映されます: https://yoshiki19940805.github.io/MAJAN_Rule/"
echo ""
read -n 1 -s -r -p "何かキーを押すと終了します..."
