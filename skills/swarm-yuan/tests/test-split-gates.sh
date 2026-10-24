#!/usr/bin/env bash
# test-split-gates.sh — split-gates.sh 行为级回归（R130 覆盖补齐）
# 契约：把 precheck.sh 的 check_* 按硬编码 FN 分组抽到 gates-strict/warn/advisory.sh，
#   删原区块并插入 source 守卫；已拆分态（gates-strict.sh 存在）守卫直接跳过；
#   拆后主文件行数异常时拒绝覆盖原文件。历史一次性工具——本测试锁「再跑无破坏」+
#   抽取/替换算法本体。绝不对真仓 assets/ 执行：全部在 mktemp 拷贝副本上跑。
# 迷你拆分说明：脚本行号表硬编码为 4143 行版本且混两套坐标系（重跑本就不可能对真仓
#   产出正确拆分）——故对副本的行号表替换为迷你表，锁算法而非锁陈旧行号。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
ROOT="$(pwd)"
TMP="$(mktemp -d /tmp/sgprobe.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# ===== 态 1：对已拆分的真仓 assets 副本重跑 → 守卫跳过 + 零改动（幂等/无破坏）=====
SB="$TMP/guard"
mkdir -p "$SB/scripts" "$SB/assets"
cp "$ROOT/scripts/split-gates.sh" "$SB/scripts/"
cp "$ROOT/assets/precheck.sh" "$ROOT/assets/gate-enforce-level.conf" \
   "$ROOT/assets/gates-strict.sh" "$ROOT/assets/gates-warn.sh" "$ROOT/assets/gates-advisory.sh" "$SB/assets/"
sum_before="$(cksum "$SB/assets"/* | awk '{print $1, $2}' | sort)"
out="$(bash "$SB/scripts/split-gates.sh" 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && printf '%s\n' "$out" | grep -q "已拆分（gates-strict.sh 已存在），跳过" \
  && ok "已拆分态 rc=0 + 明确跳过" || bad "守卫态 rc=${rc}: ${out}"
sum_after="$(cksum "$SB/assets"/* | awk '{print $1, $2}' | sort)"
[[ "$sum_before" == "$sum_after" ]] && ok "重跑零 diff（5 文件 cksum 全等）" || bad "守卫态改动了文件"
ls "$SB/assets" | grep -q '\.tmp$' && bad "守卫态残留 .tmp" || ok "无 .tmp 残留"

# ===== 态 2：前置存在性检查（缺 precheck / 缺 conf → rc=1，先于守卫）=====
SB="$TMP/noconf"
mkdir -p "$SB/scripts" "$SB/assets"
cp "$ROOT/scripts/split-gates.sh" "$SB/scripts/"
printf 'x\n' > "$SB/assets/precheck.sh"
out="$(bash "$SB/scripts/split-gates.sh" 2>&1)"; rc=$?
[[ $rc -eq 1 ]] && printf '%s\n' "$out" | grep -q "precheck.sh 或 gate-enforce-level.conf 不存在" \
  && ok "缺 conf rc=1" || bad "缺 conf rc=${rc}"
SB="$TMP/nopre"
mkdir -p "$SB/scripts" "$SB/assets"
cp "$ROOT/scripts/split-gates.sh" "$SB/scripts/"
cp "$ROOT/assets/gate-enforce-level.conf" "$SB/assets/"
out="$(bash "$SB/scripts/split-gates.sh" 2>&1)"; rc=$?
[[ $rc -eq 1 ]] && ok "缺 precheck rc=1" || bad "缺 precheck rc=${rc}"

