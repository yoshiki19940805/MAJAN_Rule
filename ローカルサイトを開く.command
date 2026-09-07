#!/bin/bash
# MAJAN_Rule: ローカルの最新ソース(src/index.html)を、常に初期状態にリセットしてから
# デフォルトブラウザで開く（保存データ・お気に入り・キャッシュを毎回クリア）
cd "$(dirname "$0")"

_on_exit() {
  local code=$?
  if [ $code -ne 0 ]; then
    echo ""
    echo "⚠️ エラーが発生しました（終了コード: $code）。内容を確認してください。"
    read -n 1 -s -r -p "何かキーを押すと終了します..." _
  fi
}
trap _on_exit EXIT

TARGET="src/local-reset.html"

if [ ! -f "$TARGET" ]; then
  echo "エラー: $TARGET が見つかりません。"
  echo "このファイルを MAJAN_Rule フォルダ直下に置いたまま実行してください。"
  exit 1
fi

echo "ローカル版サイトを初期状態で開いています: $TARGET"
open "$TARGET"

echo "完了しました。このウインドウはまもなく自動的に閉じます。"
sleep 1.5
