#!/usr/bin/env node
// =====================================================================
// build_presets.js (v3 - TSV版)
// presets/presets_all.tsv を読み取り、index.html / docs/index.html の
// プリセット定義部分（マーカーコメント内）を自動生成・置換する。
//
// TSV形式（タブ区切り）:
//   四麻カテゴリ  三麻カテゴリ  キー  ラベル  四麻選択肢  三麻選択肢  四麻:雀魂  ...
//
// - 選択肢: セル内でコンマ区切り（例: あり,なし,カスタム）
// - 「カスタム」は自動追加しない → CSVに書いたものをそのまま使用
// - プリセット列は `四麻:` / `三麻:` プレフィクスで動的検出
// =====================================================================
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TSV_PATH = path.join(ROOT, 'presets', 'presets_all.tsv');

// =====================================================================
// TSV パーサー（シンプル: タブ区切り、行区切り）
// =====================================================================
function parseTsv(text) {
  return text.split('\n').filter(l => l.trim()).map(line => {
    // \r を除去
    line = line.replace(/\r$/, '');
    // タブで分割し、各セルのダブルクォートを処理
    return line.split('\t').map(cell => {
      cell = cell.trim();
      // ダブルクォートで囲まれたセルの処理（Numbers等が自動付与）
      if (cell.startsWith('"') && cell.endsWith('"')) {
        cell = cell.slice(1, -1).replace(/""/g, '"');
      }
      return cell;
    });
  });
}

// =====================================================================
// TSV 読み込み
// =====================================================================
function loadPresetData() {
  const tsvText = fs.readFileSync(TSV_PATH, 'utf-8');
  const rows = parseTsv(tsvText);
  const header = rows[0];
  const data = rows.slice(1).filter(r => r.length >= 4);

  // ヘッダー: 0=四麻カテゴリ, 1=三麻カテゴリ, 2=キー, 3=ラベル, 4=四麻選択肢, 5=三麻選択肢, 6~=プリセット値
  const presetCols = [];
  for (let c = 6; c < header.length; c++) {
    const m = header[c].match(/^(四麻|三麻):(.+)$/);
    if (m) presetCols.push({ col: c, mode: m[1], name: m[2] });
  }

  const entries = data.map(row => ({
    cat4: row[0] || '',
    cat3: row[1] || '',
    key: row[2] || '',
    label: row[3] || '',
    opts4: (row[4] || '').split(',').map(s => s.trim()).filter(Boolean),
    opts3: (row[5] || '').split(',').map(s => s.trim()).filter(Boolean),
    values: Object.fromEntries(presetCols.map(p => [p.name, row[p.col] || ''])),
  }));

  return { entries, presetCols };
}

