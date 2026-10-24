#!/usr/bin/env bash
# detect-profile-drift.sh — 运行时探测 profile 漂移
#
# 作用：重跑 auto_detect_profile 逻辑对比当前 SKILL.md frontmatter 的 profile 字段，
# 漂移则输出建议（只升不降，质量优先偏置）。
#
# 偏置规则（决策 18/22）：
#   - 合规信号新增（docs/README 出现等保/密评/个保法/金融/医疗关键词）→ 强制提示升 compliance
#   - 规模信号升档（文件数从 <80 涨到 ≥80）→ 提示升 standard
#   - 规模信号降档（文件数从 ≥80 降到 <80）→ 不提示降 lite（只升不降）
#   - 探测失败/边界不确定 → 不提示（保守不误报）
#
# 用法：
#   bash detect-profile-drift.sh <skill_dir> [project_dir]
#   project_dir 缺省：skill conf 的 PROJECT_DIR= → 旧推导（<project>/.claude/skills/<name> 布局限定）
#   退出码：0=无漂移或仅 warn（不阻塞）；1=参数错误
#
# 触发点：precheck.sh --all/--all-full 启动时（轻量调用，stderr 输出，不阻塞主流程）
#         self-check.sh check_profile_drift 子检查

set -uo pipefail

SKILL_DIR="${1:?Usage: detect-profile-drift.sh <skill_dir>}"
[[ -d "$SKILL_DIR" ]] || { echo "✗ skill_dir 不存在: $SKILL_DIR" >&2; exit 1; }

SKILL_MD="$SKILL_DIR/SKILL.md"
[[ -f "$SKILL_MD" ]] || { echo "ℹ 无 SKILL.md，跳过 profile 漂移检测" >&2; exit 0; }

# 读取当前 profile（frontmatter `profile:` 字段）
CURRENT_PROFILE=$(grep -E "^profile:" "$SKILL_MD" 2>/dev/null | head -1 | sed -E "s/^profile:[[:space:]]*//;s/[[:space:]]*$//")
[[ -z "$CURRENT_PROFILE" ]] && CURRENT_PROFILE="standard"  # 缺省视为 standard

# profile 档序（rank：lite=1 < standard=2 < compliance=3；auto 视为 standard 对比基准）
_profile_rank() { case "$1" in lite) echo 1;; compliance) echo 3;; *) echo 2;; esac; }

# 重跑 auto_detect_profile 逻辑（从 generate-skill.sh 移植；本脚本是运行时 advisory 子集——
# 合规关键词 + 规模两信号、只升不降，全量信号集以 generate-skill.sh:auto_detect_profile 为单一来源）
# 项目根解析三级回退——①显式第 2 参数（precheck.sh 调用点传入，
# 它从 conf 已知真值）②skill conf 的 PROJECT_DIR= ③旧推导 $SKILL_DIR/../../..（仅适配
# <project>/.claude/skills/<name> 布局；用户级安装 ~/.claude/skills/<name> 下旧推导会误扫 $HOME）。
PROJECT_DIR="${2:-}"
if [[ -z "$PROJECT_DIR" && -f "$SKILL_DIR/scripts/precheck.conf" ]]; then
  # 同族剥法：conf 行带 `# AUTO:detected` 溯源注释是 conf-render 固定形态，
  # 原剥法不切 # 尾注 → 路径带注释垃圾 → -d 校验失败静默跳过检测（降级未披露为"读到真值"）。
  # 对齐 generate-skill.sh 同族剥法（cut -d'#' -f1）；尾空格先于闭引号剥（对齐空格防 s/"$// 失配）。
  PROJECT_DIR=$(grep -m1 '^PROJECT_DIR=' "$SKILL_DIR/scripts/precheck.conf" 2>/dev/null \
    | cut -d'#' -f1 | sed 's/^PROJECT_DIR=//;s/[[:space:]]*$//;s/^"//;s/"$//' || true)
