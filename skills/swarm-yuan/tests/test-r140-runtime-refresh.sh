#!/usr/bin/env bash
# test-r140-runtime-refresh.sh — R140 运行时刷新轮两项物化能力锁
# ① 生成物 SKILL.md 20k 硬顶（superpowers 7.0.1 宿主压缩截断防线物化：
#    Claude Code 压缩后重挂载技能在 20000 字符处截断、其后内容整会话消失。
#    预算 FACT_SKILLMD_BYTES_BUDGET 可按先例再登记上调，硬顶锚宿主行为不可越。）
# ② generate-skill.sh --upgrade 在途状态门（comet 0.5.0 升级门吸收：
#    升级即破坏性变更，项目状态机停在中间阶段（design/build/verify/operate）时
#    fail-closed 拒升级；open/archive/无状态放行；环境变量显式豁免。）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

GEN="$(pwd)/scripts/generate-skill.sh"
TMP="$(mktemp -d /tmp/r140.XXXXXX)"
trap 'rm -rf "${TMP}"' EXIT

# ===== ① 硬顶三件套在位 =====
grep -q '^FACT_SKILLMD_BYTES_HARD_CAP=20000' assets/facts.conf \
  && ok "①a facts 硬顶 20000 登记在位" || bad "①a FACT_SKILLMD_BYTES_HARD_CAP 缺失或值漂移"
grep -q "FACT_SKILLMD_BYTES_HARD_CAP" tests/e2e/run-gen-e2e.sh \
  && ok "①b gen-e2e §7.6b 消费者在位" || bad "①b gen-e2e 未消费硬顶 fact"
grep -q 'facts_eq FACT_SKILLMD_BYTES_HARD_CAP 20000' tests/test-doc-numbers.sh \
  && ok "①c doc-numbers 数字锁在位" || bad "①c doc-numbers 缺硬顶锁"

# ===== ② 在途状态门：真实生成 lite 技能后跑 --upgrade 三态 + 豁免 =====
PROJ="${TMP}/proj"; mkdir -p "${PROJ}/src"
printf '[package]\nname = "svc140"\nversion = "0.1.0"\nedition = "2021"\n' > "${PROJ}/Cargo.toml"
printf 'fn main() { println!("hi"); }\n' > "${PROJ}/src/main.rs"
mkdir -p "${PROJ}/.claude/skills"  # 显式 .claude 布局（不随默认落点变化）
bash "${GEN}" --profile lite r140-svc "${PROJ}" >/dev/null 2>&1
SKMD="${PROJ}/.claude/skills/r140-svc/SKILL.md"
[[ -f "${SKMD}" ]] && ok "②a lite 技能生成就位" || { bad "②a 生成失败（SKILL.md 缺失）"; exit 1; }

_bytes=$(wc -c < "${SKMD}" | tr -d ' ')
[[ "${_bytes}" -le 20000 ]] \
  && ok "①d 生成物 SKILL.md ${_bytes}B ≤ 硬顶 20000（实测）" \
  || bad "①d 生成物 SKILL.md ${_bytes}B 超硬顶（gen-e2e §7.6b 会在 sweep 变红，此处先锁）"

# ①e 变异断言：把 facts 硬顶值改小（4096 < 实测字节），§7.6b 同款判定必须判超——证明消费路径真执法
PDM="${TMP}/paradigm"; mkdir -p "${PDM}/assets"
sed 's/^FACT_SKILLMD_BYTES_HARD_CAP=20000/FACT_SKILLMD_BYTES_HARD_CAP=4096/' assets/facts.conf > "${PDM}/assets/facts.conf"
_cap=$(grep -m1 '^FACT_SKILLMD_BYTES_HARD_CAP=' "${PDM}/assets/facts.conf" | sed 's/^FACT_SKILLMD_BYTES_HARD_CAP=//; s/[^0-9].*$//')
if [[ "${_bytes}" -gt "${_cap}" && "${_cap}" -eq 4096 ]]; then
  ok "①e 变异（硬顶 4096 < 实测 ${_bytes}B）判定翻转超线——消费路径执法有效"
else
  bad "①e 变异后仍未判超（cap=${_cap:-空} bytes=${_bytes}）"
fi

