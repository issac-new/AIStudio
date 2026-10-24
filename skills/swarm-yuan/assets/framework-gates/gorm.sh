# ruleset: gorm  requires_conf: GORM_SRC_GLOBS
# gates: fw_gorm_n_plus_one(fail) fw_gorm_nested_transaction(warn) fw_gorm_soft_delete(warn) fw_gorm_conn_pool(fail) fw_gorm_dryrun_audit(warn) fw_gorm_model_convention(warn) fw_gorm_automigrate_prod(warn) fw_gorm_batch_insert(warn) fw_gorm_record_not_found(warn) fw_gorm_index(warn) fw_gorm_error_handling(warn) fw_gorm_association(warn) fw_gorm_naming(warn)
# harvested-from: P5 范例（2026-07-17），规律源自 GORM v1.25.x ~ v1.31.x 官方文档
_fw_gorm_check() {
  echo "  [gorm] GORM v1.25.x / v1.30.x / v1.31.x 框架规律"

  # ---------- 收集源文件清单（go + go.mod 统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${GORM_SRC_GLOBS[@]+"${GORM_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "gorm: GORM_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  local goarr=() modarr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.go) goarr+=("$f") ;;
      go.mod|go.sum) modarr+=("$f") ;;
    esac
  done

  # 代码正文过滤：调公共库 _fw_strip_comments_c_inline（C 系变体，多剥行内 /* */）

  local g ln

  # ====================================================================
  # fw_gorm_n_plus_one(fail)：for-range 循环内逐条查询无 Preload/Joins
  # ====================================================================
  local n1_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    local code
    code=$(_fw_strip_comments_c_inline "$g" 2>/dev/null)
    [[ -z "$code" ]] && continue
    # 命中 for ... range 循环行
    local forlines
    forlines=$(printf '%s\n' "$code" | grep -nE '\bfor[[:space:]]+.*,?[[:space:]]*range\b' || true)
    [[ -z "$forlines" ]] && continue
    # 文件级是否有 Preload/Joins
    local has_preload=0
    _fw_strip_comments_c_inline "$g" | grep -qE '\.Preload\(|\.Joins\(' && has_preload=1
    if [[ "$has_preload" -eq 0 ]]; then
      local bad_lines=""
      while IFS= read -r fl; do
        [[ -z "$fl" ]] && continue
        local lineno=${fl%%:*}
        local start=$lineno end=$((lineno + 20))
        local block
        block=$(printf '%s\n' "$code" | sed -n "${start},${end}p")
        # 循环体内含 db.First/Find/Where/Select 查询
        if printf '%s\n' "$block" | grep -qE '\.(First|Find|Where|Take|Last|Scan|Count)\('; then
          bad_lines="${bad_lines}${fl}
"
        fi
      done <<< "$forlines"
      [[ -n "$bad_lines" ]] && n1_bad="${n1_bad}${g}: for-range 循环内逐条查询且无 Preload/Joins:
${bad_lines}
"
    fi
  done
  _fw_report fail fw_gorm_n_plus_one "$n1_bad" "检出 for-range 内逐条查询无 Preload/Joins（N+1 查询，N 大时查询数线性膨胀）" "未检出 N+1 模式"

  # ====================================================================
  # fw_gorm_nested_transaction(warn)：手动 Begin 嵌套 / 无配对 Commit/Rollback
  # ====================================================================
  local begin_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    local code
    code=$(_fw_strip_comments_c_inline "$g" 2>/dev/null)
    [[ -z "$code" ]] && continue
    if printf '%s\n' "$code" | grep -qE '\.Begin\(\)'; then
      local has_commit=0 has_rollback=0
      printf '%s\n' "$code" | grep -qE '\.Commit\(\)' && has_commit=1
      printf '%s\n' "$code" | grep -qE '\.Rollback\(\)' && has_rollback=1
      if [[ "$has_commit" -eq 0 && "$has_rollback" -eq 0 ]]; then
        begin_bad="${begin_bad}${g}: Begin( 无配对 Commit/Rollback
"
      elif printf '%s\n' "$code" | grep -qE '\.Transaction\('; then
        # 同文件混用 Begin 与 Transaction，嵌套风险
        begin_bad="${begin_bad}${g}: Begin( 与 Transaction( 混用（嵌套手动 Begin 无 SavePoint）