# ===== 态 3：迷你 precheck 拆分（锁抽取/替换算法）=====
# 迷你行号表：每档 2 个函数（strict=check_branch/check_layer；warn=check_scope/check_test；
# advisory=check_consistency/check_cognition——均取自脚本硬编码 FN 列表的真实名字）
MINI="$TMP/mini.ranges"
cat > "$MINI" <<'EOF'
check_branch 100 112
check_scope 200 210
check_consistency 300 308
check_layer 400 420
check_test 500 506
check_cognition 600 612
EOF
# 副本脚本的行号表整体替换为迷你表（BSD awk -v 不接受字面换行，用 getline 读文件）
patch_split_copy() { # $1=源脚本 $2=迷你表 $3=输出
  awk -v mf="$2" '
    BEGIN { k=0; while ((getline l < mf) > 0) mini[++k]=l; close(mf) }
    /^(check_|_)[a-z_]+ [0-9]+ [0-9]+$/ { next }
    { print }
    /^cat > "\$RANGES_FILE" <<.EOF.$/ && !done { for (j=1;j<=k;j++) print mini[j]; done=1 }
  ' "$1" > "$3"
}
# 造 1200 行 precheck：区间内放函数（fn() { … }），区间外 PAD；1150 行放守卫插入锚
TOTAL=1200
SB="$TMP/mini"
mkdir -p "$SB/scripts" "$SB/assets"
patch_split_copy "$ROOT/scripts/split-gates.sh" "$MINI" "$SB/scripts/split-gates.sh"
seq "$TOTAL" | awk -v r="$MINI" '
  BEGIN { while ((getline l < r) > 0) { split(l,p," "); st[p[1]]=p[2]; en[p[1]]=p[3]
           for (j=p[2]; j<=p[3]; j++) own[j]=p[1] } close(r) }
  { n=own[NR]
    if (n != "") {
      if (st[n] == en[n])      { print n "() { :; }" }
      else if (NR == st[n])    { print n "() {" }
      else if (NR == en[n])    { print "}" }
      else                     { print "  : # body-" n }
    } else print "PAD" NR
  }
' > "$SB/assets/precheck.sh"
sed -i.bak '1150s/.*/_load_enforce_levels/' "$SB/assets/precheck.sh" && rm -f "$SB/assets/precheck.sh.bak"
cp "$ROOT/assets/gate-enforce-level.conf" "$SB/assets/"
out="$(bash "$SB/scripts/split-gates.sh" 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && printf '%s\n' "$out" | grep -q "precheck.sh 已删除门禁函数 + 插入 source 守卫" \
  && ok "迷你拆分 rc=0 + 完成提示" || bad "迷你拆分 rc=${rc}: ${out}"
[[ "$(printf '%s\n' "$out" | grep -c '2 个函数')" -eq 3 ]] \
  && ok "三档各抽 2 函数（输出计数 2×3）" || bad "函数计数异常: ${out}"
# 分组断言辅助：避免 for…done && ok 短路（循环末命令失败会吞掉 ok）
all_present() { # $1=文件 其余=函数名（须全部以 fn() { 形式存在）
  local f="$1" fn; shift
  for fn in "$@"; do grep -q "^${fn}() {" "$f" || return 1; done
  return 0
}
all_absent() { # $1=文件 其余=函数名（须全部不存在）
  local f="$1" fn; shift
  for fn in "$@"; do grep -q "^${fn}() {" "$f" && return 1; done
  return 0
}
# 三文件分组正确 + 头部契约 + 无串档
head -1 "$SB/assets/gates-strict.sh" | grep -q '^#!/usr/bin/env bash' \
  && grep -q "由 scripts/split-gates.sh 从 precheck.sh 抽取" "$SB/assets/gates-strict.sh" \
  && grep -q "不要单独执行" "$SB/assets/gates-strict.sh" \
  && ok "gates 文件头（shebang+抽取注释+不可单独执行）" || bad "gates 头部异常"
all_present "$SB/assets/gates-strict.sh" check_branch check_layer \
  && ok "gates-strict 含 strict 组两函数" || bad "gates-strict 分组缺函数"
grep -q ": # body-check_branch" "$SB/assets/gates-strict.sh" \
  && ok "gates-strict 函数体随迁" || bad "strict 函数体丢失"
all_absent "$SB/assets/gates-strict.sh" check_scope \
  && ok "strict 无串档（不含 warn 组函数）" || bad "strict 串入 warn 函数"
all_present "$SB/assets/gates-warn.sh" check_scope check_test \
  && ok "gates-warn 含 warn 组两函数" || bad "gates-warn 分组缺函数"
