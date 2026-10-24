#!/usr/bin/env bash
# test-gen-fixture-readme.sh — gen-fixture-readme.sh 行为级回归（R130 覆盖补齐）
# 契约：逐框架读 references/frameworks/<id>.md §4 门禁表 + fixture 目录生成 README 草稿；
#   --dry 只打印不落盘、--force 覆盖、默认模式只为缺 README 的 fixture 生成且不覆盖既有。
# 写路径全部在 mktemp 沙盒副本上跑（BASE 由 $0 位置推导，拷贝脚本即隔离）；
# 真仓仅跑 --dry（只读）。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
ROOT="$(pwd)"
TMP="$(mktemp -d /tmp/gfrprobe.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# --- 沙盒：拷贝脚本 + 造 demo 框架 md（§4 表含 fail/warn/长逻辑/噪声行）+ fixture ---
SB="$TMP/sb"
mkdir -p "$SB/scripts" "$SB/references/frameworks" "$SB/tests/fixtures/demo/violating" "$SB/tests/fixtures/demo/compliant"
cp "$ROOT/scripts/gen-fixture-readme.sh" "$SB/scripts/"
LONGLOGIC="$(awk 'BEGIN{for(i=1;i<=90;i++)printf "长";print "TAILXYZ"}')"
cat > "$SB/references/frameworks/demo.md" <<MDEOF
# demo
## §3 规律
- 规律甲
## §4 门禁清单（id / 级别 / 实现逻辑）
| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_demo_a | fail | 触发缺失场景甲 | CONF_A |
| fw_demo_b | warn | ${LONGLOGIC} | CONF_B |
| noise_row | fail | 非 fw_ 前缀行不该被提取 | X |
## §5 跨框架
| fw_demo_after5 | fail | §5 之后的行不该被提取 | X |
MDEOF
printf '# 注释行\n\nfw_demo_a\nfw_demo_b\n' > "$SB/tests/fixtures/demo/violating/expected-fail-ids"
SH="$SB/scripts/gen-fixture-readme.sh"

# --- 用法错误（rc=2 面）---
out="$(bash "$SH" --dry 2>&1)"; rc=$?
[[ $rc -eq 2 ]] && printf '%s\n' "$out" | grep -q "usage: gen-fixture-readme.sh --dry <id>" \
  && ok "--dry 缺 id rc=2+usage" || bad "--dry 缺 id rc=${rc}"
out="$(bash "$SH" --force 2>&1)"; rc=$?
[[ $rc -eq 2 ]] && printf '%s\n' "$out" | grep -q "usage: gen-fixture-readme.sh --force <id>" \
  && ok "--force 缺 id rc=2+usage" || bad "--force 缺 id rc=${rc}"
out="$(bash "$SH" --bogus x 2>&1)"; rc=$?
[[ $rc -eq 2 ]] && printf '%s\n' "$out" | grep -q "unknown mode: --bogus" \
  && ok "未知 mode rc=2" || bad "未知 mode rc=${rc}"

# --- --dry：内容契约（§4 提取/截断/过滤/计数/日期）且不落盘 ---
out="$(bash "$SH" --dry demo 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && ok "--dry exit 0" || bad "--dry rc=${rc}"
printf '%s\n' "$out" | grep -q "^# demo fixture 说明" && ok "标题格式" || bad "标题异常: ${out}"
printf '%s\n' "$out" | grep -q "violating 主触发 2 个 fail 意图" \
  && ok "expected-fail-ids 计数（注释/空行剔除后 2）" || bad "计数异常: ${out}"
printf '%s\n' "$out" | grep -q "fw_demo_a —— 触发缺失场景甲。" \
  && ok "短逻辑保真入 README" || bad "短逻辑丢失: ${out}"
printf '%s\n' "$out" | grep -q '\.\.\.' && ! printf '%s\n' "$out" | grep -q "TAILXYZ" \
  && ok "超长逻辑截断（>80 字符加省略号）" || bad "截断异常"
printf '%s\n' "$out" | grep -q "noise_row" && bad "非 fw_ 行混入" || ok "非 fw_ 行被过滤"
printf '%s\n' "$out" | grep -q "fw_demo_after5" && bad "§5 之后的行混入" || ok "§5 终止提取"
today="$(date +%Y-%m-%d)"
printf '%s\n' "$out" | grep -q "\*\*2/2 主触发已断言\*\*（${today} 实跑登记" \
  && ok "断言登记行带当日日期" || bad "登记行异常: ${out}"
printf '%s\n' "$out" | grep -q 'run-framework-fixture.sh demo' \
  && ok "验收行指向 run-framework-fixture.sh" || bad "验收行缺失"
[[ ! -f "$SB/tests/fixtures/demo/README.md" ]] && ok "--dry 不落盘" || bad "--dry 落盘了"

# --- md 缺失 / expected-fail-ids 缺失两个降级态 ---
out="$(bash "$SH" --dry nosuch 2>&1)"
printf '%s\n' "$out" | grep -q "references/frameworks/nosuch.md 缺失，无法自动生成门禁引用" \
  && ok "md 缺失 → 人工补提示草稿" || bad "md 缺失态异常: ${out}"
