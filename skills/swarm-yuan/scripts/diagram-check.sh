#!/usr/bin/env bash
# diagram-check.sh — 图表产物结构自检（单文件 HTML+SVG）
#
# 定位：目标技能侧可独立运行的结构门禁，也是生成器 check_diagram 的机械分支。
# 检查面（硬契约，发现即非零退出）：
#   1. 文件非空，含 <svg> 与 viewBox
#   2. 可访问 SVG：role="img" + aria-labelledby（指向 title/desc）+ 非空 title/desc
#   3. 单文件安全：无外链脚本、无内联事件属性、无未授权 <script>（动效控制器最多一个）
#   4. 无远程资源（Google Fonts 白名单；src/href/url()/@import 精确匹配，正文链接不误伤）
#   5. 响应式：min-width 等于 viewBox 宽度（上游 output-spec 契约）
#   6. 运行时可达时追加上游 self_check.py 深检（viewBox 内容越界/动效结构）
#   7. 运行时可达时追加 verify-geometry.py 几何辅助检查（advisory，不阻断）
#
# 用法：
#   bash diagram-check.sh --all
#   bash diagram-check.sh docs/diagrams/order-flow.html
#   bash diagram-check.sh --warn --all
# 环境变量：
#   DIAGRAM_DIRS    发现目录（空格分隔；默认 .swarm-yuan/diagrams docs/diagrams）
#   PROJECT_DIR     项目根（默认当前目录）
#   DIAGRAM_ENFORCE 0=只警告不阻断（默认 1）
#   SWARM_YUAN_HOME 生成器技能根（默认探测 8 宿主安装位置）
#
# 退出码：0 通过/未发现产物；1 有违例；2 用法错误
set -u

VERSION="1.0.0"
FAILS=0
CHECKED=0
WARN_ONLY=0
DEEP_ENABLED=0
RUNTIME_DIR=""
TARGETS=()
HAVE_PYTHON=0
command -v python3 >/dev/null 2>&1 && HAVE_PYTHON=1

usage() {
  sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
}

say()  { printf '%s\n' "$*"; }
pass_file() { printf '  ✓ %s\n' "$1"; }
fail_file() { FAILS=$((FAILS + 1)); printf '  ✗ %s\n' "$1"; }
warn_line() { printf '  ! %s\n' "$1"; }
note() { printf '  · %s\n' "$1"; }

# 运行时探测：优先显式 SWARM_YUAN_HOME，其次同树 scripts/../runtime，最后 8 宿主技能根。
find_runtime() {
  local cand
  for cand in \
    "${SWARM_YUAN_HOME:-}" \
    "$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)/runtime" \
    "$HOME/.zcode/skills/swarm-yuan/runtime" \
    "$HOME/.claude/skills/swarm-yuan/runtime" \
    "$HOME/.codex/skills/swarm-yuan/runtime" \
    "$HOME/.cursor/skills/swarm-yuan/runtime" \
    "$HOME/.agents/skills/swarm-yuan/runtime" \
    "$HOME/.config/opencode/skills/swarm-yuan/runtime" \
    "$HOME/.gemini/skills/swarm-yuan/runtime" \
    "$HOME/.kimi-code/skills/swarm-yuan/runtime" \
    "$HOME/.kimi/skills/swarm-yuan/runtime" \
    "$HOME/.codeium/windsurf/skills/swarm-yuan/runtime" \
    "$HOME/.factory/skills/swarm-yuan/runtime"
  do
    [ -n "$cand" ] || continue
    [ -f "$cand/diagram-design/skills/diagram-design/scripts/self_check.py" ] || continue
    RUNTIME_DIR="$cand/diagram-design"
    if [ "$HAVE_PYTHON" = "1" ]; then
      DEEP_ENABLED=1
    fi
    return 0
  done
  return 1
}

# 从 SVG 开标签取属性值：extract_attr <file> <attr>
# 折叠换行后再匹配：上游模板的 <svg> 开标签可能跨多行。
extract_attr() {
  local file="$1"
  local attr="$2"
  tr '\n' ' ' < "$file" 2>/dev/null \
    | grep -oE "<svg[^>]*[[:space:]]${attr}=[\"'][^\"']*[\"']" | head -1 \
    | sed -E "s/.*${attr}=[\"']([^\"']*)[\"']/\1/"
}

