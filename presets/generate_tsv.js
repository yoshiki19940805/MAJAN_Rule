#!/usr/bin/env node
// =====================================================================
// presets/generate_tsv.js
// 選択肢をコンマ区切りで1セルに格納するTSV形式を生成
// =====================================================================
const fs = require('fs');
const path = require('path');

// ======= OPTIONS（カスタム含む元データ）=======
const OPTIONS_4 = {
  length:["東南戦","東風戦"],mochi_ten:["25000点","30000点","カスタム"],mochi_ten_custom:[""],
  kaeshi_ten:["30000点","25000点","カスタム"],kaeshi_ten_custom:[""],
  uma:["10-20","10-30","5-15","カスタム"],uma_custom:[""],
  tobi:["あり（0点未満で終了）","あり（0点ちょうどで終了）","なし"],
  nishiiri:["なし","あり"],ipponba:["300点","1500点","カスタム"],ipponba_custom:[""],
  renchan:["テンパイ連荘","テンパイ連荘（形テンNG）","アガリ連荘"],
  oras_oya:["アガリ止め・テンパイ止めあり","アガリ止め・テンパイ止めなし","カスタム"],oras_oya_custom:[""],
  tochu_kyushu:["あり","なし"],tochu_sufon:["あり","なし"],tochu_sukan:["あり","なし"],
  tochu_sucha:["あり","なし"],tochu_sancha:["あり","なし"],
  tochu_honba:["積む","積まない","途中流局なし"],
  double_ron:["あり","なし（頭ハネ）"],triple_ron:["全員アガリ","流局（三家和）","頭ハネ"],
  naki_priority:["発声優先（同時ならポン・カン優先）","ポン・カン優先"],
  tsumo_yama:["王牌14枚残し","ドラ表示牌の隣までツモり切り","カスタム"],
  kuitan:["あり","なし"],atozuke:["あり","なし"],kuikae:["禁止","あり"],
  aka_dora:["各1枚（計3枚）","なし","カスタム"],
  kan_dora:["先めくり","後めくり","暗槓のみ先めくり","カスタム"],
  tsumopin:["あり","なし"],kiriage:["あり","なし"],renpai_toitsu:["2符","4符"],
  nagashi:["あり（流局時成立）","なし"],kokushi_ankan:["あり","なし"],
  shiro_pocchi:["なし","あり（リーチ後オールマイティ）"],
  yakuman_type:["雀魂に準ずる","天鳳に準ずる","Mリーグに準拠","カスタム"],yakuman_custom_memo:[""],
  yakuman_fukugo:["なし","あり","カスタム"],kazoe_yakuman:["13飜以上","なし"],
  sp_daisharin:["なし","あり（清一七対子）"],sp_renho:["なし","あり"],sp_nagashi_ym:["なし","あり"],
  sp_4mai_chii:["なし","あり（2翻）"],sp_shosharin:["なし","あり（混一七対子・6翻）"],
  furiten_reach:["あり","なし","カスタム"],open_reach:["なし","あり","カスタム"],
  furiten_open_reach:["あり","なし","カスタム"],tsumo_nashi_reach:["不可","可"],
  reach_1000:["あり","なし","あり（局終了時にトビ）","あり（局終了時に0点でトビ）"],
  reach_ankan_okuri:["可","不可"],reach_ankan_machi:["可","不可"],reach_ankan_mentsu:["可","不可"],
  shugi_pocchi:["あり（リーチ後白ポッチツモ）","なし"],
  shugi_ippatsu:["あり","なし"],shugi_ura:["あり","なし"],
  shugi_aka:["鳴き祝儀","門前祝儀","なし"],
  shugi_ym_tsumo:["5枚オール","3枚オール","なし"],shugi_ym_ron:["10枚","5枚","なし"],
  shugi_kazoe:["対象外","対象"],
  tobi_shou:["あり（飛ばされた人が場にチップ2枚）","なし","カスタム"],shugi_memo:[""],
  pao_daisangen:["あり","なし"],pao_daisushi:["あり","なし"],pao_sukantu:["なし","あり"],
  pao_tsumo:["パオの人が全額","通常精算"],pao_ron:["パオの人と振込者で折半","振込者が全額"],
  chombo_batsu:["満貫払い","倍満払い","20000点減点","カスタム","なし"],chombo_memo:[""],
  chombo_taiou:["やり直し","流局扱い","親なら流局","なし"],
  keibappu_type:["1000点供託","なし","カスタム"],keibappu_taiou:["ゲーム続行","カスタム","なし"],
  pen_goron_taopai:["チョンボ","上がり放棄","軽罰符","カスタム","なし"],
  pen_noten_reach:["チョンボ","上がり放棄","軽罰符","カスタム","なし"],
  pen_reach_bad_ankan:["チョンボ","上がり放棄","軽罰符","カスタム","なし"],
  pen_goron_no_taopai:["上がり放棄","チョンボ","軽罰符","カスタム","なし"],
  pen_gonaki_sarashi:["上がり放棄","チョンボ","軽罰符","カスタム","なし"],
  pen_kuikae_ihan:["上がり放棄","チョンボ","軽罰符","カスタム","なし"],
  pen_tahai:["上がり放棄","チョンボ","軽罰符","カスタム","なし"],
  pen_gonaki_hassei:["軽罰符","上がり放棄","チョンボ","カスタム","なし"],
  pen_shouhai:["軽罰符","上がり放棄","チョンボ","カスタム","なし"],
};
const OPTIONS_3 = {
  length:["東南戦","東風戦"],mochi_ten:["30000点","35000点","50000点","カスタム"],mochi_ten_custom:[""],
  kaeshi_ten:["35000点","40000点","50000点","カスタム"],kaeshi_ten_custom:[""],
  uma:["+20/±0/-20","+30/±0/-30","なし","カスタム"],uma_custom:[""],
  tobi:["あり（0点ちょうどで終了）","あり（0点未満で終了）","なし"],
  tsumozon:["なし","あり"],fu_keisan:["なし（専用点数表）","あり"],tsumopin:["あり","なし"],
  ipponba:["1000点","カスタム"],ipponba_custom:[""],tenpai_ryou:["場に2000点","カスタム"],
  renchan:["テンパイ連荘","テンパイ連荘（形テンNG）","アガリ連荘"],
  oras_oya:["アガリ止め・テンパイ止めあり","アガリ止め・テンパイ止めなし","カスタム"],oras_oya_custom:[""],
  tochu_kyushu:["あり","なし"],tochu_sukan:["あり","なし"],tochu_sancha:["あり","なし"],
  tochu_honba:["積む","積まない","途中流局なし"],
  tochu_ryukyoku:["なし（4人リーチも続行）","あり"],double_ron:["あり","なし（頭ハネ）"],
  tsumo_yama:["ドラ表示牌の隣までツモり切り","王牌14枚残し","カスタム"],
  kuitan:["あり","なし"],atozuke:["あり","なし"],
  aka_dora:["5に各2枚","カスタム"],niji_dora:["5に各2枚","カスタム"],
  kita:["共通役牌（北抜きなし）","抜きドラ"],
  hanapai:["あり（空気扱い・一発消えず・嶺上開花なし）","なし"],
  kan_dora:["先めくり","暗槓のみ先めくり","カスタム"],
  reach_1000:["あり","なし","あり（局終了時にトビ）","あり（局終了時に0点でトビ）"],
  furiten_reach:["可能（見逃しツモ可）","不可","カスタム"],
  open_reach:["なし","あり","カスタム"],furiten_open_reach:["あり","なし","カスタム"],
  tsumo_nashi_reach:["不可","可"],reach_ankan_okuri:["可","不可"],
  reach_ankan_machi:["可","不可"],reach_ankan_mentsu:["可","不可"],
  reach_kan:["待ち不変ならOK","不可"],niken_reach:["2軒リーチで残り1人手牌公開","なし"],
  shiro_pocchi:["あり（リーチ後オールマイティ）","なし"],
  sp_manzu_honitsu:["あり","なし"],sp_daisharin:["あり（清一七対子）","なし"],
  sp_renho:["あり","なし"],sp_nagashi_ym:["あり","なし"],
  sp_4mai_chii:["あり（2翻）","なし"],sp_shosharin:["あり（混一七対子・6翻）","なし"],
  yakuman_type:["雀魂に準ずる","天鑙に準ずる","カスタム"],yakuman_custom_memo:[""],
  kazoe_yakuman:["14飜以上","13飜以上","なし"],w_yakuman:["なし","あり","カスタム"],
  kokushi_ankan:["あり","なし"],shugi_ippatsu:["あり","なし"],shugi_ura:["あり","なし"],
  shugi_niji:["あり（鳴き祝儀あり）","あり（鳴き祝儀なし）","なし"],
  shugi_pocchi:["あり（リーチ後白ポッチツモ）","なし"],
  shugi_ym_tsumo:["5枚","3枚","なし"],shugi_ym_ron:["10枚","5枚","なし"],
  shugi_kazoe:["対象外","対象"],tobi_shou:["場に２枚（飛ばした人が受け取る）","カスタム"],
  shugi_memo:[""],pao_daisangen:["あり","なし"],pao_daisushi:["あり","なし"],
  pao_sukantu:["なし","あり"],pao_tsumo:["パオが全額（チップ5枚）","通常精算"],
  pao_ron:["パオと振込者で折半（チップ各5枚）","振込者が全額"],
  chombo_batsu:["倍満払い","満貫払い","カスタム","なし"],chombo_memo:[""],
  chombo_taiou:["やり直し","流局扱い","親なら流局","なし"],
  keibappu_type:["1000点供託","なし","カスタム"],keibappu_taiou:["ゲーム続行","カスタム","なし"],
  pen_goron_taopai:["チョンボ","上がり放棄","軽罰符","カスタム","なし"],
  pen_noten_reach:["チョンボ","上がり放棄","軽罰符","カスタム","なし"],
  pen_reach_bad_ankan:["チョンボ","上がり放棄","軽罰符","カスタム","なし"],
  pen_goron_no_taopai:["上がり放棄","チョンボ","軽罰符","カスタム","なし"],
  pen_gonaki_sarashi:["上がり放棄","チョンボ","軽罰符","カスタム","なし"],
  pen_kuikae_ihan:["上がり放棄","チョンボ","軽罰符","カスタム","なし"],
  pen_tahai:["上がり放棄","チョンボ","軽罰符","カスタム","なし"],
  pen_gonaki_hassei:["軽罰符","上がり放棄","チョンボ","カスタム","なし"],
  pen_reach_torikeshi:["軽罰符","上がり放棄","チョンボ","カスタム","なし"],
  pen_shouhai:["軽罰符","上がり放棄","チョンボ","カスタム","なし"],
};

