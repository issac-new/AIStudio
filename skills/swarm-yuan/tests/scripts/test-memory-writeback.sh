#!/usr/bin/env bash
# test-memory-writeback.sh — S9 守卫测试：验证 memory-writeback.sh 不污染环境
# 测试 1：.zcode/memories/ 不存在时不创建（守卫）
# 测试 2：.zcode/memories/ 存在时写入（正常）
# 测试 3：幂等（重复运行追加不覆盖）
# 用法：bash tests/scripts/test-memory-writeback.sh
set -uo pipefail
MW="$(cd "$(dirname "$0")/../.." && pwd)/assets/memory-writeback.sh"
[[ -f "$MW" ]] || { echo "✗ memory-writeback.sh 不存在"; exit 1; }
TMP="$(mktemp -d /tmp/mw-test.XXXXXX)"
PASS=0; FAIL=0
pass(){ echo "  ✓ $1"; PASS=$((PASS+1)); }
fail(){ echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "=== S9 守卫测试：memory-writeback.sh 环境污染防护 ==="

# 测试 1：.zcode/memories/ 不存在时不创建
PROJECT_DIR="$TMP" bash "$MW" >/dev/null 2>&1
if [[ ! -d "$TMP/.zcode" ]]; then pass ".zcode 不存在时不创建（守卫生效）"; else fail ".zcode 被错误创建（守卫失效）"; fi

# 测试 2：.zcode/memories/ 存在时写入
mkdir -p "$TMP/.zcode/memories"
PROJECT_DIR="$TMP" bash "$MW" >/dev/null 2>&1
if [[ -f "$TMP/.zcode/memories/project-knowledge.md" ]]; then pass ".zcode/memories/ 存在时正确写入"; else fail ".zcode/memories/ 未写入"; fi

# 测试 3：幂等（重复运行追加，行数增长）
LINES_BEFORE=$(wc -l < "$TMP/.zcode/memories/project-knowledge.md" | tr -d ' ')
PROJECT_DIR="$TMP" bash "$MW" >/dev/null 2>&1
LINES_AFTER=$(wc -l < "$TMP/.zcode/memories/project-knowledge.md" | tr -d ' ')
if [[ "$LINES_AFTER" -gt "$LINES_BEFORE" ]]; then pass "幂等追加（${LINES_BEFORE}→${LINES_AFTER} 行）"; else fail "幂等失效（${LINES_BEFORE}→${LINES_AFTER}）"; fi

# 测试 4：.swarm-yuan/ 始终写（本地兜底）
if [[ -f "$TMP/.swarm-yuan/project-knowledge.md" ]]; then pass ".swarm-yuan/ 本地兜底始终写"; else fail ".swarm-yuan/ 未写"; fi

# 测试 5：永不 fail 阻塞（exit 0 即使部分 sink 失败）
PROJECT_DIR="/nonexistent-path-xyz" bash "$MW" >/dev/null 2>&1
if [[ $? -eq 0 ]]; then pass "无效 PROJECT_DIR 仍 exit 0（best-effort 不阻塞）"; else fail "无效 PROJECT_DIR 阻塞了"; fi

# 测试 6：披露契约（适配层）——PATH 收窄遮蔽 claude-mem、无 .zcode 时：
# 每个不可用后端恰好一行"跳过"披露 + 汇总行如实计数，不静默
TMP2="$(mktemp -d /tmp/mw-test2.XXXXXX)"
OUT6=$(PROJECT_DIR="$TMP2" PATH="/usr/bin:/bin" bash "$MW" 2>&1)
rc6=$?
skip_cnt=$(printf '%s\n' "$OUT6" | grep -c '跳过（未检测到')
if [[ $rc6 -eq 0 && "$skip_cnt" -eq 2 && -f "$TMP2/.swarm-yuan/project-knowledge.md" ]]; then
  pass "披露契约：zcode/claude-mem 未装各一行跳过披露 + local 兜底写入（exit 0）"
else
  fail "披露契约破裂（rc=${rc6} skip=${skip_cnt}）：$(printf '%s' "$OUT6" | tail -5 | tr '\n' '|')"
fi
if printf '%s\n' "$OUT6" | grep -q '写入 1 / 跳过 2'; then
  pass "汇总行如实计数（写入 1 / 跳过 2）"
else
  fail "汇总行计数不实"
fi

# 测试 7：SWARM_YUAN_MEM_BACKENDS 覆盖生效——清单只留 local 时 .zcode 即使存在也不写
mkdir -p "$TMP2/.zcode/memories"
OUT7=$(PROJECT_DIR="$TMP2" PATH="/usr/bin:/bin" SWARM_YUAN_MEM_BACKENDS="local" bash "$MW" 2>&1)
if [[ ! -f "$TMP2/.zcode/memories/project-knowledge.md" ]] && printf '%s\n' "$OUT7" | grep -q '写入 1 / 跳过 0'; then
  pass "后端清单覆盖生效（SWARM_YUAN_MEM_BACKENDS=local 时 zcode 不写）"
else
  fail "后端清单覆盖未生效"
fi

# 测试 8：claude-mem double 正路径——假 CLI 记录 add 调用 + 适配层披露写入
TMP3="$(mktemp -d /tmp/mw-test3.XXXXXX)"
mkdir -p "$TMP3/bin" "$TMP3/.zcode/memories"
CALLLOG="$TMP3/calls.log"
export CALLLOG  # heredoc 带引号定界不展开变量，double 经环境变量在运行时取路径
cat > "$TMP3/bin/claude-mem" <<'CEOF'
#!/usr/bin/env bash
echo "claude-mem $*" >> "$CALLLOG"
exit 0
CEOF
chmod +x "$TMP3/bin/claude-mem"
OUT8=$(PROJECT_DIR="$TMP3" PATH="$TMP3/bin:/usr/bin:/bin" bash "$MW" 2>&1)
if grep -q '^claude-mem add' "$CALLLOG" 2>/dev/null && printf '%s\n' "$OUT8" | grep -q 'claude-mem: 已写入'; then
  pass "claude-mem 后端经适配层真实调用（add double 命中）"
else
  fail "claude-mem 后端调用未达：$(printf '%s' "$OUT8" | tail -3 | tr '\n' '|')"
fi
rm -rf "$TMP2" "$TMP3"

rm -rf "$TMP"
echo "=== 汇总：PASS=$PASS FAIL=$FAIL ==="
[[ $FAIL -eq 0 ]] && echo "✓ S9 守卫测试通过" || { echo "✗ S9 守卫测试失败"; exit 1; }
