import flet as ft
import io
import base64
import os
import urllib.request
import uuid
from PIL import Image, ImageDraw, ImageFont

# --- フォントのダウンロードと読み込み ---
FONT_URL = "https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Bold.otf"
FONT_PATH = "NotoSansCJKjp-Bold.otf"

if not os.path.exists(FONT_PATH):
    try:
        urllib.request.urlretrieve(FONT_URL, FONT_PATH)
    except Exception as e:
        print(f"Failed to download font: {e}")

# =====================================================================
# マスターデータ定義  ※各項目を個別設定できるよう細分化
# =====================================================================

# --- 四麻 選択肢 ---
OPTIONS_4 = {
    # 1. 基本設定
    "length":        ["東南戦", "東風戦"],
    "mochi_ten":     ["25000点", "30000点", "カスタム"],
    "mochi_ten_custom": [""],
    "kaeshi_ten":    ["30000点", "25000点", "カスタム"],
    "kaeshi_ten_custom": [""],
    "uma":           ["10-20", "10-30", "5-15", "カスタム"],
    "uma_custom":    [""],
    "tobi":          ["あり（0点未満で終了）", "あり（0点ちょうどで終了）", "なし"],
    "nishiiri":      ["なし", "あり"],
    "tsumopin":      ["あり", "なし"],
    "ipponba":       ["300点", "1500点", "カスタム"],
    "ipponba_custom": [""],
    # 2. 進行
    "renchan":       ["テンパイ連荘", "テンパイ連荘（形テンNG）", "アガリ連荘"],
    "oras_oya":      ["アガリ止め・テンパイ止めあり", "アガリ止め・テンパイ止めなし", "カスタム"],
    "oras_oya_custom": [""],
    "tochu_kyushu":  ["あり", "なし"],
    "tochu_sufon":   ["あり", "なし"],
    "tochu_sukan":   ["あり", "なし"],
    "tochu_sucha":   ["あり", "なし"],
    "tochu_sancha":  ["あり", "なし"],
    "tochu_honba":   ["積む", "積まない"],
    "double_ron":    ["あり", "なし（頭ハネ）"],
    "triple_ron":    ["全員アガリ", "流局（三家和）", "頭ハネ"],
    "naki_priority": ["発声優先（同時ならポン・カン優先）", "ポン・カン優先"],
    "tsumo_yama":    ["王牌14枚残し", "ドラ表示牌の隣までツモり切り", "カスタム"],
    # 3. 役・ドラ
    "kuitan":        ["あり", "なし"],
    "atozuke":       ["あり", "なし"],
    "kuikae":        ["禁止", "あり"],
    "aka_dora":      ["各1枚（計3枚）", "なし", "カスタム"],
    "kan_dora":      ["先めくり", "後めくり", "カスタム"],
    "kiriage":       ["あり", "なし"],
    "renpai_toitsu": ["2符", "4符"],
    "nagashi":       ["あり（流局時成立）", "なし"],
    "kokushi_ankan": ["あり", "なし"],
    "shiro_pocchi":  ["なし", "あり（リーチ後オールマイティ）"],
    "yakuman_type":  ["雀魂に準ずる", "天鳳に準ずる", "カスタム"],
    "yakuman_custom_memo": [""],
    "yakuman_fukugo":["なし", "あり", "カスタム"],
    "kazoe_yakuman": ["13飜以上", "なし"],
    # ローカルルール（四麻）
    "sp_daisharin":  ["なし", "あり（清一七対子）"],
    "sp_renho":      ["なし", "あり"],
    "sp_nagashi_ym": ["なし", "あり"],
    "sp_4mai_chii":  ["なし", "あり（2翻）"],
    "sp_shosharin":  ["なし", "あり（混一七対子・6翻）"],
    # 4. リーチ
    "furiten_reach": ["あり", "なし", "カスタム"],
    "open_reach":    ["なし", "あり", "カスタム"],
    "furiten_open_reach": ["あり", "なし", "カスタム"],
    "tsumo_nashi_reach": ["不可", "可"],
    "reach_1000":    ["あり", "なし", "あり（局終了時にトビ）", "あり（局終了時に0点でトビ）"],
    "reach_ankan_okuri":  ["可", "不可"],
    "reach_ankan_machi":  ["可", "不可"],
    "reach_ankan_mentsu": ["可", "不可"],
    # 5. 祝儀（個別）
    "shugi_type":    ["鳴き祝儀あり", "門前祝儀のみ", "なし"],
    "shugi_ippatsu": ["あり", "なし"],
    "shugi_ura":     ["あり", "なし"],
    "shugi_aka":     ["鳴き祝儀", "門前祝儀", "なし"],
    "shugi_ym_tsumo":["5枚オール", "3枚オール", "なし"],
    "shugi_ym_ron":  ["10枚", "5枚", "なし"],
    "shugi_kazoe":   ["対象外", "対象"],
    "shugi_memo":    [""],
    # 6. パオ（個別）
    "pao_daisangen": ["あり", "なし"],
    "pao_daisushi":  ["あり", "なし"],
    "pao_sukantu":   ["なし", "あり"],
    "pao_tsumo":     ["パオの人が全額", "通常精算"],
    "pao_ron":       ["パオの人と振込者で折半", "振込者が全額"],
    # 7. 罰則（状況別）
    "chombo_batsu": ["満貫払い", "倍満払い", "カスタム", "なし"],
    "chombo_memo":   [""],
    "chombo_taiou": ["やり直し", "流局扱い", "親なら流局", "なし"],
    "pen_goron_taopai": ["チョンボ", "アガリ放棄", "軽罰符", "カスタム", "なし"],
    "pen_noten_reach": ["チョンボ", "アガリ放棄", "軽罰符", "カスタム", "なし"],
    "pen_reach_bad_ankan": ["チョンボ", "アガリ放棄", "軽罰符", "カスタム", "なし"],
    "pen_goron_no_taopai": ["アガリ放棄", "チョンボ", "軽罰符", "カスタム", "なし"],
    "pen_gonaki_sarashi": ["アガリ放棄", "チョンボ", "軽罰符", "カスタム", "なし"],
    "pen_kuikae_ihan": ["アガリ放棄", "チョンボ", "軽罰符", "カスタム", "なし"],
    "pen_tahai": ["アガリ放棄", "チョンボ", "軽罰符", "カスタム", "なし"],
    "pen_gonaki_hassei": ["軽罰符", "アガリ放棄", "チョンボ", "カスタム", "なし"],
    "pen_reach_torikeshi": ["軽罰符", "アガリ放棄", "チョンボ", "カスタム", "なし"],
    "pen_shouhai": ["軽罰符", "アガリ放棄", "チョンボ", "カスタム", "なし"],
}

# --- 四麻 基準ルール ---
_BASE_4_COMMON = {
    "length": "東南戦", "mochi_ten": "25000点", "mochi_ten_custom": "",
    "kaeshi_ten": "30000点", "kaeshi_ten_custom": "",
    "tobi": "あり（0点未満で終了）", "tsumopin": "あり", "ipponba": "300点", "ipponba_custom": "",
    "renchan": "テンパイ連荘", "oras_oya": "アガリ止め・テンパイ止めあり", "oras_oya_custom": "",
    "tochu_kyushu": "あり", "tochu_sufon": "あり", "tochu_sukan": "あり",
    "tochu_sucha": "あり", "tochu_sancha": "あり",
    "tochu_honba": "積む", "naki_priority": "発声優先（同時ならポン・カン優先）",
    "tsumo_yama": "王牌14枚残し",
    "kuitan": "あり", "atozuke": "あり", "kuikae": "禁止",
    "aka_dora": "各1枚（計3枚）", "kan_dora": "先めくり", "renpai_toitsu": "2符",
    "kokushi_ankan": "あり", "yakuman_fukugo": "なし", "kazoe_yakuman": "13飜以上",
    "yakuman_custom_memo": "",
    "furiten_reach": "あり", "open_reach": "なし", "furiten_open_reach": "なし",
    "tsumo_nashi_reach": "不可",
    "reach_1000": "なし",
    "reach_ankan_okuri": "可", "reach_ankan_machi": "不可", "reach_ankan_mentsu": "不可",
}