// ======= カテゴリ =======
const CATEGORIES_4 = [
  ["1. 基本設定・ポイント精算",["length","mochi_ten","mochi_ten_custom","kaeshi_ten","kaeshi_ten_custom","uma","uma_custom","tobi","nishiiri","tsumopin","ipponba","ipponba_custom"]],
  ["2. 進行・連荘ルール",["renchan","oras_oya","oras_oya_custom","double_ron","triple_ron","naki_priority","tsumo_yama"]],
  ["3. 途中流局",["tochu_kyushu","tochu_sufon","tochu_sukan","tochu_sucha","tochu_sancha","tochu_honba"]],
  ["4. 役・ドラ",["kuitan","atozuke","kuikae","aka_dora","kan_dora","kiriage","renpai_toitsu","nagashi","kokushi_ankan","yakuman_type","yakuman_custom_memo","yakuman_fukugo","kazoe_yakuman"]],
  ["5. リーチ関連",["furiten_reach","open_reach","furiten_open_reach","tsumo_nashi_reach","reach_1000"]],
  ["6. リーチ後の暗槓",["reach_ankan_okuri","reach_ankan_machi","reach_ankan_mentsu"]],
  ["7. 祝儀（チップ）",["shugi_ippatsu","shugi_ura","shugi_aka","shugi_pocchi","shugi_ym_tsumo","shugi_ym_ron","shugi_kazoe","tobi_shou"]],
  ["8. 特殊牌",[]],
  ["9. ローカル役",["sp_4mai_chii","sp_shosharin"]],
  ["10. ローカル役満",["sp_daisharin","sp_renho","sp_nagashi_ym"]],
  ["11. ローカルルール",["shiro_pocchi"]],
  ["12. パオ（責任払い）",["pao_daisangen","pao_daisushi","pao_sukantu","pao_tsumo","pao_ron"]],
  ["13. チョンボ",["chombo_batsu","chombo_memo","chombo_taiou","pen_goron_taopai","pen_noten_reach","pen_reach_bad_ankan"]],
  ["14. 上がり放棄",["pen_goron_no_taopai","pen_gonaki_sarashi","pen_kuikae_ihan","pen_tahai","pen_gonaki_hassei","pen_shouhai"]],
  ["15. 軽罰符",["keibappu_type","keibappu_taiou"]],
];
const CATEGORIES_3 = [
  ["1. 基本設定・ポイント精算",["length","mochi_ten","mochi_ten_custom","kaeshi_ten","kaeshi_ten_custom","uma","uma_custom","tobi","tsumozon","fu_keisan","tsumopin","ipponba","ipponba_custom","tenpai_ryou"]],
  ["2. 進行・連荘ルール",["renchan","oras_oya","oras_oya_custom","double_ron","tsumo_yama"]],
  ["3. 途中流局",["tochu_kyushu","tochu_sukan","tochu_honba"]],
  ["4. 役・ドラ・牌の扱い",["kuitan","atozuke","aka_dora","niji_dora","kita","hanapai","kan_dora","yakuman_type","yakuman_custom_memo","kazoe_yakuman","w_yakuman","kokushi_ankan"]],
  ["5. リーチ関連",["reach_1000","furiten_reach","open_reach","furiten_open_reach","tsumo_nashi_reach"]],
  ["6. リーチ後の暗槓",["reach_ankan_okuri","reach_ankan_machi","reach_ankan_mentsu"]],
  ["7. ローカル役",["sp_4mai_chii","sp_shosharin"]],
  ["8. ローカル役満",["sp_manzu_honitsu","sp_daisharin","sp_renho","sp_nagashi_ym"]],
  ["9. ローカルルール",["niken_reach","shiro_pocchi"]],
  ["10. 祝儀（チップ）",["shugi_ippatsu","shugi_ura","shugi_niji","shugi_pocchi","shugi_ym_tsumo","shugi_ym_ron","shugi_kazoe","tobi_shou"]],
  ["11. パオ（責任払い）",["pao_daisangen","pao_daisushi","pao_sukantu","pao_tsumo","pao_ron"]],
  ["12. チョンボ",["chombo_batsu","chombo_memo","chombo_taiou","pen_goron_taopai","pen_noten_reach","pen_reach_bad_ankan"]],
  ["13. 上がり放棄",["pen_goron_no_taopai","pen_gonaki_sarashi","pen_kuikae_ihan","pen_tahai"]],
  ["14. 軽罰符",["pen_gonaki_hassei","pen_shouhai","keibappu_type","keibappu_taiou"]],
];

