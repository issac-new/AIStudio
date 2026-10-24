#!/usr/bin/env bash
# profile-threshold-survey.sh —— GitHub 开源仓库抽样统计项目规模分布
# 用途：为 auto_detect_profile 的 lite/standard 阈值提供数据依据（决策 18 修订）
#
# 样本分层（按语言/规模）：
#   - 小工具库 10（CLI 工具、小脚本库）
#   - 中型 SaaS 15（Web 应用、API 服务）
#   - 大型框架 10（知名开源框架）
#   - monorepo 5（多包仓库）
#
# 统计指标：文件数(排除 .git/node_modules/dist) / 依赖数 / 目录深度 / 主语言
# 输出：docs/profile-threshold-survey.csv + 计算 P33/P67 写入 assets/profile-thresholds.conf
set -u

BASE="$(cd "$(dirname "${0}")/.." && pwd)"
OUT_CSV="${BASE}/../docs/profile-threshold-survey.csv"
OUT_CONF="${BASE}/assets/profile-thresholds.conf"

# 样本仓库清单（owner/repo 格式，按分层组织）
# 小工具库（CLI/脚本库，预期 <100 文件）
SMALL_REPOS=(
  "jidrun/jid"          # Go CLI
  "pemistahl/trafgen"   # 占位，实际用 gh search 取
)

# 用 gh search repos 取样本（避免硬编码清单）
echo "=== 取样：小工具库（stars:50..500，size < 5MB）==="
gh search repos --language=go --stars=50..500 --limit=10 --json nameWithOwner 2>/dev/null | grep -oE '"[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+"' | tr -d '"' | head -10 > /tmp/survey-small.txt
gh search repos --language=python --stars=50..500 --limit=5 --json nameWithOwner 2>/dev/null | grep -oE '"[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+"' | tr -d '"' | head -5 >> /tmp/survey-small.txt

echo "=== 取样：中型 SaaS（stars:500..5000，size 5..50MB）==="
gh search repos --language=typescript --stars=500..5000 --limit=10 --json nameWithOwner 2>/dev/null | grep -oE '"[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+"' | tr -d '"' | head -10 > /tmp/survey-medium.txt
gh search repos --language=java --stars=500..5000 --limit=5 --json nameWithOwner 2>/dev/null | grep -oE '"[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+"' | tr -d '"' | head -5 >> /tmp/survey-medium.txt

echo "=== 取样：大型框架（stars:>5000）==="
gh search repos --language=javascript --stars=">5000" --limit=10 --json nameWithOwner 2>/dev/null | grep -oE '"[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+"' | tr -d '"' | head -10 > /tmp/survey-large.txt

echo "=== 取样：monorepo（lerna.json/pnpm-workspace）==="
gh search code "filename:lerna.json" --limit=5 --json repository 2>/dev/null | grep -oE '"[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+"' | tr -d '"' | head -5 > /tmp/survey-mono.txt || true

# 合并样本
cat /tmp/survey-{small,medium,large,mono}.txt 2>/dev/null | grep -v '^$' | sort -u > /tmp/survey-all.txt
_total=$(wc -l < /tmp/survey-all.txt | tr -d ' ')
echo "=== 共 ${_total} 个样本 ==="

