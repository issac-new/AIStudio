#!/usr/bin/env bash
# test-r141-upgrade-dryrun.sh — R141 物化能力锁：generate-skill --upgrade --dry-run 变更预演
# （openspec 1.15.0 `update --dry-run` 理念：升级动作先预演后执行——报告将 add/change/delete
#  的文件三态清单，技能目录与项目零写入；与 R140 在途状态门互补：门管时机，预演管内容面。）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

GEN="$(pwd)/scripts/generate-skill.sh"
TMP="$(mktemp -d /tmp/r141.XXXXXX)"
trap 'rm -rf "${TMP}"' EXIT

# 测试项目：Rust 单包（lite 档足够驱动 upgrade 流程）
PROJ="${TMP}/proj"; mkdir -p "${PROJ}/src"
printf '[package]\nname = "svc141"\nversion = "0.1.0"\nedition = "2021"\n' > "${PROJ}/Cargo.toml"
printf 'fn main() { println!("hi"); }\n' > "${PROJ}/src/main.rs"
bash "${GEN}" --profile lite svc141 "${PROJ}" >/dev/null 2>&1
SKDIR="${PROJ}/.claude/skills/svc141"
[[ -f "${SKDIR}/SKILL.md" ]] && ok "前置: lite 技能生成就位" || { bad "前置: 生成失败"; exit 1; }

# ===== ① 旗标守卫：--dry-run 不与 --upgrade 组合 = 用法错误 fail-closed =====
rc=0; out="$(bash "${GEN}" --dry-run svc141 "${PROJ}" 2>&1)" || rc=$?
if [[ "${rc}" -eq 1 ]] && printf '%s' "${out}" | grep -q '仅可与 --upgrade 组合'; then
  ok "①a --dry-run 单独使用 → exit 1 并点名（防「以为预演了其实创建了」语义滑落）"
else
  bad "①a 旗标守卫未按预期（rc=${rc}）：$(printf '%s' "${out}" | head -1)"
fi

# ===== ② 预演三态报告 + 零写入 =====
snap_before="$(mktemp -d "${TMP}/snap-before.XXXXXX")"
cp -Rp "${SKDIR}" "${snap_before}/skill"
rc=0; out="$(bash "${GEN}" --upgrade --dry-run svc141 "${PROJ}" 2>&1)" || rc=$?
if [[ "${rc}" -eq 0 ]] && printf '%s' "${out}" | grep -q 'DRY-RUN 预演报告'; then
  ok "②a --upgrade --dry-run → exit 0 且出预演报告"
else
  bad "②a 预演未按预期（rc=${rc}）：$(printf '%s' "${out}" | tail -3)"
fi
printf '%s' "${out}" | grep -qE '结果: change [0-9]+ \| add [0-9]+ \| delete [0-9]+' \
  && ok "②b 三态计数行在位（change|add|delete）" || bad "②b 三态计数行缺失"
if diff -rq "${snap_before}/skill" "${SKDIR}" >/dev/null 2>&1; then
  ok "②c 预演后技能目录与快照逐字节一致（零写入）"
else
  bad "②c 预演改动了技能目录（diff 非空）"
fi
residue_t="$(ls -d "${PROJ}"/.swarm-yuan-upgrade.* 2>/dev/null | head -1 || true)"
residue_tmp="$(ls -d "${TMP}"/swarm-yuan-upgrade-dryrun.* 2>/dev/null | head -1 || true)"
[[ -z "${residue_t}" && -z "${residue_tmp}" ]] \
  && ok "②d 无暂存目录残留（目标目录与 TMPDIR 均 clean）" \
  || bad "②d 暂存残留：${residue_t}${residue_tmp}"
# 预演报告至少点名一个通用模板面（upgrade 必覆盖 .swarm-yuan-version/skill-manifest.json 之一）
printf '%s' "${out}" | grep -qE 'change  (.swarm-yuan-version|skill-manifest\.json)' \
  && ok "②e 报告含通用模板变更项（版本戳/清单）" \
  || bad "②e 报告未含任何通用模板 change 项（升级面可疑为空）"

# ===== ③ 预演与实际升级对账：预演说的 change 集 = 实际升级的 change 集 =====
# 同一路径上先预演后实升：避免复制项目引入 PROJECT_DIR 迁移差异（R141 项目根重定位另测）。
dry_set="$(printf '%s' "${out}" | sed -n 's/^    change  //p' | grep -v '^\.swarm-yuan/effects/' | sort)"
rc=0; out2="$(bash "${GEN}" --upgrade svc141 "${PROJ}" 2>&1)" || rc=$?
[[ "${rc}" -eq 0 ]] || { bad "③ 前置: 实际升级失败 rc=${rc}"; exit 1; }
backup_dir="$(ls -d "${SKDIR}"/.upgrade-backup-* 2>/dev/null | head -1)"
if [[ -n "${backup_dir}" ]]; then
  real_set="$(diff -rq "${backup_dir}" "${SKDIR}" 2>/dev/null | sed -n 's/^Files .* and \(.*\) differ$/\1/p' | sed "s|^${SKDIR}/||" | grep -v '^\.swarm-yuan/effects/' | sort)"
  if [[ "${dry_set}" == "${real_set}" ]]; then
    ok "③a 预演 change 集与实际升级 change 集一致（$(printf '%s' "${dry_set}" | grep -c . || true) 项，effects 时间戳目录除外）"
  else
    bad "③a 预演与实际 change 集不一致：dry=[${dry_set//$'\n'/,}] real=[${real_set//$'\n'/,}]"
  fi
