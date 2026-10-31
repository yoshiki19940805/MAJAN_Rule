// 前のアプリ（ver管理を出す前の本番 v5.11）を、テスト用のサーバーから /old/ で配る。
// docs/ は v6.00 を出した後は新しいアプリなので、切り戻し用のタグ before-ver の docs/ を使う。
// emulator を true にすると、Firestore・Authのエミュレーターにつなぐ1行を差し込む（前のアプリには ?emu=1 の仕組みがないため）。
const { execFileSync } = require('child_process');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const OLD_TAG = 'before-ver';
const OLD_APP_PATH = '/old/index.html';

function oldAppExists() {
  try { execFileSync('git', ['-C', ROOT, 'rev-parse', '--verify', OLD_TAG], { stdio: 'ignore' }); return true; } catch (e) { return false; }
}
// /old/ のリクエストなら配って true を返す
function serveOldApp(req, res, types, opts) {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (!p.startsWith('/old/')) return false;
  let body;
  try { body = execFileSync('git', ['-C', ROOT, 'show', `${OLD_TAG}:docs/${p.slice(5)}`]); }
  catch (e) { res.writeHead(404); res.end(); return true; }
  if (p === OLD_APP_PATH && opts && opts.emulator) {
    body = body.toString('utf8').replace('const fbDb = firebase.firestore();',
      "const fbDb = firebase.firestore(); fbDb.useEmulator('localhost', 8080); fbAuth.useEmulator('http://localhost:9099');");
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  res.end(body);
  return true;
}
// 前のアプリの index.html の中身
function oldAppHtml() { return execFileSync('git', ['-C', ROOT, 'show', `${OLD_TAG}:docs/index.html`]).toString('utf8'); }
module.exports = { serveOldApp, oldAppExists, oldAppHtml, OLD_APP_PATH };
