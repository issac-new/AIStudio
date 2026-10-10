#!/usr/bin/env bash
# ontology-verify.sh — 本体论健康检查（统一依赖完整性入口）
#
# 设计来源：swarm-yuan/README.md 三章 How · 3.8 完备性（本体关系派生机制——每条依赖配机器锚）。
# 此前六锚散落各命令（fingerprint/stability-audit/版本/digest/audit/last-good），用户要判断
# "本体论依赖是否完整"须跑多个命令——本脚本一站式汇总，输出六锚健康报告。
#
# 用法:
#   bash ontology-verify.sh <PROJECT_DIR> [--skill-dir <dir>]
# 退出码: 0 正常（advisory 性质，失配不阻断——本体口径是体检不是门禁）；1 arg 错误。
set -uo pipefail
PROJ=""; SKILL_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skill-dir) SKILL_DIR="${2:?--skill-dir 需要路径}"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) [[ -z "$PROJ" ]] && PROJ="$1" || { echo "未知参数: $1" >&2; exit 1; }; shift ;;
  esac
done
[[ -n "$PROJ" && -d "$PROJ" ]] || { echo "✗ PROJECT_DIR 缺失或不存在: ${PROJ:-（空）}" >&2; exit 1; }
PROJ=$(cd "$PROJ" && pwd)
BASE="$(cd "$(dirname "$0")" && pwd)"
[[ -z "$SKILL_DIR" && -f "$PROJ/../SKILL.md" ]] && SKILL_DIR="$PROJ/.."

echo "## 本体论健康检查（六锚一站式）—— project=${PROJ}"
_ok()  { echo "  ✓ $1"; }
_bad() { echo "  ⚠ $1"; }

# 锚1：地图↔仓库的特定依赖（表征时效）
FP="$PROJ/.swarm-yuan/project-fingerprint"
if [[ ! -f "$FP" ]]; then
  _bad "Fingerprint 快照不存在（地图↔仓库依赖未锚定）——先跑 project-fingerprint.sh --write 落基线"
else
  out=$(bash "$BASE/project-fingerprint.sh" "$PROJ" --diff 2>&1)
  if printf '%s' "$out" | grep -q '无变化'; then
    _ok "地图↔仓库（Fingerprint）：快照与当前仓库一致（表征时效锚定）"
  else
    scope=$(printf '%s' "$out" | grep -cE '^\s+[~+-] ' || true)
    _ok "地图↔仓库（Fingerprint）：仓库已变化（${scope} 个 scope 变更）——按 SKILL.md 自成长段走更新链后 --write 落新基线"
  fi
fi

# 锚2：标注↔组件倾向（稳定性依赖）
if [[ -n "$SKILL_DIR" && -f "$SKILL_DIR/references/reference-manual.md" ]]; then
  out=$(bash "$BASE/inventory-verify.sh" "$PROJ" --skill-dir "$SKILL_DIR" --tsv --stability-audit 2>&1) || true
  sw=$(printf '%s' "$out" | grep -c '^STABILITY_WARN' || true)
  if [[ "${sw:-0}" -eq 0 ]]; then
    _ok "标注↔组件倾向（stability-audit）：稳定性标注与 churn/fan-in/测试三信号无冲突"
  else
    _bad "标注↔组件倾向：${sw} 处 STABILITY_WARN（标注与机械信号矛盾——复核稳定性标注）"
  fi
else
  _bad "stability-audit 跳过（skill-dir 或 reference-manual.md 缺失）"
fi

# 锚3：生成物↔生成器（类依赖/版本）
if [[ -n "$SKILL_DIR" && -f "$SKILL_DIR/.swarm-yuan-version" ]]; then
  _ok "生成物↔生成器（版本戳）：$(head -2 "$SKILL_DIR/.swarm-yuan-version" | tr '\n' ' ')"
else
  _bad "版本戳缺失（.swarm-yuan-version 不存在——生成物↔生成器依赖未锚定，--upgrade 溯源将失效）"
