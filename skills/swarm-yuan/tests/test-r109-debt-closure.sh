#!/usr/bin/env bash
# test-r109-debt-closure.sh — R108 挂账四项清偿的防复发锁（R109 债务清偿轮）
# 锁定行为（每项一轮实证过的缺陷，修复后不得复发）：
#   D8  L2/L3 spec-first 判据=spec-变更关联（特性分支上历史 spec 不再放行；基分支保留存在性）
#   D6  DIM_DATA_MODEL 枚举 Rust pub struct/enum（ENUM_ZERO_DIM 披露族收敛）
#   D7  relations-extract 补 bin crate 名 use 边 + mod 声明边（crate:: 既有行为不回归）
#   D9  --upgrade 对用户确认空值（N/A 注释）不打 TODO；未确认空值仍打（模板比对锚）
set -uo pipefail
HERE="$(cd "$(dirname "${0}")" && pwd)"
ROOT="$(cd "${HERE}/.." && pwd)"              # 生成器仓 swarm-yuan/
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/r109lock.XXXXXX")"
trap 'rm -rf "${TMP}"' EXIT

echo "── R109 债务清偿防复发锁（D8/D6/D7/D9）──"

# ════ D8：spec-变更关联（L2 四场景 + lib 单元）════
d8="${TMP}/d8"
mkdir -p "${d8}/src" "${d8}/docs/specs" "${d8}/.claude/skills/t/scripts"
git -C "${d8}" init -q -b main 2>/dev/null || { git -C "${d8}" init -q && git -C "${d8}" branch -m main; }
cp "${ROOT}/assets/hooks/spec-first-pre-commit.sh" "${d8}/.claude/skills/t/scripts/"
cp "${ROOT}/assets/spec-first-lib.sh" "${d8}/.claude/skills/t/scripts/"
{
  printf 'PROJECT_DIR="%s"\n' "$d8"
  printf 'SPEC_REQUIRED=1\n'
  printf 'WRITABLE_DIRS=("src")\n'
} > "${d8}/.claude/skills/t/scripts/precheck.conf"
printf -- '---\nstatus: active\n---\n# t\n' > "${d8}/.claude/skills/t/SKILL.md"
printf '# spec a\n\n## 决策记录\n\n历史 spec（已合入 main）。\n' > "${d8}/docs/specs/a.md"
printf 'fn a() {}\n' > "${d8}/src/a.rs"
git -C "${d8}" add -A
git -C "${d8}" -c user.name=t -c user.email=t@t commit -qm init

_pc="${d8}/.claude/skills/t/scripts/spec-first-pre-commit.sh"

# 场景 A（R108 探针复刻——原漏拦点）：特性分支带历史 spec，无 spec 提交 → 须拦
git -C "${d8}" checkout -q -b feat/hole
printf 'fn a2() {}\n' >> "${d8}/src/a.rs"
git -C "${d8}" add src
if (cd "${d8}" && bash "${_pc}") >/dev/null 2>&1; then
  bad "D8-A 特性分支无 spec 提交被放行（护栏退化未根治）"
else
  ok "D8-A 特性分支无 spec 提交被拦（历史 spec 不再放行）"
fi
git -C "${d8}" reset -q HEAD -- .   # 清 staged 残留，防跨场景状态污染

# 场景 B：本分支写过 spec（已提交）+ 源码 staged → 放行
git -C "${d8}" checkout -q main && git -C "${d8}" checkout -q -b feat/withspec
printf '# spec b\n\n## 决策记录\n\n本分支新 spec。\n' > "${d8}/docs/specs/b.md"
git -C "${d8}" add docs && git -C "${d8}" -c user.name=t -c user.email=t@t commit -qm spec
printf 'fn b() {}\n' >> "${d8}/src/a.rs"
git -C "${d8}" add src
if (cd "${d8}" && bash "${_pc}") >/dev/null 2>&1; then
  ok "D8-B 本分支 spec 提交后源码 staged 放行"
else
  bad "D8-B 本分支有 spec 仍被拦（关联过严）"
fi
git -C "${d8}" reset -q HEAD -- .

# 场景 C：基分支（main）保留存在性语义 → 放行
git -C "${d8}" checkout -q main
printf 'fn c() {}\n' >> "${d8}/src/a.rs"
git -C "${d8}" add src
if (cd "${d8}" && bash "${_pc}") >/dev/null 2>&1; then
  ok "D8-C 基分支存在性宽口径放行（主干直提交归分支门）"
else
  bad "D8-C 基分支存在性语义丢失"
fi

# 场景 D（lib 单元=L3 语义）：特性分支 --no-verify 逃逸后——变更集无 spec 关联；
# 写入未跟踪 spec（开发中态）后关联成立
git -C "${d8}" checkout -q feat/hole 2>/dev/null || git -C "${d8}" checkout -q -b feat/hole2
# shellcheck disable=SC1091
. "${ROOT}/assets/spec-first-lib.sh"
if spf_on_base_branch "${d8}" ""; then
  bad "D8-D 特性分支被误判为基分支"
elif [[ -n "$(spf_find_governing_spec "${d8}" 'docs/specs/*.md' 'staged branch untracked' "")" ]]; then
  bad "D8-D 逃逸变更集被误判有关联 spec"