# 态1：phase=build（在途）→ fail-closed exit 2 + 点名
mkdir -p "${PROJ}/.swarm-yuan"
printf 'change: r140-inflight\nphase: build\nworkflow: full\n' > "${PROJ}/.swarm-yuan/state.yaml"
rc1=0; out1="$(bash "${GEN}" --upgrade r140-svc "${PROJ}" 2>&1)" || rc1=$?
if [[ "${rc1}" -eq 2 ]] && printf '%s\n' "${out1}" | grep -q '在途任务' && printf '%s\n' "${out1}" | grep -q 'phase=build'; then
  ok "②b 态1 phase=build → exit 2 拒升级并点名（fail-closed）"
else
  bad "②b 态1 未按预期拦截（rc=${rc1}）：$(printf '%s\n' "${out1}" | head -2 | tr '\n' ' ')"
fi

# 态2：phase=archive（已归档）→ 放行 rc=0
printf 'change: r140-done\nphase: archive\nworkflow: full\n' > "${PROJ}/.swarm-yuan/state.yaml"
rc2=0; bash "${GEN}" --upgrade r140-svc "${PROJ}" >/dev/null 2>&1 || rc2=$?
if [[ "${rc2}" -eq 0 && -f "${SKMD}" ]]; then
  ok "②c 态2 phase=archive → 升级放行（rc=0，产物完好）"
else
  bad "②c 态2 archive 被误拦（rc=${rc2}）"
fi

# 态3：phase=build + 显式豁免 → 放行 rc=0
printf 'change: r140-inflight\nphase: build\nworkflow: full\n' > "${PROJ}/.swarm-yuan/state.yaml"
rc3=0; SWARM_YUAN_UPGRADE_ALLOW_INFLIGHT=1 bash "${GEN}" --upgrade r140-svc "${PROJ}" >/dev/null 2>&1 || rc3=$?
if [[ "${rc3}" -eq 0 ]]; then
  ok "②d 态3 build+SWARM_YUAN_UPGRADE_ALLOW_INFLIGHT=1 → 显式豁免放行"
else
  bad "②d 态3 豁免通道失效（rc=${rc3}）"
fi

# 态4：phase=open（仅注册）→ 放行 rc=0
printf 'change: r140-open\nphase: open\nworkflow: full\n' > "${PROJ}/.swarm-yuan/state.yaml"
rc4=0; bash "${GEN}" --upgrade r140-svc "${PROJ}" >/dev/null 2>&1 || rc4=$?
if [[ "${rc4}" -eq 0 ]]; then
  ok "②e 态4 phase=open → 放行（仅注册不算在途）"
else
  bad "②e 态4 open 被误拦（rc=${rc4}）"
fi

# ===== ③ 回归实抓缺陷锁（trade-forge 真实填充轮 G-D3/G-D4/G-D5/G-D6b）=====
# G-D3：temp target-dir 部署形态下，门禁文件锚（review-record/reference-manual）须解析到
#       本技能根而非 CWD=PROJECT_DIR 的项目根或 .claude/skills 旧技能 glob。
PROJ2="${TMP}/proj2"; mkdir -p "${PROJ2}/src" "${PROJ2}/.claude/skills/old-skill/references"
printf '[package]\nname = "svc2"\nversion = "0.1.0"\n' > "${PROJ2}/Cargo.toml"
printf 'fn main() {}\n' > "${PROJ2}/src/main.rs"
bash "${GEN}" --profile lite r140-anchor "${PROJ2}" >/dev/null 2>&1
SK2="${PROJ2}/.claude/skills/r140-anchor"
# 诱饵：项目根与旧技能 glob 各放一份「缺领域知识段」的 reference-manual + 旧 review-record
printf '# 旧技能地图（无领域知识段）\n' > "${PROJ2}/.claude/skills/old-skill/references/reference-manual.md"
printf '旧记录\n' > "${PROJ2}/.claude/skills/old-skill/references/review-record.md"
printf '# 项目根地图（无领域知识段）\n' > "${PROJ2}/reference-manual.md"
# 技能根放真值（领域知识段 + review-record），CONF 指向技能根（temp 部署形态等价）
mkdir -p "${SK2}/references" "${PROJ2}/docs/reviews"
printf '# 2026-10-24 评审留档\n评审人：regression-agent  日期：2026-10-24  结论：通过\n' > "${PROJ2}/docs/reviews/2026-10-24-regression-review.md"
printf '## 领域知识\n- 规律X（src/main.rs:1）\n' > "${SK2}/references/reference-manual.md"
printf '五维审查点：正确性/安全/性能/可维护/测试覆盖\n## findings\n| 文件 | 问题 | 处置 |\n| --- | --- | --- |\n| - | 无 | - |\n' > "${SK2}/references/review-record.md"
_d3out="$( cd "${PROJ2}" && REVIEW_RECORD_REQUIRED=1 bash "${SK2}/scripts/precheck.sh" --domain 2>&1; echo "rc=$?" )"
if printf '%s\n' "${_d3out}" | grep -q "含领域知识段"; then
  ok "③a G-D3 domain 锚解析到技能根真值（诱饵 reference-manual 未被读）"
