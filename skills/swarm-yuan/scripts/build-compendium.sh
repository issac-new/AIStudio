#!/usr/bin/env bash
# build-compendium.sh — 设计汇编新鲜度检查与再生成（全卷逐字节比对）
#
# docs/design-compendium-full.md 内嵌六卷正本快照：卷一 README（唯一设计文档）/卷二 决策史/
# 卷三 上游供应链台账/卷四 使用手册/卷五 facts.conf/卷六 吸收清单。卷首导读与卷七/卷八为
# 汇编自生成内容，无单一正本，不参与比对。
#
# 检查语义（2026-10-24 R141 根治抽检假绿）：旧版只覆盖卷一/四/六、每卷只取正本前 200
# 非空行、行级「全文任一处命中」即算过——卷二/三/五零覆盖，深位改动漏检（R140 实录
# 两例假绿：usage-manual 第 404 行升级节改动后仍报卷四新鲜；facts.conf 新增事实键
# 未嵌入汇编未被点名）。本版每卷从汇编切出后与正本逐字节比对，任一卷任何位置漂移、
# 卷结构缺失或失序即报红（fail-closed）。收口门接入 run-sweep ⑦与 CI。
#
# 用法:
#   bash build-compendium.sh --check    # 校验六卷与正本一致（陈旧/结构缺失 rc 1）
#   bash build-compendium.sh --regen    # 重灌六卷正本段（其余卷原样保留），自校验通过才落盘
#   bash build-compendium.sh --help
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "${BASE}/.." && pwd)"
FULL="$ROOT/docs/design-compendium-full.md"

# 卷表（顺序即汇编卷序；标题行须与汇编逐字一致）
VOL_KEY=(一 二 三 四 五 六)
VOL_NAME=("设计论证" "决策史" "上游供应链台账" "使用手册" "数字口径单源" "吸收清单")
VOL_SRC=(
  "$BASE/README.md"
  "$ROOT/docs/design-evolution.md"
  "$ROOT/docs/upstream-baseline.md"
  "$ROOT/docs/usage-manual.md"
  "$BASE/assets/facts.conf"
  "$BASE/references/capability-map.md"
)
# 结构守卫基准：九卷标题齐全有序（卷首+卷一~卷八）
STRUCT_EXPECT=$(printf '%s\n' "卷首 导读" "卷一 设计论证" "卷二 决策史" "卷三 上游供应链台账" "卷四 使用手册" "卷五 数字口径单源" "卷六 吸收清单" "卷七 轮档完整索引" "卷八 用户指令全量编年")

# 归一化：去尾部空行，再剥一个尾随 '---' 分卷分隔线（卷五/卷六末尾带、卷一~四不带）
_normalize() {
  awk '{l[NR]=$0} END{n=NR; while(n>=1&&l[n]~/^[[:space:]]*$/)n--; if(n>=1&&l[n]=="---")n--; for(i=1;i<=n;i++)print l[i]}'
}