"
      fi
    fi
  done
  _fw_report warn fw_gorm_nested_transaction "$begin_bad" "检出手动 Begin（嵌套无 SavePoint，须统一用 Transaction 闭包）" "未检出违规 Begin 嵌套"

  # ====================================================================
  # fw_gorm_soft_delete(warn)：软删除字段须 gorm.DeletedAt
  # ====================================================================
  local sd_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    local code
    code=$(_fw_strip_comments_c_inline "$g" 2>/dev/null)
    [[ -z "$code" ]] && continue
    # 含 DeletedAt 字段但类型非 gorm.DeletedAt
    local hits
    hits=$(printf '%s\n' "$code" | grep -nE 'DeletedAt[[:space:]]+(time\.Time|\*time\.Time|sql\.NullTime)' || true)
    [[ -n "$hits" ]] && sd_bad="${sd_bad}${g}:${hits}
"
    # 未用 Unscoped 且显式 WHERE deleted_at（说明自定义软删除未自动过滤）
    if printf '%s\n' "$code" | grep -qE 'deleted_at[[:space:]]*(IS|is)[[:space:]]*NULL' \
       && ! printf '%s\n' "$code" | grep -qE 'gorm\.DeletedAt|Unscoped\('; then
      sd_bad="${sd_bad}${g}: 自定义 deleted_at 软删除字段（须改 gorm.DeletedAt 自动过滤）
"
    fi
  done
  _fw_report warn fw_gorm_soft_delete "$sd_bad" "软删除字段非 gorm.DeletedAt（自定义字段无自动过滤，已删记录泄漏风险）" "软删除字段均用 gorm.DeletedAt 或无软删除"

  # ====================================================================
  # fw_gorm_conn_pool(fail)：gorm.Open 须配 SetMaxOpenConns
  # ====================================================================
  local open_hit=0 pool_hit=0
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    _fw_strip_comments_c_inline "$g" | grep -qE 'gorm\.Open\(' && open_hit=1
    _fw_strip_comments_c_inline "$g" | grep -qE 'SetMaxOpenConns' && pool_hit=1
  done
  if [[ "$open_hit" -eq 1 && "$pool_hit" -eq 0 ]]; then
    fail "fw_gorm_conn_pool: gorm.Open 后未配 SetMaxOpenConns（默认 MaxOpenConns=0 无限制，高并发打爆 DB）"
  else
    pass "fw_gorm_conn_pool: 已配连接池或无 gorm.Open"
  fi

  # ====================================================================
  # fw_gorm_dryrun_audit(warn)：LogMode(logger.Info/Silent) 风险
  # ====================================================================
  local logmode_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    ln=$(_fw_strip_comments_c_inline "$g" | grep -nE 'LogMode[[:space:]]*\([[:space:]]*logger\.(Info|Silent)' || true)
    [[ -n "$ln" ]] && logmode_bad="${logmode_bad}${g}:${ln}
"
  done
  _fw_report warn fw_gorm_dryrun_audit "$logmode_bad" "检出 LogMode(logger.Info/Silent)（Info 打印全 SQL 含敏感参数 CWE-532；Silent 吞错误；审计须用 DryRun Session）" "未检出危险 LogMode（生产用 Warn，审计用 DryRun Session）"

  # ====================================================================
  # fw_gorm_model_convention(warn)：GORM 模型须有主键声明
  # ====================================================================
  local model_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    local code
    code=$(_fw_strip_comments_c_inline "$g" 2>/dev/null)
    [[ -z "$code" ]] && continue
    # 命中 type X struct { 行
    local structlines
    structlines=$(printf '%s\n' "$code" | grep -nE '^type[[:space:]]+[A-Z][A-Za-z0-9_]*[[:space:]]+struct[[:space:]]*\{' || true)
    [[ -z "$structlines" ]] && continue
    while IFS= read -r sl; do
      [[ -z "$sl" ]] && continue
      local lineno=${sl%%:*}
      local end
      # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
      end=$(printf '%s\n' "$code" | sed -n "${lineno},\$p" | grep -nE '^\}' | head -1 | cut -d: -f1 || true)
      [[ -z "$end" ]] && continue
      local block
      block=$(printf '%s\n' "$code" | sed -n "$((lineno)),$((lineno + end - 1))p")
      # 仅当 struct 含 gorm:" 标签才视为 GORM 模型
      if ! printf '%s\n' "$block" | grep -qE 'gorm:"'; then
        continue
      fi
      # 已嵌入 gorm.Model 或含 ID 字段或 primaryKey 标签
      if printf '%s\n' "$block" | grep -qE 'gorm\.Model|ID[[:space:]]+[A-Za-z]|primaryKey'; then
        continue
      fi
      model_bad="${model_bad}${g}:${sl}（GORM 模型无主键声明）