// =====================================================================
// JavaScript コード生成
// =====================================================================
function generateJs(entries, presetCols) {
  const lines = [];
  const js = v => JSON.stringify(v);

  // --- OPTIONS_4 ---
  lines.push('const OPTIONS_4 = {');
  for (const e of entries) {
    if (e.opts4.length > 0 && e.cat4) {
      lines.push(`  ${e.key}:[${e.opts4.map(js).join(',')}],`);
    }
  }
  lines.push('};');
  lines.push('');

  // --- OPTIONS_3 ---
  lines.push('const OPTIONS_3 = {');
  for (const e of entries) {
    if (e.opts3.length > 0 && e.cat3) {
      lines.push(`  ${e.key}:[${e.opts3.map(js).join(',')}],`);
    }
  }
  lines.push('};');
  lines.push('');

  // --- BASE_RULES_4 ---
  const presets4 = presetCols.filter(p => p.mode === '四麻');
  const baseRuleNames4 = { '雀魂':'雀魂（四麻・段位戦）','Mリーグ':'Mリーグ公式（四麻）','天鳳':'天鳳（四麻）' };

  lines.push('// --- 基準ルール ---');
  lines.push('const BASE_RULES_4 = {');
  for (const p of presets4) {
    const ruleName = baseRuleNames4[p.name] || `${p.name}（四麻）`;
    const settings = [];
    for (const e of entries) {
      if (e.cat4 && e.values[p.name] !== undefined) settings.push(`${e.key}:${js(e.values[p.name])}`);
    }
    lines.push(`  ${js(ruleName)}: {`);
    let buf = [];
    for (const s of settings) {
      buf.push(s);
      if (buf.join(', ').length > 80) { lines.push(`    ${buf.join(', ')},`); buf = []; }
    }
    if (buf.length) lines.push(`    ${buf.join(', ')},`);
    lines.push('  },');
  }
  lines.push('};');
  lines.push('');
  if (presets4.length) {
    const n = baseRuleNames4[presets4[0].name] || `${presets4[0].name}（四麻）`;
    lines.push(`const DEFAULT_4 = {...BASE_RULES_4[${js(n)}]};`);
  }
  lines.push('');

  // --- BASE_RULES_3 ---
  const presets3 = presetCols.filter(p => p.mode === '三麻');
  const baseRuleNames3 = { '関東三麻':'三人麻雀（標準）' };

  lines.push('const BASE_RULES_3 = {');
  for (const p of presets3) {
    const ruleName = baseRuleNames3[p.name] || `${p.name}（三麻）`;
    const settings = [];
    for (const e of entries) {
      if (e.cat3 && e.values[p.name] !== undefined) settings.push(`${e.key}:${js(e.values[p.name])}`);
    }
    lines.push(`  ${js(ruleName)}:{`);
    let buf = [];
    for (const s of settings) {
      buf.push(s);
      if (buf.join(', ').length > 80) { lines.push(`    ${buf.join(', ')},`); buf = []; }
    }
    if (buf.length) lines.push(`    ${buf.join(', ')},`);
    lines.push('  },');
  }
  lines.push('};');
  if (presets3.length) {
    const n = baseRuleNames3[presets3[0].name] || `${presets3[0].name}（三麻）`;
    lines.push(`const DEFAULT_3 = {...BASE_RULES_3[${js(n)}]};`);
  }
  lines.push('');

  // --- LABELS ---
  lines.push('// --- ラベル ---');
  lines.push('const LABELS = {');
  for (const e of entries) {
    if ((e.cat4 || e.cat3) && e.label) lines.push(`  ${e.key}:${js(e.label)},`);
  }
  lines.push('};');
  lines.push('');

  // --- CATEGORIES ---
  // カテゴリ内で特定キーを先頭に固定する定義
  const CATEGORY_KEY_ORDER = {
    'チョンボ': ['chombo_batsu', 'chombo_taiou'],
    '軽罰符':  ['keibappu_type', 'keibappu_taiou'],
  };

  function enforceKeyOrder(catName, keys) {
    for (const [pattern, orderedKeys] of Object.entries(CATEGORY_KEY_ORDER)) {
      if (!catName.includes(pattern)) continue;
      // orderedKeys を先頭に持ってきて、残りはそのまま
      const head = orderedKeys.filter(k => keys.includes(k));
      const rest = keys.filter(k => !orderedKeys.includes(k));
      return [...head, ...rest];
    }
    return keys;
  }

  function genCats(varName, field) {
    lines.push(`const ${varName} = [`);
    const cats = {}; const order = [];
    for (const e of entries) {
      const c = e[field];
      if (c) {
        if (!cats[c]) { cats[c] = { keys: [], penalty: false }; order.push(c); }
        cats[c].keys.push(e.key);
        if (c.includes('チョンボ') || c.includes('上がり放棄') || c.includes('軽罰符')) cats[c].penalty = true;
      }
    }
    for (const c of order) {
      const d = cats[c];
      const orderedKeys = enforceKeyOrder(c, d.keys);
      const ks = orderedKeys.map(js).join(',');
      lines.push(d.penalty ? `  [${js(c)},[${ks}], true],` : `  [${js(c)},[${ks}]],`);
    }
    lines.push('];');
  }
  lines.push('// --- カテゴリ ---');
  genCats('CATEGORIES_4', 'cat4');
  lines.push('');
  genCats('CATEGORIES_3', 'cat3');

  return lines.join('\n');
}

// =====================================================================
// ファイル置換
// =====================================================================
const BEGIN_JS = '/* __BEGIN_PRESETS__ */';
const END_JS   = '/* __END_PRESETS__ */';

function replaceBlock(content, begin, end, replacement) {
  const s = content.indexOf(begin);
  const e = content.indexOf(end);
  if (s === -1 || e === -1) return null;
  return content.substring(0, s + begin.length) + '\n' + replacement + '\n' + content.substring(e);
}

// =====================================================================
// メイン
// =====================================================================
function main() {
  console.log('📋 Reading TSV:', TSV_PATH);
  const { entries, presetCols } = loadPresetData();
  console.log(`   ${entries.length} entries, ${presetCols.length} presets`);

  const jsCode = generateJs(entries, presetCols);

  // ビルド日時（JST）
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const buildDate = jst.toISOString().replace('T', ' ').slice(0, 16);

  for (const f of [path.join(ROOT,'index.html'), path.join(ROOT,'docs','index.html')]) {
    if (!fs.existsSync(f)) { console.log(`⏭️ ${f} not found`); continue; }
    let content = fs.readFileSync(f, 'utf-8');

    // 1) プリセット置換
    const result = replaceBlock(content, BEGIN_JS, END_JS, jsCode);
    if (!result) { console.error(`❌ Markers not found in ${f}`); process.exit(1); }
    content = result;

    // 2) バージョンをインクリメント
    const versionMatch = content.match(/const currentVersion = "v([\d.]+)"/);
    if (versionMatch) {
      const oldVer = versionMatch[1];
      const parts = oldVer.split('.');
      const minor = parseInt(parts[parts.length - 1]) + 1;
      parts[parts.length - 1] = String(minor).padStart(2, '0');
      const newVer = parts.join('.');
      // キャッシュクリア用バージョン
      content = content.replace(
        /const currentVersion = "v[\d.]+"/,
        `const currentVersion = "v${newVer}"`
      );
      // CONFIG内のバージョン
      content = content.replace(
        /appVersion: "v[\d.]+"/,
        `appVersion: "v${newVer}"`
      );
      console.log(`   Version: v${oldVer} → v${newVer}`);
    }

    // 3) ビルド日時を更新
    content = content.replace(
      /buildDate: "[^"]*"/,
      `buildDate: "${buildDate}"`
    );

    fs.writeFileSync(f, content, 'utf-8');
    console.log(`✅ ${path.relative(ROOT, f)}`);
  }

  console.log(`   Build date: ${buildDate}`);
  console.log('\n🎉 Build complete!');
}

main();
