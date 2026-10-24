#!/bin/bash
# 守门：中央清单角色增量（2026-10-18 多机能力管理轮）——mx-lib install_skills 读
# skill-provisioning.json 的四面锚 + 行为契约。缺位=零行为变化（bare CI 兼容）；
# 忽略 '*' 通用行（sim 基线=SKILLS_INSTALL，通用行叠装会给 42 账号翻倍）；
# 来源限 SKILLS_SRC；charter 追加与 __SIM_ROOT__ 实例化与基线同款。
set -u
cd "$(dirname "$0")/../.."
fails=0

ck() { if grep -qE "$3" "$2"; then echo "PASS $1"; else echo "FAIL $1（$2 缺锚：$3）"; fails=1; fi; }
ckf() { if grep -qF "$3" "$2"; then echo "PASS $1"; else echo "FAIL $1（$2 缺锚：$3）"; fails=1; fi; }

LIB=mux/mx-lib.sh

# ① 读取链与缺位兼容
ck "读取链·env 显式优先" "$LIB" 'MX_SKILL_MANIFEST:-\$\{MX_CENTRAL_SHARED'
ckf "读取链·宿主 _shared 默认" "$LIB" '$HOME/.hermes/profiles/_shared}/skill-provisioning.json'
ck "缺位零行为" "$LIB" 'if \[\[ -f "\$_mxm" \]\]'

# ② 行为契约：忽略 '*'、来源限 SKILLS_SRC、同构安装三件套
ckf "契约·来源限 SKILLS_SRC" "$LIB" '[[ -d "$SKILLS_SRC/$_ms" ]]'
ckf "契约·整目录拷贝" "$LIB" 'cp -R "$SKILLS_SRC/$_ms/." "$PROF/skills/$_ms/"'
ck "契约·charter 追加" "$LIB" 'cat "\$STYLE_CHARTER" >> "\$PROF/skills/\$_ms/SKILL.md"'
ck "契约·__SIM_ROOT__ 实例化" "$LIB" 's\|__SIM_ROOT__\|\$SIM_ROOT\|g'

# ③ 匹配语义与 overlay skillprovision 同源（精确>后缀>前缀 的分值序，锚在真身文件）
ckf "真身·mx-lib 调用" "$LIB" 'mux/manifest-extras.py'
ck "匹配·优先级分值" mux/manifest-extras.py "if m == '\*':"
ck "匹配·后缀 500 段" mux/manifest-extras.py 'if m\.startswith'
ckf "匹配·忽略通用行" mux/manifest-extras.py "r['match'] != '*' and matches(r['match'], profile)"

# ④ 语法自检（改动必过 bash -n——纪律 19 同款）
if bash -n "$LIB" 2>/dev/null; then echo "PASS mx-lib bash -n"; else echo "FAIL $LIB 语法"; fails=1; fi

# ⑤ 功能烟测：直测真身 mux/manifest-extras.py（*-tester 命中后缀角色、忽略 '*'、无命中空输出、坏文件空输出）
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/m.json" <<'J'
{"version":1,"roles":[
  {"match":"*","skills":["universal-should-not-appear"]},
  {"match":"*-tester","skills":["backend-integration-testing","extra-from-manifest"]},
  {"match":"lin","skills":["lin-only"]}
]}
J
OUT_T=$(python3 mux/manifest-extras.py qi-tester "$TMP/m.json" | tr '\n' ' ')
OUT_N=$(python3 mux/manifest-extras.py nobody "$TMP/m.json" | tr '\n' ' ')
OUT_L=$(python3 mux/manifest-extras.py lin "$TMP/m.json" | tr '\n' ' ')
echo 'not json' > "$TMP/bad.json"
OUT_B=$(python3 mux/manifest-extras.py lin "$TMP/bad.json" | tr '\n' ' ')
if [[ "$OUT_T" == "backend-integration-testing extra-from-manifest " ]]; then echo "PASS 功能·后缀角色命中且忽略通用行"; else echo "FAIL 功能·tester 输出=[$OUT_T]"; fails=1; fi
if [[ -z "$OUT_N" ]]; then echo "PASS 功能·无命中空输出"; else echo "FAIL 功能·nobody 输出=[$OUT_N]"; fails=1; fi
if [[ "$OUT_L" == "lin-only " ]]; then echo "PASS 功能·精确命中"; else echo "FAIL 功能·lin 输出=[$OUT_L]"; fails=1; fi
if [[ -z "$OUT_B" ]]; then echo "PASS 功能·坏文件空输出（fail-soft）"; else echo "FAIL 功能·坏文件输出=[$OUT_B]"; fails=1; fi

[ "$fails" -eq 0 ] && echo 'PASS skill-manifest-gate（mx-lib 中央清单四面锚+行为契约）'
exit "$fails"
