# ruleset: sharding  requires_conf: SHARDING_KEY_COLUMNS SHARDED_TABLES SHARDING_BROADCAST_TABLES MYBATIS_MAPPER_DIRS
# gates: fw_sharding_key_in_dml(fail) fw_sharding_key_expr(warn) fw_sharding_broadcast_write(fail) fw_sharding_binding_join(warn) fw_sharding_order_merge(warn) fw_sharding_keygen(warn) fw_sharding_xa(warn) fw_sharding_unsupported_sql(warn) fw_sharding_hint(warn)
# harvested-from: T9 P1 范例（2026-07-17），规律源自 shardingsphere 5.5.3 官方文档（features/sharding concept+limitation、features/transaction、user-manual hint）
_fw_sharding_check() {
  echo "  [sharding] ShardingSphere 5.5.x 框架规律"

  # ---------- 收集 mapper XML 文件清单 ----------
  local xmls xmlarr=()
  xmls=""
  for d in ${MYBATIS_MAPPER_DIRS[@]+"${MYBATIS_MAPPER_DIRS[@]}"}; do
    [[ -d "$d" ]] || continue
    while IFS= read -r f; do
      xmls="${xmls}${f}
"
    done < <(find "$d" -type f -name '*.xml' 2>/dev/null)
  done
  # 去空行 + 去重
  xmls=$(printf '%s\n' "$xmls" |  grep -E '.+' | sort -u)
  if [[ -z "$xmls" ]]; then
    warn "sharding: 无 mapper XML 可检（MYBATIS_MAPPER_DIRS）"
    return
  fi
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && xmlarr+=("$ln")
  done <<< "$xmls"

  # ---------- 组装分片表/分片键映射串 ----------
  # SHARDING_KEY_COLUMNS 元素形如 "t_order=user_id"；pairs_str 供 awk -v 传入（空格分隔）
  local pairs_str="" kv
  for kv in ${SHARDING_KEY_COLUMNS[@]+"${SHARDING_KEY_COLUMNS[@]}"}; do
    case "$kv" in
      *=*) pairs_str="${pairs_str}${kv} " ;;
      *) : ;;  # 无 = 的畸形项跳过
    esac
  done
  pairs_str="${pairs_str% }"

  # 全部分片表名串（含无键映射的表），供 binding_join/order_merge 判定表归属
  local sharded_str="" st
  for st in ${SHARDED_TABLES[@]+"${SHARDED_TABLES[@]}"}; do
    sharded_str="${sharded_str}${st} "
  done
  sharded_str="${sharded_str% }"

  # ====================================================================
  # fw_sharding_key_in_dml(fail)：分片表 UPDATE/DELETE 块必须含分片键
  # ====================================================================
  if [[ -z "$pairs_str" ]]; then
    pass "fw_sharding_key_in_dml: SHARDING_KEY_COLUMNS 未配置，跳过"
  else
    local kid_hits="" xfile
    for xfile in "${xmlarr[@]}"; do
      local hits
      # awk 抽取 <update>/<delete> 语句块（BSD awk 无 IGNORECASE，统一 tolower 比对）
      # 分片键必须出现在 WHERE 段的谓词位置（key = / IN / BETWEEN / 范围比较）——
      # 列名在 SET 子句、ORDER BY、select 列表里出现不算"带分片键"（trade-forge 实测：ORDER BY order_id 曾掩盖缺键）
      hits=$(awk -v pairs="$pairs_str" '
        function keypred(s, k) { return s ~ ("(^|[^a-z0-9_])" k "[[:space:]]*(<=|>=|<>|!=|=|<|>|in[[:space:]]*\\(|in[[:space:]]|between[[:space:]])") }
        BEGIN{
          pairs=tolower(pairs);
          np=split(pairs, arr, " ");
          for(i=1;i<=np;i++){ split(arr[i], kv, "="); tabs[i]=kv[1]; keys[i]=kv[2] }
        }
        /<update[[:space:]>]|<delete[[:space:]>]/ { inb=1; buf=""; head=$0 }
        inb { buf = buf " " tolower($0) }
        /<\/update>|<\/delete>/ {
          if (inb) {
            wi=index(buf, "where"); wpart=(wi>0) ? substr(buf, wi) : "";
            for (i=1;i<=np;i++) {
              t=tabs[i]; k=keys[i];
              if (k=="") continue;
              if (buf ~ ("update[[:space:]]+" t "([^a-z0-9_]|$)") || buf ~ ("from[[:space:]]+" t "([^a-z0-9_]|$)")) {
                if (wpart=="" || !keypred(wpart, k)) {
                  print FILENAME " 缺分片键 " k " :: " head;
                }
              }
            }
          }
          inb=0;
        }
      ' "$xfile" 2>/dev/null || true)
      [[ -n "$hits" ]] && kid_hits="${kid_hits}${hits}
"
    done
    _fw_report fail fw_sharding_key_in_dml "${kid_hits}" "分片表 UPDATE/DELETE 缺分片键（SQL 无分片字段触发全路由广播，官方 concept 文档：full routing, performance is poor）" "分片表 UPDATE/DELETE 均含分片键"
  fi

  # ====================================================================
  # fw_sharding_key_expr(warn)：分片键被函数/表达式包裹 → 路由失效全路由
  # ====================================================================
  if [[ -z "$pairs_str" ]]; then
    pass "fw_sharding_key_expr: SHARDING_KEY_COLUMNS 未配置，跳过"
  else
    local ke_hits="" kcol
    # 逐分片键列检索 "函数名(分片键" 形态（近似实现：函数名紧贴括号，排除 where ( 类带空格形态）
    for kv in ${pairs_str}; do
      kcol="${kv#*=}"
      [[ -n "$kcol" ]] || continue
      local ke_hit
      ke_hit=$(grep -rniE "[a-z_][a-z0-9_]*\([[:space:]]*${kcol}([^a-zA-Z0-9_]|\$)" "${xmlarr[@]}" 2>/dev/null || true)
      [[ -n "$ke_hit" ]] && ke_hits="${ke_hits}${ke_hit}
"
    done
    _fw_report warn fw_sharding_key_expr "${ke_hits}" "分片键被函数/表达式包裹（官方 limitation：分片键取值仅支持字面量/绑定参数，函数计算结果不用于分片 → 全路由或路由校验失败）" "分片键均为字面量/绑定参数直取"
  fi

  # ====================================================================
  # fw_sharding_broadcast_write(fail)：广播表业务侧只读，检出 DML 写 → fail
  # ====================================================================
  if [[ ${#SHARDING_BROADCAST_TABLES[@]} -eq 0 ]]; then
    pass "fw_sharding_broadcast_write: SHARDING_BROADCAST_TABLES 未配置，跳过"
  else
    local bw_pat="" bt bw_hits
    for bt in ${SHARDING_BROADCAST_TABLES[@]+"${SHARDING_BROADCAST_TABLES[@]}"}; do
      bw_pat="${bw_pat}|(insert[[:space:]]+into[[:space:]]+${bt}([^a-zA-Z0-9_]|\$))|(update[[:space:]]+${bt}([^a-zA-Z0-9_]|\$))|(delete[[:space:]]+from[[:space:]]+${bt}([^a-zA-Z0-9_]|\$))"
    done
    bw_pat="${bw_pat#|}"
    bw_hits=$(grep -rniE "$bw_pat" "${xmlarr[@]}" 2>/dev/null || true)
    _fw_report fail fw_sharding_broadcast_write "${bw_hits}" "业务 DML 直写广播表（广播表存在于每个数据源，业务侧应只读；字典变更须走受控迁移通道，直写放大到全部节点且脱离版本管控）" "广播表无业务 DML 写入（只读）"
  fi

  # ====================================================================
  # fw_sharding_binding_join(warn)：JOIN ≥2 张分片表且无分片键关联 → warn
  # ====================================================================
  if [[ -z "$sharded_str" ]]; then
    pass "fw_sharding_binding_join: SHARDED_TABLES 未配置，跳过"
  else
    local bj_hits=""
    for xfile in "${xmlarr[@]}"; do
      local hits
      hits=$(awk -v pairs="$pairs_str" -v all="$sharded_str" '
        BEGIN{
          pairs=tolower(pairs); all=tolower(all);
          np=split(pairs, arr, " ");
          for(i=1;i<=np;i++){ split(arr[i], kv, "="); keys[kv[1]]=kv[2] }
          na=split(all, atabs, " ");
        }
        /<select[[:space:]>]/ { inb=1; buf=""; head=$0 }
        inb { buf = buf " " tolower($0) }
        /<\/select>/ {
          if (inb && buf ~ /join[[:space:]]/) {
            used=0; keymiss=0;
            for (j=1;j<=na;j++) {
              t=atabs[j];
              if (buf ~ ("(^|[^a-z0-9_])" t "([^a-z0-9_]|$)")) {
                used++;
                k=keys[t];
                # 有键映射的表须键在场（JOIN 关联或 WHERE 条件），否则该表全路由
                if (k!="" && !(buf ~ ("(^|[^a-z0-9_])" k "([^a-z0-9_]|$)"))) keymiss=1;
              }
            }
            if (used>=2 && keymiss) print FILENAME " JOIN 涉及 " used " 张分片表存在分片键缺失 :: " head;
          }
          inb=0;
        }
      ' "$xfile" 2>/dev/null || true)
      [[ -n "$hits" ]] && bj_hits="${bj_hits}${hits}
"
    done
    _fw_report warn fw_sharding_binding_join "${bj_hits}" "JOIN 涉及多张分片表但未用分片键关联（官方 concept：binding tables 必须以分片键关联，否则笛卡尔积/跨库关联，路由 SQL 按分片数乘积膨胀）" "多表 JOIN 均含分片键关联或无多分片表 JOIN"
  fi

  # ====================================================================
  # fw_sharding_order_merge(warn)：分片表 ORDER BY/LIMIT 无分片键 → 归并/深分页放大
  # ====================================================================
  if [[ -z "$sharded_str" ]]; then
    pass "fw_sharding_order_merge: SHARDED_TABLES 未配置，跳过"
  else
    local om_hits=""
    for xfile in "${xmlarr[@]}"; do
      local hits
      hits=$(awk -v pairs="$pairs_str" -v all="$sharded_str" '
        function keypred(s, k) { return s ~ ("(^|[^a-z0-9_])" k "[[:space:]]*(<=|>=|<>|!=|=|<|>|in[[:space:]]*\\(|in[[:space:]]|between[[:space:]])") }
        BEGIN{
          pairs=tolower(pairs); all=tolower(all);
          np=split(pairs, arr, " ");
          for(i=1;i<=np;i++){ split(arr[i], kv, "="); keys[kv[1]]=kv[2] }
          na=split(all, atabs, " ");
        }
        /<select[[:space:]>]/ { inb=1; buf=""; head=$0 }
        inb { buf = buf " " tolower($0) }
        /<\/select>/ {
          if (inb && (buf ~ /order[[:space:]]+by/ || buf ~ /limit[[:space:]]/)) {
            used=0; keyok=0;
            wi=index(buf, "where"); wpart=(wi>0) ? substr(buf, wi) : "";
            for (j=1;j<=na;j++) {
              t=atabs[j];
              if (buf ~ ("(^|[^a-z0-9_])" t "([^a-z0-9_]|$)")) {
                used++;
                k=keys[t];
                # 分片键须在 WHERE 段谓词位置；ORDER BY/select 列表里的同名列不算（否则 ORDER BY order_id 掩盖缺键）
                if (k!="" && wpart!="" && keypred(wpart, k)) keyok=1;
              }
            }
            if (used>=1 && !keyok) print FILENAME " 分片表排序/分页无分片键 :: " head;
          }
          inb=0;
        }
      ' "$xfile" 2>/dev/null || true)
      [[ -n "$hits" ]] && om_hits="${om_hits}${hits}
"
    done
    _fw_report warn fw_sharding_order_merge "${om_hits}" "分片表 ORDER BY/LIMIT 查询无分片键（跨分片归并 + 深分页每分片取回 offset+count 行内存归并，IO/内存随分片数与 offset 双放大；建议加分片键条件/限页深/游标分页）" "分片表排序分页均带分片键或无排序分页"
  fi

  # ====================================================================
  # fw_sharding_keygen(warn)：useGeneratedKeys + 分片表 insert → 分布式主键须 SNOWFLAKE/UUID
  # ====================================================================
  if [[ -z "$sharded_str" ]]; then
    pass "fw_sharding_keygen: SHARDED_TABLES 未配置，跳过"
  else
    local kg_bad=""
    for xfile in "${xmlarr[@]}"; do
      grep -qiE 'useGeneratedKeys[[:space:]]*=[[:space:]]*"true"' "$xfile" 2>/dev/null || continue
      for st in ${sharded_str}; do
        if grep -qiE "insert[[:space:]]+into[[:space:]]+${st}([^a-zA-Z0-9_]|\$)" "$xfile" 2>/dev/null; then
          kg_bad="${kg_bad}${xfile}
"
          break
        fi
      done
    done
    _fw_report warn fw_sharding_keygen "${kg_bad}" "分片表 INSERT 依赖数据库自增回填（官方 concept：各物理表自增序列相互不知 → 跨分片主键重复；须配 keyGenerators type: SNOWFLAKE/UUID 或应用层雪花 ID）" "分片表 INSERT 未依赖数据库自增回填"
  fi

  # ====================================================================
  # fw_sharding_xa(warn)：同 Java 文件含 @Transactional 与 ≥2 个分片表名 → 提示 XA/Seata
  # ====================================================================
  local pd="${PROJECT_DIR:-}"
  local jarr=()
  if [[ -n "$pd" && -d "$pd" ]]; then
    while IFS= read -r jf; do
      [[ -n "$jf" ]] && jarr+=("$jf")
    done < <(find "$pd" -type f -name '*.java' -not -path '*/target/*' -not -path '*/node_modules/*' 2>/dev/null)
  fi
  if [[ -z "$pd" || ! -d "$pd" ]]; then
    pass "fw_sharding_xa: PROJECT_DIR 未配置，跳过"
  elif [[ ${#jarr[@]} -eq 0 ]]; then
    pass "fw_sharding_xa: 无 Java 源文件，跳过"
  elif [[ -z "$sharded_str" ]]; then
    pass "fw_sharding_xa: SHARDED_TABLES 未配置，跳过"
  else
    local xa_bad="" jf tcnt
    for jf in "${jarr[@]}"; do
      grep -qE '@Transactional' "$jf" 2>/dev/null || continue
      tcnt=0
      for st in ${sharded_str}; do
        # 词边界：t_order 不应命中 t_order_item（与 broadcast/keygen/binding_join 同款防护）
        if grep -qE "${st}([^a-zA-Z0-9_]|\$)" "$jf" 2>/dev/null; then
          tcnt=$((tcnt+1))
        fi
      done
      [[ "$tcnt" -ge 2 ]] && xa_bad="${xa_bad}${jf}
"
    done
    _fw_report warn fw_sharding_xa "${xa_bad}" "@Transactional 方法疑似跨分片写（官方 transaction 文档：LOCAL 模式不保证跨节点强一致/最终一致；跨分片写须显式 XA 或 Seata(BASE)，5.5.2 起 Seata Client ≥ 2.2.0）" "未发现 @Transactional 跨分片写风险"
  fi

  # ====================================================================
  # fw_sharding_unsupported_sql(warn)：检出官方 limitation 不支持 SQL → warn
  # ====================================================================
  local us_hits=""
  # LOAD DATA / LOAD XML 装载（官方：不支持装载到分片表，仅支持单表/广播表）
  local us_load
  us_load=$(grep -rniE 'load[[:space:]]+(data|xml)[[:space:]]' "${xmlarr[@]}" 2>/dev/null || true)
  [[ -n "$us_load" ]] && us_hits="${us_hits}${us_load}
"
  # CASE WHEN 同行内含 SELECT（近似：CASE WHEN 含子查询不支持；多行形态须人工复核）
  local us_case
  us_case=$(grep -rniE 'case[[:space:]]+when[^!]*select' "${xmlarr[@]}" 2>/dev/null || true)
  [[ -n "$us_case" ]] && us_hits="${us_hits}${us_case}
"
  # 聚合函数外包表达式阻断归并（R141 实栈：COALESCE(SUM(...)) 只返回部分分片结果）
  local us_agg
  us_agg=$(grep -rniE '(coalesce|ifnull|nvl)[[:space:]]*\([[:space:]]*(sum|count|avg|max|min)[[:space:]]*\(|case[[:space:]]+when[[:space:]]+(sum|count|avg|max|min)[[:space:]]*\(' "${xmlarr[@]}" 2>/dev/null || true)
  [[ -n "$us_agg" ]] && us_hits="${us_hits}${us_agg}
"
  _fw_report warn fw_sharding_unsupported_sql "${us_hits}" "检出官方 limitation 不支持/受限 SQL（LOAD DATA|XML 到分片表不支持；CASE WHEN 含子查询不支持；聚合函数外包 COALESCE/IFNULL/NVL 会阻断归并导致静默少算，空值归一改应用层；另须人工核对 Oracle rownum+BETWEEN 分页、SQLServer WITH 分页、DISTINCT 混用聚合、; 多语句）" "未检出 LOAD DATA/CASE WHEN 子查询/聚合外包等不支持 SQL"

  # ====================================================================
  # fw_sharding_hint(warn)：HintManager 未 close/未 try-with-resources → ThreadLocal 泄漏
  # ====================================================================
  if [[ -z "$pd" || ! -d "$pd" ]]; then
    pass "fw_sharding_hint: PROJECT_DIR 未配置，跳过"
  elif [[ ${#jarr[@]} -eq 0 ]]; then
    pass "fw_sharding_hint: 无 Java 源文件，跳过"
  else
    local hint_bad=""
    for jf in "${jarr[@]}"; do
      grep -qE 'HintManager' "$jf" 2>/dev/null || continue
      # 已含 close() 或 try-with-resources 形态 → 视为已清理
      if grep -qE '\.close\(\)' "$jf" 2>/dev/null || grep -qE 'try[[:space:]]*\([^)]*HintManager' "$jf" 2>/dev/null; then
        continue
      fi
      hint_bad="${hint_bad}${jf}
"
    done
    _fw_report warn fw_sharding_hint "${hint_bad}" "HintManager 使用后未 close()/未 try-with-resources（官方 Hint 文档：分片值存 ThreadLocal 仅当前线程生效，不清理会污染线程池后续请求 → 路由串库）" "HintManager 均显式清理或无 Hint 用法"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
