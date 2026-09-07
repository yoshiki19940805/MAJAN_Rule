#!/bin/bash
# MAJAN_Rule: src の最新版を docs（公開用フォルダ）へ反映し、GitHubにpushして
# GitHub Pages (https://yoshiki19940805.github.io/MAJAN_Rule/) に公開する
set -e
cd "$(dirname "$0")"

echo "==================================="
echo " MAJAN_Rule デプロイスクリプト"
echo "==================================="
echo ""

echo "[1/4] src の最新ファイルを docs へコピーしています..."
cp src/index.html docs/index.html
cp src/style.css docs/style.css
cp src/sw.js docs/sw.js
echo "  done."
echo ""

echo "[2/4] 変更内容を確認しています..."
git add -A
if git diff --cached --quiet; then
  echo "  変更はありませんでした（コミットはスキップします）。"
  HAS_CHANGES=0
else
  echo "  変更点:"
  git diff --cached --stat | sed 's/^/    /'
  HAS_CHANGES=1
fi
echo ""

if [ "$HAS_CHANGES" = "1" ]; then
  echo "[3/4] コミットしています..."
  read -p "  コミットメッセージ（空欄でEnter＝自動生成）: " MSG
  if [ -z "$MSG" ]; then
    MSG="Deploy: $(date '+%Y-%m-%d %H:%M:%S')"
  fi
  git commit -m "$MSG"
  echo ""
else
  echo "[3/4] コミット済みの変更を確認しています..."
  UNPUSHED=$(git log origin/main..HEAD --oneline 2>/dev/null | wc -l | tr -d ' ')
  if [ "$UNPUSHED" = "0" ]; then
    echo "  プッシュ待ちのコミットもありません。デプロイの必要はなさそうです。"
    read -n 1 -s -r -p "何かキーを押すと終了します..."
    exit 0
  else
    echo "  ローカルに未プッシュのコミットが ${UNPUSHED} 件あります。プッシュします。"
  fi
  echo ""
fi

echo "[4/4] GitHub にプッシュしています..."
git push origin main
echo ""

echo "✅ デプロイが完了しました！"
echo "数分後に反映されます: https://yoshiki19940805.github.io/MAJAN_Rule/"
echo ""
read -n 1 -s -r -p "何かキーを押すと終了します..."