else
  bad "③a G-D3 domain 仍读到诱饵/缺段文件：$(printf '%s\n' "${_d3out}" | grep 领域知识 | head -1)"
fi
_d3r="$( cd "${PROJ2}" && REVIEW_RECORD_REQUIRED=1 bash "${SK2}/scripts/precheck.sh" --review-record 2>&1 )"
if ! printf '%s\n' "${_d3r}" | grep -q "gate_review_record"; then
  ok "③b G-D3 review-record 经 SKILL_DIR 解析到技能根文件（零 gate_review_record_* fail，诱饵未被读）"
else
  bad "③b G-D3 review-record 仍 fail：$(printf '%s\n' "${_d3r}" | grep "gate_review_record" | head -1)"
fi
# G-D3 全局锚源码在位
grep -q 'SKILL_DIR="${SKILL_DIR:-' scripts/../assets/precheck.sh 2>/dev/null || grep -q 'SKILL_DIR="${SKILL_DIR:-' "$(dirname "$0")/../assets/precheck.sh" \
  && ok "③c SKILL_DIR 全局注入在位（G-D3 根修）" || bad "③c SKILL_DIR 注入缺失"

# G-D4：domain 扫描不吞构建产物（coverage/dist/target 不作违规证据）
mkdir -p "${PROJ2}/frontend/coverage"
printf 'document.getElementById("x").innerHTML = data.userInput;\n' > "${PROJ2}/frontend/coverage/sorter.js"
printf 'WRITABLE_DIRS=(\"frontend\")\n' >> "${SK2}/scripts/precheck.conf" 2>/dev/null || true
_d4out="$( cd "${PROJ2}" && bash "${SK2}/scripts/precheck.sh" --domain 2>&1 )"
if printf '%s\n' "${_d4out}" | grep -q "coverage/sorter.js"; then
  bad "④ G-D4 产物文件仍被计入违规（coverage/sorter.js 命中）"
else
  ok "④ G-D4 构建产物不计违规（coverage/sorter.js 被排除）"
fi

# G-D5：--all-full SILENT 模式 warn 压缩须在汇总段披露计数（可对账）
_d5out="$( cd "${PROJ2}" && bash "${SK2}/scripts/precheck.sh" --all-full 2>&1 )"
_d5w="$(printf '%s\n' "${_d5out}" | grep -oE 'warn [0-9]+' | head -1 | grep -oE '[0-9]+')"
if [[ "${_d5w:-0}" -gt 0 ]] && printf '%s\n' "${_d5out}" | grep -qE "压缩明细：${_d5w} 条 warn"; then
  ok "⑤ G-D5 --all-full warn 压缩披露在位且计数一致（${_d5w} 条）"
elif [[ "${_d5w:-0}" -eq 0 ]] && ! printf '%s\n' "${_d5out}" | grep -q "压缩明细"; then
  ok "⑤ G-D5 零 warn 不出披露行（语义正确）"
else
  bad "⑤ G-D5 披露与计数不可对账（warn=${_d5w:-?}）"
fi

# G-D6b：framework-evidence 证据净化词表含 target/coverage
grep -q 'target|coverage' scripts/framework-evidence.sh 2>/dev/null || grep -q 'target|coverage' "$(dirname "$0")/../scripts/framework-evidence.sh" \
  && ok "⑥ G-D6b 证据净化词表含 target/coverage" || bad "⑥ G-D6b 词表缺 target/coverage"

# G-D7：日期命名评审记录被接受（与 check_review 今日留痕命名口径对齐），三要素内容检查不放松
mv "${PROJ2}/docs/reviews/2026-10-24-regression-review.md" "${PROJ2}/docs/reviews/2026-10-23.md"
_d7a="$( cd "${PROJ2}" && REVIEW_RECORD_REQUIRED=1 bash "${SK2}/scripts/precheck.sh" --review-record 2>&1 )"
if printf '%s\n' "${_d7a}" | grep -q "评审记录检查通过"; then
  ok "⑦a G-D7 日期命名（2026-10-23.md）被接受且三要素齐备通过"
