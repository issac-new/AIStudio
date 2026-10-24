# gate: cwe-audit
# domain: security / enforce: advisory / tier: compliance
check_cwe_audit() {
  echo "=== CWE 元数据库对账（--cwe-audit，advisory）==="
  local base="${PROJECT_DIR:-$(pwd)}"
  # 生成器自身：base=swarm-yuan/；目标 skill：base=项目根（references/cwe-database.md 拷贝自生成器）
  local cwe_db=""
  for cand in "$base/references/cwe-database.md" "$base/swarm-yuan/references/cwe-database.md"; do
    [[ -f "$cand" ]] && cwe_db="$cand" && break
  done
  if [[ -z "$cwe_db" ]]; then
    warn "cwe-database.md 不存在（CWE 元数据库未生成）"
    return 0
  fi
  local db_cwes
  db_cwes=$(grep -oE 'CWE-[0-9]+' "$cwe_db" | sort -u)
  local db_cnt; db_cnt=$(echo "$db_cwes" | grep -c . || true)
  echo "  cwe-database.md 登记条目: ${db_cnt} 条"

  # 收集仓库内所有 CWE 标注（框架规则 md + framework-gates + security-spec）
  local scan_dirs=()
  for d in "$base/references/frameworks" "$base/swarm-yuan/references/frameworks" "$base/references" "$base/swarm-yuan/references" "$base/assets/framework-gates" "$base/swarm-yuan/assets/framework-gates"; do
    [[ -d "$d" ]] && scan_dirs+=("$d")
  done
  local repo_cwes="" _found
  for d in ${scan_dirs[@]+"${scan_dirs[@]}"}; do
    _found=$(grep -rhoE 'CWE-[0-9]+' "$d"/*.md "$d"/*.sh 2>/dev/null || true)
    [[ -n "$_found" ]] && repo_cwes="${repo_cwes}${repo_cwes:+$'\n'}$_found"
  done
  # security-spec.md 也扫
  for f in "$base/references/security-spec.md" "$base/swarm-yuan/references/security-spec.md"; do
    [[ -f "$f" ]] && repo_cwes="${repo_cwes}${repo_cwes:+$'\n'}$(grep -oE 'CWE-[0-9]+' "$f" 2>/dev/null || true)"
  done
  repo_cwes=$(echo "$repo_cwes" | sort -u | grep . || true)
  local repo_cnt; repo_cnt=$(echo "$repo_cwes" | grep -c . || true)
  echo "  仓库内 CWE 标注（去重）: ${repo_cnt} 条"

  # 对账：仓库内有但数据库无 → 未登记
  local unregistered=0
  local cwe
  while IFS= read -r cwe; do
    [[ -z "$cwe" ]] && continue
    if ! echo "$db_cwes" | grep -qxF "$cwe"; then
      warn "CWE 未在 cwe-database.md 登记: $cwe"
      unregistered=$((unregistered + 1))
    fi
  done <<< "$repo_cwes"

  # 数据库有但仓库无 → 无检查点（孤儿条目）
  local orphans=0
  while IFS= read -r cwe; do
    [[ -z "$cwe" ]] && continue
    if ! echo "$repo_cwes" | grep -qxF "$cwe"; then
      orphans=$((orphans + 1))
    fi
  done <<< "$db_cwes"

  if [[ "$unregistered" -eq 0 && "$orphans" -eq 0 ]]; then
    pass "CWE 元数据库对账通过（${db_cnt} 条全登记 + 全有检查点，ISO 5055/GB 34943 对齐）"
  else
    [[ "$unregistered" -gt 0 ]] && warn "${unregistered} 条 CWE 标注未在 cwe-database.md 登记"
    [[ "$orphans" -gt 0 ]] && echo "  ℹ ${orphans} 条 CWE 在数据库登记但仓库无标注（文档级锚点，非缺陷）"
  fi
}