else
  bad "③a 实际升级后未找到备份目录（对账锚缺失）"
fi

# ===== ④ 在途状态门与 dry-run 的边界：预演放行（零写入无斜切风险），真升级仍拦截 =====
mkdir -p "${PROJ}/.swarm-yuan"
printf 'change: r141-inflight\nphase: build\nworkflow: full\n' > "${PROJ}/.swarm-yuan/state.yaml"
rc=0; out3="$(bash "${GEN}" --upgrade --dry-run svc141 "${PROJ}" 2>&1)" || rc=$?
if [[ "${rc}" -eq 0 ]] && printf '%s' "${out3}" | grep -q 'DRY-RUN 预演报告'; then
  ok "④a 在途态（phase=build）dry-run 放行且正常出报告"
else
  bad "④a 在途态 dry-run 被误拦（rc=${rc}）：$(printf '%s' "${out3}" | head -1)"
fi
rc=0; out4="$(bash "${GEN}" --upgrade svc141 "${PROJ}" 2>&1)" || rc=$?
if [[ "${rc}" -eq 2 ]] && printf '%s' "${out4}" | grep -q '在途任务'; then
  ok "④b 同状态真升级仍 exit 2 拦截（R140 门不因 dry-run 松动）"
else
  bad "④b 真升级在途拦截回归破坏（rc=${rc}）"
fi

# ===== ⑤ D1：trace-log 独立调用账本落点（CWD 在技能目录内须上溯项目根） =====
# 实证：R140 会话曾在技能目录 CWD 下写决策，D-140-01/02/03 三条落技能侧 .swarm-yuan 碎片
#（正本在项目侧，全新生成技能时碎片被清=证据链断）。修复=--project-dir > env > 同目录 conf
# > CWD 技能目录上溯 > pwd 逐字（state-machine.sh 同条带）。
D1P="$(mktemp -d "${TMP}/d1.XXXXXX")"
mkdir -p "${D1P}/proj/.claude/skills/sk/scripts" "${D1P}/proj/.swarm-yuan"
cp assets/trace-log.sh "${D1P}/proj/.claude/skills/sk/scripts/"
( cd "${D1P}/proj/.claude/skills/sk/scripts" && bash trace-log.sh --key-node 生成 --status done --note d1 >/dev/null 2>&1 )
if [[ -f "${D1P}/proj/.swarm-yuan/key-nodes.jsonl" && ! -d "${D1P}/proj/.claude/skills/sk/.swarm-yuan" ]]; then
  ok "⑤a 无 conf 时 CWD 在技能目录内 → 账本落项目侧、零技能侧碎片（CWD 上溯执法）"
else
  bad "⑤a 账本落点错误（项目侧=$([[ -f ${D1P}/proj/.swarm-yuan/key-nodes.jsonl ]] && echo 有 || echo 无) 技能侧=$([[ -d ${D1P}/proj/.claude/skills/sk/.swarm-yuan ]] && echo 有 || echo 无)）"
fi
printf 'PROJECT_DIR=%s\n' "${D1P}/proj" > "${D1P}/proj/.claude/skills/sk/scripts/precheck.conf"
( cd "${D1P}/proj/.claude/skills/sk/scripts" && bash trace-log.sh --decision --type Taste --suggestion t --user-action approved >/dev/null 2>&1 )
if [[ -f "${D1P}/proj/.swarm-yuan/decisions.jsonl" ]] && grep -q '"type": *"Taste"' "${D1P}/proj/.swarm-yuan/decisions.jsonl" 2>/dev/null; then
  ok "⑤b 同目录 precheck.conf 的 PROJECT_DIR 解析在位（conf 优先于 CWD）"
else
  bad "⑤b conf 解析未生效（decisions.jsonl 未落项目侧）"
fi
( cd "${D1P}/proj" && bash .claude/skills/sk/scripts/trace-log.sh --key-node 发布 --status done --note d1c >/dev/null 2>&1 )
_lines="$(wc -l < "${D1P}/proj/.swarm-yuan/key-nodes.jsonl" 2>/dev/null | tr -d ' ')"
[[ "${_lines}" == "2" ]] && ok "⑤c 项目根 CWD 正常路径不回归（key-nodes 2 行）" || bad "⑤c 项目根路径回归破坏（行数=${_lines}）"
# state-machine 同条带：CWD 在技能目录内时 STATE_DIR 上溯
cp assets/state-machine.sh "${D1P}/proj/.claude/skills/sk/scripts/"
mkdir -p "${D1P}/proj/.swarm-yuan"
( cd "${D1P}/proj/.claude/skills/sk/scripts" && bash state-machine.sh init d1-probe --force >/dev/null 2>&1 )
if grep -q 'change: d1-probe' "${D1P}/proj/.swarm-yuan/state.yaml" 2>/dev/null && ! ls "${D1P}/proj/.claude/skills/sk/.swarm-yuan/state.yaml" >/dev/null 2>&1; then
  ok "⑤d state-machine 同条带上溯（state.yaml 落项目侧，两侧一致）"
else
  bad "⑤d state-machine 落点错误（R126 两侧一致契约破坏）"
fi

[[ "${FAIL}" -eq 0 ]] && echo "PASS: r141 upgrade --dry-run 全锁绿" || { echo "FAIL: r141 upgrade --dry-run 存在红项" >&2; exit 1; }
