#!/usr/bin/env bash
# test-r142-branch-trunk-order.sh — R142 研发四阶段顺序锁：分支开发→分支测试→主干合并→主干回归
# （2026-10-27 用户指令立法，决策 57：九节点不变，四阶段是节点上的顺序语义——⑤编码=分支开发、
#   ⑥⑦=分支测试（分支全绿才合入，主干不做"合后再测"）、⑧=主干合并、⑨=主干回归在先（main
#   全量回归全绿才构建发布）。本测试锁三处口径单源一致 + 生成骨架携带 + 节点数不回退，
#   防后续改动把顺序改乱或"主干回归"悄悄蒸发。）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

GEN="$(pwd)/scripts/generate-skill.sh"
ROOT="$(pwd)"
TMP="$(mktemp -d /tmp/r142.XXXXXX)"
trap 'rm -rf "${TMP}"' EXIT

# 顺序断言助手：关键词按序首现（缺词或逆序=败；字节偏移比较，多字节安全）
order_ok() { # $1=file 其余=关键词序列
  local f="$1"; shift
  local pos prev=0 k p
  for k in "$@"; do
    p=$(grep -bo "$k" "$f" 2>/dev/null | head -1 | cut -d: -f1)
    if [[ -z "$p" ]]; then echo "    （缺关键词: ${k}）" >&2; return 1; fi
    if (( p <= prev )); then echo "    （逆序: ${k} @${p} <= ${prev}）" >&2; return 1; fi
    prev=$p
  done
  return 0
}

# 节点段包含断言：## 节点X 段内含关键词（段以 ^## 切界，总览/终检不混入）
sec_has() { # $1=file $2=段头正则 $3=关键词
  awk -v h="$2" -v kw="$3" '
    /^## / { insec = ($0 ~ h) ? 1 : 0; next }
    insec && index($0, kw) { found = 1; exit }
    END { exit !found }
  ' "$1"
}

# ===== ① 三处口径单源一致（SKILL.md / template-spec / 生成器模板） =====
SK="${ROOT}/SKILL.md"
TS="${ROOT}/references/template-spec.md"
GS="${ROOT}/scripts/generate-skill.sh"

if grep -q '研发四阶段＝分支开发→分支测试→主干合并→主干回归' "$SK"; then
  ok "①a SKILL.md description 四阶段口径在位"
else
  bad "①a SKILL.md description 四阶段口径缺失"
fi
if order_ok "$SK" 分支开发 分支测试 主干合并 主干回归; then
  ok "①b SKILL.md 四阶段顺序正确（分支开发→分支测试→主干合并→主干回归）"
else
  bad "①b SKILL.md 四阶段顺序错乱或缺词"
fi

if grep -q '研发过程四阶段顺序（2026-10-27 立法）' "$TS" && order_ok "$TS" 分支开发 分支测试 主干合并 主干回归; then
  ok "①c template-spec.md 四阶段声明在位且顺序正确"
else
  bad "①c template-spec.md 四阶段声明缺失或顺序错乱"
fi

grep -q '★分支开发（feature 分支自 origin/main 起' "$TS" \
  && ok "①d template-spec 节点⑤行含分支开发纪律" || bad "①d template-spec 节点⑤行缺分支开发纪律"
grep -q '★分支测试（门禁序列在分支执行全绿才可合入' "$TS" \
  && ok "①e template-spec 节点⑥行含分支测试判据" || bad "①e template-spec 节点⑥行缺分支测试判据"
grep -q '★主干回归（合入后在 main 复跑全量回归，全绿才构建发布' "$TS" \
  && ok "①f template-spec 节点⑨行含主干回归门禁" || bad "①f template-spec 节点⑨行缺主干回归门禁"

if grep -q '研发过程四阶段顺序（2026-10-27 立法）' "$GS"; then
  ok "①g generate-skill.sh workflow 模板含四阶段声明"
else
  bad "①g generate-skill.sh workflow 模板缺四阶段声明"
fi

