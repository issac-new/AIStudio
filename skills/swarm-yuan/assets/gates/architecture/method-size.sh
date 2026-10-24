# gate: method-size
# domain: architecture / enforce: advisory / tier: arch
check_method_size() {
  echo "=== 方法粒度检查（单方法行数上限）==="
  local max_lines="${METHOD_MAX_LINES:-60}"
  local scan_dirs="${WRITABLE_DIRS[*]:-}"
  if [[ -z "$scan_dirs" ]]; then
    skip_if_unconfigured "WRITABLE_DIRS 未配置，方法粒度检查跳过"
    return
  fi
  local found=0 _dir _f
  for _dir in $scan_dirs; do
    [[ -d "${PROJECT_DIR:-.}/${_dir}" ]] || continue
    while IFS= read -r _f; do
      [[ -f "$_f" ]] || continue
      # awk：匹配函数起始行模式，到下一个起始或 EOF 计行数，超阈值输出
      awk -v max="$max_lines" -v file="$_f" '
        /^[[:space:]]*(public |private |protected |static |def |func |function |[a-zA-Z_][a-zA-Z0-9_]*\s*\()/ {
          if (start > 0 && NR - start > max) printf "%s:%d 方法起始于第 %d 行，长度 %d 行 > 上限 %d\n", file, NR, start, NR-start, max
          start = NR
        }
        END { if (start > 0 && NR - start > max) printf "%s:%d 方法起始于第 %d 行，长度 %d 行 > 上限 %d\n", file, NR, start, NR-start, max }
      ' "$_f" 2>/dev/null
    done < <(find "${PROJECT_DIR:-.}/${_dir}" -type f \( -name '*.java' -o -name '*.py' -o -name '*.go' -o -name '*.js' -o -name '*.ts' -o -name '*.kt' \) \
      -not -path '*/node_modules/*' -not -path '*/target/*' -not -path '*/dist/*' -not -path '*/build/*' \
      -not -path '*/vendor/*' -not -path '*/.venv/*' -not -path '*/venv/*' 2>/dev/null | head -200)
  done | while IFS= read -r _line; do
    [[ -n "$_line" ]] && warn "$_line"
  done
  # 汇总（子管道内 warn 计数不进主 shell——此处只决定 pass/fail 出口）
  local _big
  _big=$(for _dir in $scan_dirs; do
    [[ -d "${PROJECT_DIR:-.}/${_dir}" ]] || continue
    find "${PROJECT_DIR:-.}/${_dir}" -type f \( -name '*.java' -o -name '*.py' -o -name '*.go' -o -name '*.js' -o -name '*.ts' -o -name '*.kt' \) \
      -not -path '*/node_modules/*' -not -path '*/target/*' -not -path '*/dist/*' -not -path '*/build/*' \
      -not -path '*/vendor/*' -not -path '*/.venv/*' -not -path '*/venv/*' 2>/dev/null | head -200 | while read -r _f; do
      awk -v max="$max_lines" 'BEGIN{s=0;c=0} /^[[:space:]]*(public |private |protected |static |def |func |function |[a-zA-Z_][a-zA-Z0-9_]*\s*\()/ {if(s>0&&NR-s>max)c++; s=NR} END{if(s>0&&NR-s>max)c++; print c+0}' "$_f" 2>/dev/null
    done
  done | awk '{s+=$1} END{print s+0}')
  if [[ "${_big:-0}" -gt 0 ]]; then
    warn "发现 ${_big} 个方法超 ${max_lines} 行（METHOD_MAX_LINES）——拆分职责或抽子方法"
  else
    pass "方法粒度达标（无超 ${max_lines} 行方法）"
  fi
}
