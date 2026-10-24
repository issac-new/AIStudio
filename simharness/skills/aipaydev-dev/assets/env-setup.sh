#!/usr/bin/env bash
# env-setup.sh — 通用环境加载与资源检测脚本模板（由 swarm-yuan 生成器按项目定制）
# 对应材料 assets §1 加载开发环境 + §2 检测资源连接、工具权限
# 用法: bash env-setup.sh
# 生成目标技能时：
#   - 替换 RUNTIME_CHECKS 为项目实际运行时版本要求
#   - 替换 RESOURCE_CHECKS 为项目实际外部资源（无则清空）
#   - 替换 TOOL_CHECKS 为项目需要的工具

set -uo pipefail

FAIL=0
pass() { echo "  ✓ $1"; }
warn() { echo "  ⚠ $1"; }
fail() { echo "  ✗ $1"; FAIL=1; }

echo "=== 开发环境检测 ==="

# ===== 按项目定制：运行时版本 =====
# 示例：node>=23 / python>=3.11 / go>=1.22 / java>=17
# 生成时替换为项目实际要求，不需要的删掉

# 版本比较：have >= want ?（按 major.minor 数值逐段比，bash 3.2 / macOS 可移植，不依赖 sort -V）
ver_ge() {
  local have="$1" want="$2"
  local hmaj hmin wmaj wmin
  hmaj="${have%%.*}"; hmin="${have#*.}"; hmin="${hmin%%.*}"
  [[ "$hmin" == "$have" || -z "$hmin" ]] && hmin=0
  wmaj="${want%%.*}"; wmin="${want#*.}"; wmin="${wmin%%.*}"
  [[ "$wmin" == "$want" || -z "$wmin" ]] && wmin=0
  # 非数字兜底按 0 处理
  [[ "$hmaj" =~ ^[0-9]+$ ]] || hmaj=0
  [[ "$hmin" =~ ^[0-9]+$ ]] || hmin=0
  [[ "$wmaj" =~ ^[0-9]+$ ]] || wmaj=0
  [[ "$wmin" =~ ^[0-9]+$ ]] || wmin=0
  (( hmaj > wmaj )) && return 0
  (( hmaj == wmaj && hmin >= wmin )) && return 0
  return 1
}

check_runtime() {
  local name="$1" cmd="$2" min_ver="$3"
  if command -v "$cmd" &>/dev/null; then
    local ver_line ver
    ver_line=$("$cmd" --version 2>&1 | head -1)
    # 提取首个数字版本号（v23.0.0 → 23.0.0；openjdk version "17.0.1" → 17.0.1）
    ver=$(printf '%s\n' "$ver_line" | grep -oE '[0-9]+(\.[0-9]+)*' | head -1)
    if [[ -z "$ver" ]]; then
      warn "$name: ${ver_line}（无法解析版本号，要求 >= ${min_ver}，请人工确认）"
    elif ver_ge "$ver" "$min_ver"; then
      pass "$name: ${ver_line}（满足 >= ${min_ver}）"
    else
      fail "$name: ${ver_line}（版本过低，要求 >= ${min_ver}）"
    fi
  else
    fail "${name} 未安装（要求 >= ${min_ver}）"
  fi
}
check_runtime "Node.js" node "23.0.0"
# check_runtime "Python" python3 "3.11"
# check_runtime "Go" go "1.22"
# check_runtime "Java" java "17"
# check_runtime "Rust" rustc "1.75"

echo ""
echo "=== 工具权限检测 ==="
# ===== 按项目定制：所需工具 =====
check_tool() {
  local cmd="$1" label="$2"
  if command -v "$cmd" &>/dev/null; then
    pass "$label: $("$cmd" --version 2>&1 | head -1)"
  else
    warn "$label 未安装（部分功能受限）"
  fi
}
check_tool git "Git"
check_tool gh "GitHub CLI"
check_tool docker "Docker"
# check_tool psql "PostgreSQL CLI"
# check_tool redis-cli "Redis CLI"

echo ""
echo "=== 外部资源连通性检测 ==="
# ===== 按项目定制：外部资源（无则保留"无外部资源"）=====
# 数据库示例（生成时填入真实连接方式）：
# if command -v psql &>/dev/null; then
#   if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -p "$DB_PORT" -d "$DB_NAME" -c "SELECT 1" &>/dev/null; then
#     pass "数据库连接正常"
#   else
#     fail "数据库连接失败"
#   fi
# fi

# Redis 示例：
# if command -v redis-cli &>/dev/null; then
#   if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping &>/dev/null; then
#     pass "Redis 连接正常"
#   else
#     warn "Redis 连接失败"
#   fi
# fi

echo "  (按项目实际资源填充；无外部资源则标注)"
warn "外部资源检测需按项目定制（生成时填充或删除本段）"

echo ""
echo "=== 代码仓库状态检测 ==="
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
if [[ -d "$PROJECT_DIR/.git" ]]; then
  cd "$PROJECT_DIR" || exit 1
  pass "git 仓库: $(git branch --show-current 2>/dev/null || echo 'detached')"
  pass "工作树: $(git status --porcelain 2>/dev/null | wc -l | xargs) 个改动"
else
  warn "$PROJECT_DIR 不是 git 仓库"
fi

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo "✓ 环境检测通过"
  exit 0
else
  echo "✗ 环境检测未通过，请修复上述问题"
  exit 1
fi
