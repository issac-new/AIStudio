#!/usr/bin/env bash
# test-framework-evidence.sh — framework-evidence.sh 台账双态测试（WP-P3b/M2）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
SH="scripts/framework-evidence.sh"
TMP="$(mktemp -d /tmp/fetest.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# 构造一个迷你 react 框架文件（含 verify 块）→ 临时替换 BASE/references/frameworks/react.md
# 为不污染真实框架库，用 --frameworks-dir 指向临时目录
mkdir -p "$TMP/fwdir"
cat > "$TMP/fwdir/react.md" <<'EOF'
---
ruleset_id: react
深度门槛: 2
最后调研: 2026-07-17
---
# React
## §3 领域规律
### 规律：Hooks 须在组件顶层调用
- **验证方法**: ...
- **对应门禁**: fw_react_hooks_top_level(fail)

```verify
id: react-r01
cmd: grep -rnE 'useState|useEffect' --include='*.tsx' "${PROJECT_DIR}"
expect: hits>0
```
### 规律：自定义 Hook 命名
- **对应门禁**: 人工检查

```verify
id: react-r02
cmd:
expect: always
```
EOF

# 态 1：项目含 useState → react-r01 hits>0 SUGGEST=applicable
mkdir -p "$TMP/proj/src"
printf 'useState(0)\n' > "$TMP/proj/src/a.tsx"
out="$(bash "$SH" "$TMP/proj" --frameworks react --frameworks-dir "$TMP/fwdir" --top 2 2>/dev/null)"; rc=$?
[[ $rc -eq 0 ]] && ok "台账 exit 0" || bad "exit=$rc"
echo "$out" | grep -qE 'react	react-r01	.*[1-9][0-9]*	.*applicable' && ok "r01 hits>0 applicable" || bad "r01 异常: $out"
echo "$out" | grep -qE 'react	react-r02	.*manual' && ok "r02 expect=always manual" || bad "r02 异常: $out"
echo "$out" | grep -qE 'a\.tsx:[0-9]+' && ok "evidence 含 file:line" || bad "evidence 缺失: $out"

# 态 2：项目无 useState → r01 hits=0 SUGGEST=likely-na
mkdir -p "$TMP/proj2/src"
printf 'console.log(1)\n' > "$TMP/proj2/src/b.ts"
out="$(bash "$SH" "$TMP/proj2" --frameworks react --frameworks-dir "$TMP/fwdir" 2>/dev/null)"
echo "$out" | grep -qE 'react	react-r01	.*0	.*likely-na' && ok "r01 hits=0 likely-na" || bad "态2 r01 异常: $out"

# 态 3：确定性（同输入连跑两次 evidence 段一致）
o1="$(bash "$SH" "$TMP/proj" --frameworks react --frameworks-dir "$TMP/fwdir" --top 2 2>/dev/null)"
o2="$(bash "$SH" "$TMP/proj" --frameworks react --frameworks-dir "$TMP/fwdir" --top 2 2>/dev/null)"
[[ "$o1" == "$o2" ]] && ok "确定性 byte-identical" || bad "两次不一致"

[[ $FAIL -eq 0 ]] && { echo "PASS test-framework-evidence"; exit 0; } || { echo "FAIL test-framework-evidence" >&2; exit 1; }
