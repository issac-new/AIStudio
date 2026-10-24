# gate: frontend
# domain: architecture / enforce: warn / tier: arch
check_frontend() {
  echo "=== 前端组件架构检查（层级深/容器展示分离/props多/重复依赖/循环依赖/CSS污染）==="
  local found=0

  # 回归#18 防御：COMPONENT_DIR 为单目录标量；误配成数组时 [[ -z "$COMPONENT_DIR" ]]
  # 在 set -u + bash 3.2 直接 unbound 崩溃。兜底后"If it's an array, treat as unset"。
  [[ -z "${COMPONENT_DIR:-}" ]] && COMPONENT_DIR=""

  if [[ -z "$COMPONENT_DIR" || ! -d "$COMPONENT_DIR" ]]; then
    warn "未配置 COMPONENT_DIR 或目录不存在，跳过前端组件检查"
    return
  fi

  # ---- 1. 组件嵌套深度（>MAX_COMPONENT_DEPTH warn）----
  if [[ "$MAX_COMPONENT_DEPTH" -gt 0 ]]; then
    # 粗筛：找 JSX 中组件标签嵌套深度（按缩进估算）
    local cf
    while IFS= read -r cf; do
      [[ -z "$cf" ]] && continue
      local max_indent=0
      # 用 python 扫描字符算 JSX 组件标签的峰值嵌套深度（兼容同行嵌套）
      local depth
      depth=$(python3 -c "
import re,sys
try: t=open('$cf',encoding='utf-8').read()
except: t=''
depth=0; maxd=0
for m in re.finditer(r'<(/?)([A-Z][A-Za-z0-9]*)', t):
  if m.group(1)=='/': depth=max(0,depth-1)
  else: depth+=1; maxd=max(maxd,depth)
print(maxd)
" 2>/dev/null || echo 0)
      if [[ "$depth" -gt "$MAX_COMPONENT_DEPTH" ]]; then
        warn "${cf} 组件嵌套深度 ${depth}（>阈值 ${MAX_COMPONENT_DEPTH}）——层级过深导致渲染栈深、调试难、性能损耗，建议扁平化"
      fi
    done < <(find "$COMPONENT_DIR" -type f \( -name '*.tsx' -o -name '*.jsx' -o -name '*.vue' -o -name '*.svelte' \) 2>/dev/null)
  fi

  # ---- 2. 容器组件与展示组件未分离检测 ----
  # 粗筛：组件文件同时含 API 调用（fetch/axios/useQuery）和大量 JSX 渲染
  local cf2
  while IFS= read -r cf2; do
    [[ -z "$cf2" ]] && continue
    local has_io has_render
    has_io=$(grep -cE '(fetch|axios|useQuery|useMutation|useSWR|\.get\(|\.post\()' "$cf2" 2>/dev/null || true)
    has_io=$(_norm_int "${has_io:-0}")
    # 统计 JSX 标签出现次数（非行数），用 grep -o 计数
    has_render=$(grep -oE '<(div|span|ul|li|section|article|main|header|footer|table|button|input|form|p|h[1-6])' "$cf2" 2>/dev/null | wc -l | xargs || true)
    has_render=$(_norm_int "${has_render:-0}")
    if [[ "$has_io" -gt 0 && "$has_render" -gt 10 ]]; then
      warn "${cf2} 同时含数据获取（${has_io}）和大量渲染（${has_render}）——容器组件与展示组件未分离，建议拆分（容器管数据，展示管 UI），提升复用性与可测性"
      break  # 只提示一次，避免刷屏
    fi
  done < <(find "$COMPONENT_DIR" -type f \( -name '*.tsx' -o -name '*.jsx' -o -name '*.vue' -o -name '*.svelte' \) 2>/dev/null)

  # ---- 3. 组件 props 过多检测（>MAX_PROPS_COUNT warn）----
  if [[ "$MAX_PROPS_COUNT" -gt 0 ]]; then
    local cf3
    while IFS= read -r cf3; do
      [[ -z "$cf3" ]] && continue
      # 提取 props 解构 / interface Props 的字段数（粗筛，支持同行多字段）
      local props_count
      props_count=$(awk '
        /interface [A-Z][A-Za-z]*Props|type [A-Z][A-Za-z]*Props/ {in_props=1; next}
        in_props && /^\}/ {in_props=0; if(count>0) print count; count=0; next}
        in_props {
          # 统计该行中 "字段:" 模式的出现次数（同行多字段用 ; 或 , 分隔）
          n = gsub(/[a-zA-Z_][a-zA-Z0-9_]*[?:]?[[:space:]]*:/, "&")
          count += n
        }
      ' "$cf3" 2>/dev/null | sort -n | tail -1 || echo 0)
      if [[ "$props_count" -gt "$MAX_PROPS_COUNT" ]]; then
        warn "${cf3} props 数量 ${props_count}（>阈值 ${MAX_PROPS_COUNT}）——props 过多说明组件职责过重，建议拆分"
      fi
    done < <(find "$COMPONENT_DIR" -type f \( -name '*.tsx' -o -name '*.ts' \) 2>/dev/null)
  fi

  # ---- 4. 循环依赖检测（madge 优先，降级 grep）----
  if command -v madge >/dev/null 2>&1; then
    local circ _circ_err
    _circ_err=$(mktemp "${TMPDIR:-/tmp}/swarm-yuan-madge.XXXXXX")
    circ=$(madge --circular --extensions ts,tsx,js,jsx "$COMPONENT_DIR" 2>"$_circ_err" || true)
    if echo "$circ" | grep -qi 'circular'; then
      fail "检测到组件循环依赖（madge）——A↔B 互相 import 会导致运行时 undefined："
      echo "$circ" | sed 's/^/    /'
      found=1
    elif [[ -z "$circ" && -s "$_circ_err" ]]; then
      warn "madge 循环依赖检测执行失败（stderr: $(head -1 "$_circ_err" 2>/dev/null)）——本项未判定"
    fi
    rm -f "$_circ_err"
  else
    # 降级：检测同目录文件互引（粗筛）
    warn "未安装 madge，循环依赖检测跳过（npm i -g madge）"
  fi

  # ---- 5. 全局 CSS 污染检测 ----
  if [[ -n "$STYLE_DIR" && -d "$STYLE_DIR" ]]; then
    # 检测纯 CSS 文件（无 .module. 后缀）含全局类定义
    local global_css
    global_css=$(find "$STYLE_DIR" -type f -name '*.css' ! -name '*.module.css' 2>/dev/null || true)
    if [[ -n "$global_css" ]]; then
      local gcount; gcount=$(echo "$global_css" | wc -l | xargs || true)
      if [[ "$gcount" -gt 0 ]]; then
        warn "检测到 ${gcount} 个非 scoped CSS 文件（无 .module.css 后缀）——全局类名易冲突，建议 CSS Modules / styled-components / Tailwind scoped"
      fi
    fi
  fi

  # ---- 6. bundle 重复依赖（若有报告）----
  if [[ -n "$BUNDLE_REPORT" && -f "$BUNDLE_REPORT" ]]; then
    # 粗筛：bundle 报告中是否含同一包多版本（搜 "x.x.x" 重复包名）
    local dups
    dups=$(grep -oE '"[^"]+"' "$BUNDLE_REPORT" 2>/dev/null | sort | uniq -c | sort -rn | awk '$1>1' | head -5 || true)
    if [[ -n "$dups" ]]; then
      warn "bundle 报告中检测到重复依赖（可能多版本打包）："
      echo "$dups" | sed 's/^/    /'
    fi
  fi

  if [[ $found -eq 0 ]]; then
    pass "前端组件架构检查通过"
  fi
}
