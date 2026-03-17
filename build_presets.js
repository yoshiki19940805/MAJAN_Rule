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

// 三麻で異なるカテゴリ名が必要な場合のマッピング
const CAT_RENAME_3 = {
  '役・ドラ': '役・ドラ・牌の扱い',
};


function loadPresetData() {
  const tsvText = fs.readFileSync(TSV_PATH, 'utf-8');
  const rows = parseTsv(tsvText);
  const header = rows[0];

  // メタデータ行（#設定）とデータ行を分離
  const metaRows = {};
  const dataRows = [];
  for (const row of rows.slice(1)) {
    if (row.length < 3) continue;
    if ((row[0] || '').startsWith('#')) {
      metaRows[row[1]] = row;
    } else {
      dataRows.push(row);
    }
  }

  // 新ヘッダー: 0=カテゴリ, 1=キー, 2=ラベル, 3=四麻選択肢, 4=三麻選択肢, 5~=プリセット値
  const presetCols = [];
  for (let c = 5; c < header.length; c++) {
    const m = header[c].match(/^(四麻|三麻):(.+)$/);
    if (m) {
      const readonly = metaRows['_readonly'] ? (metaRows['_readonly'][c] || '').trim() === '○' : true;
      const isDefault = metaRows['_default'] ? (metaRows['_default'][c] || '').trim() === '○' : true;
      presetCols.push({ col: c, mode: m[1], name: m[2], readonly, isDefault });
    }
  }

  const presets4 = presetCols.filter(p => p.mode === '四麻');
  const presets3 = presetCols.filter(p => p.mode === '三麻');

  // デフォルトプリセットを特定（ペナルティカテゴリ動的判定用）
  const defaultPreset4 = presets4.find(p => p.isDefault) || presets4[0];
  const defaultPreset3 = presets3.find(p => p.isDefault) || presets3[0];

  // ペナルティキーのカテゴリをデフォルトプリセットの値から動的に判定
  const PENALTY_CATS = ['チョンボ', '上がり放棄', '軽罰符'];
  function getPenaltyCat3(row, baseCat) {
    if (!PENALTY_CATS.some(pc => baseCat.includes(pc))) return null;
    if (!defaultPreset3) return null;
    const val = (row[defaultPreset3.col] || '').trim();
    // プリセット値がペナルティカテゴリ名と一致する場合、そのカテゴリに移動
    for (const pc of PENALTY_CATS) {
      if (val === pc) return pc;
    }
    return null; // 値がペナルティカテゴリ名でない場合、元のカテゴリのまま
  }

  const entries = dataRows.map(row => {
    const cat = row[0] || '';
    const key = row[1] || '';
    const opts4 = (row[3] || '').split(',').map(s => s.trim()).filter(Boolean);
    const opts3 = (row[4] || '').split(',').map(s => s.trim()).filter(Boolean);
    const values = Object.fromEntries(presetCols.map(p => [p.name, row[p.col] || '']));

    // 四麻/三麻の所属判定
    const has4 = opts4.length > 0 || presets4.some(p => (row[p.col] || '').trim() !== '');
    const has3 = opts3.length > 0 || presets3.some(p => (row[p.col] || '').trim() !== '');

    // 三麻カテゴリ: ペナルティは動的判定、その他はCAT_RENAME_3
    let cat3 = '';
    if (has3) {
      const penaltyCat = getPenaltyCat3(row, cat);
      cat3 = penaltyCat || CAT_RENAME_3[cat] || cat;
    }

    return {
      cat,
      cat4: has4 ? cat : '',
      cat3,
      key,
      label: row[2] || '',
      opts4,
      opts3,
      values,
    };
  });

  return { entries, presetCols };
}

// =====================================================================
// JavaScript コード生成
// =====================================================================

// _memo / _custom は自動の「カスタム」追加対象外
const SKIP_AUTO_CUSTOM = key => key.endsWith('_memo') || key.endsWith('_custom');