# 切卷：$1=卷标题行（如「# 卷二 决策史」）；$2=汇编文件（默认 $FULL）→ stdout 归一化卷正文。
# 卷头 = 标题后的空行与「> 来源：」「> 正本：」注记行；首个其他行起为正文，至下一
#「^# 卷」标题行终止。正文=正本全文逐字节（含正本自带的「何时读我」路由头——卷六
# 首行即此类；旧版曾把它当卷头注记误切，且 R140 手工重灌曾注记重复，均由此锚澄清）。
_extract_volume() {
  local _t="$1" _f="${2:-$FULL}"
  awk -v t="$_t" '
    $0==t {f=1; next}
    f && h { if ($0=="" || $0 ~ /^> 来源：/ || $0 ~ /^> 正本：/) next; h=0 }
    f { if ($0 ~ /^# 卷/) exit
        print }
    BEGIN{h=1}
  ' "$_f" | _normalize
}

# 结构守卫：九卷标题齐全且有序 → rc 0
_struct_check() {
  local _f="${1:-$FULL}" _actual
  _actual=$(grep -E '^# (卷首|卷[一二三四五六七八])' "$_f" | sed 's/^# //')
  [[ "$_actual" == "$STRUCT_EXPECT" ]]
}

# 六卷比对：$1=汇编文件（默认 $FULL）→ rc 0 全新鲜；逐卷点名 + 首处差异上下文
_volumes_check() {
  local _f="${1:-$FULL}" _rc=0 _i _title _src _ta _tb
  for _i in "${!VOL_KEY[@]}"; do
    _title="# 卷${VOL_KEY[$_i]} ${VOL_NAME[$_i]}"
    _src="${VOL_SRC[$_i]}"
    if [[ ! -f "$_src" ]]; then echo "  ✗ 卷${VOL_KEY[$_i]} 正本缺失: $_src" >&2; _rc=1; continue; fi
    _ta="$(mktemp "${TMPDIR:-/tmp}/cmp-a.XXXXXX")"; _tb="$(mktemp "${TMPDIR:-/tmp}/cmp-b.XXXXXX")"
    _normalize < "$_src" > "$_ta"
    _extract_volume "$_title" "$_f" > "$_tb"
    if [[ ! -s "$_tb" ]]; then
      echo "  ✗ 卷${VOL_KEY[$_i]}（${VOL_NAME[$_i]}）未在汇编中切出（标题锚缺失或正文为空）" >&2
      _rc=1
    elif cmp -s "$_ta" "$_tb"; then
      echo "  ✓ 卷${VOL_KEY[$_i]} ${VOL_NAME[$_i]}新鲜"
    else
      echo "  ✗ 卷${VOL_KEY[$_i]}（${VOL_SRC[$_i]##*/}）已变更，需重新生成汇编（首处差异：）" >&2
      diff "$_ta" "$_tb" 2>/dev/null | head -4 | sed 's/^/      /' >&2
      _rc=1
    fi
    rm -f "$_ta" "$_tb"
  done
  return "$_rc"
}

do_check() {
  echo "▶ 设计汇编新鲜度（全卷逐字节）"
  if [[ ! -f "$FULL" ]]; then echo "  ✗ docs/design-compendium-full.md 缺失" >&2; return 1; fi
  local rc=0
  if ! _struct_check; then
    echo "  ✗ 卷结构缺失或失序（应为卷首+卷一~卷八九卷，实际：）" >&2
    grep -E '^# (卷首|卷[一二三四五六七八])' "$FULL" | sed 's/^/      /' >&2
    rc=1
  fi
  _volumes_check "$FULL" || rc=1
  if [[ "$rc" -eq 0 ]]; then
    echo "✓ 汇编六卷与正本逐字节一致"
  else
    echo "✗ 汇编陈旧（bash build-compendium.sh --regen 一键重灌）" >&2
  fi
  return "$rc"
}

do_regen() {
  echo "▶ 重灌汇编六卷正本段（其余卷原样保留）"
  [[ -f "$FULL" ]] || { echo "  ✗ $FULL 缺失" >&2; return 1; }
  local out; out="$(mktemp "${TMPDIR:-/tmp}/comp-regen.XXXXXX")"
  # 单遍重写：命中卷标题→打印卷头 3 行→灌入正本→跳过旧正文至下一「^# 卷」行
  # （保留原分卷分隔线约定：旧块尾带 --- 则重灌后仍带）。
  awk \
    -v t0="# 卷一 设计论证"       -v s0="${VOL_SRC[0]}" \
    -v t1="# 卷二 决策史"         -v s1="${VOL_SRC[1]}" \
    -v t2="# 卷三 上游供应链台账" -v s2="${VOL_SRC[2]}" \
    -v t3="# 卷四 使用手册"       -v s3="${VOL_SRC[3]}" \
    -v t4="# 卷五 数字口径单源"   -v s4="${VOL_SRC[4]}" \
    -v t5="# 卷六 吸收清单"       -v s5="${VOL_SRC[5]}" '
    function is_title(line) {
      if (line==t0) return 0; if (line==t1) return 1; if (line==t2) return 2
      if (line==t3) return 3; if (line==t4) return 4; if (line==t5) return 5
      return -1
    }
    function dump(i, l) { while ((getline l < (s[i]))>0) print l; close(s[i]) }
    BEGIN { s[0]=s0;s[1]=s1;s[2]=s2;s[3]=s3;s[4]=s4;s[5]=s5; skip=0; saw_sep=0; pend=-1; hd=0 }
    skip {
      if ($0 ~ /^# 卷/) {
        # 卷分隔形态实测两种：content\n\n# 卷N（无 ---）与 content\n---\n\n# 卷N；
        # --- 须是旧正文最后一个非空行才算分隔（正文内部的 markdown 分隔线不算——
        # 卷一/二/三正文尾段含 --- 横线，误记会在无分隔边界凭空加 ---）
        if (saw_sep) { print "---"; print "" } else { print "" }
        skip=0; saw_sep=0
        # 不 next：本行落入下方主块，作为下一卷标题或普通行处理
      } else {
        if ($0 == "---") saw_sep=1
        else if ($0 != "") saw_sep=0
        next
      }
    }
    {
      k=is_title($0)
      if (k>=0) { print; pend=k; next }
      if (pend>=0) {
        # 卷头 = 空行与「> 来源：/> 正本：」注记行（与 _extract_volume 口径一致）
        if ($0=="" || $0 ~ /^> 来源：/ || $0 ~ /^> 正本：/) { print; next }
        dump(pend); skip=1; saw_sep=0; pend=-1; next
      }
      print
    }
  ' "$FULL" > "$out"
  # 自校验（结构+六卷）通过才落盘——拼接事故不得写坏汇编
  if _struct_check "$out" && _volumes_check "$out" >/dev/null 2>&1; then
    mv "$out" "$FULL"
    echo "  ✓ 已重灌，自校验通过"
    do_check
  else
    echo "  ✗ 重灌产物自校验失败，保留原汇编（未落盘）；请检查卷结构" >&2
    rm -f "$out"
    return 1
  fi
}

case "${1:-}" in
  --check) do_check ;;
  --regen)  do_regen ;;
  -h|--help|"") sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) echo "用法: bash $0 --check|--regen|--help" >&2; exit 2 ;;
esac
