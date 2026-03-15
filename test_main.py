#!/usr/bin/env python3
"""test_main.py - 麻雀ルール共有アプリ 自動テスト"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import (
    OPTIONS_4, OPTIONS_3, BASE_RULES_4, BASE_RULES_3,
    DEFAULT_4, DEFAULT_3, LABELS, CATEGORIES_4, CATEGORIES_3,
    FONT_PATH
)

passed = 0
failed = 0

def ok(msg):
    global passed; passed += 1; print(f"  ✅ {msg}")

def ng(msg):
    global failed; failed += 1; print(f"  ❌ {msg}")

def check(cond, msg):
    ok(msg) if cond else ng(msg)

# =====================================================================
print("\n" + "=" * 50)
print("テスト1: マスターデータ整合性")
print("=" * 50)

# 四麻
for bname, bvals in BASE_RULES_4.items():
    for k, v in bvals.items():
        check(k in OPTIONS_4, f"4麻 {bname}: '{k}' in OPTIONS")
        if k != "shugi_memo":
            check(v in OPTIONS_4[k], f"4麻 {bname}: '{k}'='{v}' valid")

# 三麻
for bname, bvals in BASE_RULES_3.items():
    for k, v in bvals.items():
        check(k in OPTIONS_3, f"3麻 {bname}: '{k}' in OPTIONS")
        if k != "shugi_memo":
            check(v in OPTIONS_3[k], f"3麻 {bname}: '{k}'='{v}' valid")

# LABELS
all_keys = set(list(OPTIONS_4.keys()) + list(OPTIONS_3.keys()))
for k in sorted(all_keys):
    check(k in LABELS, f"LABELS に '{k}' 存在")

# =====================================================================
print("\n" + "=" * 50)
print("テスト2: カテゴリ網羅性")
print("=" * 50)

for k in OPTIONS_4:
    found = any(k in ck for _, ck in CATEGORIES_4)
    check(found, f"4麻 CATEGORIES に '{k}' 含む")

for k in OPTIONS_3:
    found = any(k in ck for _, ck in CATEGORIES_3)
    check(found, f"3麻 CATEGORIES に '{k}' 含む")

# =====================================================================
print("\n" + "=" * 50)
print("テスト3: CRUD")
print("=" * 50)

rules = []

# 四麻作成
r4 = {"id": "1", "name": "テスト四麻", "mode": "四麻",
      "base_rule": list(BASE_RULES_4.keys())[0], "settings": DEFAULT_4.copy()}
rules.append(r4)
check(len(rules) == 1, "四麻作成")
check(len(r4["settings"]) > 30, f"四麻 設定項目数 ({len(r4['settings'])})")

# 三麻作成
r3 = {"id": "2", "name": "テスト三麻", "mode": "三麻",
      "base_rule": list(BASE_RULES_3.keys())[0], "settings": DEFAULT_3.copy()}
rules.append(r3)
check(len(rules) == 2, "三麻作成")
check(len(r3["settings"]) > 30, f"三麻 設定項目数 ({len(r3['settings'])})")

# 削除
rules = [r for r in rules if r["id"] != "1"]
check(len(rules) == 1, "削除後")

# =====================================================================
print("\n" + "=" * 50)
print("テスト4: 差分検出（四麻のみ）")
print("=" * 50)

test_r = {"id": "t", "name": "diff", "mode": "四麻",
          "base_rule": "雀魂（四麻・段位戦）", "settings": DEFAULT_4.copy()}
base = BASE_RULES_4["雀魂（四麻・段位戦）"]
diffs = {k: v for k, v in test_r["settings"].items() if k != "shugi_memo" and v != base.get(k)}
check(len(diffs) > 0, f"差分あり ({len(diffs)}件)")
for k, v in diffs.items():
    print(f"    {LABELS.get(k, k)}: {v} ≠ 基準:{base.get(k)}")

# =====================================================================
print("\n" + "=" * 50)
print("テスト5: 罰則の個別設定確認")
print("=" * 50)

pen_keys_4 = ["chombo_batsu","chombo_taiou","pen_goron_taopai","pen_noten_reach",
              "pen_reach_bad_ankan","pen_goron_no_taopai","pen_gonaki_sarashi",
              "pen_kuikae_ihan","pen_tahai","pen_gonaki_hassei","pen_reach_torikeshi","pen_shouhai"]

for k in pen_keys_4:
    check(k in OPTIONS_4, f"4麻罰則 '{k}' in OPTIONS")
    check(k in LABELS, f"4麻罰則 '{k}' in LABELS")
    check(k in DEFAULT_4, f"4麻罰則 '{k}' in DEFAULT")

for k in pen_keys_4:
    check(k in OPTIONS_3, f"3麻罰則 '{k}' in OPTIONS")
    check(k in DEFAULT_3, f"3麻罰則 '{k}' in DEFAULT")

# =====================================================================
print("\n" + "=" * 50)
print("テスト6: 祝儀の個別設定確認")
print("=" * 50)

shugi_keys_4 = ["shugi_ippatsu","shugi_ura","shugi_aka","shugi_ym_tsumo","shugi_ym_ron","shugi_kazoe"]
for k in shugi_keys_4:
    check(k in OPTIONS_4, f"4麻祝儀 '{k}' in OPTIONS")
    check(k in LABELS, f"4麻祝儀 '{k}' in LABELS")

shugi_keys_3 = ["shugi_ippatsu","shugi_ura","shugi_niji","shugi_pocchi","shugi_ym_tsumo","shugi_ym_ron"]
for k in shugi_keys_3:
    check(k in OPTIONS_3, f"3麻祝儀 '{k}' in OPTIONS")
    check(k in LABELS, f"3麻祝儀 '{k}' in LABELS")

# =====================================================================
print("\n" + "=" * 50)
print("テスト7: パオの個別設定確認")
print("=" * 50)

pao_keys_4 = ["pao_daisangen","pao_daisushi","pao_sukantu","pao_tsumo","pao_ron"]
for k in pao_keys_4:
    check(k in OPTIONS_4, f"4麻パオ '{k}'")
    check(k in LABELS, f"4麻 LABELS '{k}'")

pao_keys_3 = ["pao_daisangen","pao_daisushi","pao_tsumo","pao_ron"]
for k in pao_keys_3:
    check(k in OPTIONS_3, f"3麻パオ '{k}'")

# =====================================================================
print("\n" + "=" * 50)
print("テスト8: 三麻専用項目")
print("=" * 50)

sanma_only = ["tsumozon","fu_keisan","tsumopin","tenpai_ryou","tsumo_yama",
              "aka_niji","kita","hanapai","kan_dora","niken_reach","shiro_pocchi",
              "sp_manzu_honitsu","sp_daisharin","sp_renho","sp_nagashi_ym",
              "sp_4mai_chii","sp_shosharin","w_yakuman",
              "shugi_niji","shugi_pocchi","tobi_shou","tobi_bunpai"]
for k in sanma_only:
    check(k in OPTIONS_3, f"3麻専用 '{k}' in OPTIONS")
    check(k in LABELS, f"3麻専用 '{k}' in LABELS")

# =====================================================================
print("\n" + "=" * 50)
print("テスト9: 画像生成")
print("=" * 50)

from main import main as main_func
from PIL import Image
import io, base64

def gen_img(rd):
    from main import (FONT_PATH, LABELS, CATEGORIES_4, CATEGORIES_3,
                      BASE_RULES_4, BASE_RULES_3, OPTIONS_4, OPTIONS_3)
    from PIL import Image, ImageDraw, ImageFont
    settings = rd["settings"]
    num = len([k for k in settings if k != "shugi_memo"])
    ih = max(1600, 300 + num * 48)
    img = Image.new('RGB', (800, ih), '#FFFFFF')
    draw = ImageDraw.Draw(img)
    try:
        if os.path.exists(FONT_PATH):
            font = ImageFont.truetype(FONT_PATH, 22)
        else:
            font = ImageFont.load_default()
    except:
        font = ImageFont.load_default()

    draw.text((25, 25), f"{rd['name']} ({rd['mode']})", fill='#000', font=font)
    cats = CATEGORIES_4 if rd['mode'] == '四麻' else CATEGORIES_3
    y = 100
    for _, ck in cats:
        for k in ck:
            if k == "shugi_memo": continue
            v = settings.get(k, "")
            draw.text((30, y), f"{LABELS.get(k,k)}: {v}", fill='#333', font=font)
            y += 42
    img = img.crop((0, 0, 800, y+25))
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode('utf-8')

b4 = gen_img(r4)
check(len(b4) > 100, "画像base64生成（四麻）")

pil4 = Image.open(io.BytesIO(base64.b64decode(b4)))
check(pil4.format == "PNG", "PNG読み込み可")

b3 = gen_img(r3)
check(len(b3) > 100, "画像base64生成（三麻）")

out_dir = os.path.dirname(os.path.abspath(__file__))
for name, b in [("test_4ma.png", b4), ("test_3ma.png", b3)]:
    p = os.path.join(out_dir, name)
    with open(p, "wb") as f:
        f.write(base64.b64decode(b))
    check(os.path.exists(p), f"ファイル保存 {name}")

# =====================================================================
print("\n" + "=" * 50)
total = passed + failed
print(f"結果: {passed} PASSED / {failed} FAILED / {total} TOTAL")
print("=" * 50)
if failed == 0:
    print("🎉 全テスト合格！")
else:
    print("⚠️ 失敗あり")
    sys.exit(1)