function generateJs(entries, presetCols) {
  const lines = [];
  const js = v => JSON.stringify(v);

  // 全ドロップダウンキーを収集（_memo除外）
  const allDropdownKeys4 = [];
  const allDropdownKeys3 = [];

  // --- OPTIONS_4 ---
  lines.push('const OPTIONS_4 = {');
  for (const e of entries) {
    if (e.opts4.length > 0 && e.cat4 && !SKIP_AUTO_CUSTOM(e.key)) {
      // 「カスタム」が無ければ末尾に自動追加
      const opts = [...e.opts4];
      if (!opts.includes('カスタム')) opts.push('カスタム');
      lines.push(`  ${e.key}:[${opts.map(js).join(',')}],`);
      allDropdownKeys4.push(e.key);
    } else if (e.opts4.length > 0 && e.cat4) {
      lines.push(`  ${e.key}:[${e.opts4.map(js).join(',')}],`);
    }
  }
  lines.push('};');
  lines.push('');

  // --- OPTIONS_3 ---
  lines.push('const OPTIONS_3 = {');
  for (const e of entries) {
    if (e.opts3.length > 0 && e.cat3 && !SKIP_AUTO_CUSTOM(e.key)) {
      const opts = [...e.opts3];
      if (!opts.includes('カスタム')) opts.push('カスタム');
      lines.push(`  ${e.key}:[${opts.map(js).join(',')}],`);
      allDropdownKeys3.push(e.key);
    } else if (e.opts3.length > 0 && e.cat3) {
      lines.push(`  ${e.key}:[${e.opts3.map(js).join(',')}],`);
    }
  }
  lines.push('};');
  lines.push('');

  // --- customDropdownKeys (全ドロップダウンキーの和集合) ---
  const allCustomKeys = [...new Set([...allDropdownKeys4, ...allDropdownKeys3])];
  lines.push(`const customDropdownKeys = new Set(${js(allCustomKeys)});`);
  lines.push('');

  // --- BASE_RULES_4 ---
  const presets4 = presetCols.filter(p => p.mode === '四麻');

  lines.push('// --- 基準ルール ---');
  lines.push('const BASE_RULES_4 = {');
  for (const p of presets4) {
    const ruleName = p.name;
    const settings = [];
    for (const e of entries) {
      if (e.cat4 && e.values[p.name] !== undefined) {
        settings.push(`${e.key}:${js(e.values[p.name])}`);
        // _custom 値を自動追加（_memo系除外）
        if (!SKIP_AUTO_CUSTOM(e.key) && allDropdownKeys4.includes(e.key)) {
          settings.push(`${e.key}_custom:""`);
        }
      }
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
    lines.push(`const DEFAULT_4 = {...BASE_RULES_4[${js(presets4[0].name)}]};`);
  }
  lines.push('');

  // --- BASE_RULES_3 ---
  const presets3 = presetCols.filter(p => p.mode === '三麻');

  lines.push('const BASE_RULES_3 = {');
  for (const p of presets3) {
    const ruleName = p.name;
    const settings = [];
    for (const e of entries) {
      if (e.cat3 && e.values[p.name] !== undefined) {
        settings.push(`${e.key}:${js(e.values[p.name])}`);
        if (!SKIP_AUTO_CUSTOM(e.key) && allDropdownKeys3.includes(e.key)) {
          settings.push(`${e.key}_custom:""`);
        }
      }
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
    lines.push(`const DEFAULT_3 = {...BASE_RULES_3[${js(presets3[0].name)}]};`);
  }
  lines.push('');

  // --- LABELS ---
  lines.push('// --- ラベル ---');
  lines.push('const LABELS = {');
  for (const e of entries) {
    if ((e.cat4 || e.cat3) && e.label) {
      lines.push(`  ${e.key}:${js(e.label)},`);
      // _custom 用ラベルを自動生成（_memo除外）
      if (!SKIP_AUTO_CUSTOM(e.key) && allCustomKeys.includes(e.key)) {
        lines.push(`  ${e.key}_custom:${js(e.label + '（カスタム）')},`);
      }
    }
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
        // _custom キーはカテゴリに含めない（ビルド時自動処理のため）
        if (!e.key.endsWith('_custom')) cats[c].keys.push(e.key);
        if (c.includes('チョンボ') || c.includes('上がり放棄') || c.includes('軽罰符')) cats[c].penalty = true;
      }
    }
    let num = 1;
    for (const c of order) {
      const d = cats[c];
      if (d.keys.length === 0) continue; // 空カテゴリはスキップ
      const orderedKeys = enforceKeyOrder(c, d.keys);
      const ks = orderedKeys.map(js).join(',');
      const numbered = `${num}. ${c}`;
      lines.push(d.penalty ? `  [${js(numbered)},[${ks}], true],` : `  [${js(numbered)},[${ks}]],`);
      num++;
    }
    lines.push('];');
  }
  lines.push('// --- カテゴリ ---');
  genCats('CATEGORIES_4', 'cat4');
  lines.push('');
  genCats('CATEGORIES_3', 'cat3');

  // --- PRESET_INJECTIONS (初期プリセット自動生成) ---
  lines.push('');
  lines.push('// --- 初期プリセット定義 ---');
  // IDの生成: プリセット名からURLセーフなIDを作成
  function makePresetId(mode, name) {
    // 既知のID対応を保持（既存データとの互換性）
    const knownIds = {
      '四麻:雀魂（四麻・段位戦）': 'preset_jantama_4',
      '四麻:天鳳（四麻）': 'preset_tenhou_4',
      '四麻:Mリーグ公式（四麻）': 'preset_mleague_4',
      '三麻:三人麻雀（標準）': 'preset_zoo_3',
    };
    const fullKey = `${mode}:${name}`;
    if (knownIds[fullKey]) return knownIds[fullKey];
    // 新規: preset_ + ハッシュ
    const hash = name.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    const modeKey = mode === '四麻' ? '4' : '3';
    return `preset_${Math.abs(hash).toString(36)}_${modeKey}`;
  }

  // 短い表示名を生成（括弧内の補足を除去）
  function shortName(name) {
    return name.replace(/[（(].+[）)]$/, '').trim();
  }

  const allPresets = [];
  for (const p of presetCols) {
    const id = makePresetId(p.mode, p.name);
    const mode = p.mode === '四麻' ? '四麻' : '三麻';
    const baseVar = p.mode === '四麻' ? 'BASE_RULES_4' : 'BASE_RULES_3';
    allPresets.push({ id, mode, name: shortName(p.name), fullName: p.name, baseVar, readonly: p.readonly, isDefault: p.isDefault });
  }
  lines.push(`const PRESET_INJECTIONS = [`);
  for (const p of allPresets) {
    lines.push(`  { id: ${js(p.id)}, mode: ${js(p.mode)}, name: ${js(p.name)}, readonly: ${p.readonly}, date: '1970/01/01 00:00:00', settings: {...${p.baseVar}[${js(p.fullName)}]} },`);
  }
  lines.push('];');

  // デフォルト標準ルールのID
  const default4Ids = allPresets.filter(p => p.mode === '四麻' && p.isDefault).map(p => p.id);
  const default3Ids = allPresets.filter(p => p.mode === '三麻' && p.isDefault).map(p => p.id);
  lines.push(`const DEFAULT_PRESET_IDS_4 = ${js(default4Ids)};`);
  lines.push(`const DEFAULT_PRESET_IDS_3 = ${js(default3Ids)};`);

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