# 统计每个仓库
echo "repo,file_count,dep_count,dir_depth,main_lang" > "$OUT_CSV"
_tmpdir="$(mktemp -d /tmp/survey.XXXXXX)"
_i=0
while IFS= read -r repo; do
  [[ -z "$repo" ]] && continue
  _i=$((_i+1))
  echo -n "[$_i/$_total] $repo ... "
  # clone --depth 1
  if ! git clone --depth 1 "https://github.com/$repo.git" "$_tmpdir/$(basename "$repo")" 2>/dev/null; then
    echo "SKIP (clone failed)"
    continue
  fi
  _p="$_tmpdir/$(basename "$repo")"
  # 文件数（排除 .git/node_modules/dist/build）
  _fc=$(find "$_p" -type f -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path "*/.venv/*" -not -path "*/venv/*" -not -path "*/site-packages/*" -not -path "*/__pycache__/*" -not -path "*/.tox/*" 2>/dev/null | wc -l | tr -d ' ')
  # 依赖数（package.json dependencies + devDependencies 子键数）
  _dc=0
  if [[ -f "$_p/package.json" ]]; then
    _dc=$(grep -A 9999 '"dependencies"' "$_p/package.json" 2>/dev/null | grep -cE '^\s+"[^"]+":\s' || echo 0)
    _dc=$((_dc + $(grep -A 9999 '"devDependencies"' "$_p/package.json" 2>/dev/null | grep -cE '^\s+"[^"]+":\s' || echo 0)))
  fi
  # 目录深度
  _dd=$(find "$_p" -type d -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/.venv/*' -not -path '*/venv/*' -not -path '*/site-packages/*' -not -path '*/__pycache__/*' -not -path '*/.tox/*' 2>/dev/null | wc -l | tr -d ' ')
  # 主语言
  _ml=$(gh api "repos/$repo" --jq .language 2>/dev/null || echo "?")
  echo "$_fc files, $_dc deps, $_dd dirs, $_ml"
  echo "$repo,$_fc,$_dc,$_dd,$_ml" >> "$OUT_CSV"
  rm -rf "$_p"
done < /tmp/survey-all.txt

rm -rf "$_tmpdir"

# 计算 P33/P67 分位数（文件数）
echo ""
echo "=== 统计结果 ==="
_total=$(tail -n +2 "$OUT_CSV" | wc -l | tr -d ' ')
if [[ "$_total" -lt 10 ]]; then
  echo "⚠ 样本不足 $_total 个(<10)，用默认阈值"
  _p33=80; _p67=400
else
  # 排序取分位数
  _p33=$(tail -n +2 "$OUT_CSV" | cut -d, -f2 | sort -n | awk -v n="$_total" 'NR==int(n*0.33)+1{print; exit}')
  _p67=$(tail -n +2 "$OUT_CSV" | cut -d, -f2 | sort -n | awk -v n="$_total" 'NR==int(n*0.67)+1{print; exit}')
  _p33="${_p33:-80}"; _p67="${_p67:-400}"
fi
echo "P33 (lite 上限): $_p33 文件"
echo "P67 (standard 上限): $_p67 文件"

# 生成 profile-thresholds.conf
{
  echo "# profile-thresholds.conf —— auto_detect_profile 阈值配置（决策 18 修订）"
  echo "# 由 scripts/profile-threshold-survey.sh 统计生成（$(date -u +%Y-%m-%d)，样本 $_total 个）"
  echo "# 用户可按项目类型调整。偏置修正：信号明确才升档，模糊走默认 standard。"
  echo "#"
  echo "# 阈值：文件数 P33/P67 分位数（样本统计），用户可按项目类型微调"
  echo "PROFILE_LITE_MAX_FILES=$_p33"
  echo "PROFILE_STANDARD_MAX_FILES=$_p67"
  echo "# 依赖数阈值（package.json dependencies + devDependencies 子键数）"
  echo "PROFILE_LITE_MAX_DEPS=20"
  echo "# monorepo 标志文件存在时一律 standard（不降 lite）"
  echo "PROFILE_MONOREPO_FORCE_STANDARD=1"
  echo "# 技术栈复杂度阈值"
  echo "PROFILE_FORMS_THRESHOLD=3        # 形态数 ≥3 → standard"
  echo "PROFILE_FRAMEWORKS_THRESHOLD=20  # 框架数 ≥20 → standard"
} > "$OUT_CONF"

echo ""
echo "✓ 生成 ${OUT_CSV}（${_total} 个样本）"
echo "✓ 生成 ${OUT_CONF}（P33=${_p33} / P67=${_p67}）"