# 节点数不因阶段挂载回退/膨胀（决策 57：九节点不变）
if grep -q '^FACT_FLOW_NODES=9' "${ROOT}/assets/facts.conf"; then
  ok "①h FACT_FLOW_NODES=9 未变（四阶段挂载不动节点数）"
else
  bad "①h FACT_FLOW_NODES 偏离 9——四阶段立法不得改节点数"
fi

# ===== ② 生成骨架携带（standard 档端到端；lite 档裁剪不随发 workflow.md——line 3128 注记） =====
PROJ="${TMP}/proj"; mkdir -p "${PROJ}/src"
printf '[package]\nname = "svc142"\nversion = "0.1.0"\nedition = "2021"\n' > "${PROJ}/Cargo.toml"
printf 'fn main() { println!("hi"); }\n' > "${PROJ}/src/main.rs"
if bash "${GEN}" --profile standard svc142 "${PROJ}" >/dev/null 2>&1; then
  ok "②a standard 技能生成成功"
else
  bad "②a lite 技能生成失败"; exit 1
fi
WF="${PROJ}/.claude/skills/svc142/references/workflow.md"
[[ -f "$WF" ]] && ok "②b 产物 workflow.md 就位" || { bad "②b 产物 workflow.md 缺失"; exit 1; }

if order_ok "$WF" 分支开发 分支测试 主干合并 主干回归; then
  ok "②c 产物 workflow.md 四阶段顺序正确"
else
  bad "②c 产物 workflow.md 四阶段顺序错乱或缺词"
fi

sec_has "$WF" '^## 节点⑤' '分支开发' \
  && ok "②d 节点⑤段含分支开发" || bad "②d 节点⑤段缺分支开发"
sec_has "$WF" '^## 节点⑥' '分支测试' \
  && ok "②e 节点⑥段含分支测试" || bad "②e 节点⑥段缺分支测试"
sec_has "$WF" '^## 节点⑥' '合后再测' \
  && ok "②f 节点⑥段锁『主干不做合后再测』" || bad "②f 节点⑥段缺『主干不做合后再测』约束"
sec_has "$WF" '^## 节点⑧' '主干合并' \
  && ok "②g 节点⑧段含主干合并" || bad "②g 节点⑧段缺主干合并"
sec_has "$WF" '^## 节点⑨' '主干回归' \
  && ok "②h 节点⑨段含主干回归" || bad "②h 节点⑨段缺主干回归"
grep -q 'operate=⑨主干回归+构建发布' "$WF" \
  && ok "②i state-machine 对照 operate=主干回归+构建发布" || bad "②i state-machine 对照未更新"
grep -q '节点⑨构建发布：主干回归（main 全量回归全绿）' "$WF" \
  && ok "②j 终检表节点⑨行含主干回归" || bad "②j 终检表节点⑨行缺主干回归"

# ===== ③ 节点时序硬序（⑤ < ⑥ < ⑧ < ⑨，合并在测试后、回归在合并后） =====
n5=$(grep -n '^## 节点⑤' "$WF" | head -1 | cut -d: -f1)
n6=$(grep -n '^## 节点⑥' "$WF" | head -1 | cut -d: -f1)
n8=$(grep -n '^## 节点⑧' "$WF" | head -1 | cut -d: -f1)
n9=$(grep -n '^## 节点⑨' "$WF" | head -1 | cut -d: -f1)
if [[ -n "$n5" && -n "$n6" && -n "$n8" && -n "$n9" ]] && (( n5 < n6 && n6 < n8 && n8 < n9 )); then
  ok "③ 节点硬序 ⑤编码 < ⑥测试 < ⑧合入 < ⑨发布（分支测试先于主干合并、主干回归最后）"
else
  bad "③ 节点硬序破坏（n5=${n5} n6=${n6} n8=${n8} n9=${n9}）"
fi

if [[ $FAIL -eq 0 ]]; then
  echo "PASS: R142 研发四阶段顺序锁全部断言通过"
else
  echo "FAIL: R142 存在失败断言" >&2
fi
exit $FAIL