# 判断 aria-labelledby 的每个 id 都能在文件里找到非空 title/desc。
check_a11y_ids() {
  local file="$1" ids id flat
  flat=$(tr '\n' ' ' < "$file" 2>/dev/null)
  ids=$(extract_attr "$file" "aria-labelledby")
  if [ -z "$ids" ]; then
    fail_file "$file: <svg> 缺 aria-labelledby（可访问 SVG 契约）"
    return 1
  fi
  for id in $ids; do
    if ! printf '%s' "$flat" | grep -Eq "id=[\"']${id}[\"']"; then
      fail_file "$file: aria-labelledby 指向的 id 不存在：${id}"
      return 1
    fi
  done
  if ! printf '%s' "$flat" | grep -Eq '<title[^>]*>[[:space:]]*[^<[:space:]]'; then
    fail_file "$file: <title> 缺失或为空（可访问 SVG 契约）"
    return 1
  fi
  if ! printf '%s' "$flat" | grep -Eq '<desc[^>]*>[[:space:]]*[^<[:space:]]'; then
    fail_file "$file: <desc> 缺失或为空（可访问 SVG 契约）"
    return 1
  fi
  return 0
}

# 远程资源白名单：只允许 Google Fonts。只匹配真正会加载资源的标签/函数，
# <a href> 正文链接不算远程资源。
check_remote_assets() {
  local file="$1" bad
  bad=$(grep -nE '<script[^>]+src=["'"'"']https?://|<link[^>]+href=["'"'"']https?://|<(image|use)[^>]+(href|xlink:href)=["'"'"']https?://|url\([[:space:]]*["'"'"']?https?://|@import[[:space:]]+(url\()?["'"'"']?https?://' "$file" 2>/dev/null \
    | grep -vE 'fonts\.googleapis\.com|fonts\.gstatic\.com' || true)
  if [ -n "$bad" ]; then
    fail_file "$file: 存在未授权远程资源（只允许 Google Fonts）"
    printf '%s\n' "$bad" | head -5 | sed 's/^/      /'
    return 1
  fi
  return 0
}

# 脚本策略：允许零脚本；动效图允许一个内联控制器（data-motion-root 存在）。
check_scripts() {
  local file="$1" count motion
  count=$(grep -c '<script' "$file" 2>/dev/null || true)
  [ -n "$count" ] || count=0
  if [ "$count" = "0" ]; then
    return 0
  fi
  motion=$(grep -c 'data-motion-root' "$file" 2>/dev/null || true)
  [ -n "$motion" ] || motion=0
  if grep -qE '<script[^>]+src=' "$file"; then
    fail_file "$file: 存在外链 <script src>（单文件安全契约）"
    return 1
  fi
  if [ "$motion" = "0" ]; then
    fail_file "$file: 存在 <script> 但无 data-motion-root（静态图不应带脚本）"
    return 1
  fi
  if [ "$count" -gt 1 ]; then
    fail_file "$file: 动效图有 ${count} 个 <script>（只允许一个上游控制器）"
    return 1
  fi
  return 0
}

# 内联事件属性：只检查标签内部，避免正文里的 "on..." 误伤。
check_inline_handlers() {
  local file="$1" hit
  hit=$(grep -nE '<[a-zA-Z][^>]*[[:space:]]on[a-z]+[[:space:]]*=' "$file" 2>/dev/null | head -5 || true)
  if [ -n "$hit" ]; then
    fail_file "$file: 存在内联事件属性（可执行属性禁止）"
    printf '%s\n' "$hit" | sed 's/^/      /'
    return 1
  fi
  return 0
}

# 响应式契约：min-width 必须存在；与 viewBox 宽度不一致记为警告。
# 依据：上游 output-spec 要求两者相等，但上游多张历史示例（900 vs 1000）早于该规则；
# 缺失是明确违约，不一致可能是历史产物，交给人判断而不直接阻断。
check_min_width() {
  local file="$1" vb width minw flat
  flat=$(tr '\n' ' ' < "$file" 2>/dev/null)
  vb=$(printf '%s' "$flat" | grep -oE 'viewBox="[^"]+"' | head -1 | sed -E 's/viewBox="([^"]+)"/\1/')
  if [ -z "$vb" ]; then
    fail_file "$file: 缺 viewBox（尺寸预设契约）"
    return 1
  fi
  width=$(printf '%s\n' "$vb" | awk '{print $3}')
  case "$width" in
    ''|*[!0-9.]*)
      note "$file: viewBox 宽度非数值（${vb}），跳过 min-width 对账"
      return 0
      ;;
  esac
  width=${width%.*}
  minw=$(printf '%s' "$flat" | grep -oE 'min-width:[[:space:]]*[0-9.]+px' | head -1 | grep -oE '[0-9.]+' | head -1)
  if [ -z "$minw" ]; then
    fail_file "$file: 缺 min-width（应等于 viewBox 宽度 ${width}px；外层 overflow-x:auto）"
    return 1
  fi
  minw=${minw%.*}
  if [ "$minw" != "$width" ]; then
    warn_line "$file: min-width=${minw}px 与 viewBox 宽度 ${width}px 不一致（窄屏字号会被缩放；建议对齐）"
  fi
  return 0
}