// ======= プリセット値 =======
const _BASE_4_COMMON = {length:"東南戦",mochi_ten:"25000点",mochi_ten_custom:"",kaeshi_ten:"30000点",kaeshi_ten_custom:"",tobi:"あり（0点未満で終了）",ipponba:"300点",ipponba_custom:"",renchan:"テンパイ連荘",oras_oya:"アガリ止め・テンパイ止めあり",oras_oya_custom:"",tochu_kyushu:"あり",tochu_sufon:"あり",tochu_sukan:"あり",tochu_sucha:"あり",tochu_sancha:"あり",tochu_honba:"積む",naki_priority:"発声優先（同時ならポン・カン優先）",tsumo_yama:"王牌14枚残し",kuitan:"あり",atozuke:"あり",kuikae:"禁止",aka_dora:"各１枚（計3枚）",kan_dora:"先めくり",tsumopin:"あり",renpai_toitsu:"2符",kokushi_ankan:"あり",yakuman_fukugo:"なし",kazoe_yakuman:"13飜以上",yakuman_custom_memo:"",furiten_reach:"あり",open_reach:"なし",furiten_open_reach:"なし",tsumo_nashi_reach:"不可",reach_1000:"なし",reach_ankan_okuri:"可",reach_ankan_machi:"不可",reach_ankan_mentsu:"不可"};
const P4 = {
  "雀魂":{..._BASE_4_COMMON,uma:"5-15",nishiiri:"あり",double_ron:"あり",triple_ron:"全員アガリ",kiriage:"なし",nagashi:"あり（流局時成立）",yakuman_type:"雀魂に準ずる",naki_priority:"ポン・カン優先",tochu_sancha:"なし",kan_dora:"暗槓のみ先めくり",renpai_toitsu:"4符",furiten_reach:"なし",reach_ankan_okuri:"不可",chombo_batsu:"なし",chombo_taiou:"なし",keibappu_type:"なし",keibappu_taiou:"なし",pen_goron_taopai:"なし",pen_noten_reach:"なし",pen_reach_bad_ankan:"なし",pen_goron_no_taopai:"なし",pen_gonaki_sarashi:"なし",pen_kuikae_ihan:"なし",pen_tahai:"なし",pen_gonaki_hassei:"なし",pen_shouhai:"なし",shugi_ippatsu:"なし",shugi_ura:"なし",shugi_aka:"なし",shugi_pocchi:"なし",shugi_ym_tsumo:"なし",shugi_ym_ron:"なし",shugi_kazoe:"対象外",shugi_memo:"",tobi_shou:"",pao_daisangen:"あり",pao_daisushi:"あり",pao_sukantu:"なし",pao_tsumo:"パオの人が全額",pao_ron:"パオの人と振込者で折半",sp_daisharin:"なし",sp_renho:"なし",sp_nagashi_ym:"なし",sp_4mai_chii:"なし",sp_shosharin:"なし",shiro_pocchi:""},
  "Mリーグ":{..._BASE_4_COMMON,uma:"10-30",uma_custom:"",nishiiri:"なし",tobi:"なし",oras_oya:"アガリ止め・テンパイ止めなし",tochu_kyushu:"なし",tochu_sufon:"なし",tochu_sukan:"なし",tochu_sucha:"なし",tochu_sancha:"なし",tochu_honba:"途中流局なし",double_ron:"なし（頭ハネ）",triple_ron:"頭ハネ",naki_priority:"ポン・カン優先",kiriage:"あり",nagashi:"なし",kan_dora:"暗槓のみ先めくり",kokushi_ankan:"なし",yakuman_type:"Mリーグに準拠",tsumo_nashi_reach:"可",reach_1000:"あり",reach_ankan_okuri:"不可",chombo_batsu:"20000点減点",chombo_taiou:"やり直し",keibappu_type:"なし",keibappu_taiou:"なし",pen_goron_taopai:"チョンボ",pen_noten_reach:"チョンボ",pen_reach_bad_ankan:"チョンボ",pen_goron_no_taopai:"上がり放棄",pen_gonaki_sarashi:"上がり放棄",pen_kuikae_ihan:"上がり放棄",pen_tahai:"上がり放棄",pen_gonaki_hassei:"上がり放棄",pen_shouhai:"上がり放棄",shugi_ippatsu:"なし",shugi_ura:"なし",shugi_aka:"なし",shugi_pocchi:"なし",shugi_ym_tsumo:"なし",shugi_ym_ron:"なし",shugi_kazoe:"対象外",shugi_memo:"",tobi_shou:"",pao_daisangen:"あり",pao_daisushi:"あり",pao_sukantu:"なし",pao_tsumo:"パオの人が全額",pao_ron:"パオの人と振込者で折半",sp_daisharin:"なし",sp_renho:"なし",sp_nagashi_ym:"なし",sp_4mai_chii:"なし",sp_shosharin:"なし",shiro_pocchi:""},
  "天鳳":{..._BASE_4_COMMON,uma:"10-20",nishiiri:"あり",double_ron:"あり",triple_ron:"流局（三家和）",kiriage:"なし",nagashi:"あり（流局時成立）",yakuman_type:"天鳳に準ずる",naki_priority:"ポン・カン優先",kan_dora:"暗槓のみ先めくり",renpai_toitsu:"4符",furiten_reach:"なし",reach_ankan_okuri:"不可",chombo_batsu:"なし",chombo_taiou:"なし",keibappu_type:"なし",keibappu_taiou:"なし",pen_goron_taopai:"なし",pen_noten_reach:"なし",pen_reach_bad_ankan:"なし",pen_goron_no_taopai:"なし",pen_gonaki_sarashi:"なし",pen_kuikae_ihan:"なし",pen_tahai:"なし",pen_gonaki_hassei:"なし",pen_shouhai:"なし",shugi_ippatsu:"なし",shugi_ura:"なし",shugi_aka:"なし",shugi_pocchi:"なし",shugi_ym_tsumo:"なし",shugi_ym_ron:"なし",shugi_kazoe:"対象外",shugi_memo:"",tobi_shou:"",pao_daisangen:"あり",pao_daisushi:"あり",pao_sukantu:"なし",pao_tsumo:"パオの人が全額",pao_ron:"パオの人と振込者で折半",sp_daisharin:"なし",sp_renho:"なし",sp_nagashi_ym:"なし",sp_4mai_chii:"なし",sp_shosharin:"なし",shiro_pocchi:""},
};
const P3 = {
  "関東三麻":{length:"東南戦",mochi_ten:"35000点",kaeshi_ten:"40000点",uma:"+20/±0/-20",tobi:"あり（0点未満で終了）",tsumozon:"なし",fu_keisan:"なし（専用点数表）",tsumopin:"あり",ipponba:"1000点",ipponba_custom:"",tenpai_ryou:"場に2000点",renchan:"テンパイ連荘",oras_oya:"アガリ止め・テンパイ止めあり",oras_oya_custom:"",tochu_kyushu:"なし",tochu_sukan:"なし",tochu_honba:"途中流局なし",tochu_ryukyoku:"なし（3人リーチも続行）",double_ron:"あり",tsumo_yama:"ドラ表示牌の隣までツモり切り",kuitan:"あり",atozuke:"あり",aka_dora:"5に各2枚",niji_dora:"5に各2枚",kita:"共通役牌（北抜きなし）",hanapai:"あり（空気扱い・一発消えず・嶺上開花なし）",kan_dora:"先めくり",reach_1000:"あり（局終了時にトビ）",furiten_reach:"不可",open_reach:"あり",furiten_open_reach:"なし",tsumo_nashi_reach:"不可",reach_ankan_okuri:"不可",reach_ankan_machi:"不可",reach_ankan_mentsu:"可",reach_kan:"待ち不変ならOK",niken_reach:"2軒リーチで残り1人手牌公開",shiro_pocchi:"あり（リーチ後オールマイティ）",sp_manzu_honitsu:"あり",sp_daisharin:"あり（清一七対子）",sp_renho:"あり",sp_nagashi_ym:"あり",sp_4mai_chii:"あり（2翻）",sp_shosharin:"あり（混一七対子・6翻）",yakuman_type:"雀魂に準ずる",yakuman_custom_memo:"",kazoe_yakuman:"14飜以上",w_yakuman:"なし",kokushi_ankan:"あり",shugi_ippatsu:"あり",shugi_ura:"あり",shugi_niji:"あり（鳴き祝儀あり）",shugi_pocchi:"あり（リーチ後白ポッチツモ）",shugi_ym_tsumo:"5枚",shugi_ym_ron:"10枚",shugi_kazoe:"対象外",tobi_shou:"場に２枚（飛ばした人が受け取る）",shugi_memo:"",pao_daisangen:"あり",pao_daisushi:"あり",pao_sukantu:"なし",pao_tsumo:"放銃扱い",pao_ron:"パオと振込者で折半（チップ各5枚）",chombo_batsu:"倍満払い",chombo_memo:"",chombo_taiou:"やり直し",pen_goron_taopai:"チョンボ",pen_noten_reach:"チョンボ",pen_reach_bad_ankan:"チョンボ",pen_goron_no_taopai:"上がり放棄",pen_gonaki_sarashi:"上がり放棄",pen_kuikae_ihan:"上がり放棄",pen_tahai:"上がり放棄",keibappu_type:"1000点供託",keibappu_taiou:"なし",pen_gonaki_hassei:"軽罰符",pen_shouhai:"軽罰符＋山から補充"},
};
const LABELS = {length:"対局の長さ",mochi_ten:"持ち点",mochi_ten_custom:"持ち点（カスタム）",kaeshi_ten:"返し点",kaeshi_ten_custom:"返し点（カスタム）",uma:"ウマ",uma_custom:"ウマ（カスタム）",tobi:"トビ終了",nishiiri:"西入",ipponba:"一本場",ipponba_custom:"一本場（カスタム）",tenpai_ryou:"テンパイ料",tsumozon:"ツモ損",fu_keisan:"符計算",tsumopin:"ツモピンフ",renchan:"連荘条件",oras_oya:"オーラスの親",oras_oya_custom:"オーラスの親（カスタム）",tochu_kyushu:"九種九牌",tochu_sufon:"四風連打",tochu_sukan:"四槓散了",tochu_sucha:"四家立直",tochu_sancha:"三家和",tochu_ryukyoku:"途中流局",tochu_honba:"途中流局時の本場",double_ron:"ダブロン",triple_ron:"トリロン",naki_priority:"鳴きの優先",tsumo_yama:"ツモ山",kuitan:"喰いタン",atozuke:"後付け",kuikae:"喰い替え",aka_dora:"赤ドラ",niji_dora:"虹ドラ（祝儀あり）",kiriage:"切り上げ満貫",renpai_toitsu:"連風牌の対子",nagashi:"流し満貫",kokushi_ankan:"国士の暗槓ロン",yakuman_type:"役満の種類",yakuman_custom_memo:"役満カスタム詳細",yakuman_fukugo:"役満の複合・W役満",kazoe_yakuman:"数え役満",w_yakuman:"W役満",kita:"北の扱い",hanapai:"花牌",kan_dora:"カンドラ",furiten_reach:"フリテンリーチ",open_reach:"オープンリーチ",furiten_open_reach:"フリテンオープンリーチ",tsumo_nashi_reach:"ツモ番なしリーチ",reach_1000:"1000点未満のリーチ",reach_ankan_okuri:"送り槓",reach_ankan_machi:"待ちの変わる槓",reach_ankan_mentsu:"面子構成の変わる槓",reach_kan:"リーチ後のカン",niken_reach:"2軒リーチ時",shiro_pocchi:"白ポッチ",sp_manzu_honitsu:"マンズ混一色（役満）",sp_daisharin:"大車輪",sp_renho:"人和（役満）",sp_nagashi_ym:"流し役満",sp_4mai_chii:"四枚使い七対子",sp_shosharin:"小車輪",shugi_ippatsu:"一発祝儀",shugi_ura:"裏ドラ祝儀",shugi_aka:"赤ドラ祝儀",shugi_niji:"虹牌祝儀",shugi_pocchi:"白ポッチ祝儀",shugi_ym_tsumo:"役満祝儀（ツモ）",shugi_ym_ron:"役満祝儀（ロン）",shugi_kazoe:"数え役満祝儀",tobi_shou:"トビ賞",pao_daisangen:"大三元パオ",pao_daisushi:"大四喜パオ",pao_sukantu:"四槓子パオ",pao_tsumo:"パオ支払い（ツモ）",pao_ron:"パオ支払い（ロン）",chombo_batsu:"チョンボ罰符",chombo_memo:"罰符の詳細",chombo_taiou:"チョンボ対処",pen_goron_taopai:"誤ロン・誤ツモ（倒牌）",pen_noten_reach:"ノーテンリーチ流局",pen_reach_bad_ankan:"リーチ後不正暗槓",pen_goron_no_taopai:"誤ロン・誤ツモ（倒牌なし）",pen_gonaki_sarashi:"誤鳴き（牌晒し）",pen_kuikae_ihan:"喰い替え違反",pen_tahai:"多牌",keibappu_type:"軽罰符の内容",keibappu_taiou:"軽罰符後の対処",pen_gonaki_hassei:"誤鳴き（発声のみ）",pen_shouhai:"少牌",pen_reach_torikeshi:"リーチ取り消し"};

