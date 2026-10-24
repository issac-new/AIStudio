#!/usr/bin/env bash
# test-r118-gate-hardening.sh — R118 审计加固回归锁（门禁 fail-closed / 真实性）
# 覆盖：门禁文件缺失硬失败、const/.env 密钥、扫描目录缺失、隐私非法正则、
#       release-sign 无产物/空签名、SAST 异常退出码、shift-left 无 spec、
#       mermaid 别名、多模式并集、doctor 读 conf、spec-first 未跟踪源码。
# 全部在 mktemp 目录内执行，不联网、不写仓库。
set -u
BASE="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/r118gate.XXXXXX")"
trap 'rm -rf "$T"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
need() { # $1=输出 $2=必须出现的字面串 $3=用例名
  if printf '%s\n' "$1" | grep -qF "$2"; then ok "$3"; else bad "${3}（缺「${2}」）"; fi
}
forbid() { # $1=输出 $2=不得出现的字面串 $3=用例名
  if printf '%s\n' "$1" | grep -qF "$2"; then bad "$3（出现「$2」）"; else ok "$3"; fi
}
assets="$T/assets"
mkdir -p "$assets"
cp "$BASE/assets/precheck.sh" "$BASE/assets/gates-strict.sh" "$BASE/assets/gates-warn.sh" \
   "$BASE/assets/gates-advisory.sh" "$BASE/assets/memory-backends.sh" \
   "$BASE/assets/gate-enforce-level.conf" "$BASE/assets/spec-first-lib.sh" "$assets/"

write_conf() { # $1=项目根，其余行追加
  local proj="$1"; shift
  {
    printf 'PROJECT_DIR="%s"\n' "$proj"
    printf '%s\n' "$@"
  } > "$assets/precheck.conf"
}
run_gate() { # $1=项目根，$2..=precheck 参数；stdout=输出，返回 precheck rc
  local proj="$1"; shift
  ( cd "$proj" && bash "$assets/precheck.sh" "$@" 2>&1 )
}

# 1) 门禁实现文件缺失 → rc=2，不得假通过
mkdir -p "$T/missing/scripts"
cp "$BASE/assets/precheck.sh" "$T/missing/scripts/"
out=$( bash "$T/missing/scripts/precheck.sh" --all 2>&1 ); rc=$?
if [[ "$rc" -eq 2 ]]; then ok "缺失 gates-*.sh 硬失败 rc=2"; else bad "缺失 gates-*.sh 未硬失败（rc=${rc}）"; fi
need "$out" "门禁实现文件缺失" "缺失 gates-*.sh 提示"

# 2) const 密钥（旧版 -i 把 const [A-Z_] 也匹配小写，整类漏检）
P="$T/p-const"; mkdir -p "$P/src"
printf 'const password = "SuperSecret123456";\n' > "$P/src/config.js"
write_conf "$P" 'WRITABLE_DIRS=("src")' 'SCAN_DIRS=()' 'SECURITY_TOOL="builtin"'
out=$( run_gate "$P" --security ); rc=$?
if [[ "$rc" -eq 1 ]]; then ok "const 硬编码密钥阻断"; else bad "const 硬编码密钥未阻断（rc=${rc}）"; fi
need "$out" "config.js" "const 密钥定位到文件"

# 3) .env 无引号密钥（旧版只认引号值）
P="$T/p-env"; mkdir -p "$P/src"
printf 'API_KEY=abcdefghijklmnopqrstuvwxyz123456\n' > "$P/src/.env"
write_conf "$P" 'WRITABLE_DIRS=("src")' 'SCAN_DIRS=("src")' 'SENSITIVE_TOOL="builtin"'
out=$( run_gate "$P" --sensitive ); rc=$?
if [[ "$rc" -eq 1 ]]; then ok ".env 无引号密钥阻断"; else bad ".env 密钥未阻断（rc=${rc}）"; fi
need "$out" ".env" ".env 密钥定位到文件"