"
    done <<< "$structlines"
  done
  _fw_report warn fw_gorm_model_convention "$model_bad" "GORM 模型无 gorm.Model/ID/primaryKey（First 查询按 ID 约定找不到主键报错）" "模型主键声明完整或无 GORM 模型"

  # ====================================================================
  # fw_gorm_automigrate_prod(warn)：AutoMigrate 不应在生产入口
  # ====================================================================
  local am_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    local base
    base=$(basename "$g")
    # 生产入口启发式：main.go / cmd/ 下 / server/ 下，且非 _test.go
    case "$base" in
      *_test.go) continue ;;
      main.go|*.go)
        case "$g" in
          */cmd/*|*/server/*|*/main.go|*/main_*.go)
            if _fw_strip_comments_c_inline "$g" | grep -qE '\.AutoMigrate\('; then
              am_bad="${am_bad}${g}: AutoMigrate( 在生产入口（生产须用独立 migration 工具）
"
            fi
            ;;
        esac
        ;;
    esac
  done
  _fw_report warn fw_gorm_automigrate_prod "$am_bad" "AutoMigrate 在生产入口（无回滚、多实例并发竞态，须用 golang-migrate/atlas/goose）" "AutoMigrate 未在生产入口或无 AutoMigrate"

  # ====================================================================
  # fw_gorm_batch_insert(warn)：for-range 内单条 Create 须改 CreateInBatches
  # ====================================================================
  local batch_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    local code
    code=$(_fw_strip_comments_c_inline "$g" 2>/dev/null)
    [[ -z "$code" ]] && continue
    local has_batch=0
    _fw_strip_comments_c_inline "$g" | grep -qE '\.CreateInBatches\(' && has_batch=1
    if [[ "$has_batch" -eq 0 ]]; then
      local forlines
      forlines=$(printf '%s\n' "$code" | grep -nE '\bfor[[:space:]]+.*,?[[:space:]]*range\b' || true)
      [[ -z "$forlines" ]] && continue
      local bad_lines=""
      while IFS= read -r fl; do
        [[ -z "$fl" ]] && continue
        local lineno=${fl%%:*}
        local start=$lineno end=$((lineno + 15))
        local block
        block=$(printf '%s\n' "$code" | sed -n "${start},${end}p")
        if printf '%s\n' "$block" | grep -qE '\.Create\('; then
          bad_lines="${bad_lines}${fl}
"
        fi
      done <<< "$forlines"
      [[ -n "$bad_lines" ]] && batch_bad="${batch_bad}${g}: for-range 内单条 Create 无 CreateInBatches:
${bad_lines}
"
    fi
  done
  _fw_report warn fw_gorm_batch_insert "$batch_bad" "for-range 内单条 Create（N 次 RTT，须 CreateInBatches 分批）" "已用 CreateInBatches 或无循环 Create"

  # ====================================================================
  # fw_gorm_record_not_found(warn)：First 须配 ErrRecordNotFound 判断
  # ====================================================================
  local first_hit=0 rnf_hit=0
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    _fw_strip_comments_c_inline "$g" | grep -qE '\.First\(' && first_hit=1
    _fw_strip_comments_c_inline "$g" | grep -qE 'ErrRecordNotFound' && rnf_hit=1
  done
  if [[ "$first_hit" -eq 1 && "$rnf_hit" -eq 0 ]]; then
    warn "fw_gorm_record_not_found: 检出 First( 但无 ErrRecordNotFound 判断（无记录会被当 500 报错）"
  else
    pass "fw_gorm_record_not_found: 已配 ErrRecordNotFound 判断或无 First"
  fi

  # ====================================================================
  # fw_gorm_index(warn)：高频 Where 字段须 gorm:"index"
  # ====================================================================
  # 启发式：检出 .Where("col = / col IN 但对应模型无 index 标签。仅对常见外键/状态字段提示。
  local index_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    local code
    code=$(_fw_strip_comments_c_inline "$g" 2>/dev/null)
    [[ -z "$code" ]] && continue
    # 检出 Where("user_id / order_id / status / tenant_id ...") 但同项目无 gorm:"index
    if printf '%s\n' "$code" | grep -qE '\.Where\("(user_id|order_id|tenant_id|status|deleted_at)'; then
      if ! printf '%s\n' "$code" | grep -qE 'gorm:"index'; then
        local wl
        wl=$(printf '%s\n' "$code" | grep -nE '\.Where\("(user_id|order_id|tenant_id|status|deleted_at)' | head -3 || true)
        index_bad="${index_bad}${g}:${wl}