// --- key ordering ---
const key2cat4 = {}; for (const [c,ks] of CATEGORIES_4) for (const k of ks) key2cat4[k]=c;
const key2cat3 = {}; for (const [c,ks] of CATEGORIES_3) for (const k of ks) key2cat3[k]=c;
const orderedKeys = []; const seen = new Set();
for (const [cn,k4] of CATEGORIES_4) {
  for (const k of k4) { if (!seen.has(k)){orderedKeys.push(k);seen.add(k);} }
  const n = cn.match(/^(\d+)\./)?.[1];
  const m3 = CATEGORIES_3.find(([c])=>c.match(/^(\d+)\./)?.[1]===n);
  if (m3) for (const k of m3[1]) { if (!seen.has(k)){orderedKeys.push(k);seen.add(k);} }
}
for (const [,k3] of CATEGORIES_3) for (const k of k3) { if (!seen.has(k)){orderedKeys.push(k);seen.add(k);} }

// --- TSV generation ---
const TAB = '\t';
const header = ['四麻カテゴリ','三麻カテゴリ','キー','ラベル','四麻選択肢','三麻選択肢','四麻:雀魂','四麻:Mリーグ','四麻:天鳳','三麻:関東三麻'];
const rows = [header.join(TAB)];

for (const key of orderedKeys) {
  const cat4 = key2cat4[key]||'';
  const cat3 = key2cat3[key]||'';
  const label = LABELS[key]||key;
  // 選択肢（カスタム除外・空除外）をコンマ区切りで1セルに
  const opts4raw = OPTIONS_4[key]||[];
  const opts4str = opts4raw.filter(v=>v!=='カスタム'&&v!=='').join(',');
  const opts3raw = OPTIONS_3[key]||[];
  const opts3str = opts3raw.filter(v=>v!=='カスタム'&&v!=='').join(',');
  const v_j = key in P4["雀魂"] ? (P4["雀魂"][key]??'') : '';
  const v_m = key in P4["Mリーグ"] ? (P4["Mリーグ"][key]??'') : '';
  const v_t = key in P4["天鳳"] ? (P4["天鳳"][key]??'') : '';
  const v_z = key in P3["関東三麻"] ? (P3["関東三麻"][key]??'') : '';
  rows.push([cat4,cat3,key,label,opts4str,opts3str,v_j,v_m,v_t,v_z].join(TAB));
}

const outPath = path.join(__dirname, 'presets_all.tsv');
fs.writeFileSync(outPath, rows.join('\n'), 'utf-8');
console.log(`Generated: ${outPath} (${rows.length} rows, ${header.length} columns)`);