# demo2：md 存在（含空 §4 表）但 fixture 无 expected-fail-ids → 未登记降级
mkdir -p "$SB/references/frameworks" "$SB/tests/fixtures/demo2/violating"
printf '# demo2\n## §4 门禁清单\n| 门禁 id | 级别 | 实现逻辑 |\n|---|---|---|\n' > "$SB/references/frameworks/demo2.md"
out="$(bash "$SH" --dry demo2 2>&1)"
printf '%s\n' "$out" | grep -q "当前未登记，请人工补" \
  && ok "无 expected-fail-ids → 未登记提示" || bad "未登记态异常: ${out}"

# --- 默认模式（独立沙盒，只有 aaa/bbb 两个 fixture）：只为缺 README 的生成，已有不覆盖 ---
SB2="$TMP/sb2"
mkdir -p "$SB2/scripts" "$SB2/references/frameworks" "$SB2/tests/fixtures/aaa/violating" "$SB2/tests/fixtures/bbb"
cp "$ROOT/scripts/gen-fixture-readme.sh" "$SB2/scripts/"
printf 'fw_a1\n' > "$SB2/tests/fixtures/aaa/violating/expected-fail-ids"
printf 'KEEP-ORIGINAL\n' > "$SB2/tests/fixtures/bbb/README.md"
out="$(bash "$SB2/scripts/gen-fixture-readme.sh" 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && printf '%s\n' "$out" | grep -q "共生成 1 个，跳过（已有 README）1 个" \
  && ok "默认模式 生成1/跳过1" || bad "默认模式汇总异常: ${out}"
[[ -f "$SB2/tests/fixtures/aaa/README.md" ]] && grep -q "^# aaa fixture 说明" "$SB2/tests/fixtures/aaa/README.md" \
  && ok "aaa/README.md 落盘且标题正确" || bad "aaa 未生成"
grep -q "KEEP-ORIGINAL" "$SB2/tests/fixtures/bbb/README.md" \
  && ok "既有 bbb/README.md 不被覆盖" || bad "bbb 被覆盖"
out="$(bash "$SB2/scripts/gen-fixture-readme.sh" 2>&1)"
printf '%s\n' "$out" | grep -q "共生成 0 个，跳过（已有 README）2 个" \
  && ok "重复跑默认模式全跳过（不覆盖既有）" || bad "二次跑汇总异常: ${out}"
grep -q "KEEP-ORIGINAL" "$SB2/tests/fixtures/bbb/README.md" && ok "二次跑后 bbb 仍保真" || bad "bbb 被改"

# --- --force：覆盖既有；目录不存在显式拒绝（R130 修复回归：原版假成功）---
out="$(bash "$SB2/scripts/gen-fixture-readme.sh" --force bbb 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && printf '%s\n' "$out" | grep -q "✓ 强制覆盖 bbb/README.md" \
  && ok "--force 覆盖成功提示" || bad "--force rc=${rc}"
grep -q "^# bbb fixture 说明" "$SB2/tests/fixtures/bbb/README.md" \
  && ok "--force 后内容为新草稿" || bad "--force 内容异常"
out="$(bash "$SB2/scripts/gen-fixture-readme.sh" --force nosuch 2>&1)"; rc=$?
[[ $rc -eq 2 ]] && printf '%s\n' "$out" | grep -q "✗ fixture 目录不存在" \
  && ok "--force 缺目录 rc=2 拒绝（不再假成功）" || bad "--force 缺目录 rc=${rc}: ${out}"

# --- 空 fixtures 目录默认模式（R130 修复回归：原版 glob 不展开虚报「✓ 生成 */README.md」）---
EMPTY="$TMP/empty"
mkdir -p "$EMPTY/scripts" "$EMPTY/tests/fixtures"
cp "$ROOT/scripts/gen-fixture-readme.sh" "$EMPTY/scripts/"
out="$(bash "$EMPTY/scripts/gen-fixture-readme.sh" 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && printf '%s\n' "$out" | grep -q "共生成 0 个，跳过（已有 README）0 个" \
  && ! printf '%s\n' "$out" | grep -q "No such file or directory" \
  && ok "空 fixtures 目录 → 干净 0/0（无虚报无报错）" || bad "空目录态异常: ${out}"

# --- 真仓只读集成：--dry koa 走真实 §4 数据 ---
out="$(bash "$ROOT/scripts/gen-fixture-readme.sh" --dry koa 2>&1)"; rc=$?
[[ $rc -eq 0 ]] && printf '%s\n' "$out" | grep -q "fw_koa_error_handler" \
  && printf '%s\n' "$out" | grep -q "2/2 主触发已断言" \
  && ok "真仓 koa --dry 提取 fail 门禁与断言登记" || bad "真仓 koa 态异常: ${out}"

[[ $FAIL -eq 0 ]] && { echo "PASS test-gen-fixture-readme"; exit 0; } || { echo "FAIL test-gen-fixture-readme" >&2; exit 1; }