fi

# 锚4：decisions↔trace 链式依赖（digest 锚）
# 旧实现只比"decisions 末行 ref vs trace 当前末行"——决策后正常追加 trace 即系统性误报，
# 且篡改任何非末行永不检出。新语义（与写入端对齐）：每条带锚 decisions 行的 ref_trace_hash
# 必须能在 trace.jsonl 中解析到具体行（存在性——被引用行遭篡改则 cksum 变、解析失败），
# 且解析位置须随 decisions 行序单调不减（顺序性）；任一失败即"全链自该点 stale"。
DEC="$PROJ/.swarm-yuan/decisions.jsonl"; TR="$PROJ/.swarm-yuan/trace.jsonl"
if [[ -f "$DEC" && -f "$TR" ]]; then
  _tr_cksum="${TMPDIR:-/tmp}/ov-tr-cksum.$$"
  _dec_anchors="${TMPDIR:-/tmp}/ov-dec-anchors.$$"
  : > "$_tr_cksum"
  while IFS= read -r _tl; do
    printf '%s' "$_tl" | cksum | awk '{print $1}' >> "$_tr_cksum"
  done < "$TR"
  grep -nE '"ref_trace_hash":"[^"]+"' "$DEC" | sed -n 's/^\([0-9][0-9]*\):.*"ref_trace_hash":"\([^"]*\)".*/\1 \2/p' > "$_dec_anchors"
  _total_dec=$(wc -l < "$DEC" | tr -d ' ')
  _anchored=$(wc -l < "$_dec_anchors" | tr -d ' ')
  _legacy=$((_total_dec - _anchored))
  _pos=0; _stale_at=""; _resolved=0
  while read -r _dln _dh; do
    [[ -n "${_dln:-}" && -n "${_dh:-}" ]] || continue
    _found=$(awk -v h="$_dh" -v p="$_pos" 'NR>p && $1==h {print NR; exit}' "$_tr_cksum")
    if [[ -z "$_found" ]]; then
      _stale_at="decisions 第 ${_dln} 行（锚 ${_dh} 在 trace 中无解）"
      break
    fi
    _pos="$_found"; _resolved=$((_resolved+1))
  done < "$_dec_anchors"
  if [[ -n "$_stale_at" ]]; then
    _bad "decisions↔trace（digest 链）：失配——${_stale_at}；被引用的 trace 行遭篡改或丢失，全链自该点 stale"
  elif [[ "$_anchored" -eq 0 ]]; then
    _ok "decisions↔trace（digest 链）：无锚定行（${_legacy} 行均为锚定引入前旧行/写入时无 trace——非失配）"
  else
    _ok "decisions↔trace（digest 链）：${_resolved}/${_anchored} 锚定行解析且顺序一致（另 ${_legacy} 行旧式无锚）"
  fi
  rm -f "$_tr_cksum" "$_dec_anchors"
else
  _bad "digest 链跳过（decisions.jsonl 或 trace.jsonl 不存在）"
fi

# 锚5：账本↔过程（配对审计）
GA="$PROJ/.swarm-yuan/gate-audit.jsonl"
if [[ -f "$GA" ]]; then
  n=$(wc -l < "$GA" | tr -d ' ')
  _ok "账本↔过程（gate-audit）：${n} 行决策审计（invoked/result 单行自包含）"
else
  _ok "账本↔过程（gate-audit）：无审计文件（hooks 未启用拦截=休眠态，正常）"
fi

# 锚6：好基线反事实保护（last-good 红线状态）
if [[ -f "$FP" ]]; then
  total=$(sed -n 's/^total=\([0-9]*\).*/\1/p' "$FP" | head -1)
  _ok "last-good 红线：当前基线 total=${total}（骤降 >50% 时 --write 将拒绝并要求 --force）"
fi

echo "→ 六锚语义详见 swarm-yuan/README.md 三章 How · 3.8 完备性（本体论驱动——每条依赖的断裂可检测点）"
exit 0
