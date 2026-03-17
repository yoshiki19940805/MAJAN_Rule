#!/usr/bin/env node
// =====================================================================
// build_presets.js (v2)
// presets/presets_all.csv を読み取り、index.html / docs/index.html の
// プリセット定義部分（マーカーコメント内）を自動生成・置換する。
//
// CSV形式:
//   四麻カテゴリ, 三麻カテゴリ, キー, ラベル,
//   四麻選択肢1~5, 三麻選択肢1~5,
//   四麻:プリセット名..., 三麻:プリセット名...
//
// - 「カスタム」は CSVに書かない → _custom サブキーがある場合に自動追加
// - プリセット列は `四麻:` / `三麻:` プレフィクスで動的検出
// - 列追加でプリセット増やせる / 行追加で項目追加 / 行削除で項目削除
// =====================================================================
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CSV_PATH = path.join(ROOT, 'presets', 'presets_all.csv');
const MAX_OPTS = 5;

// =====================================================================
// CSV パーサー
// =====================================================================
function parseCsv(text) {
  const rows = [];
  let i = 0;
  while (i < text.length) {
    const row = [];
    while (true) {
      let val = '';
      if (text[i] === '"') {
        i++;
        while (i < text.length) {
          if (text[i] === '"') {
            if (text[i+1] === '"') { val += '"'; i += 2; }
            else { i++; break; }
          } else { val += text[i]; i++; }
        }
      } else {
        while (i < text.length && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          val += text[i]; i++;
        }
      }
      row.push(val);
      if (i >= text.length || text[i] === '\n' || text[i] === '\r') break;
      if (text[i] === ',') i++;
    }
    if (text[i] === '\r') i++;
    if (text[i] === '\n') i++;
    rows.push(row);
  }
  return rows;
}