"
      fi
    fi
  done
  _fw_report warn fw_gorm_index "$index_bad" "高频查询字段(user_id/order_id/status)可能缺 gorm:\"index\" 标签（启发式，须人工核对）" "未检出疑似缺索引字段"

  # ====================================================================
  # fw_gorm_error_handling(warn)：db.Error 须区分 ErrRecordNotFound/ErrDuplicatedKey
  # ====================================================================
  local dberr_hit=0 rnf2_hit=0 dup_hit=0
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    _fw_strip_comments_c_inline "$g" | grep -qE '\.Error\b|result\.Error|errs\.Is' && dberr_hit=1
    _fw_strip_comments_c_inline "$g" | grep -qE 'ErrRecordNotFound' && rnf2_hit=1
    _fw_strip_comments_c_inline "$g" | grep -qE 'ErrDuplicatedKey' && dup_hit=1
  done
  if [[ "$dberr_hit" -eq 1 && "$rnf2_hit" -eq 0 && "$dup_hit" -eq 0 ]]; then
    warn "fw_gorm_error_handling: 检出 .Error 但未区分 ErrRecordNotFound/ErrDuplicatedKey（无记录当 500）"
  else
    pass "fw_gorm_error_handling: 已区分 DB 错误类型或无 .Error"
  fi

  # ====================================================================
  # fw_gorm_association(warn)：多 ID 字段关联须显式 foreignKey
  # ====================================================================
  local assoc_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    local code
    code=$(_fw_strip_comments_c_inline "$g" 2>/dev/null)
    [[ -z "$code" ]] && continue
    local structlines
    structlines=$(printf '%s\n' "$code" | grep -nE '^type[[:space:]]+[A-Z][A-Za-z0-9_]*[[:space:]]+struct[[:space:]]*\{' || true)
    [[ -z "$structlines" ]] && continue
    while IFS= read -r sl; do
      [[ -z "$sl" ]] && continue
      local lineno=${sl%%:*}
      local end
      end=$(printf '%s\n' "$code" | sed -n "${lineno},\$p" | grep -nE '^\}' | head -1 | cut -d: -f1 || true)
      [[ -z "$end" ]] && continue
      local block
      block=$(printf '%s\n' "$code" | sed -n "$((lineno)),$((lineno + end - 1))p")
      # 多个以 ID 结尾的字段（潜在多外键），且关联字段无 foreignKey 标签
      local id_cnt
      id_cnt=$(printf '%s\n' "$block" | grep -cE '[A-Z][A-Za-z0-9]*ID[[:space:]]+[A-Za-z]' || true)
      if [[ "${id_cnt:-0}" -ge 2 ]]; then
        if ! printf '%s\n' "$block" | grep -qE 'foreignKey:'; then
          assoc_bad="${assoc_bad}${g}:${sl}（多外键字段无 foreignKey 标签）
"
        fi
      fi
    done <<< "$structlines"
  done
  _fw_report warn fw_gorm_association "$assoc_bad" "多 ID 字段关联无 foreignKey 标签（Preload 推断歧义，加载错关联）" "关联外键声明清晰或无多外键模型"

  # ====================================================================
  # fw_gorm_naming(warn)：TableName 与 NamingStrategy 禁混用
  # ====================================================================
  local tn_hit=0 ns_hit=0 tn_files=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    if _fw_strip_comments_c_inline "$g" | grep -qE 'func[[:space:]]*\([^)]*\)[[:space:]]+TableName\(\)[[:space:]]+string'; then
      tn_hit=1
      tn_files="${tn_files}${g}
"
    fi
    _fw_strip_comments_c_inline "$g" | grep -qE 'NamingStrategy' && ns_hit=1
  done
  if [[ "$tn_hit" -eq 1 && "$ns_hit" -eq 1 ]]; then
    warn "fw_gorm_naming: TableName() 与 NamingStrategy 混用（表名不一致，查询错表）:
${tn_files}"
  else
    pass "fw_gorm_naming: 命名策略一致"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