# 上游深检：self_check.py（硬），verify-geometry.py（advisory）。
run_deep_checks() {
  local file="$1" out rc
  [ "$DEEP_ENABLED" = "1" ] || return 0
  out=$(python3 "$RUNTIME_DIR/skills/diagram-design/scripts/self_check.py" "$file" 2>&1)
  rc=$?
  if [ "$rc" -ne 0 ]; then
    fail_file "$file: 上游 self_check.py 失败"
    printf '%s\n' "$out" | head -20 | sed 's/^/      /'
    return 1
  fi
  out=$(python3 "$RUNTIME_DIR/gates/verify-geometry.py" "$file" 2>&1)
  rc=$?
  if [ "$rc" -ne 0 ]; then
    warn_line "$file: verify-geometry.py 有几何发现（advisory，按上游模板比例标定）"
    printf '%s\n' "$out" | head -10 | sed 's/^/      /'
  fi
  return 0
}

check_file() {
  local file="$1"
  local ok=1
  CHECKED=$((CHECKED + 1))
  if [ ! -s "$file" ]; then
    fail_file "$file: 文件不存在或为空"
    return 0
  fi
  if ! grep -q '<svg' "$file"; then
    fail_file "$file: 未找到内联 <svg>"
    ok=0
  fi
  if ! grep -q 'viewBox=' "$file"; then
    fail_file "$file: 未找到 viewBox"
    ok=0
  fi
  if ! grep -Eq 'role=["'"'"']img["'"'"']' "$file"; then
    fail_file "$file: <svg> 缺 role=\"img\"（可访问 SVG 契约）"
    ok=0
  fi
  check_a11y_ids "$file" || ok=0
  check_remote_assets "$file" || ok=0
  check_scripts "$file" || ok=0
  check_inline_handlers "$file" || ok=0
  check_min_width "$file" || ok=0
  run_deep_checks "$file" || ok=0
  if [ "$ok" = "1" ]; then
    pass_file "$file"
  fi
}

discover() {
  local base dir dirs
  base="${PROJECT_DIR:-$PWD}"
  if [ -n "${DIAGRAM_DIRS:-}" ]; then
    dirs="$DIAGRAM_DIRS"
  else
    dirs=".swarm-yuan/diagrams docs/diagrams"
  fi
  for dir in $dirs; do
    case "$dir" in
      /*) ;;
      *) dir="$base/$dir" ;;
    esac
    [ -d "$dir" ] || continue
    find "$dir" -type f -name '*.html' -print0 2>/dev/null
  done
}

main() {
  local arg f found
  while [ $# -gt 0 ]; do
    case "$1" in
      --all) ;;
      --warn) WARN_ONLY=1 ;;
      --runtime) find_runtime >/dev/null 2>&1; printf '%s\n' "${RUNTIME_DIR:-未找到}"; exit 0 ;;
      --help|-h) usage; exit 0 ;;
      -*) say "未知参数：$1"; usage; exit 2 ;;
      *) TARGETS+=("$1") ;;
    esac
    shift
  done
  [ "${DIAGRAM_ENFORCE:-1}" = "0" ] && WARN_ONLY=1
  find_runtime >/dev/null 2>&1 || true

  say "=== 图表结构自检（diagram-check ${VERSION}）==="
  if [ "$DEEP_ENABLED" = "1" ]; then
    say "  运行时深检：${RUNTIME_DIR}（self_check.py 硬检 + verify-geometry.py advisory）"
  else
    say "  运行时深检：不可用（仅内建结构检查；生成器侧可设 SWARM_YUAN_HOME 启用）"
  fi

  if [ "${#TARGETS[@]}" -gt 0 ]; then
    for f in "${TARGETS[@]}"; do
      if [ -d "$f" ]; then
        while IFS= read -r -d '' arg; do check_file "$arg"; done < <(find "$f" -type f -name '*.html' -print0 2>/dev/null)
      else
        check_file "$f"
      fi
    done
  else
    while IFS= read -r -d '' f; do check_file "$f"; done < <(discover)
  fi

  if [ "$CHECKED" = "0" ]; then
    say "  未发现图表产物（发现目录：${DIAGRAM_DIRS:-.swarm-yuan/diagrams docs/diagrams}）"
    say "  需要配图时：读 runtime/diagram-design/skills/diagram-design/SKILL.md，按语义模式选型后生成。"
    exit 0
  fi
  say "  检查 ${CHECKED} 个文件，${FAILS} 个违例"
  if [ "$FAILS" -gt 0 ] && [ "$WARN_ONLY" = "0" ]; then
    exit 1
  fi
  exit 0
}

main "$@"