BASE_RULES_4 = {
    "雀魂（四麻・段位戦）": {
        **_BASE_4_COMMON,
        "uma": "5-15", "uma_custom": "", "nishiiri": "あり",
        "double_ron": "あり", "triple_ron": "全員アガリ",
        "kiriage": "なし", "nagashi": "あり（流局時成立）",
        "yakuman_type": "雀魂に準ずる",
        "chombo_batsu": "なし", "chombo_taiou": "なし",
        "pen_goron_taopai": "なし", "pen_noten_reach": "なし", "pen_reach_bad_ankan": "なし",
        "pen_goron_no_taopai": "なし", "pen_gonaki_sarashi": "なし", "pen_kuikae_ihan": "なし",
        "pen_tahai": "なし", "pen_gonaki_hassei": "なし", "pen_reach_torikeshi": "なし", "pen_shouhai": "なし",
        "shugi_type": "なし", "shugi_ippatsu": "なし", "shugi_ura": "なし", "shugi_aka": "なし",
        "shugi_ym_tsumo": "なし", "shugi_ym_ron": "なし", "shugi_kazoe": "対象外", "shugi_memo": "",
        "pao_daisangen": "あり", "pao_daisushi": "あり", "pao_sukantu": "なし",
        "pao_tsumo": "パオの人が全額", "pao_ron": "パオの人と振込者で折半",
        "sp_daisharin": "なし", "sp_renho": "なし", "sp_nagashi_ym": "なし", "sp_4mai_chii": "なし", "sp_shosharin": "なし",
    },
    "Mリーグ公式（四麻）": {
        **_BASE_4_COMMON,
        "uma": "10-30", "uma_custom": "", "nishiiri": "なし", "tobi": "なし",
        "oras_oya": "アガリ止め・テンパイ止めなし",
        "tochu_kyushu": "なし", "tochu_sufon": "なし", "tochu_sukan": "なし",
        "tochu_sucha": "なし", "tochu_sancha": "なし",
        "double_ron": "なし（頭ハネ）", "triple_ron": "頭ハネ",
        "kiriage": "あり", "nagashi": "なし",
        "yakuman_type": "カスタム",
    },
    "天鳳（四麻）": {
        **_BASE_4_COMMON,
        "uma": "10-20", "nishiiri": "あり",
        "double_ron": "あり", "triple_ron": "流局（三家和）",
        "kiriage": "なし", "nagashi": "あり（流局時成立）",
        "yakuman_type": "天鳳に準ずる",
        "chombo_batsu": "なし", "chombo_taiou": "なし",
        "pen_goron_taopai": "なし", "pen_noten_reach": "なし", "pen_reach_bad_ankan": "なし",
        "pen_goron_no_taopai": "なし", "pen_gonaki_sarashi": "なし", "pen_kuikae_ihan": "なし",
        "pen_tahai": "なし", "pen_gonaki_hassei": "なし", "pen_reach_torikeshi": "なし", "pen_shouhai": "なし",
        "shugi_type": "なし", "shugi_ippatsu": "なし", "shugi_ura": "なし", "shugi_aka": "なし",
        "shugi_ym_tsumo": "なし", "shugi_ym_ron": "なし", "shugi_kazoe": "対象外", "shugi_memo": "",
        "pao_daisangen": "あり", "pao_daisushi": "あり", "pao_sukantu": "なし",
        "pao_tsumo": "パオの人が全額", "pao_ron": "パオの人と振込者で折半",
        "sp_daisharin": "なし", "sp_renho": "なし", "sp_nagashi_ym": "なし", "sp_4mai_chii": "なし", "sp_shosharin": "なし",
    },
}

DEFAULT_4 = {
    **_BASE_4_COMMON,
    "uma": "10-20", "nishiiri": "あり",
    "double_ron": "あり", "triple_ron": "全員アガリ",
    "kiriage": "あり", "nagashi": "あり（流局時成立）",
    "yakuman_type": "雀魂に準ずる",
    # デフォルトは祝儀あり
    "shugi_type": "鳴き祝儀あり", "shugi_ippatsu": "あり", "shugi_ura": "あり",
    "shugi_aka": "鳴き祝儀",
    "shugi_ym_tsumo": "5枚オール", "shugi_ym_ron": "10枚",
    "shugi_kazoe": "対象外", "shugi_memo": "",
    # パオ
    "pao_daisangen": "あり", "pao_daisushi": "あり", "pao_sukantu": "なし",
    "pao_tsumo": "パオの人が全額", "pao_ron": "パオの人と振込者で折半",
    # 罰則
    "chombo_batsu": "満貫払い", "chombo_memo": "", "chombo_taiou": "やり直し",
    "pen_goron_taopai": "チョンボ", "pen_noten_reach": "チョンボ",
    "pen_reach_bad_ankan": "チョンボ",
    "pen_goron_no_taopai": "アガリ放棄", "pen_gonaki_sarashi": "アガリ放棄",
    "pen_kuikae_ihan": "アガリ放棄", "pen_tahai": "アガリ放棄",
    "pen_gonaki_hassei": "軽罰符", "pen_reach_torikeshi": "軽罰符",
    "pen_shouhai": "軽罰符",
    # ローカル役（雀魂・天酹にはない）
    "shiro_pocchi": "なし",
    "sp_daisharin": "なし", "sp_renho": "なし", "sp_nagashi_ym": "なし",
    "sp_4mai_chii": "なし", "sp_shosharin": "なし",
}

