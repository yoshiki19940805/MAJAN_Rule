#!/bin/bash
# MAJAN_Rule: ローカルの最新ソース(src/index.html)を、常に初期状態にリセットしてから
# デフォルトブラウザで開く（保存データ・お気に入り・キャッシュを毎回クリア）
cd "$(dirname "$0")"

# --- 完了後にこのTerminalウィンドウを自動で閉じるための仕組み ---
_close_terminal_window() {
  local target_tty
  target_tty="$(tty 2>/dev/null)"
  [ -z "$target_tty" ] && return
  osascript -e "
    tell application \"Terminal\"
      repeat with w in windows
        try
          if tty of (selected tab of w) is \"$target_tty\" then
            close w
            exit repeat
          end if
        end try
      end repeat
    end tell
  " > /dev/null 2>&1
}
_on_exit() {
  local code=$?
  if [ $code -eq 0 ]; then
    sleep 1.5
    _close_terminal_window
  else
    echo ""
    echo "⚠️ エラーが発生しました（終了コード: $code）。内容を確認してください。"
    read -n 1 -s -r -p "何かキーを押すと終了します..." _
  fi
}
trap _on_exit EXIT
# ------------------------------------------------------------

TARGET="src/local-reset.html"

if [ ! -f "$TARGET" ]; then
  echo "エラー: $TARGET が見つかりません。"
  echo "このファイルを MAJAN_Rule フォルダ直下に置いたまま実行してください。"
  exit 1
fi

echo "ローカル版サイトを初期状態で開いています: $TARGET"
open "$TARGET"

echo "完了しました。まもなくこのウィンドウは自動で閉じます。"