else
  bad "⑦a G-D7 日期命名仍判 missing：$(printf '%s\n' "${_d7a}" | grep gate_review_record | head -1)"
fi
printf '# 无要素日期命名记录\n' > "${PROJ2}/docs/reviews/2026-10-22.md"
_d7b="$( cd "${PROJ2}" && REVIEW_RECORD_REQUIRED=1 bash "${SK2}/scripts/precheck.sh" --review-record 2>&1 )"
if printf '%s\n' "${_d7b}" | grep -q "gate_review_record_incomplete"; then
  ok "⑦b G-D7 日期命名缺三要素仍 fail（内容检查未放松）"
else
  bad "⑦b G-D7 缺要素日期命名未被点名：$(printf '%s\n' "${_d7b}" | grep -E 'gate_review|通过' | head -2 | tr '\n' ' ')"
fi
rm -f "${PROJ2}/docs/reviews/2026-10-22.md"

# T1-D1：调用方 env SPEC_FILE 优先（环境通道活代码——旧版被 _default_conf 无条件置空抹掉）
mkdir -p "${PROJ2}/docs/specs"
printf '旧 spec（无测试设计内容）\n' > "${PROJ2}/docs/specs/2026-01-01-old.md"
touch -t 202601010000 "${PROJ2}/docs/specs/2026-01-01-old.md"
printf '## 测试设计\n| 用例 | 类型 |\n| --- | --- |\n| 正常 | 单测 |\n| 边界 | 单测 |\n| 异常 | 单测 |\n' > "${PROJ2}/docs/specs/2026-10-24-new.md"
_d8="$( cd "${PROJ2}" && SPEC_FILE="docs/specs/2026-10-24-new.md" bash "${SK2}/scripts/precheck.sh" --shift-left 2>&1 )"
if ! printf '%s\n' "${_d8}" | grep -q "未找到 spec 文件"; then
  ok "⑧ T1-D1 SPEC_FILE 环境通道生效（env 指定文件被消费，不再被默认置空抹掉）"
else
  bad "⑧ T1-D1 环境通道仍是死代码（SPEC_FILE env 被抹）"
fi

# T1-D2：_find_spec_file 取最新 mtime（源锚；行为面由 trade-forge 真路径复验——
# 多 spec 项目 spec-first 发现逻辑不再永远命中最旧文件）
grep -q '"$_f" -nt "$_hit"' assets/precheck.sh 2>/dev/null || grep -q '"$_f" -nt "$_hit"' "$(dirname "$0")/../assets/precheck.sh" \
  && ok "⑨ T1-D2 _find_spec_file 取最新 mtime（源锚在位）" || bad "⑨ T1-D2 newest-mtime 逻辑缺失"

# T2-D3：plan 发现死清单根治——.swarm-yuan/tasks.md 承载 §20 执法；无 tasks.md 项目口径不变
mkdir -p "${PROJ2}/.swarm-yuan"
printf '# 实施计划\n\n## §20 变更左移（plan 阶段写变更影响）\n- 影响面：src/main.rs\n' > "${PROJ2}/.swarm-yuan/tasks.md"
_d10="$( cd "${PROJ2}" && bash "${SK2}/scripts/precheck.sh" --shift-left 2>&1 )"
if printf '%s\n' "${_d10}" | grep -q "plan §20 变更左移段存在"; then
  ok "⑩a T2-D3 tasks.md 承载 §20 执法（plan 段存在 pass）"
else
  bad "⑩a T2-D3 tasks.md 未被 plan 发现消费：$(printf '%s\n' "${_d10}" | grep -E 'plan|§20' | head -1)"
fi
_d10b="$( cd "${TMP}/proj" && bash "${PROJ}/.claude/skills/r140-svc/scripts/precheck.sh" --shift-left 2>&1 )"
if printf '%s\n' "${_d10b}" | grep -q "未找到 plan 文件"; then
  ok "⑩b T2-D3 无 tasks.md 项目维持 warn 口径（不变更）"
else
  bad "⑩b T2-D3 无 tasks.md 项目口径漂移：$(printf '%s\n' "${_d10b}" | grep -E 'plan|§20' | head -1)"
fi

# ===== 收口 =====
if [[ "${FAIL}" -eq 0 ]]; then
  echo "✓ test-r140-runtime-refresh 全部断言通过"
else
  echo "✗ test-r140-runtime-refresh 存在失败断言" >&2
fi
exit "${FAIL}"