# --- 三麻 選択肢 ---
OPTIONS_3 = {
    # 1. 基本設定
    "length":        ["東南戦", "東風戦"],
    "mochi_ten":     ["30000点", "50000点", "カスタム"],
    "mochi_ten_custom": [""],
    "kaeshi_ten":    ["35000点", "50000点", "カスタム"],
    "kaeshi_ten_custom": [""],
    "uma":           ["+20/±0/-20", "+30/±0/-30", "なし"],
    "tobi":          ["あり（0点ちょうどで終了）", "あり（0点未満で終了）", "なし"],
    "tsumozon":      ["なし", "あり"],
    "fu_keisan":     ["なし（専用点数表）", "あり"],
    "tsumopin":      ["あり", "なし"],
    "ipponba":       ["1000点", "カスタム"],
    "ipponba_custom": [""],
    "tenpai_ryou":   ["場に2000点", "場に3000点"],
    # 2. 進行
    "renchan":       ["テンパイ連荘", "テンパイ連荘（形テンNG）", "アガリ連荘"],
    "oras_oya":      ["アガリ止め・テンパイ止めあり", "アガリ止め・テンパイ止めなし", "カスタム"],
    "oras_oya_custom": [""],
    "agariyame":     ["あり（トップ時強制終了）", "なし"],
    "tochu_kyushu":  ["あり", "なし"],
    "tochu_sukan":   ["あり", "なし"],
    "tochu_sancha":  ["あり", "なし"],
    "tochu_honba":   ["積む", "積まない"],
    "tochu_ryukyoku":["なし（3人リーチも続行）", "あり"],
    "double_ron":    ["あり", "なし（頭ハネ）"],
    "tsumo_yama":    ["ドラ表示牌の隣までツモり切り", "王牌14枚残し", "カスタム"],
    # 3. 役・ドラ・牌
    "kuitan":        ["あり", "なし"],
    "atozuke":       ["あり", "なし"],
    "aka_niji":      ["5索5筒 赤2虹2（計8枚・全ドラ）", "赤ドラ各1枚", "なし"],
    "kita":          ["共通役牌（北抜きなし）", "抜きドラ"],
    "hanapai":       ["あり（空気扱い・一発消えず・嶺上開花なし）", "なし"],
    "kan_dora":      ["先めくり", "後めくり", "カスタム"],
    # 4. リーチ
    "reach_1000":    ["あり", "なし", "あり（局終了時にトビ）", "あり（局終了時に0点でトビ）"],
    "furiten_reach": ["可能（見逃しツモ可）", "不可", "カスタム"],
    "open_reach":    ["あり（全晒し・フリテン可・放銃時役満払い）", "なし", "カスタム"],
    "furiten_open_reach": ["あり", "なし", "カスタム"],
    "reach_ankan_okuri":  ["可", "不可"],
    "reach_ankan_machi":  ["可", "不可"],
    "reach_ankan_mentsu": ["可", "不可"],
    "reach_kan":     ["待ち不変ならOK", "不可"],
    # 5. 特殊役
    "niken_reach":   ["2軒リーチで残り1人手牌公開", "なし"],
    "shiro_pocchi":  ["あり（リーチ後オールマイティ）", "なし"],
    "sp_manzu_honitsu":["あり", "なし"],
    "sp_daisharin":  ["あり（清一七対子）", "なし"],
    "sp_renho":      ["あり", "なし"],
    "sp_nagashi_ym": ["あり", "なし"],
    "sp_4mai_chii":  ["あり（2翻）", "なし"],
    "sp_shosharin":  ["あり（混一七対子・6翻）", "なし"],
    "kazoe_yakuman": ["14飜以上", "13飜以上", "なし"],
    "w_yakuman":     ["なし", "あり", "カスタム"],
    "kokushi_ankan": ["あり", "なし"],
    # 6. 祝儀
    "shugi_ippatsu": ["あり", "なし"],
    "shugi_ura":     ["あり", "なし"],
    "shugi_niji":    ["あり（鳴き祝儀あり）", "あり（鳴き祝儀なし）", "なし"],
    "shugi_pocchi":  ["あり（リーチ後白ポッチツモ）", "なし"],
    "shugi_ym_tsumo":["5枚", "3枚", "なし"],
    "shugi_ym_ron":  ["10枚", "5枚", "なし"],
    "shugi_kazoe":   ["対象外", "対象"],
    "tobi_shou":     ["あり（飛ばされた人が場にチップ2枚）", "なし"],
    "tobi_bunpai":   ["1人飛ばし2枚・2人飛ばし1枚ずつ等", "飛ばした人が全取り"],
    "shugi_memo":    [""],
    # 7. パオ
    "pao_daisangen": ["あり", "なし"],
    "pao_daisushi":  ["あり", "なし"],
    "pao_tsumo":     ["パオが全額（チップ5枚）", "通常精算"],
    "pao_ron":       ["パオと振込者で折半（チップ各5枚）", "振込者が全額"],
    # 8. 罰則（状況別）
    "chombo_batsu": ["倍満払い", "満貫払い", "なし"],
    "chombo_taiou": ["やり直し", "流局扱い", "親なら流局", "なし"],
    "pen_goron_taopai": ["チョンボ", "アガリ放棄", "軽罰符", "カスタム", "なし"],
    "pen_noten_reach": ["チョンボ", "アガリ放棄", "軽罰符", "カスタム", "なし"],
    "pen_reach_bad_ankan": ["チョンボ", "アガリ放棄", "軽罰符", "カスタム", "なし"],
    "pen_goron_no_taopai": ["アガリ放棄", "チョンボ", "軽罰符", "カスタム", "なし"],
    "pen_gonaki_sarashi": ["アガリ放棄", "チョンボ", "軽罰符", "カスタム", "なし"],
    "pen_kuikae_ihan": ["アガリ放棄", "チョンボ", "軽罰符", "カスタム", "なし"],
    "pen_tahai": ["アガリ放棄", "チョンボ", "軽罰符", "カスタム", "なし"],
    "pen_gonaki_hassei": ["軽罰符", "アガリ放棄", "チョンボ", "カスタム", "なし"],
    "pen_reach_torikeshi": ["軽罰符", "アガリ放棄", "チョンボ", "カスタム", "なし"],
    "pen_shouhai": ["軽罰符", "アガリ放棄", "チョンボ", "カスタム", "なし"],
}

BASE_RULES_3 = {
    "三人麻雀（標準）": {
        "length": "東南戦", "mochi_ten": "30000点", "kaeshi_ten": "35000点",
        "uma": "+20/±0/-20", "tobi": "あり（0点ちょうどで終了）",
        "tsumozon": "なし", "fu_keisan": "なし（専用点数表）", "tsumopin": "あり",
        "ipponba": "1000点", "ipponba_custom": "", "tenpai_ryou": "場に2000点",
        "renchan": "テンパイ連荘", "oras_oya": "アガリ止め・テンパイ止めあり", "oras_oya_custom": "",
        "agariyame": "あり（トップ時強制終了）",
        "tochu_kyushu": "あり", "tochu_sukan": "あり", "tochu_sancha": "あり",
        "tochu_honba": "積む", "tochu_ryukyoku": "なし（3人リーチも続行）",
        "double_ron": "あり",
        "tsumo_yama": "ドラ表示牌の隣までツモり切り",
        "kuitan": "あり", "atozuke": "あり",
        "aka_niji": "5索5筒 赤2虹2（計8枚・全ドラ）",
        "kita": "共通役牌（北抜きなし）",
        "hanapai": "あり（空気扱い・一発消えず・嶺上開花なし）", "kan_dora": "先めくり",
        "reach_1000": "あり（局終了時にトビ）", "furiten_reach": "可能（見逃しツモ可）",
        "open_reach": "あり（全晒し・フリテン可・放銃時役満払い）",
        "furiten_open_reach": "あり",
        "reach_ankan_okuri": "可", "reach_ankan_machi": "不可", "reach_ankan_mentsu": "不可",
        "reach_kan": "待ち不変ならOK",
        "niken_reach": "2軒リーチで残り1人手牌公開", "shiro_pocchi": "あり（リーチ後オールマイティ）",
        "sp_manzu_honitsu": "あり", "sp_daisharin": "あり（清一七対子）",
        "sp_renho": "あり", "sp_nagashi_ym": "あり",
        "sp_4mai_chii": "あり（2翻）", "sp_shosharin": "あり（混一七対子・6翻）",
        "kazoe_yakuman": "14飜以上", "w_yakuman": "なし", "kokushi_ankan": "あり",
        "shugi_ippatsu": "あり", "shugi_ura": "あり",
        "shugi_niji": "あり（鳴き祝儀あり）", "shugi_pocchi": "あり（リーチ後白ポッチツモ）",
        "shugi_ym_tsumo": "5枚", "shugi_ym_ron": "10枚", "shugi_kazoe": "対象外",
        "tobi_shou": "あり（飛ばされた人が場にチップ2枚）",
        "tobi_bunpai": "1人飛ばし2枚・2人飛ばし1枚ずつ等",
        "shugi_memo": "",
        "pao_daisangen": "あり", "pao_daisushi": "あり",
        "pao_tsumo": "パオが全額（チップ5枚）",
        "pao_ron": "パオと振込者で折半（チップ各5枚）",
        "chombo_batsu": "倍満払い", "chombo_taiou": "やり直し",
        "pen_goron_taopai": "チョンボ", "pen_noten_reach": "チョンボ",
        "pen_reach_bad_ankan": "チョンボ",
        "pen_goron_no_taopai": "上がり放棄", "pen_gonaki_sarashi": "上がり放棄",
        "pen_kuikae_ihan": "上がり放棄", "pen_tahai": "上がり放棄",
        "pen_gonaki_hassei": "軽罰符（1000点供託）",
        "pen_reach_torikeshi": "軽罰符（1000点供託）",
        "pen_shouhai": "軽罰符＋山から補充",
    }
}

DEFAULT_3 = BASE_RULES_3["三人麻雀（標準）"].copy()
BASE_RULES_3.update({
    "雀魂（三麻・段位戦）": {
        **DEFAULT_3,
        "tsumozon": "あり", "kita": "抜きドラ",
        "chombo_batsu": "なし", "chombo_taiou": "なし",
        "pen_goron_taopai": "なし", "pen_noten_reach": "なし", "pen_reach_bad_ankan": "なし",
        "pen_goron_no_taopai": "なし", "pen_gonaki_sarashi": "なし", "pen_kuikae_ihan": "なし",
        "pen_tahai": "なし", "pen_gonaki_hassei": "なし", "pen_reach_torikeshi": "なし", "pen_shouhai": "なし",
        "shugi_type": "なし", "shugi_ippatsu": "なし", "shugi_ura": "なし", "shugi_niji": "なし", "shugi_pocchi": "なし",
        "shugi_ym_tsumo": "なし", "shugi_ym_ron": "なし", "shugi_kazoe": "対象外", "shugi_memo": "",
        "pao_daisangen": "あり", "pao_daisushi": "あり", "pao_sukantu": "なし",
        "pao_tsumo": "パオが全額（チップ5枚）", "pao_ron": "パオと振込者で折半（チップ各5枚）",
    },
    "天鳳（三麻）": {
        **DEFAULT_3,
        "tsumozon": "あり", "kita": "抜きドラ",
        "chombo_batsu": "なし", "chombo_taiou": "なし",
        "pen_goron_taopai": "なし", "pen_noten_reach": "なし", "pen_reach_bad_ankan": "なし",
        "pen_goron_no_taopai": "なし", "pen_gonaki_sarashi": "なし", "pen_kuikae_ihan": "なし",
        "pen_tahai": "なし", "pen_gonaki_hassei": "なし", "pen_reach_torikeshi": "なし", "pen_shouhai": "なし",
        "shugi_type": "なし", "shugi_ippatsu": "なし", "shugi_ura": "なし", "shugi_niji": "なし", "shugi_pocchi": "なし",
        "shugi_ym_tsumo": "なし", "shugi_ym_ron": "なし", "shugi_kazoe": "対象外", "shugi_memo": "",
    },
})