# 3b) localStorage 取 token 不是硬编码密钥（nest-forge 实证误报）
P="$T/p-token"; mkdir -p "$P/src"
printf "const token = localStorage.getItem('nf_token');\n" > "$P/src/auth.ts"
write_conf "$P" 'WRITABLE_DIRS=("src")' 'SCAN_DIRS=("src")' 'SENSITIVE_TOOL="builtin"'
out=$( run_gate "$P" --sensitive ); rc=$?
if [[ "$rc" -eq 0 ]]; then ok "localStorage token 不误报"; else bad "localStorage token 误报（rc=${rc}）"; fi
forbid "$out" "疑似敏感信息" "localStorage token 无误报行"

# 4) SCAN_DIRS 空 → skip（不得打印“未发现”）
write_conf "$P" 'WRITABLE_DIRS=("src")' 'SCAN_DIRS=()' 'SENSITIVE_TOOL="builtin"'
out=$( run_gate "$P" --sensitive ); rc=$?
if [[ "$rc" -eq 0 ]]; then ok "SCAN_DIRS 空为 skip rc=0"; else bad "SCAN_DIRS 空未 skip（rc=${rc}）"; fi
need "$out" "SKIPPED" "SCAN_DIRS 空显式 skip"
forbid "$out" "未发现明显敏感信息" "SCAN_DIRS 空不假通过"

# 5) 配置目录全不存在 → fail
write_conf "$P" 'WRITABLE_DIRS=("src")' 'SCAN_DIRS=("nope")' 'SENSITIVE_TOOL="builtin"'
out=$( run_gate "$P" --sensitive ); rc=$?
if [[ "$rc" -eq 1 ]]; then ok "SCAN_DIRS 全不存在阻断"; else bad "SCAN_DIRS 全不存在未阻断（rc=${rc}）"; fi
need "$out" "gate_sensitive_dirs_missing" "SCAN_DIRS 缺失 fail id"

# 6) authz 目录全不存在 → fail
write_conf "$P" 'AUTHZ_SCAN_DIRS=("nope")'
out=$( run_gate "$P" --authz ); rc=$?
if [[ "$rc" -eq 1 ]]; then ok "AUTHZ_SCAN_DIRS 全不存在阻断"; else bad "AUTHZ_SCAN_DIRS 全不存在未阻断（rc=${rc}）"; fi
need "$out" "gate_authz_dirs_missing" "AUTHZ_SCAN_DIRS 缺失 fail id"

# 7) 隐私非法 ERE → fail（不得静默当无命中）
write_conf "$P" 'PRIVACY_SCAN_DIRS=("src")' 'PRIVACY_EXTRA_PATTERNS=("[")'
out=$( run_gate "$P" --privacy ); rc=$?
if [[ "$rc" -eq 1 ]]; then ok "隐私非法 ERE 阻断"; else bad "隐私非法 ERE 未阻断（rc=${rc}）"; fi
need "$out" "gate_privacy_invalid_pattern" "隐私非法 ERE fail id"

# 8) release-sign REQUIRED=1 且无产物 → fail
P="$T/p-rel"; mkdir -p "$P"
write_conf "$P" 'RELEASE_SIGN_REQUIRED=1' 'RELEASE_SIGN_TOOL="none"'
out=$( run_gate "$P" --release-sign ); rc=$?
if [[ "$rc" -eq 1 ]]; then ok "release-sign 无产物阻断"; else bad "release-sign 无产物未阻断（rc=${rc}）"; fi
need "$out" "gate_release_sign_no_artifacts" "release-sign 无产物 fail id"

# 9) release-sign 空签名 → fail（-s 非 -f）
mkdir -p "$P/dist"; : > "$P/dist/a.zip"; : > "$P/dist/a.zip.asc"
out=$( run_gate "$P" --release-sign ); rc=$?
if [[ "$rc" -eq 1 ]]; then ok "release-sign 空签名阻断"; else bad "release-sign 空签名未阻断（rc=${rc}）"; fi
need "$out" "gate_release_sign_missing" "release-sign 空签名 fail id"

# 10) SAST 载体异常退出（rc=3）→ fail
P="$T/p-sast"; mkdir -p "$P/src" "$T/bin"
printf 'x=1\n' > "$P/src/a.js"
printf '#!/bin/sh\nexit 3\n' > "$T/bin/npx"; chmod +x "$T/bin/npx"
write_conf "$P" 'SECURITY_SCAN_DIRS=("src")' 'SAST_DEEP_TOOL="codex-security"' 'OPENAI_API_KEY="dummy"'
out=$( cd "$P" && PATH="$T/bin:$PATH" bash "$assets/precheck.sh" --sast-deep 2>&1 ); rc=$?
if [[ "$rc" -eq 1 ]]; then ok "SAST 异常退出阻断"; else bad "SAST 异常退出未阻断（rc=${rc}）"; fi
need "$out" "gate_sast_deep_tool_error" "SAST 异常退出 fail id"

