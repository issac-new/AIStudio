#!/usr/bin/env bash
# test-r108-rust-family.sh — Rust 语言族回归轮五缺陷防复发锁（R108，rust-forge 载体）
# 锁定行为（每项一轮实证过的缺陷，修复后不得复发）：
#   D1  交付形态嗅探 backend-service 判据含 Cargo.toml（Rust 服务不再漏嗅）
#   D2a auto 档文件数计数排除 target/（cargo 构建产物不充数）
#   D2b 框架信号粗计含 Cargo.toml + 子目录 package.json（前后端子目录布局依赖计入）
#   D4  check_security HTTP 动词 method:'DELETE' 豁免（经 security 夹具双态锁）
#   D5  DIM_TESTFILES 枚举含 *.test.jsx/*.spec.jsx（React JSX 测试不再漏数）
set -uo pipefail
HERE="$(cd "$(dirname "${0}")" && pwd)"
ROOT="$(cd "${HERE}/.." && pwd)"              # 生成器仓 swarm-yuan/（tests 的上级）
REPO="$(cd "${ROOT}/.." && pwd)"              # 仓库根（verifier 所在）
GEN="${ROOT}/scripts/generate-skill.sh"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/r108lock.XXXXXX")"
trap 'rm -rf "${TMP}"' EXIT

echo "── R108 Rust 族防复发锁（5 项）──"

# ── D1：Cargo.toml 布局 → 交付形态含 backend-service ──
fx1="${TMP}/d1"; mkdir -p "${fx1}/src"
printf '[package]\nname = "svc"\nversion = "0.1.0"\nedition = "2021"\n' > "${fx1}/Cargo.toml"
printf 'fn main() { println!("hi"); }\n' > "${fx1}/src/main.rs"
bash "${GEN}" --profile lite d1-probe "${fx1}" >/dev/null 2>&1
out1=$(grep -F "交付形态" "${fx1}/.claude/skills/d1-probe/SKILL.md" 2>/dev/null || true)
if printf '%s' "${out1}" | grep -q 'backend-service'; then
  ok "D1 交付形态嗅探含 backend-service（Cargo.toml 判据）"
else
  bad "D1 交付形态嗅探漏 backend-service：${out1:-（无输出）}"
fi
rm -rf "${fx1}/.claude"

# ── D2a：target/ 构建产物不计入文件数（干净 Rust 小项目 + 300 个产物文件 → lite 依据须为框架信号或形态，不得是文件数 ≥80）──
fx2="${TMP}/d2a"; mkdir -p "${fx2}/src" "${fx2}/target/debug"
printf '[package]\nname = "tiny"\nversion = "0.1.0"\n' > "${fx2}/Cargo.toml"
printf 'fn main() {}\n' > "${fx2}/src/main.rs"
for i in $(seq 1 300); do : > "${fx2}/target/debug/artifact-${i}.o"; done
out2=$(bash "${GEN}" --profile auto d2a-probe "${fx2}" 2>&1 | grep -E 'profile auto 判定|规模信号' || true)
if printf '%s' "${out2}" | grep -q '文件数 2'; then
  ok "D2a 文件数计数排除 target/（300 产物不入数）"
else
  bad "D2a 文件数计数仍含 target/：${out2:-（无输出）}"
fi
rm -rf "${fx2}/.claude"

# ── D2b：纯 Rust 干净树依赖信号计 Cargo.toml（无 web/ 子目录也能升档）；子目录 package.json 计入 ──
fx3="${TMP}/d2b"; mkdir -p "${fx3}/src" "${fx3}/web"
{ printf '[package]\nname = "pure"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n';
  printf 'axum = "0.8"\ntokio = "1"\nserde = "1"\nserde_json = "1"\ntower = "0.5"\n'; } > "${fx3}/Cargo.toml"
printf 'pub fn hello() {}\n' > "${fx3}/src/lib.rs"
printf '{"name":"w","dependencies":{"react":"^18.3.1"},"devDependencies":{"vite":"^5.4.11","vitest":"^2.1.8"}}\n' > "${fx3}/web/package.json"
out3=$(bash "${GEN}" --profile auto d2b-probe "${fx3}" 2>&1 | grep -E 'profile auto 判定' || true)
printf '%s' "${out3}" | grep -q 'standard' && ok "D2b 子目录依赖计入（web/package.json 驱动升 standard）" \
  || bad "D2b 子目录依赖未计入：${out3:-（无输出）}"
rm -rf "${fx3}/.claude"

# 干净纯 Rust 小树（无前端）也须 standard（Cargo 依赖信号驱动），且依据含「框架信号」
{ printf '[package]\nname = "pure2"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n';
  for dep in axum tokio serde serde_json tower http-body-util tracing thiserror anyhow uuid chrono log env_logger reqwest sqlx rand regex clap async-trait futures mime time url; do
    printf '%s = "1"\n' "${dep}"
  done; } > "${fx2}/Cargo.toml"
out3b=$(bash "${GEN}" --profile auto d2b2-probe "${fx2}" 2>&1 | grep -E 'profile auto 判定' || true)
printf '%s' "${out3b}" | grep -q '框架信号' && ok "D2b Cargo.toml 计入框架信号（纯 Rust 树升档依据在册）" \
  || bad "D2b Cargo.toml 未计入框架信号：${out3b:-（无输出）}"
rm -rf "${fx2}/.claude"

# ── D5：DIM_TESTFILES 枚举 *.test.jsx ──
fx4="${TMP}/d5"; mkdir -p "${fx4}/web/src"
printf '{"name":"w","dependencies":{"react":"^18.3.1"}}\n' > "${fx4}/web/package.json"
: > "${fx4}/web/src/App.test.jsx"
: > "${fx4}/web/src/api.test.js"
# 提取必须锁 LC_ALL=C：macOS BWK awk 在 UTF-8 locale 下用中文做 $1=="测试文件" 比较会
# 误判其他维度标签相等（实测 维度/类型定义 也被判等），断言随之失真——本机 en_US.UTF-8
# 下长期红；C locale 保证按字节比较。同仓既有范式见 inventory-verify.sh:311。
out4=$(bash "${ROOT}/scripts/inventory-verify.sh" "${fx4}" --form frontend 2>/dev/null | LC_ALL=C awk -F'\t' '$1=="测试文件"{print $2}')
if [[ "${out4}" == "2" ]]; then
  ok "D5 测试文件枚举含 *.test.jsx（2/2）"
else
  bad "D5 测试文件枚举漏 *.test.jsx（枚举=${out4:-空}）"
fi

# ── D4：security 夹具双态（compliant 含 HTTP 动词形态=exit 0；violating 仍拦=exit 非 0）──
if bash "${ROOT}/tests/run-gate-fixture.sh" security >/dev/null 2>&1; then
  ok "D4 security 夹具双态（HTTP 动词豁免形态合规面绿）"
else
  bad "D4 security 夹具双态失败（run-gate-fixture.sh security）"
fi

echo "── 汇总：${PASS} 通过 / ${FAIL} 失败 ──"
[[ "${FAIL}" -eq 0 ]]