# --- ラベル ---
LABELS = {
    "length": "対局の長さ", "mochi_ten": "持ち点", "mochi_ten_custom": "持ち点（カスタム）",
    "kaeshi_ten": "返し点", "kaeshi_ten_custom": "返し点（カスタム）",
    "uma": "ウマ", "uma_custom": "ウマ（カスタム）",
    "tobi": "トビ終了", "nishiiri": "西入",
    "ipponba": "一本場", "ipponba_custom": "一本場（カスタム）",
    "tenpai_ryou": "テンパイ料",
    "tsumozon": "ツモ損", "fu_keisan": "符計算", "tsumopin": "ツモピン",
    "renchan": "連荘条件", "oras_oya": "オーラスの親の終了", "oras_oya_custom": "オーラスの親の終了（カスタム）",
    "agariyame": "アガリやめ・テンパイやめ",
    "tochu_kyushu": "九種九牌", "tochu_sufon": "四風連打", "tochu_sukan": "四槓散了",
    "tochu_sucha": "四家立直", "tochu_sancha": "三家和",
    "tochu_ryukyoku": "途中流局", "tochu_honba": "途中流局時の本場",
    "double_ron": "ダブロン", "triple_ron": "トリロン",
    "naki_priority": "鳴きの優先", "tsumo_yama": "ツモ山",
    "kuitan": "喰いタン", "atozuke": "後付け", "kuikae": "喰い替え",
    "aka_dora": "赤ドラ", "aka_niji": "赤ドラ・虹ドラ",
    "kiriage": "切り上げ満貫", "renpai_toitsu": "連風牌の対子",
    "nagashi": "流し満貫", "kokushi_ankan": "国士の暗槓ロン",
    "yakuman_type": "役満の種類", "yakuman_custom_memo": "役満カスタム詳細",
    "yakuman_fukugo": "役満の複合・W役満",
    "kazoe_yakuman": "数え役満", "w_yakuman": "W役満",
    "kita": "北の扱い", "hanapai": "花牌", "kan_dora": "カンドラ",
    "furiten_reach": "フリテンリーチ", "open_reach": "オープンリーチ",
    "furiten_open_reach": "フリテンオープンリーチ",
    "tsumo_nashi_reach": "ツモ番なしリーチ", "reach_1000": "1000点未満のリーチ",
    "reach_ankan_okuri": "送り槓", "reach_ankan_machi": "待ちの変わる槓", "reach_ankan_mentsu": "面子構成の変わる槓",
    "reach_ankan": "リーチ後の暗槓", "reach_kan": "リーチ後のカン",
    "niken_reach": "2軒リーチ時", "shiro_pocchi": "白ポッチ",
    "sp_manzu_honitsu": "マンズ混一色（役満）",
    "sp_daisharin": "大車輪", "sp_renho": "人和（役満）",
    "sp_nagashi_ym": "流し役満",
    "sp_4mai_chii": "四枚使い七対子", "sp_shosharin": "小車輪",
    # 祝儀（個別）
    "shugi_type": "祝儀の種類",
    "shugi_ippatsu": "一発祝儀", "shugi_ura": "裏ドラ祝儀",
    "shugi_aka": "赤ドラ祝儀", "shugi_niji": "虹牌祝儀",
    "shugi_pocchi": "白ポッチ祝儀",
    "shugi_ym_tsumo": "役満祝儀（ツモ）", "shugi_ym_ron": "役満祝儀（ロン）",
    "shugi_kazoe": "数え役満祝儀", "shugi_memo": "特記事項（レート等）",
    "tobi_shou": "トビ賞", "tobi_bunpai": "トビ賞分配",
    # パオ（個別）
    "pao_daisangen": "大三元パオ", "pao_daisushi": "大四喜パオ",
    "pao_sukantu": "四槓子パオ",
    "pao_tsumo": "パオ支払い（ツモ）", "pao_ron": "パオ支払い（ロン）",
    # 罰則（状況別）
    "chombo_batsu": "チョンボ罰符", "chombo_memo": "罰符の詳細", "chombo_taiou": "チョンボ対処",
    "pen_goron_taopai": "誤ロン・誤ツモ（倒牌）",
    "pen_noten_reach": "ノーテンリーチ流局",
    "pen_reach_bad_ankan": "リーチ後不正暗槓",
    "pen_goron_no_taopai": "誤ロン・誤ツモ（倒牌なし）",
    "pen_gonaki_sarashi": "誤鳴き（牌晒し）",
    "pen_kuikae_ihan": "喰い替え違反",
    "pen_tahai": "多牌",
    "pen_gonaki_hassei": "誤鳴き（発声のみ）",
    "pen_reach_torikeshi": "リーチ取消",
    "pen_shouhai": "少牌",
}

# --- カテゴリ ---
CATEGORIES_4 = [
    ("1. 基本設定・ポイント精算", ["length","mochi_ten","mochi_ten_custom","kaeshi_ten","kaeshi_ten_custom","uma","uma_custom","tobi","nishiiri","tsumopin","ipponba","ipponba_custom"]),
    ("2. 進行・連荘ルール", ["renchan","oras_oya","oras_oya_custom","double_ron","triple_ron","naki_priority","tsumo_yama"]),
    ("3. 途中流局", ["tochu_kyushu","tochu_sufon","tochu_sukan","tochu_sucha","tochu_sancha","tochu_honba"]),
    ("4. 役・ドラ", ["kuitan","atozuke","kuikae","aka_dora","kan_dora","kiriage","renpai_toitsu","nagashi","kokushi_ankan","yakuman_type","yakuman_custom_memo","yakuman_fukugo","kazoe_yakuman"]),
    ("5. リーチ関連", ["furiten_reach","open_reach","furiten_open_reach","tsumo_nashi_reach","reach_1000"]),
    ("6. リーチ後の暗槓", ["reach_ankan_okuri","reach_ankan_machi","reach_ankan_mentsu"]),
    ("7. 祝儀（チップ）", ["shugi_type","shugi_ippatsu","shugi_ura","shugi_aka","shugi_ym_tsumo","shugi_ym_ron","shugi_kazoe"]),
    ("8. 特殊牌", []),
    ("9. ローカル役", ["shiro_pocchi","sp_4mai_chii","sp_shosharin"]),
    ("10. ローカル役満", ["sp_daisharin","sp_renho","sp_nagashi_ym"]),
    ("11. パオ（責任払い）", ["pao_daisangen","pao_daisushi","pao_sukantu","pao_tsumo","pao_ron"]),
    ("12. チョンボ", ["chombo_batsu","chombo_memo","chombo_taiou","pen_goron_taopai","pen_noten_reach","pen_reach_bad_ankan"]),
    ("13. 上がり放棄", ["pen_goron_no_taopai","pen_gonaki_sarashi","pen_kuikae_ihan","pen_tahai"]),
    ("14. 軽罰符", ["pen_gonaki_hassei","pen_reach_torikeshi","pen_shouhai"]),
]