all_absent "$SB/assets/gates-warn.sh" check_branch \
  && ok "warn 无串档（不含 strict 组函数）" || bad "warn 串入 strict 函数"
all_present "$SB/assets/gates-advisory.sh" check_consistency check_cognition \
  && ok "gates-advisory 含 advisory 组两函数" || bad "gates-advisory 分组缺函数"
# 原文件区块被正确替换：定义消失、区间外内容保留、守卫插入
all_absent "$SB/assets/precheck.sh" check_branch check_scope check_consistency \
  && ok "precheck 三档定义区块已删" || bad "precheck 残留门禁定义"
grep -q '^PAD99$' "$SB/assets/precheck.sh" && grep -q '^PAD113$' "$SB/assets/precheck.sh" \
  && ok "区间外内容原样保留（PAD99/PAD113）" || bad "区间外内容丢失"
grep -q '^_load_enforce_levels$' "$SB/assets/precheck.sh" \
  && ok "守卫插入锚行保留" || bad "锚行丢失"
ln="$(grep -n '^_load_enforce_levels$' "$SB/assets/precheck.sh" | head -1 | cut -d: -f1)"
awk -v n="$ln" 'NR>n && NR<=n+2' "$SB/assets/precheck.sh" | grep -q "# ===== 门禁函数 source 守卫" \
  && ok "守卫块紧随锚行插入" || bad "守卫位置异常"
grep -q 'SWARM_YUAN_BUNDLED' "$SB/assets/precheck.sh" \
  && grep -q 'for _gf in gates-strict.sh gates-warn.sh gates-advisory.sh; do' "$SB/assets/precheck.sh" \
  && ok "守卫含三文件 source 循环与 SWARM_YUAN_BUNDLED 扩展点" || bad "守卫内容异常"
# 行数精确锁：总行数 - 删除区间 + 守卫块 10 行
del="$(awk '{s+=$3-$2+1} END{print s}' "$MINI")"
expect_lines=$((TOTAL - del + 10))
actual_lines="$(wc -l < "$SB/assets/precheck.sh" | tr -d ' ')"
[[ "$actual_lines" -eq "$expect_lines" ]] \
  && ok "拆后行数精确 ${expect_lines}（删 ${del} 行+守卫 10 行）" || bad "行数 ${actual_lines}≠${expect_lines}"
bash -n "$SB/assets/precheck.sh" && bash -n "$SB/assets/gates-strict.sh" \
  && bash -n "$SB/assets/gates-warn.sh" && bash -n "$SB/assets/gates-advisory.sh" \
  && ok "四文件 bash -n 全过" || bad "语法校验失败"
ls "$SB/assets" | grep -q '\.tmp$' && bad "拆分残留 .tmp" || ok "无 .tmp 残留"

# ===== 态 4：拆后行数异常防线（拒绝覆盖原文件）=====
SB="$TMP/short"
mkdir -p "$SB/scripts" "$SB/assets"
patch_split_copy "$ROOT/scripts/split-gates.sh" "$MINI" "$SB/scripts/split-gates.sh"
seq 700 | sed 's/^/PAD/' > "$SB/assets/precheck.sh"
cp "$ROOT/assets/gate-enforce-level.conf" "$SB/assets/"
sum0="$(cksum "$SB/assets/precheck.sh" | awk '{print $1}')"
out="$(bash "$SB/scripts/split-gates.sh" 2>&1)"; rc=$?
sum1="$(cksum "$SB/assets/precheck.sh" | awk '{print $1}')"
[[ $rc -eq 1 ]] && printf '%s\n' "$out" | grep -q "拆分后主文件行数异常" \
  && ok "行数异常 rc=1 + 拒绝覆盖提示" || bad "行数防线 rc=${rc}: ${out}"
[[ "$sum0" == "$sum1" ]] && ok "原 precheck 未被覆盖" || bad "异常态覆盖了原文件"
[[ -f "$SB/assets/precheck.sh.tmp" ]] && ok ".tmp 保留供人工核查" || bad ".tmp 未保留"

[[ $FAIL -eq 0 ]] && { echo "PASS test-split-gates"; exit 0; } || { echo "FAIL test-split-gates" >&2; exit 1; }
