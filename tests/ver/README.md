# ver管理のテスト

計画書（`~/Documents/MAJAN_Rule_docs/雀カルテ_ver管理_計画書.html`）の「テスト項目」を確かめるテストです。
項目の一覧と結果は `tests/test_cases.md` の「V. ver管理」に書きます。

## 全部を1回で流す

```bash
bash tests/ver/run_all.sh
```

- 今までの機能の回帰テストと、Firestoreを使わないテスト（画面）を流した後、Firestoreエミュレーターを自動で起動して、Firestoreのルールとクラウド同期のテストを流します。
- Firestoreを使わないテストだけを流すときは `bash tests/ver/run_all.sh --auto`。
- 結果は、画面に「✅／❌」で出るほか、`tests/ver/last_result_*.json` に残ります。`tests/test_cases.md` の「結果」の列に、日付と一緒に書き写します。

## 準備（初めて流すとき）

| 必要なもの | 確かめ方 | 入れ方 |
|---|---|---|
| Node.js | `node -v` | 入っている |
| Playwright（ヘッドレスブラウザ） | `ls ~/node_modules/playwright` | 入っている（ホームフォルダーのものを使う） |
| Java（Firestoreエミュレーターに必要） | `/opt/homebrew/opt/openjdk@21/bin/java -version` | `brew install openjdk@21`（2026-10-31に入れた。run_all.sh が自動でこの場所を使う） |
| Firebase CLI | `firebase --version` | 入っている |

`@firebase/rules-unit-testing` などのテスト用の部品は、初めて流すときに `tests/ver/node_modules` に自動で入ります（Gitには入れません）。

## ファイル

| ファイル | 中身 | 方法 |
|---|---|---|
| `regression.test.js` | 今までの機能の回帰テスト（`tests/test_cases.md` の A〜Q のうち自動の項目） | 自動 |
| `ver_phase1.test.js` | 1回目の画面（表示画面のボタン、共有シート、verの欄、別のルールとして保存、お知らせ、前のアプリとの互換） | 自動 |
| `rules_phase2.test.js` | 段階2・3のFirestoreのルール（シリーズ・パスワード・公開の記録・比較対象・強調） | 外部 |
| `rules_phase1.test.js` | 1回目のFirestoreのルール（`rule_ext`・`deleted_rules`） | 外部 |
| `sync_phase1.test.js` | 1回目のクラウド同期（verの同期、削除したルールが戻らないこと） | 外部 |
| `ver_phase2.test.js` | 段階2：verのリンク（リンクの作成・送る・下書きと公開・過去のverのリンク・削除・複数の端末） | 外部 |
| `ver_phase3.test.js` | 段階3：強調だけの公開・「手動」の印・別のverと比べる | 外部 |
| `ver_rest.test.js` | 段階2・3の残りの項目（verの名前と変更内容、送るときの比較対象、パスワードのない端末、複数の端末、削除の途中、ログイン、前のアプリとの互換、比較対象の件数、verが多いルール、幅375px）。前のアプリは、`old_app.js` がタグ `before-ver`（v5.11）の `docs/` を `/old/` で配り、エミュレーターにつなぐ1行を差し込んで使う | 外部 |
| `ver_history.test.js` | 追加：表示画面で過去のverを見る（V-117〜V-121） | 外部 |
| `run_all.sh` | 上をまとめて流す | |

## 仕組み

- テストは、リポジトリの中身をそのまま手元のサーバーで配り、ヘッドレスブラウザで開きます。`src/`（新しいアプリ）と、`/old/` で配る前のアプリ（切り戻し用のタグ `before-ver` の `docs/`、v5.11）が同じオリジンになるので、前のアプリとの互換も確かめられます。v6.00 を出した後は `docs/` も新しいアプリなので、前のアプリにはタグのものを使います。
- Firestoreを使わないテストでは、本番のFirestoreへの通信を止めています。
- エミュレーターを使うテストでは、アプリを `?emu=1` を付けて開きます。手元（localhost）で開いたときだけ、アプリがエミュレーターにつなぎます（`src/index.html` の Firebase初期化の直後）。
- 前のアプリとして別のものを使うときは、`OLD_APP=/パス/index.html node tests/ver/ver_phase1.test.js`。