CATEGORIES_3 = [
    ("1. 基本設定・ポイント精算", ["length","mochi_ten","mochi_ten_custom","kaeshi_ten","kaeshi_ten_custom","uma","uma_custom","tobi","tsumozon","fu_keisan","tsumopin","ipponba","ipponba_custom","tenpai_ryou"]),
    ("2. 進行・連荘ルール", ["renchan","oras_oya","oras_oya_custom","double_ron","tsumo_yama"]),
    ("3. 途中流局", ["tochu_kyushu","tochu_sukan","tochu_sancha","tochu_honba"]),
    ("4. 役・ドラ・牌の扱い", ["kuitan","atozuke","aka_niji","kita","hanapai","kan_dora"]),
    ("5. リーチ関連", ["reach_1000","furiten_reach","open_reach","furiten_open_reach"]),
    ("6. リーチ後の暗槓", ["reach_ankan_okuri","reach_ankan_machi","reach_ankan_mentsu"]),
    ("7. 特殊役", ["kazoe_yakuman","w_yakuman","kokushi_ankan"]),
    ("8. ローカル役", ["niken_reach","shiro_pocchi","sp_4mai_chii","sp_shosharin"]),
    ("9. ローカル役満", ["sp_manzu_honitsu","sp_daisharin","sp_renho","sp_nagashi_ym"]),
    ("10. 祝儀（チップ）", ["shugi_ippatsu","shugi_ura","shugi_niji","shugi_pocchi","shugi_ym_tsumo","shugi_ym_ron","shugi_kazoe","tobi_shou","tobi_bunpai"]),
    ("11. パオ（責任払い）", ["pao_daisangen","pao_daisushi","pao_tsumo","pao_ron"]),
    ("12. チョンボ", ["chombo_batsu","chombo_memo","chombo_taiou","pen_goron_taopai","pen_noten_reach","pen_reach_bad_ankan"]),
    ("13. 上がり放棄", ["pen_goron_no_taopai","pen_gonaki_sarashi","pen_kuikae_ihan","pen_tahai"]),
    ("14. 軽罰符", ["pen_gonaki_hassei","pen_reach_torikeshi","pen_shouhai"]),
]

# =====================================================================
# アプリ本体
# =====================================================================

