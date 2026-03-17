#!/usr/bin/env node
// =====================================================================
// build_presets.js
// presets/presets_all.csv を読み取り、index.html / docs/index.html / main.py の
// プリセット定義部分（マーカーコメント内）を自動生成・置換する。
// =====================================================================
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CSV_PATH = path.join(ROOT, 'presets', 'presets_all.csv');

// =====================================================================
// CSV パーサー（RFC 4180 準拠の簡易実装）
// =====================================================================
function parseCsv(text) {
  const rows = [];
  let i = 0;
  while (i < text.length) {
    const row = [];
    while (true) {
      let val = '';
      if (text[i] === '"') {
        i++; // skip opening quote
        while (i < text.length) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') { val += '"'; i += 2; }
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
// CSV 読み込み・構造化
// =====================================================================
function loadPresetData() {
  const csvText = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(csvText);
  const header = rows[0];
  const data = rows.slice(1).filter(r => r.length >= header.length);

  // ヘッダーからプリセット列を特定
  // 期待: [四麻カテゴリ, 三麻カテゴリ, キー, ラベル, 四麻選択肢, 三麻選択肢, ...プリセット値列]
  const presetCols = [];
  for (let c = 6; c < header.length; c++) {
    const h = header[c];
    const m = h.match(/^(四麻|三麻):(.+)$/);
    if (m) presetCols.push({ col: c, mode: m[1], name: m[2] });
  }

  // 構造化
  const entries = data.map(row => ({
    cat4: row[0],
    cat3: row[1],
    key: row[2],
    label: row[3],
    opts4: row[4] ? row[4].split(' | ').map(s => s.trim()) : [],
    opts3: row[5] ? row[5].split(' | ').map(s => s.trim()) : [],
    values: Object.fromEntries(presetCols.map(p => [p.name, row[p.col] || ''])),
  }));

  return { entries, presetCols };
}

// =====================================================================
// JavaScript コード生成
// =====================================================================
function generateJs(entries, presetCols) {
  const lines = [];

  // --- OPTIONS_4 ---
  lines.push('const OPTIONS_4 = {');
  for (const e of entries) {
    if (e.opts4.length > 0 && e.cat4) {
      const vals = e.opts4.map(v => JSON.stringify(v)).join(',');
      lines.push(`  ${e.key}:[${vals}],`);
    }
  }
  lines.push('};');
  lines.push('');

  // --- OPTIONS_3 ---
  lines.push('const OPTIONS_3 = {');
  for (const e of entries) {
    if (e.opts3.length > 0 && e.cat3) {
      const vals = e.opts3.map(v => JSON.stringify(v)).join(',');
      lines.push(`  ${e.key}:[${vals}],`);
    }
  }
  lines.push('};');
  lines.push('');

  // --- BASE_RULES_4 ---
  const presets4 = presetCols.filter(p => p.mode === '四麻');
  // Determine base rule display names
  const baseRuleNames4 = {
    '雀魂': '雀魂（四麻・段位戦）',
    'Mリーグ': 'Mリーグ公式（四麻）',
    '天鳳': '天鳳（四麻）',
  };

  lines.push('// --- 基準ルール ---');
  lines.push('const BASE_RULES_4 = {');
  for (const p of presets4) {
    const ruleName = baseRuleNames4[p.name] || p.name;
    const settings = [];
    for (const e of entries) {
      if (e.cat4 && e.values[p.name] !== undefined) {
        settings.push(`${e.key}:${JSON.stringify(e.values[p.name])}`);
      }
    }
    lines.push(`  ${JSON.stringify(ruleName)}: {`);
    // Format settings into groups of ~3 per line for readability
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

  // --- DEFAULT_4 --- (same as first 4ma preset for now - uses the first preset)
  lines.push('const DEFAULT_4 = {...BASE_RULES_4[' + JSON.stringify(baseRuleNames4[presets4[0]?.name] || '') + ']};');
  lines.push('');

  // --- BASE_RULES_3 ---
  const presets3 = presetCols.filter(p => p.mode === '三麻');
  const baseRuleNames3 = {
    '関東三麻': '三人麻雀（標準）',
  };

  lines.push('const BASE_RULES_3 = {');
  for (const p of presets3) {
    const ruleName = baseRuleNames3[p.name] || p.name;
    const settings = [];
    for (const e of entries) {
      if (e.cat3 && e.values[p.name] !== undefined) {
        settings.push(`${e.key}:${JSON.stringify(e.values[p.name])}`);
      }
    }
    lines.push(`  ${JSON.stringify(ruleName)}:{`);
    let lineItems = [];
    for (const s of settings) {
      lineItems.push(s);
      if (lineItems.join(', ').length > 80) {
        lines.push(`    ${lineItems.join(', ')},`);
        lineItems = [];
      }
    }
    if (lineItems.length > 0) lines.push(`    ${lineItems.join(', ')},`);
    lines.push('  }');
  }
  lines.push('};');
  lines.push('const DEFAULT_3 = {...BASE_RULES_3[' + JSON.stringify(baseRuleNames3[presets3[0]?.name] || '') + ']};');
  lines.push('');

  // --- LABELS ---
  lines.push('// --- ラベル ---');
  lines.push('const LABELS = {');
  for (const e of entries) {
    if ((e.cat4 || e.cat3) && e.label) {
      lines.push(`  ${e.key}:${JSON.stringify(e.label)},`);
    }
  }
  lines.push('};');
  lines.push('');

  // --- CATEGORIES_4 ---
  lines.push('// --- カテゴリ ---');
  lines.push('const CATEGORIES_4 = [');
  const cats4 = {};
  const cats4Order = [];
  for (const e of entries) {
    if (e.cat4) {
      if (!cats4[e.cat4]) { cats4[e.cat4] = { keys: [], ispenalty: false }; cats4Order.push(e.cat4); }
      cats4[e.cat4].keys.push(e.key);
      // Mark penalty categories
      if (e.cat4.includes('チョンボ') || e.cat4.includes('上がり放棄') || e.cat4.includes('軽罰符')) {
        cats4[e.cat4].ispenalty = true;
      }
    }
  }
  for (const name of cats4Order) {
    const c = cats4[name];
    const keysStr = c.keys.map(k => JSON.stringify(k)).join(',');
    if (c.ispenalty) {
      lines.push(`  [${JSON.stringify(name)},[${keysStr}], true],`);
    } else {
      lines.push(`  [${JSON.stringify(name)},[${keysStr}]],`);
    }
  }
  lines.push('];');
  lines.push('');

  // --- CATEGORIES_3 ---
  lines.push('const CATEGORIES_3 = [');
  const cats3 = {};
  const cats3Order = [];
  for (const e of entries) {
    if (e.cat3) {
      if (!cats3[e.cat3]) { cats3[e.cat3] = { keys: [], ispenalty: false }; cats3Order.push(e.cat3); }
      cats3[e.cat3].keys.push(e.key);
      if (e.cat3.includes('チョンボ') || e.cat3.includes('上がり放棄') || e.cat3.includes('軽罰符')) {
        cats3[e.cat3].ispenalty = true;
      }
    }
  }
  for (const name of cats3Order) {
    const c = cats3[name];
    const keysStr = c.keys.map(k => JSON.stringify(k)).join(',');
    if (c.ispenalty) {
      lines.push(`  [${JSON.stringify(name)},[${keysStr}], true],`);
    } else {
      lines.push(`  [${JSON.stringify(name)},[${keysStr}]],`);
    }
  }
  lines.push('];');

  return lines.join('\n');
}

// =====================================================================
// Python コード生成
// =====================================================================
function generatePy(entries, presetCols) {
  const lines = [];

  // --- OPTIONS_4 ---
  lines.push('OPTIONS_4 = {');
  for (const e of entries) {
    if (e.opts4.length > 0 && e.cat4) {
      const vals = e.opts4.map(v => JSON.stringify(v)).join(', ');
      lines.push(`    "${e.key}": [${vals}],`);
    }
  }
  lines.push('}');
  lines.push('');

  // --- OPTIONS_3 ---
  lines.push('OPTIONS_3 = {');
  for (const e of entries) {
    if (e.opts3.length > 0 && e.cat3) {
      const vals = e.opts3.map(v => JSON.stringify(v)).join(', ');
      lines.push(`    "${e.key}": [${vals}],`);
    }
  }
  lines.push('}');
  lines.push('');

  // --- BASE_RULES_4 ---
  const presets4 = presetCols.filter(p => p.mode === '四麻');
  const baseRuleNames4 = { '雀魂': '雀魂（四麻・段位戦）', 'Mリーグ': 'Mリーグ公式（四麻）', '天鳳': '天鳳（四麻）' };

  lines.push('BASE_RULES_4 = {');
  for (const p of presets4) {
    const ruleName = baseRuleNames4[p.name] || p.name;
    lines.push(`    "${ruleName}": {`);
    for (const e of entries) {
      if (e.cat4 && e.values[p.name] !== undefined) {
        lines.push(`        "${e.key}": ${JSON.stringify(e.values[p.name])},`);
      }
    }
    lines.push('    },');
  }
  lines.push('}');
  lines.push('');

  // --- BASE_RULES_3 ---
  const presets3 = presetCols.filter(p => p.mode === '三麻');
  const baseRuleNames3 = { '関東三麻': '三人麻雀（標準）' };

  lines.push('BASE_RULES_3 = {');
  for (const p of presets3) {
    const ruleName = baseRuleNames3[p.name] || p.name;
    lines.push(`    "${ruleName}": {`);
    for (const e of entries) {
      if (e.cat3 && e.values[p.name] !== undefined) {
        lines.push(`        "${e.key}": ${JSON.stringify(e.values[p.name])},`);
      }
    }
    lines.push('    },');
  }
  lines.push('}');
  lines.push('');

  // --- LABELS ---
  lines.push('LABELS = {');
  for (const e of entries) {
    if ((e.cat4 || e.cat3) && e.label) {
      lines.push(`    "${e.key}": "${e.label}",`);
    }
  }
  lines.push('}');
  lines.push('');

  // --- CATEGORIES_4 ---
  lines.push('CATEGORIES_4 = [');
  const cats4 = {};
  const cats4Order = [];
  for (const e of entries) {
    if (e.cat4) {
      if (!cats4[e.cat4]) { cats4[e.cat4] = { keys: [], ispenalty: false }; cats4Order.push(e.cat4); }
      cats4[e.cat4].keys.push(e.key);
      if (e.cat4.includes('チョンボ') || e.cat4.includes('上がり放棄') || e.cat4.includes('軽罰符')) {
        cats4[e.cat4].ispenalty = true;
      }
    }
  }
  for (const name of cats4Order) {
    const c = cats4[name];
    const keysStr = c.keys.map(k => `"${k}"`).join(', ');
    if (c.ispenalty) {
      lines.push(`    ("${name}", [${keysStr}], True),`);
    } else {
      lines.push(`    ("${name}", [${keysStr}]),`);
    }
  }
  lines.push(']');
  lines.push('');

  // --- CATEGORIES_3 ---
  lines.push('CATEGORIES_3 = [');
  const cats3 = {};
  const cats3Order = [];
  for (const e of entries) {
    if (e.cat3) {
      if (!cats3[e.cat3]) { cats3[e.cat3] = { keys: [], ispenalty: false }; cats3Order.push(e.cat3); }
      cats3[e.cat3].keys.push(e.key);
      if (e.cat3.includes('チョンボ') || e.cat3.includes('上がり放棄') || e.cat3.includes('軽罰符')) {
        cats3[e.cat3].ispenalty = true;
      }
    }
  }
  for (const name of cats3Order) {
    const c = cats3[name];
    const keysStr = c.keys.map(k => `"${k}"`).join(', ');
    if (c.ispenalty) {
      lines.push(`    ("${name}", [${keysStr}], True),`);
    } else {
      lines.push(`    ("${name}", [${keysStr}]),`);
    }
  }
  lines.push(']');

  return lines.join('\n');
}

// =====================================================================
// ファイル置換
// =====================================================================
const BEGIN_MARKER_JS = '/* __BEGIN_PRESETS__ */';
const END_MARKER_JS   = '/* __END_PRESETS__ */';
const BEGIN_MARKER_PY = '# __BEGIN_PRESETS__';
const END_MARKER_PY   = '# __END_PRESETS__';

function replaceMarkerBlock(content, beginMarker, endMarker, replacement) {
  const startIdx = content.indexOf(beginMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) return null;
  const before = content.substring(0, startIdx + beginMarker.length);
  const after = content.substring(endIdx);
  return before + '\n' + replacement + '\n' + after;
}

// =====================================================================
// メインビルド
// =====================================================================
function main() {
  console.log('📋 Reading CSV:', CSV_PATH);
  const { entries, presetCols } = loadPresetData();
  console.log(`   ${entries.length} entries, ${presetCols.length} presets found`);

  const jsCode = generateJs(entries, presetCols);
  const pyCode = generatePy(entries, presetCols);

  // Apply to index.html
  const htmlFiles = [
    path.join(ROOT, 'index.html'),
    path.join(ROOT, 'docs', 'index.html'),
  ];

  for (const htmlFile of htmlFiles) {
    if (!fs.existsSync(htmlFile)) { console.log(`⏭️ Skipping ${htmlFile} (not found)`); continue; }
    const content = fs.readFileSync(htmlFile, 'utf-8');
    const result = replaceMarkerBlock(content, BEGIN_MARKER_JS, END_MARKER_JS, jsCode);
    if (result === null) {
      console.error(`❌ Markers not found in ${htmlFile}`);
      console.error(`   Add ${BEGIN_MARKER_JS} and ${END_MARKER_JS} around the OPTIONS/BASE_RULES/CATEGORIES block.`);
      process.exit(1);
    }
    fs.writeFileSync(htmlFile, result, 'utf-8');
    console.log(`✅ Updated: ${path.relative(ROOT, htmlFile)}`);
  }

  // Apply to main.py (optional - only if markers exist)
  const pyFile = path.join(ROOT, 'main.py');
  if (fs.existsSync(pyFile)) {
    const content = fs.readFileSync(pyFile, 'utf-8');
    const result = replaceMarkerBlock(content, BEGIN_MARKER_PY, END_MARKER_PY, pyCode);
    if (result === null) {
      console.log(`⏭️ Skipping main.py (markers not found)`);
    } else {
      fs.writeFileSync(pyFile, result, 'utf-8');
      console.log(`✅ Updated: main.py`);
    }
  }

  console.log('\n🎉 Build complete!');
}

main();