// =====================================================================
// CSV 読み込み
// =====================================================================
function loadPresetData() {
  const csvText = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(csvText);
  const header = rows[0];
  const data = rows.slice(1).filter(r => r.length >= 4);

  // ヘッダー解析
  // 固定列: 0=四麻カテゴリ, 1=三麻カテゴリ, 2=キー, 3=ラベル
  // 4-8: 四麻選択肢1~5, 9-13: 三麻選択肢1~5
  // 14~: プリセット値列
  const presetStartCol = 4 + MAX_OPTS * 2; // = 14
  const presetCols = [];
  for (let c = presetStartCol; c < header.length; c++) {
    const h = header[c];
    const m = h.match(/^(四麻|三麻):(.+)$/);
    if (m) presetCols.push({ col: c, mode: m[1], name: m[2] });
  }

  // 全キーを先に集めて _custom サブキーの存在を把握
  const allKeys = new Set(data.map(r => r[2]));

  const entries = data.map(row => {
    const key = row[2];
    // 四麻選択肢 (列4-8)
    const opts4 = [];
    for (let i = 0; i < MAX_OPTS; i++) {
      const v = (row[4 + i] || '').trim();
      if (v) opts4.push(v);
    }
    // _custom サブキーがあればカスタムを追加
    if (allKeys.has(key + '_custom')) opts4.push('カスタム');

    // 三麻選択肢 (列9-13)
    const opts3 = [];
    for (let i = 0; i < MAX_OPTS; i++) {
      const v = (row[4 + MAX_OPTS + i] || '').trim();
      if (v) opts3.push(v);
    }
    if (allKeys.has(key + '_custom')) opts3.push('カスタム');

    return {
      cat4: row[0] || '',
      cat3: row[1] || '',
      key,
      label: row[3] || '',
      opts4,
      opts3,
      values: Object.fromEntries(presetCols.map(p => [p.name, row[p.col] || ''])),
    };
  });

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
  const baseRuleNames4 = {
    '雀魂': '雀魂（四麻・段位戦）',
    'Mリーグ': 'Mリーグ公式（四麻）',
    '天鳳': '天鳳（四麻）',
  };

  lines.push('// --- 基準ルール ---');
  lines.push('const BASE_RULES_4 = {');
  for (const p of presets4) {
    const ruleName = baseRuleNames4[p.name] || `${p.name}（四麻）`;
    const settings = [];
    for (const e of entries) {
      if (e.cat4 && e.values[p.name] !== undefined) {
        settings.push(`${e.key}:${js(e.values[p.name])}`);
      }
    }
    lines.push(`  ${js(ruleName)}: {`);
    let lineItems = [];
    for (const s of settings) {
      lineItems.push(s);
      if (lineItems.join(', ').length > 80) {
        lines.push(`    ${lineItems.join(', ')},`);
        lineItems = [];
      }
    }
    if (lineItems.length > 0) lines.push(`    ${lineItems.join(', ')},`);
    lines.push('  },');
  }
  lines.push('};');
  lines.push('');
  if (presets4.length > 0) {
    const firstRuleName = baseRuleNames4[presets4[0].name] || `${presets4[0].name}（四麻）`;
    lines.push(`const DEFAULT_4 = {...BASE_RULES_4[${js(firstRuleName)}]};`);
  }
  lines.push('');

  // --- BASE_RULES_3 ---
  const presets3 = presetCols.filter(p => p.mode === '三麻');
  const baseRuleNames3 = {
    '関東三麻': '三人麻雀（標準）',
  };

  lines.push('const BASE_RULES_3 = {');
  for (const p of presets3) {
    const ruleName = baseRuleNames3[p.name] || `${p.name}（三麻）`;
    const settings = [];
    for (const e of entries) {
      if (e.cat3 && e.values[p.name] !== undefined) {
        settings.push(`${e.key}:${js(e.values[p.name])}`);
      }
    }
    lines.push(`  ${js(ruleName)}:{`);
    let lineItems = [];
    for (const s of settings) {
      lineItems.push(s);
      if (lineItems.join(', ').length > 80) {
        lines.push(`    ${lineItems.join(', ')},`);
        lineItems = [];
      }
    }
    if (lineItems.length > 0) lines.push(`    ${lineItems.join(', ')},`);
    lines.push('  },');
  }
  lines.push('};');
  if (presets3.length > 0) {
    const firstRuleName = baseRuleNames3[presets3[0].name] || `${presets3[0].name}（三麻）`;
    lines.push(`const DEFAULT_3 = {...BASE_RULES_3[${js(firstRuleName)}]};`);
  }
  lines.push('');

  // --- LABELS ---
  lines.push('// --- ラベル ---');
  lines.push('const LABELS = {');
  for (const e of entries) {
    if ((e.cat4 || e.cat3) && e.label) {
      lines.push(`  ${e.key}:${js(e.label)},`);
    }
  }
  lines.push('};');
  lines.push('');

  // --- CATEGORIES ---
  function genCategories(name, entries, catField) {
    lines.push(`const ${name} = [`);
    const cats = {};
    const order = [];
    for (const e of entries) {
      const cat = e[catField];
      if (cat) {
        if (!cats[cat]) { cats[cat] = { keys: [], penalty: false }; order.push(cat); }
        cats[cat].keys.push(e.key);
        if (cat.includes('チョンボ') || cat.includes('上がり放棄') || cat.includes('軽罰符')) {
          cats[cat].penalty = true;
        }
      }
    }
    for (const c of order) {
      const d = cats[c];
      const ks = d.keys.map(js).join(',');
      if (d.penalty) lines.push(`  [${js(c)},[${ks}], true],`);
      else lines.push(`  [${js(c)},[${ks}]],`);
    }
    lines.push('];');
  }
  lines.push('// --- カテゴリ ---');
  genCategories('CATEGORIES_4', entries, 'cat4');
  lines.push('');
  genCategories('CATEGORIES_3', entries, 'cat3');

  return lines.join('\n');
}

// =====================================================================
// ファイル置換
// =====================================================================
const BEGIN_JS = '/* __BEGIN_PRESETS__ */';
const END_JS   = '/* __END_PRESETS__ */';
const BEGIN_PY = '# __BEGIN_PRESETS__';
const END_PY   = '# __END_PRESETS__';

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
  console.log('📋 Reading CSV:', CSV_PATH);
  const { entries, presetCols } = loadPresetData();
  console.log(`   ${entries.length} entries, ${presetCols.length} presets`);

  const jsCode = generateJs(entries, presetCols);

  const htmlFiles = [
    path.join(ROOT, 'index.html'),
    path.join(ROOT, 'docs', 'index.html'),
  ];

  for (const f of htmlFiles) {
    if (!fs.existsSync(f)) { console.log(`⏭️ ${f} not found`); continue; }
    const result = replaceBlock(fs.readFileSync(f, 'utf-8'), BEGIN_JS, END_JS, jsCode);
    if (!result) { console.error(`❌ Markers not found in ${f}`); process.exit(1); }
    fs.writeFileSync(f, result, 'utf-8');
    console.log(`✅ ${path.relative(ROOT, f)}`);
  }

  // main.py (optional)
  const pyFile = path.join(ROOT, 'main.py');
  if (fs.existsSync(pyFile)) {
    const content = fs.readFileSync(pyFile, 'utf-8');
    if (content.includes(BEGIN_PY)) {
      // TODO: Python code generation
      console.log(`⏭️ main.py (Python generation not yet implemented)`);
    } else {
      console.log(`⏭️ main.py (no markers)`);
    }
  }

  console.log('\n🎉 Build complete!');
}

main();