def main(page: ft.Page):
    page.title = "麻雀ルール共有アプリ"
    page.window_width = 420
    page.window_height = 820
    page.bgcolor = "#F0F2F5"
    page.padding = 0

    C_SURFACE = "#FFFFFF"
    C_TEXT = "#1A202C"
    C_SUB = "#718096"
    C_ACCENT = "#3182CE"
    C_HIGHLIGHT = "#E53E3E"
    C_HIGHLIGHT_BG = "#FFF5F5"
    C_BORDER = "#E2E8F0"

    try:
        saved_data = page.client_storage.get("mahjong_settings_v5")
    except Exception:
        saved_data = None
    if not saved_data:
        saved_data = {"rules": []}

    current_state = {"editing_id": None, "rule_data": None, "preview_base64": ""}

    def save_state():
        try:
            page.client_storage.set("mahjong_settings_v5", saved_data)
        except Exception:
            pass

    def get_base_dict(mode, page=None):
        if not page: return {}
        cr = page.client_storage.get("mahjong_custom_base_rules")
        if not cr:
            cr = {
                "preset_jantama_4": {"name": "雀魂（段位戦）", "mode": "四麻", "settings": BASE_RULES_4["雀魂（四麻・段位戦）"].copy()},
                "preset_tenhou_4": {"name": "天鳳（段位戦）", "mode": "四麻", "settings": BASE_RULES_4["天鳳（四麻）"].copy()},
                "preset_mleague_4": {"name": "Mリーグ", "mode": "四麻", "settings": BASE_RULES_4["Mリーグ公式（四麻）"].copy()},
                "preset_jantama_3": {"name": "雀魂（三麻・段位戦）", "mode": "三麻", "settings": BASE_RULES_3["雀魂（三麻・段位戦）"].copy()},
                "preset_tenhou_3": {"name": "天鳳（三麻）", "mode": "三麻", "settings": BASE_RULES_3["天鳳（三麻）"].copy()}
            }
            page.client_storage.set("mahjong_custom_base_rules", cr)
        
        base = {}
        for cid, rule in cr.items():
            if rule.get("mode") == mode:
                base[f"__custom__{cid}"] = rule.get("settings", {})
        return base

    def get_base_rule_name(k, page):
        if k and str(k).startswith("__custom__"):
            cid = str(k).replace("__custom__", "")
            cr = page.client_storage.get("mahjong_custom_base_rules") or {}
            if cid in cr:
                return cr[cid].get("name", "標準ルール")
        return k

    def get_options_dict(mode):
        return OPTIONS_4 if mode == "四麻" else OPTIONS_3

    def get_categories(mode):
        return CATEGORIES_4 if mode == "四麻" else CATEGORIES_3

    # --- Pillow Image Gen ---
    def generate_preview_image(rule_data):
        settings = rule_data["settings"]
        num_items = len([k for k in settings if k != "shugi_memo"])
        img_h = max(1600, 300 + num_items * 48)
        img = Image.new('RGB', (800, img_h), color='#FFFFFF')
        draw = ImageDraw.Draw(img)

        try:
            if os.path.exists(FONT_PATH):
                font = ImageFont.truetype(FONT_PATH, 22)
                font_title = ImageFont.truetype(FONT_PATH, 30)
                font_cat = ImageFont.truetype(FONT_PATH, 20)
            elif os.path.exists("/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc"):
                font = ImageFont.truetype("/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc", 22)
                font_title = ImageFont.truetype("/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc", 30)
                font_cat = ImageFont.truetype("/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc", 20)
            else:
                font = font_title = font_cat = ImageFont.load_default()
        except:
            font = font_title = font_cat = ImageFont.load_default()

        draw.rectangle([(0, 0), (800, 120)], fill='#1A202C')
        draw.text((25, 25), f"{rule_data['name']} ({rule_data['mode']})", fill='#FFFFFF', font=font_title)
        draw.text((25, 70), f"基準: {get_base_rule_name(rule_data['base_rule'], None)}", fill='#A0AEC0', font=font)

        y = 140
        bd = get_base_dict(rule_data['mode'], page)
        base = bd.get(rule_data['base_rule'], list(bd.values())[0] if bd else {})
        categories = get_categories(rule_data['mode'])

        for cat_title, cat_keys in categories:
            draw.rectangle([(15, y), (785, y+30)], fill='#EDF2F7')
            draw.text((25, y+3), f"■ {cat_title}", fill=C_TEXT, font=font_cat)
            y += 38

            for key in cat_keys:
                if key == "shugi_memo":
                    memo = settings.get(key, "")
                    if memo:
                        draw.text((30, y), f"  備考: {memo[:40]}", fill=C_SUB, font=font)
                        y += 42
                    continue
                val = settings.get(key, "")
                label = LABELS.get(key, key)
                is_diff = base is not None and (key not in base or str(val) != str(base.get(key, "")))

                if is_diff:
                    draw.rectangle([(15, y-4), (785, y+34)], fill=C_HIGHLIGHT_BG)
                    draw.text((30, y), f"* {label}", fill=C_HIGHLIGHT, font=font)
                    draw.text((320, y), str(val)[:28], fill=C_HIGHLIGHT, font=font)
                else:
                    draw.text((30, y), f"・ {label}", fill=C_TEXT, font=font)
                    draw.text((320, y), str(val)[:28], fill=C_SUB, font=font)
                y += 42

        img = img.crop((0, 0, 800, y + 25))
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        return base64.b64encode(buf.getvalue()).decode('utf-8')

    # --- Actions ---
    def create_new_rule(mode):
        bd = get_base_dict(mode, page)
        bn = list(bd.keys())[0] if bd else ""
        init = DEFAULT_4.copy() if mode == "四麻" else DEFAULT_3.copy()
        nr = {"id": str(uuid.uuid4()), "name": "新規ルール", "mode": mode, "base_rule": bn, "settings": init}
        saved_data["rules"].append(nr)
        save_state()
        edit_rule(nr["id"])

    def edit_rule(rule_id):
        current_state["editing_id"] = rule_id
        for r in saved_data["rules"]:
            if r["id"] == rule_id:
                current_state["rule_data"] = r
                break
        page.go("/edit")

    def delete_rule(rule_id):
        saved_data["rules"] = [r for r in saved_data["rules"] if r["id"] != rule_id]
        save_state()
        route_change(None)

    def show_preview(e):
        b64 = generate_preview_image(current_state["rule_data"])
        current_state["preview_base64"] = b64
        page.go("/preview")

    def save_image_file(e):
        b64 = current_state.get("preview_base64", "")
        if not b64: return
        name = current_state["rule_data"]["name"].replace(" ", "_").replace("/", "_")
        path = os.path.join(os.path.expanduser("~"), "Desktop", f"{name}.png")
        with open(path, "wb") as f:
            f.write(base64.b64decode(b64))
        page.snack_bar = ft.SnackBar(ft.Text(f"画像を保存: {path}"), open=True)
        page.update()

    def save_pdf_file(e):
        rd = current_state.get("rule_data")
        if not rd: return
        settings = rd["settings"]
        name = rd["name"].replace(" ", "_").replace("/", "_")
        path = os.path.join(os.path.expanduser("~"), "Desktop", f"{name}.pdf")
        a4_w, a4_h = 595, 842
        categories = get_categories(rd["mode"])
        bd = get_base_dict(rd["mode"], page)
        base = bd.get(rd.get("base_rule", ""), list(bd.values())[0] if bd else {})

        try:
            if os.path.exists(FONT_PATH):
                font = ImageFont.truetype(FONT_PATH, 18)
                font_title = ImageFont.truetype(FONT_PATH, 24)
                font_cat = ImageFont.truetype(FONT_PATH, 16)
            elif os.path.exists("/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc"):
                font = ImageFont.truetype("/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc", 18)
                font_title = ImageFont.truetype("/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc", 24)
                font_cat = ImageFont.truetype("/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc", 16)
            else:
                font = font_title = font_cat = ImageFont.load_default()
        except:
            font = font_title = font_cat = ImageFont.load_default()

        pages = []
        for ci, (cat_title, cat_keys) in enumerate(categories):
            if not cat_keys:
                continue
            # ページ高さを計算
            row_count = sum(1 for k in cat_keys if settings.get(k, "") not in [None, ""])
            pg_h = max(200, 100 + row_count * 36 + 60)
            pg = Image.new('RGB', (a4_w, pg_h), '#FFFFFF')
            draw = ImageDraw.Draw(pg)
            # ヘッダー（ルール名 + カテゴリ名）
            draw.rectangle([(0, 0), (a4_w, 50)], fill='#1A202C')
            draw.text((15, 10), f"{rd['name']} ({rd['mode']})", fill='#FFFFFF', font=font_title)
            y = 60
            draw.rectangle([(10, y), (a4_w - 10, y + 28)], fill='#EDF2F7')
            draw.text((18, y + 3), f"■ {cat_title}", fill='#1A202C', font=font_cat)
            y += 36
            for key in cat_keys:
                val = settings.get(key, "")
                if not val or val is None:
                    continue
                label = LABELS.get(key, key)
                is_diff = base is not None and (key not in base or str(val) != str(base.get(key, "")))
                color = '#E53E3E' if is_diff else '#1A202C'
                draw.text((22, y), f"{label}:", fill='#718096', font=font)
                draw.text((240, y), str(val)[:50], fill=color, font=font)
                y += 36
            # ページ画像をA4に埋め込み
            a4_page = Image.new('RGB', (a4_w, a4_h), '#FFFFFF')
            a4_page.paste(pg, (0, 10))
            pages.append(a4_page)

        if not pages:
            return
        pages[0].save(path, 'PDF', resolution=72, save_all=True, append_images=pages[1:])
        page.snack_bar = ft.SnackBar(ft.Text(f"PDFを保存: {path}"), open=True)
        page.update()

    def save_html_file(e):
        rd = current_state.get("rule_data")
        if not rd: return
        settings = rd["settings"]
        is_4ma = rd["mode"] == "四麻"
        cats = get_categories(rd["mode"])
        base = None
        if is_4ma:
            bd = get_base_dict("四麻", page)
            base = bd.get(rd.get("base_rule", ""), {})
        rows = ""
        for ct, ck in cats:
            rows += f'<tr class="cat"><td colspan="3">{ct}</td></tr>\n'
            for k in ck:
                if k == "shugi_memo":
                    memo = settings.get(k, "")
                    if memo:
                        rows += f'<tr><td colspan="3" class="memo">📝 {memo}</td></tr>\n'
                    continue
                val = str(settings.get(k, ""))
                label = LABELS.get(k, k)
                diff = base is not None and val != str(base.get(k, ""))
                cls = ' class="diff"' if diff else ''
                badge = ' <span class="badge">差分</span>' if diff else ''
                rows += f'<tr{cls}><td>{label}{badge}</td><td>{val}</td></tr>\n'
        mode_info = f"基準: {rd.get('base_rule', '')}" if is_4ma else "三人麻雀ルール"
        html = f"""<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{rd['name']}</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,sans-serif;background:#f0f2f5;padding:8px}}
.header{{background:#1a202c;color:#fff;padding:16px;border-radius:8px 8px 0 0}}
.header h1{{font-size:18px;margin-bottom:4px}}
.header p{{font-size:12px;color:#a0aec0}}
table{{width:100%;border-collapse:collapse;background:#fff;font-size:13px}}
td{{padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top}}
tr td:first-child{{font-weight:bold;width:45%;color:#1a202c}}
tr td:last-child{{color:#718096;text-align:right}}
tr.cat td{{background:#edf2f7;font-weight:bold;font-size:13px;color:#1a202c;padding:6px 10px}}
tr.diff{{background:#fff5f5}}
tr.diff td{{color:#e53e3e}}
.badge{{background:#e53e3e;color:#fff;font-size:9px;padding:1px 5px;border-radius:8px;margin-left:4px}}
.memo{{font-size:12px;color:#718096;padding:6px 14px}}
</style></head><body>
<div class="header"><h1>{rd['name']} ({rd['mode']})</h1><p>{mode_info}</p></div>
<table>{rows}</table>
</body></html>"""
        name = rd["name"].replace(" ", "_").replace("/", "_")
        path = os.path.join(os.path.expanduser("~"), "Desktop", f"{name}.html")
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
        page.snack_bar = ft.SnackBar(ft.Text(f"HTMLを保存: {path}"), open=True)
        page.update()

    def name_changed(e):
        current_state["rule_data"]["name"] = e.control.value
        save_state()

    def update_ui_edit(e):
        save_state()
        route_change(None)

    # --- UI Helpers ---
    def create_dropdown(dict_key, options):
        label = LABELS.get(dict_key, dict_key)
        if dict_key == "shugi_memo":
            def on_text_change(e):
                current_state["rule_data"]["settings"][dict_key] = e.control.value
                save_state()
            return ft.Container(
                content=ft.Row([
                    ft.Text(label, color=C_TEXT, weight=ft.FontWeight.BOLD, size=11),
                    ft.TextField(value=str(current_state["rule_data"]["settings"].get(dict_key, "")),
                        on_change=on_text_change, width=180, text_size=11,
                        border_color="transparent", bgcolor=C_SURFACE, hint_text="例: 点5=100円")
                ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                padding=ft.padding.only(left=16, right=8, top=0, bottom=0),
                bgcolor=C_SURFACE, border=ft.border.only(bottom=ft.border.BorderSide(1, C_BORDER))
            )

        def on_change(e):
            current_state["rule_data"]["settings"][dict_key] = e.control.value
            update_ui_edit(e)

        if dict_key not in current_state["rule_data"]["settings"]:
            current_state["rule_data"]["settings"][dict_key] = options[0]

        cur_val = str(current_state["rule_data"]["settings"].get(dict_key, options[0]))
        dd = ft.Dropdown(value=cur_val, options=[ft.dropdown.Option(str(o)) for o in options],
            on_change=on_change, border_color="transparent", color=C_SUB,
            width=180, text_size=10, alignment=ft.alignment.center_right, content_padding=6)

        mode = current_state["rule_data"]["mode"]
        bd = get_base_dict(mode, page)
        if bd:
            b_dict = bd.get(current_state["rule_data"]["base_rule"], {})
            is_diff = (dict_key not in b_dict) or (cur_val != str(b_dict.get(dict_key, "")))
        else:
            is_diff = False

        bg = C_HIGHLIGHT_BG if is_diff else C_SURFACE
        lc = C_HIGHLIGHT if is_diff else C_TEXT

        badge = ft.Container(
            content=ft.Text("差分", size=8, color=C_SURFACE, weight=ft.FontWeight.BOLD),
            bgcolor=C_HIGHLIGHT, padding=ft.padding.symmetric(horizontal=4, vertical=1),
            border_radius=6, visible=is_diff)

        return ft.Container(
            content=ft.Row([
                ft.Row([ft.Text(label, color=lc, weight=ft.FontWeight.BOLD, size=11), badge], spacing=4),
                dd
            ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
            padding=ft.padding.only(left=14, right=0, top=0, bottom=0),
            bgcolor=bg, border=ft.border.only(bottom=ft.border.BorderSide(1, C_BORDER)))

    # --- Handlers ---
    def on_click_edit(e): edit_rule(e.control.data)
    def on_click_delete(e): delete_rule(e.control.data)
    def on_click_create_4ma(e): create_new_rule("四麻")
    def on_click_create_3ma(e): create_new_rule("三麻")

    def show_custom_base_manager():
        cr = page.client_storage.get("mahjong_custom_base_rules")
        if not cr:
            cr = {
                "preset_jantama_4": {"name": "雀魂（段位戦）", "mode": "四麻", "settings": BASE_RULES_4["雀魂（四麻・段位戦）"].copy()},
                "preset_tenhou_4": {"name": "天鳳（段位戦）", "mode": "四麻", "settings": BASE_RULES_4["天鳳（四麻）"].copy()},
                "preset_mleague_4": {"name": "Mリーグ", "mode": "四麻", "settings": BASE_RULES_4["Mリーグ公式（四麻）"].copy()},
                "preset_jantama_3": {"name": "雀魂（三麻・段位戦）", "mode": "三麻", "settings": BASE_RULES_3["雀魂（三麻・段位戦）"].copy()},
                "preset_tenhou_3": {"name": "天鳳（三麻）", "mode": "三麻", "settings": BASE_RULES_3["天鳳（三麻）"].copy()}
            }
            page.client_storage.set("mahjong_custom_base_rules", cr)

        def delete_custom(cid):
            if cid in cr:
                del cr[cid]
                page.client_storage.set("mahjong_custom_base_rules", cr)
                show_custom_base_manager()

        def create_new_custom(mode):
            import time
            cid = "custom_" + str(int(time.time() * 1000))
            def_sets = DEFAULT_4.copy() if mode == "四麻" else DEFAULT_3.copy()
            cr[cid] = {"name": f"新規標準ルール({mode})", "mode": mode, "settings": def_sets}
            page.client_storage.set("mahjong_custom_base_rules", cr)
            show_custom_base_editor(cid)

        list_items = []
        if not cr:
            list_items.append(ft.Container(content=ft.Text("標準ルールはありません", color=C_SUB, text_align=ft.TextAlign.CENTER), padding=ft.padding.symmetric(vertical=20)))
        else:
            for cid, rule in cr.items():
                list_items.append(
                    ft.Container(
                        content=ft.Row([
                            ft.Column([
                                ft.Text(rule.get("name", "名称未設定"), weight=ft.FontWeight.BOLD, color=C_TEXT),
                                ft.Text(rule.get("mode", ""), size=12, color=C_SUB)
                            ]),
                            ft.Row([
                                ft.IconButton(ft.Icons.EDIT, icon_color=C_ACCENT, on_click=lambda e, i=cid: show_custom_base_editor(i)),
                                ft.IconButton(ft.Icons.DELETE, icon_color="#E53E3E", on_click=lambda e, i=cid: delete_custom(i)),
                            ])
                        ], alignment=ft.alignment.space_between),
                        padding=10, bgcolor=C_SURFACE, border_radius=8,
                        border=ft.border.all(1, C_BORDER), margin=ft.margin.only(bottom=10)
                    )
                )

        page.views.append(
            ft.View(
                "/custom_base_manager",
                [
                    ft.Container(
                        content=ft.Row([
                            ft.TextButton("← ホーム", on_click=lambda _: page.go("/"), style=ft.ButtonStyle(color=C_TEXT)),
                            ft.Text("標準ルールの管理", size=16, weight=ft.FontWeight.BOLD, color=C_TEXT),
                            ft.Container(width=50)
                        ], alignment=ft.alignment.space_between),
                        padding=ft.padding.symmetric(horizontal=10, vertical=10),
                        bgcolor=C_SURFACE, border=ft.border.only(bottom=ft.border.BorderSide(1, C_BORDER))
                    ),
                    ft.Container(
                        content=ft.Row([
                            ft.ElevatedButton("+ 新規作成(四麻)", on_click=lambda _: create_new_custom("四麻"), bgcolor=C_ACCENT, color=C_SURFACE),
                            ft.ElevatedButton("+ 新規作成(三麻)", on_click=lambda _: create_new_custom("三麻"), bgcolor=C_ACCENT, color=C_SURFACE),
                        ], alignment=ft.alignment.space_between),
                        padding=15
                    ),
                    ft.Container(content=ft.Column(list_items, scroll=ft.ScrollMode.HIDDEN), expand=True, padding=ft.padding.symmetric(horizontal=15))
                ],
                bgcolor=page.bgcolor, padding=0
            )
        )
        page.update()

    def show_custom_base_editor(cid):
        cr = page.client_storage.get("mahjong_custom_base_rules") or {}
        if cid not in cr: return
        rule = cr[cid]
        mode = rule.get("mode", "四麻")
        settings = rule.get("settings", {})
        
        name_field = ft.TextField(value=rule.get("name", ""), label="ルール名", width=300, border_color=C_BORDER, color=C_TEXT)

        def save_and_back(e):
            n = name_field.value.strip() or "名称未設定"
            if cid in cr:
                cr[cid]["name"] = n
                page.client_storage.set("mahjong_custom_base_rules", cr)
            show_custom_base_manager()

        def update_val(key, val):
            if cid in cr:
                cr[cid]["settings"][key] = val
                page.client_storage.set("mahjong_custom_base_rules", cr)

        def do_copy(e):
            src = e.control.value
            if not src: return
            if src in cr:
                cr[cid]["settings"] = cr[src]["settings"].copy()
                page.client_storage.set("mahjong_custom_base_rules", cr)
            show_custom_base_editor(cid)

        # 既存の標準ルールからコピー
        opts_cp = [ft.dropdown.Option(str(k), text=v.get("name", "")) for k, v in cr.items() if v.get("mode") == mode and k != cid]
        opts_cp.insert(0, ft.dropdown.Option("", text="-- コピー元を選択 --"))
        cp_dd = ft.Dropdown(label="既存からコピー", options=opts_cp, on_change=do_copy, width=300, border_color=C_BORDER, color=C_TEXT)

        items = [ft.Container(content=ft.Column([name_field, cp_dd], spacing=10), padding=15, bgcolor=C_SURFACE, border_radius=8, margin=ft.margin.only(bottom=10))]

        cats = get_categories(mode)
        opts = get_options_dict(mode)

        for cat_title, cat_keys in cats:
            items.append(ft.Container(content=ft.Text(cat_title, weight=ft.FontWeight.BOLD, color=C_TEXT), padding=ft.padding.only(top=10, bottom=5)))
            for k in cat_keys:
                val = settings.get(k, "")
                label = LABELS.get(k, k)
                is_text = (k in opts and opts[k] and opts[k][0] == "")
                
                if is_text:
                    tf = ft.TextField(value=str(val), label="↳ "+label, width=300, border_color=C_BORDER, color=C_TEXT, on_change=lambda e, key=k: update_val(key, e.control.value))
                    parent_key = k.replace("_custom", "")
                    tf.visible = (settings.get(parent_key, "") == "カスタム")
                    items.append(tf)
                else:
                    o_list = [ft.dropdown.Option(str(o)) for o in opts.get(k, [])]
                    def on_change_dd(e, key=k):
                        update_val(key, e.control.value)
                        show_custom_base_editor(cid) 
                    items.append(ft.Dropdown(value=str(val), label=label, options=o_list, on_change=on_change_dd, width=300, border_color=C_BORDER, color=C_TEXT))

        page.views.append(
            ft.View(
                f"/custom_base_editor/{cid}",
                [
                    ft.Container(
                        content=ft.Row([
                            ft.TextButton("← 戻る", on_click=lambda _: show_custom_base_manager(), style=ft.ButtonStyle(color=C_TEXT)),
                            ft.Text(f"編集: {mode}", size=16, weight=ft.FontWeight.BOLD, color=C_TEXT),
                            ft.ElevatedButton("保存", on_click=save_and_back, bgcolor=C_ACCENT, color=C_SURFACE)
                        ], alignment=ft.alignment.space_between),
                        padding=ft.padding.symmetric(horizontal=10, vertical=10),
                        bgcolor=C_SURFACE, border=ft.border.only(bottom=ft.border.BorderSide(1, C_BORDER))
                    ),
                    ft.Container(content=ft.Column(items, scroll=ft.ScrollMode.HIDDEN), expand=True, padding=15)
                ],
                bgcolor=page.bgcolor, padding=0
            )
        )
        page.update()

    # --- Routing ---
    def route_change(route):
        page.views.clear()

        if page.route == "/custom_base_manager":
            show_custom_base_manager()
        elif page.route.startswith("/custom_base_editor/"):
            show_custom_base_editor(page.route.split("/")[-1])
        elif page.route == "/" or route is None and page.route == "/":
            cards = []
            for r in saved_data["rules"]:
                cards.append(ft.Container(
                    content=ft.Row([
                        ft.Column([
                            ft.Text(r["name"], weight=ft.FontWeight.BOLD, color=C_TEXT, size=14),
                            ft.Text(f"{r['mode']}", color=C_SUB, size=11)
                        ], spacing=2),
                        ft.Row([
                            ft.IconButton(ft.Icons.EDIT, icon_color=C_ACCENT, data=r["id"], on_click=on_click_edit),
                            ft.IconButton(ft.Icons.DELETE, icon_color=C_HIGHLIGHT, data=r["id"], on_click=on_click_delete)
                        ], spacing=0)
                    ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                    padding=10, bgcolor=C_SURFACE, border_radius=8, margin=ft.margin.only(bottom=5),
                    border=ft.border.all(1, C_BORDER)))

            page.views.append(ft.View("/", bgcolor=page.bgcolor, scroll=ft.ScrollMode.AUTO, controls=[
                ft.Container(content=ft.Text("麻雀ルールブック", color=C_SURFACE, weight=ft.FontWeight.BOLD, size=20),
                    padding=20, bgcolor=C_ACCENT, alignment=ft.alignment.center),
                ft.Container(content=ft.Column([
                    ft.Row([
                        ft.ElevatedButton("➕ 四麻作成", on_click=on_click_create_4ma, expand=True, bgcolor=C_SURFACE, color=C_TEXT),
                        ft.ElevatedButton("➕ 三麻作成", on_click=on_click_create_3ma, expand=True, bgcolor=C_SURFACE, color=C_TEXT),
                    ], spacing=10),
                    ft.Container(
                        content=ft.ElevatedButton("⚙️ 標準ルールの管理", on_click=lambda _: page.go("/custom_base_manager"), bgcolor=C_SURFACE, color=C_TEXT, expand=True),
                        margin=ft.margin.only(top=10)
                    ),
                    ft.Divider(height=16, color=C_BORDER),
                    ft.Text("保存済みのルール", weight=ft.FontWeight.BOLD, color=C_SUB, size=13),
                    *cards
                ]), padding=14)
            ]))

        elif page.route == "/edit":
            rd = current_state["rule_data"]
            if not rd:
                page.go("/"); return
            mode = rd["mode"]
            bd = get_base_dict(mode, page)
            opts = get_options_dict(mode)
            cats = get_categories(mode)

            if bd and rd.get("base_rule") not in bd:
                rd["base_rule"] = list(bd.keys())[0] if bd else ""
                save_state()

            def on_change_base(e):
                rd["base_rule"] = e.control.value
                save_state()
                route_change(None)

            fields = []
            for ct, ck in cats:
                fields.append(ft.Container(content=ft.Text(ct, weight=ft.FontWeight.BOLD, size=12, color=C_TEXT),
                    margin=ft.margin.only(top=10)))
                cols = [create_dropdown(k, opts[k]) for k in ck if k in opts]
                fields.append(ft.Container(content=ft.Column(cols, spacing=0),
                    bgcolor=C_SURFACE, border_radius=8, border=ft.border.all(1, C_BORDER), margin=ft.margin.only(top=3)))

            ec = [
                ft.Container(content=ft.Row([
                    ft.IconButton(ft.Icons.ARROW_BACK, on_click=lambda _: page.go("/"), icon_color=C_TEXT),
                    ft.Text("ルールの編集", color=C_TEXT, weight=ft.FontWeight.BOLD, size=14),
                    ft.ElevatedButton("プレビュー", on_click=show_preview, bgcolor=C_ACCENT, color=C_SURFACE)
                ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                    padding=6, bgcolor=C_SURFACE, border=ft.border.only(bottom=ft.border.BorderSide(1, C_BORDER))),
                ft.Container(content=ft.TextField(value=rd["name"], label="ルール名", on_change=name_changed,
                    bgcolor=C_SURFACE, text_style=ft.TextStyle(color=C_TEXT)),
                    padding=ft.padding.symmetric(horizontal=14, vertical=6)),
            ]
            if True:
                ec.append(ft.Container(content=ft.Row([
                    ft.Text("比較基準:", weight=ft.FontWeight.BOLD, color=C_TEXT, size=11),
                    ft.Dropdown(value=rd.get("base_rule"), options=[ft.dropdown.Option(k, text=get_base_rule_name(k, page)) for k in bd.keys()],
                        on_change=on_change_base, border_color=C_BORDER, width=220, text_size=10, content_padding=6)
                ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                    padding=ft.padding.symmetric(horizontal=14, vertical=3), bgcolor=C_SURFACE,
                    border=ft.border.only(bottom=ft.border.BorderSide(1, C_BORDER))))
                ec.append(ft.Container(content=ft.Text("💡 色付き = 基準ルールとの変更点", color=C_HIGHLIGHT, size=10, weight=ft.FontWeight.BOLD),
                    padding=ft.padding.only(left=14, top=6)))
            ec.append(ft.Container(padding=ft.padding.symmetric(horizontal=10, vertical=3), content=ft.Column(fields)))
            page.views.append(ft.View("/edit", bgcolor=page.bgcolor, padding=0, scroll=ft.ScrollMode.AUTO, controls=ec))

        elif page.route == "/preview":
            b64 = current_state.get("preview_base64", "")
            page.views.append(ft.View("/preview", bgcolor=page.bgcolor, padding=0, scroll=ft.ScrollMode.AUTO, controls=[
                ft.Container(content=ft.Row([
                    ft.TextButton("＜ 戻る", on_click=lambda _: page.go("/edit")),
                    ft.Text("出力プレビュー", color=C_TEXT, weight=ft.FontWeight.BOLD, size=14),
                    ft.Container(width=50)
                ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                    padding=10, bgcolor=C_SURFACE, border=ft.border.only(bottom=ft.border.BorderSide(1, C_BORDER))),
                ft.Container(content=ft.Image(src_base64=b64, fit=ft.ImageFit.CONTAIN), padding=14, alignment=ft.alignment.center),
                ft.Container(content=ft.Row([
                    ft.ElevatedButton("📷 画像を保存", on_click=save_image_file, bgcolor="#38A169", color=C_SURFACE, expand=True),
                    ft.ElevatedButton("📄 PDFを保存", on_click=save_pdf_file, bgcolor="#DD6B20", color=C_SURFACE, expand=True),
                ], spacing=10), padding=ft.padding.symmetric(horizontal=14, vertical=6)),
                ft.Container(content=ft.ElevatedButton("📱 スマホ用HTMLを保存", on_click=save_html_file, bgcolor="#805AD5", color=C_SURFACE, expand=True),
                    padding=ft.padding.only(left=14, right=14, bottom=10))
            ]))

        page.update()

    def view_pop(e):
        if len(page.views) > 1:
            page.views.pop()
            page.go(page.views[-1].route)
        else:
            page.go("/")

    page.on_route_change = route_change
    page.on_view_pop = view_pop
    page.go("/")

if __name__ == '__main__':
    ft.app(target=main, view=ft.AppView.WEB_BROWSER, port=8550)