else
  printf '# spec c\n\n## 决策记录\n\n未提交 spec。\n' > "${d8}/docs/specs/c.md"
  if [[ -n "$(spf_find_governing_spec "${d8}" 'docs/specs/*.md' 'staged branch untracked' "")" ]]; then
    ok "D8-D L3 关联语义正确（逃逸无关联；untracked spec 认）"
  else
    bad "D8-D untracked spec 未被关联面认到"
  fi
fi

# ════ D6：数据模型维枚举 Rust pub struct/enum ════
d6="${TMP}/d6"; mkdir -p "${d6}/src"
printf 'pub struct Task { pub id: u64 }\n' > "${d6}/src/models.rs"
printf 'fn main() {}\n' > "${d6}/src/main.rs"
# LC_ALL=C：macOS BWK awk 在 UTF-8 locale 下比较中文标签会误判相等（见 test-r108 D5 同源修复）
_d6n=$(bash "${ROOT}/scripts/inventory-verify.sh" "${d6}" --form backend 2>/dev/null | LC_ALL=C awk -F'\t' '$1=="数据模型 / ORM 实体"{print $2}')
if [[ "${_d6n}" == "1" ]]; then
  ok "D6 Rust pub struct 计入数据模型维（models.rs=1，main.rs 不计）"
else
  bad "D6 数据模型维 Rust 枚举异常（=${_d6n:-空}）"
fi

# ════ D7：bin crate 名 use 边 + mod 声明边（crate:: 不回归）════
d7="${TMP}/d7"; mkdir -p "${d7}/src" "${d7}/.claude/skills/probe"
printf '[package]\nname = "rust-forge"\nversion = "0.1.0"\n' > "${d7}/Cargo.toml"
printf 'pub mod error;\npub mod models;\npub mod routes;\npub mod store;\n' > "${d7}/src/lib.rs"
printf 'use rust_forge::routes::router;\nuse rust_forge::store::shared_store;\nfn main(){}\n' > "${d7}/src/main.rs"
printf 'use crate::models::Task;\npub enum AppError { N }\n' > "${d7}/src/error.rs"
printf 'pub struct Task {}\n' > "${d7}/src/models.rs"
printf 'pub fn router(){}\n' > "${d7}/src/routes.rs"
printf 'pub fn shared_store(){}\n' > "${d7}/src/store.rs"
bash "${ROOT}/scripts/relations-extract.sh" "${d7}" --skill-dir "${d7}/.claude/skills/probe" >/dev/null 2>&1
_rel="${d7}/.claude/skills/probe/references/relations.jsonl"
if grep -q '"from":"src/main.rs","to":"src/routes.rs"' "$_rel" && \
   grep -q '"from":"src/main.rs","to":"src/store.rs"' "$_rel" && \
   grep -q '"from":"src/lib.rs","to":"src/error.rs"' "$_rel" && \
   grep -q '"from":"src/error.rs","to":"src/models.rs"' "$_rel"; then
  ok "D7 bin use 边×2 + mod 声明边 + crate:: 回归锚全命中"
else
  bad "D7 Rust 边集缺边（$(wc -l < "$_rel" 2>/dev/null || echo 0) 条）"
fi

# ════ D9：--upgrade 用户确认空值不打标；未确认仍打 ════
d9="${TMP}/d9"; mkdir -p "${d9}/src" "${d9}/web/src"
printf '[package]\nname = "t9"\nversion = "0.1.0"\nedition = "2021"\n' > "${d9}/Cargo.toml"
printf 'fn main(){}\n' > "${d9}/src/main.rs"
printf '{"name":"w","dependencies":{"react":"^18.3.1"},"devDependencies":{"vite":"^5.4.11","vitest":"^2.1.8"}}\n' > "${d9}/web/package.json"
printf "import { defineConfig } from 'vite'\nexport default defineConfig({})\n" > "${d9}/web/vite.config.js"
bash "${ROOT}/scripts/generate-skill.sh" --profile standard t9 "${d9}" "${TMP}/t9-skill" >/dev/null 2>&1
_arch="${TMP}/t9-skill/t9/scripts/precheck.arch.conf"
# 用户改写注释=确认 N/A（与模板不同字）
sed -i.bak 's|^VITE_INJECT_SCRIPT=.*|VITE_INJECT_SCRIPT=""  # 本项目无注入脚本，保持空跳过（R109-D9 锁）|' "$_arch" && rm -f "${_arch}.bak"
bash "${ROOT}/scripts/generate-skill.sh" --upgrade t9 "${d9}" "${TMP}/t9-skill" >/dev/null 2>&1
_vi_line=$(grep '^VITE_INJECT_SCRIPT=' "$_arch" || true)
_vt_line=$(grep '^VITEST_TEST_GLOBS=' "$_arch" || true)
if printf '%s' "${_vi_line}" | grep -q 'TODO('; then
  bad "D9 用户确认空值仍被打 TODO 标记：${_vi_line}"
elif ! printf '%s' "${_vt_line}" | grep -q 'TODO('; then
  bad "D9 未确认空值未打 TODO（标记机制失效）：${_vt_line}"
elif grep -qE 'TODO\(upgrade\).*TODO\(framework-gates\)|TODO\(framework-gates\).*TODO\(upgrade\)' "$_arch"; then
  bad "D9 双 TODO 标记堆积（跨类感知失效）"
else
  ok "D9 确认空值不打标 / 未确认仍打 / 无双标堆积"
fi

echo "── 汇总：${PASS} 通过 / ${FAIL} 失败 ──"
[[ "${FAIL}" -eq 0 ]]
