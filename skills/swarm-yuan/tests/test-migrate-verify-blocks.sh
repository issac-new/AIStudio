#!/usr/bin/env bash
# test-migrate-verify-blocks.sh — migrate-verify-blocks.sh 草稿生成测试（WP-P3a）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
SH="scripts/migrate-verify-blocks.sh"
TMP="$(mktemp -d /tmp/mvbtest.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# 构造一个迷你框架文件（含 grep 验证方法 + 人工检查两种规律）
cat > "$TMP/fw.md" <<'EOF'
## §3 领域规律

### 规律：Hooks 须在组件顶层调用
- **适用版本**: React 16.8+
- **规律**: ...散文...
- **违反后果**: ...
- **验证方法**: `grep -rnE 'useState|useEffect' --include='*.tsx' ${PROJECT_DIR}` 命中 if 块内 → fail。
- **对应门禁**: fw_react_hooks_top_level(fail)

### 规律：自定义 Hook 须以 use 开头
- **适用版本**: React 16.8+
- **规律**: ...散文...
- **违反后果**: ...
- **验证方法**: 检出含 useState 的函数不以 use 开头 → 人工确认。
- **对应门禁**: 人工检查
EOF

# 态 1：草稿模式 stdout 含两个 verify 块
out="$(bash "$SH" "$TMP/fw.md" 2>/dev/null)"; rc=$?
[[ $rc -eq 0 ]] && ok "草稿 exit 0" || bad "exit=$rc"
echo "$out" | grep -qE 'id: fw-r1' && ok "规律1 id 生成" || bad "缺 id fw-r1: $out"
echo "$out" | grep -qE 'cmd: grep -rnE' && ok "规律1 cmd 从验证方法提取" || bad "规律1 cmd 缺失"
echo "$out" | grep -qE 'expect: hits>0' && ok "规律1 expect hits>0" || bad "规律1 expect 缺失"
echo "$out" | grep -qE 'expect: always' && ok "规律2（人工检查）expect always" || bad "规律2 expect 缺失"

# 态 2：幂等（已有 verify 块的文件再跑不重复生成）
printf '\n```verify\nid: fw-r1\ncmd: x\nexpect: hits>0\n```\n' >> "$TMP/fw.md"
out2="$(bash "$SH" "$TMP/fw.md" 2>/dev/null)"
echo "$out2" | grep -c 'id: fw-r1' | grep -q '^1$' && ok "幂等不重复" || bad "幂等失败: $(echo "$out2" | grep -c 'id: fw-r1')"

[[ $FAIL -eq 0 ]] && { echo "PASS test-migrate-verify-blocks"; exit 0; } || { echo "FAIL test-migrate-verify-blocks" >&2; exit 1; }