fi
[[ -z "$PROJECT_DIR" ]] && PROJECT_DIR=$(cd "$SKILL_DIR/../../.." 2>/dev/null && pwd)
[[ -n "$PROJECT_DIR" && -d "$PROJECT_DIR" ]] || { echo "ℹ 无法推导项目根目录，跳过 profile 漂移检测" >&2; exit 0; }

# 阈值与生成器单一来源对齐（同款 source；缺 conf 走默认 80）
_pthr="$SKILL_DIR/assets/profile-thresholds.conf"
[[ -f "$_pthr" ]] && { set +u; source "$_pthr"; set -u; }
_lite_max=${PROFILE_LITE_MAX_FILES:-80}

# 自扫守卫（impl-conformance，关闭 DESIGN §11 已知边界①）：扫描目标是 swarm-yuan 生成器仓自身
# （repo 根或其 worktree——同布局）时，仓内 README/行业 profile 文档天然含合规关键词，
# 会误报"应升 compliance"。生成器仓的 profile 由自举 conf 显式管理，跳过探测。
if [[ -f "$PROJECT_DIR/swarm-yuan/assets/facts.conf" ]] || \
   { [[ -f "$PROJECT_DIR/assets/facts.conf" ]] && [[ -f "$PROJECT_DIR/scripts/generate-skill.sh" ]]; }; then
  echo "ℹ 扫描目标是 swarm-yuan 生成器仓自身（或其 worktree），跳过 profile 漂移检测（防自扫误报）" >&2
  exit 0
fi

# 合规信号（最强，命中即 compliance）
COMPLIANCE_KW="等保|密评|GB/T[[:space:]]*39786|GB/T[[:space:]]*22239|个人信息保护|个保法|金融行业|医疗行业"
sig=$(grep -rliE "$COMPLIANCE_KW" "$PROJECT_DIR/docs" "$PROJECT_DIR"/README* 2>/dev/null | head -1 || true)
if [[ -n "$sig" ]]; then
  DETECTED_PROFILE="compliance"
  DRIFT_REASON="命中合规信号（${sig#"$PROJECT_DIR"/}）"
else
  # 规模信号：文件数（head 截断加速，≥${_lite_max} 即 standard；统计失败按 standard——升档偏置）
  n=$(find "$PROJECT_DIR" -type f -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/dist/*' \
      -not -path "*/.venv/*" -not -path "*/venv/*" -not -path "*/site-packages/*" -not -path "*/__pycache__/*" -not -path "*/.tox/*" \
      2>/dev/null | head -$((_lite_max+1)) | wc -l | tr -d ' ')
  n="${n:-$((_lite_max+1))}"
  [[ "$n" =~ ^[0-9]+$ ]] || n=$((_lite_max+1))
  if [[ "$n" -lt "$_lite_max" ]]; then
    DETECTED_PROFILE="lite"
    DRIFT_REASON="规模信号：文件数 ${n}（<${_lite_max} → lite）"
  else
    DETECTED_PROFILE="standard"
    DRIFT_REASON="规模信号：文件数 ${n}（≥${_lite_max} → standard）"
  fi
fi

# 漂移判定（只升不降）
_current_rank=$(_profile_rank "$CURRENT_PROFILE")
_detected_rank=$(_profile_rank "$DETECTED_PROFILE")

if [[ "$DETECTED_PROFILE" == "$CURRENT_PROFILE" ]]; then
  exit 0  # 无漂移
fi

if [[ $_detected_rank -gt $_current_rank ]]; then
  # 升档漂移：提示
  echo "⚠ profile 漂移：当前 ${CURRENT_PROFILE} → 探测 ${DETECTED_PROFILE}（${DRIFT_REASON}）" >&2
  echo "  建议升级：bash generate-skill.sh --upgrade --profile ${DETECTED_PROFILE} <name> <project>" >&2
  echo "  （质量优先偏置：只升不降；探测为降档时不提示）" >&2
  exit 0  # warn 不阻塞
fi

# 降档不提示（只升不降），静默退出
exit 0