# 11) shift-left 无 spec 不得打印“均已嵌入”
P="$T/p-sl"; mkdir -p "$P/src"; printf 'const x = 1;\n' > "$P/src/a.js"
write_conf "$P" 'WRITABLE_DIRS=("src")'
out=$( run_gate "$P" --shift-left ); rc=$?
if [[ "$rc" -eq 0 ]]; then ok "shift-left 无 spec rc=0"; else bad "shift-left 无 spec 非零（rc=${rc}）"; fi
forbid "$out" "均已在 spec/plan 阶段嵌入" "shift-left 无 spec 不宣称全部嵌入"
need "$out" "部分完成" "shift-left 无 spec 显式部分完成"

# 12) --mermaid 别名与 --diagram 等价
P="$T/p-mermaid"; mkdir -p "$P/src"; printf 'x\n' > "$P/src/a.md"
write_conf "$P" 'WRITABLE_DIRS=("src")'
out1=$( run_gate "$P" --mermaid ); rc1=$?
out2=$( run_gate "$P" --diagram ); rc2=$?
if [[ "$rc1" -eq 0 && "$rc2" -eq 0 && "$out1" == "$out2" ]]; then ok "mermaid 别名等价"; else bad "mermaid 别名不等价（rc=${rc1}/${rc2}）"; fi

# 13) 多模式并集：--all --shift-left 必须执行 12 个调用
P="$T/p-multi"; mkdir -p "$P/src"; printf 'x\n' > "$P/src/a.js"
write_conf "$P" 'WRITABLE_DIRS=("src")' 'SCAN_DIRS=()'
out=$( run_gate "$P" --all --shift-left ); rc=$?
need "$out" "左移检查" "多模式执行 shift-left"
need "$out" "调用 12" "多模式调用数 12"

# 14) --doctor 必须读入 conf（而非内置默认值）
P="$T/p-doctor"; mkdir -p "$P"
write_conf "/definitely/not/here" 'WRITABLE_DIRS=("missing")' 'ACTIVE_FRAMEWORKS=("vue")'
out=$( bash "$assets/precheck.sh" --doctor 2>&1 ); rc=$?
if [[ "$rc" -eq 1 ]]; then ok "doctor 对坏 conf 返回 1"; else bad "doctor 对坏 conf 返回 ${rc}"; fi
need "$out" "/definitely/not/here" "doctor 读到 conf 的 PROJECT_DIR"
forbid "$out" "PROJECT_DIR 存在：." "doctor 不误报默认值"

# 15) spec-first 未跟踪源码必须被看见
P="$T/p-spec"; mkdir -p "$P/src"
( cd "$P" && git init -q && git checkout -q -b main && git config user.email t@t && git config user.name t \
  && printf 'README\n' > README.md && git add README.md && git commit -qm init )
printf 'const x = 1;\n' > "$P/src/new.js"
write_conf "$P" 'WRITABLE_DIRS=("src")' 'SPEC_REQUIRED=1' 'SPEC_GLOB="docs/specs/*.md"' 'BASE_BRANCH="main"'
out=$( run_gate "$P" --spec-first ); rc=$?
if [[ "$rc" -eq 1 ]]; then ok "未跟踪源码触发 spec-first"; else bad "未跟踪源码绕过 spec-first（rc=${rc}）"; fi
need "$out" "gate_spec_first_missing" "spec-first 未跟踪源码 fail id"

# 16) Jest coverageThreshold 必须被覆盖率门禁识别（nest-forge 实证）
if grep -q 'coverageThreshold' "$BASE/assets/framework-gates/jest-vitest.sh"; then
  ok "jest 覆盖率门禁识别 coverageThreshold"
else
  bad "jest 覆盖率门禁未识别 coverageThreshold"
fi

echo ""
echo "test-r118-gate-hardening: PASS ${PASS} / FAIL ${FAIL}"
[[ "$FAIL" -eq 0 ]]
