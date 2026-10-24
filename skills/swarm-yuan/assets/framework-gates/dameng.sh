# ruleset: dameng  requires_conf: DAMENG_SQL_GLOBS DAMENG_SCHEMA_GLOBS
# gates: fw_dameng_case_sensitive(fail) fw_dameng_reserved_word(fail) fw_dameng_mysql_syntax(fail) fw_dameng_rownum(fail) fw_dameng_group_concat(fail) fw_dameng_unsupported_type(fail) fw_dameng_identity_insert(fail) fw_dameng_driver(fail) fw_dameng_driver_version(warn) fw_dameng_auto_increment(warn) fw_dameng_isolation(warn) fw_dameng_mysql_func(warn) fw_dameng_empty_string(warn) fw_dameng_varchar_length(warn) fw_dameng_schema(warn) fw_dameng_deep_paging(warn)
# harvested-from: P1/P2 信创补强（2026-07-20），规律源自达梦官方 FAQ（eco.dameng.com）与 DM8 迁移实践
_fw_dameng_check() {
  echo "  [dameng] 达梦 DM8 框架规律"

  # ---------- 收集文件清单（查询 SQL + 配置 + 构建文件 入 sqlarr；DDL 入 scharr） ----------
  local srcs sqlarr=() scharr=()
  srcs=$(_fw_resolve_globs ${DAMENG_SQL_GLOBS[@]+"${DAMENG_SQL_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && sqlarr+=("$ln")
  done <<< "$srcs"
  srcs=$(_fw_resolve_globs ${DAMENG_SCHEMA_GLOBS[@]+"${DAMENG_SCHEMA_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && scharr+=("$ln")
  done <<< "$srcs"

  if [[ ${#sqlarr[@]} -eq 0 && ${#scharr[@]} -eq 0 ]]; then
    warn "dameng: DAMENG_SQL_GLOBS/DAMENG_SCHEMA_GLOBS 未配置或无文件可检"
    return
  fi

  # 配置/构建文件子集（ini/conf/yml/yaml/properties/xml——xml 覆盖 pom.xml 驱动版本检查）
  local cfgarr=() f
  for f in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    case "$(basename "$f")" in
      *.cnf|*.ini|*.conf|*.cfg|*.yml|*.yaml|*.properties|*.xml) cfgarr+=("$f") ;;
    esac
  done

  # 合并全集（identity_insert 需跨 SQL/DDL 两集合扫描；sort -u 去 glob 重叠）
  local allsrcs allarr=()
  allsrcs=$( { for f in "${sqlarr[@]+"${sqlarr[@]}"}"; do printf '%s\n' "$f"; done
               for f in "${scharr[@]+"${scharr[@]}"}"; do printf '%s\n' "$f"; done; } | sort -u )
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && allarr+=("$ln")
  done <<< "$allsrcs"

  # SQL 正文过滤：调公共库 _fw_strip_comments_sql（去 -- 行注释，防注释里的关键字造成误判）

  local c s t ln

  # ====================================================================
  # fw_dameng_case_sensitive(fail)：引号包裹的小写标识符（表名/列名）
  # ====================================================================
  local cs_bad=""
  for s in "${scharr[@]+"${scharr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE 'CREATE[[:space:]]+TABLE[[:space:]]+(IF[[:space:]]+NOT[[:space:]]+EXISTS[[:space:]]+)?"[a-z]|^[[:space:]]*"[a-z][A-Za-z_0-9]*"[[:space:]]+[A-Za-z]' || true)
    [[ -n "$ln" ]] && cs_bad="${cs_bad}${s}:${ln}
"
  done
  _fw_report fail fw_dameng_case_sensitive "$cs_bad" "检出双引号小写标识符（CASE_SENSITIVE 下引号小写名必须全链路带引号访问，裸名 SQL 报\"无效的对象名\"）——DTS 迁移去勾\"保持对象名大小写\"转大写，或全链路引号化" "无引号小写标识符"

  # ====================================================================
  # fw_dameng_reserved_word(fail)：列定义行首词裸用 DM 保留字
  # ====================================================================
  local rw_bad=""
  for s in "${scharr[@]+"${scharr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE '^[[:space:]]*(domain|context|percent|top|type|identity|model|dimension|verify|reference|ref|login|offset|limit)[[:space:]]+(varchar2?|n?varchar|char|nchar|int|integer|bigint|smallint|tinyint|numeric|number|decimal|float|double|real|date|timestamp|time|clob|blob|text|bit)' || true)
    [[ -n "$ln" ]] && rw_bad="${rw_bad}${s}:${ln}
"
  done
  _fw_report fail fw_dameng_reserved_word "$rw_bad" "列名裸用 DM 保留字（建表/查询报\"语法分析出错\"，且新版会持续新增保留字）——优先改名规避；或 dm_svc.conf/JDBC URL 加 keywords=(...) 屏蔽" "无裸保留字列名"

  # ====================================================================
  # fw_dameng_mysql_syntax(fail)：MySQL 方言残留（ENGINE=/反引号/UNSIGNED/ON DUPLICATE KEY/UPDATE|DELETE...LIMIT）
  # ====================================================================
  local ms_bad=""
  for s in "${allarr[@]+"${allarr[@]}"}"; do
    case "$(basename "$s")" in
      *.sql) ;;
      *) continue ;;
    esac
    ln=$(_fw_strip_comments_sql "$s" | grep -inE 'ENGINE[[:space:]]*=[[:space:]]*[A-Za-z]|UNSIGNED([^A-Za-z_]|$)|ON[[:space:]]+DUPLICATE[[:space:]]+KEY|`' || true)
    [[ -n "$ln" ]] && ms_bad="${ms_bad}${s}:${ln}
"
    ln=$(_fw_strip_comments_sql "$s" | grep -inE '^[[:space:]]*(UPDATE|DELETE)[[:space:]].*LIMIT[[:space:]]+[0-9]+' || true)
    [[ -n "$ln" ]] && ms_bad="${ms_bad}${s}:${ln}
"
  done
  _fw_report fail fw_dameng_mysql_syntax "$ms_bad" "MySQL 方言残留（DM 无存储引擎/UNSIGNED/反引号；ON DUPLICATE KEY 须改 MERGE INTO；UPDATE|DELETE...LIMIT 须改 WHERE ROWNUM <= n）——迁移脚本须 DM 原生化" "无 MySQL 方言残留"

  # ====================================================================
  # fw_dameng_rownum(fail)：ROWNUM > / >= / BETWEEN 恒空集
  # ====================================================================
  local rn_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE 'ROWNUM[[:space:]]*(>=?|BETWEEN[[:space:]])' || true)
    [[ -n "$ln" ]] && rn_bad="${rn_bad}${s}:${ln}
"
  done
  _fw_report fail fw_dameng_rownum "$rn_bad" "ROWNUM 从 1 递增分配，ROWNUM > n / BETWEEN 恒返回空集（第一页正常、翻页静默丢数据）——须子查询包装取别名，或改 LIMIT m OFFSET n" "无 ROWNUM 误用"

  # ====================================================================
  # fw_dameng_group_concat(fail)：GROUP_CONCAT 在 DM 不存在
  # ====================================================================
  local gc_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE 'GROUP_CONCAT[[:space:]]*\(' || true)
    [[ -n "$ln" ]] && gc_bad="${gc_bad}${s}:${ln}
"
  done
  _fw_report fail fw_dameng_group_concat "$gc_bad" "GROUP_CONCAT 非 DM 内置函数（报\"无法解析的成员访问表达式\"）——改 LISTAGG(col, ',') WITHIN GROUP (ORDER BY col)，DISTINCT 先子查询去重" "无 GROUP_CONCAT"

  # ====================================================================
  # fw_dameng_unsupported_type(fail)：BOOLEAN/ENUM 列类型
  # ====================================================================
  local ut_bad=""
  for s in "${scharr[@]+"${scharr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE '[[:space:]]+BOOLEAN([[:space:],)]|$)|[[:space:]]+ENUM[[:space:]]*\(' || true)
    [[ -n "$ln" ]] && ut_bad="${ut_bad}${s}:${ln}
"
  done
  _fw_report fail fw_dameng_unsupported_type "$ut_bad" "DM 无 BOOLEAN/ENUM 类型（建表报\"非法参数\"）——布尔改 BIT，枚举改 VARCHAR/CHAR + CHECK 约束" "无 BOOLEAN/ENUM 列"

  # ====================================================================
  # fw_dameng_identity_insert(fail)：IDENTITY 表显式 ID 首列 INSERT 且无 SET IDENTITY_INSERT
  # ====================================================================
  local ii_tbls="" ii_t ii_bad=""
  for s in "${allarr[@]+"${allarr[@]}"}"; do
    case "$(basename "$s")" in
      *.sql) ;;
      *) continue ;;
    esac
    ii_t=$(_fw_strip_comments_sql "$s" | awk '
      /CREATE[[:space:]]+TABLE/ {
        ln=$0
        sub(/^.*CREATE[[:space:]]+TABLE[[:space:]]+(IF[[:space:]]+NOT[[:space:]]+EXISTS[[:space:]]+)?/, "", ln)
        gsub(/"/, "", ln)
        sub(/\..*/, "", ln)
        split(ln, a, /[[:space:](]+/)
        last=a[1]
      }
      /IDENTITY[[:space:]]*\(/ && last != "" { print last; last="" }
    ' 2>/dev/null | sort -u || true)
    [[ -n "$ii_t" ]] && ii_tbls="${ii_tbls} ${ii_t}"
  done
  for t in $ii_tbls; do
    for s in "${allarr[@]+"${allarr[@]}"}"; do
      case "$(basename "$s")" in
        *.sql) ;;
        *) continue ;;
      esac
      _fw_strip_comments_sql "$s" | grep -qiE 'SET[[:space:]]+IDENTITY_INSERT' && continue
      ln=$(_fw_strip_comments_sql "$s" | grep -inE "INSERT[[:space:]]+INTO[[:space:]]+([A-Za-z_0-9\"]+\\.)?\"?${t}\"?[[:space:]]*\\([[:space:]]*\"?ID\"?[[:space:]]*," || true)
      [[ -n "$ln" ]] && ii_bad="${ii_bad}${s}:${ln}
"
    done
  done
  _fw_report fail fw_dameng_identity_insert "$ii_bad" "对 IDENTITY 自增列显式赋值（报\"仅当指定列列表，且 SET IDENTITY_INSERT 为 ON 时，才能对自增列赋值\"）——SET IDENTITY_INSERT <表> ON 且列名列表齐全；插 0 亦报错" "无 IDENTITY 列显式赋值"

  # ====================================================================
  # fw_dameng_driver(fail)：jdbc:dm:// 与 com.mysql 驱动类共存
  # ====================================================================
  local dr_bad=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qiE 'jdbc:dm://' "$c" 2>/dev/null && grep -qiE 'com\.mysql' "$c" 2>/dev/null; then
      dr_bad="${dr_bad}${c}
"
    fi
  done
  _fw_report fail fw_dameng_driver "$dr_bad" "达梦不兼容 MySQL 线协议（连 5236 报\"不支持的数据库类型\"）——必须 jdbc:dm:// + dm.jdbc.driver.DmDriver" "驱动类与 URL 匹配"

  # ====================================================================
  # fw_dameng_driver_version(warn)：Dm(8)?JdbcDriver1[0-7] 旧驱动
  # ====================================================================
  local dv_bad=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -inE 'Dm8?JdbcDriver1[0-7]' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && dv_bad="${dv_bad}${c}:${ln}
"
  done
  _fw_report warn fw_dameng_driver_version "$dv_bad" "旧版达梦 JDBC 驱动（15/16/17 对应 JDK1.5~1.7）——JDK8+ 工程须 DmJdbcDriver18 且驱动小版本与服务端打包版本匹配（错版报\"无效的列名\"/连不上）" "驱动版本为 DmJdbcDriver18 或未检出"

  # ====================================================================
  # fw_dameng_auto_increment(warn)：AUTO_INCREMENT 仅 2023-05 后版本兼容
  # ====================================================================
  local ai_bad=""
  for s in "${scharr[@]+"${scharr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE 'AUTO_INCREMENT' || true)
    [[ -n "$ln" ]] && ai_bad="${ai_bad}${s}:${ln}
"
  done
  _fw_report warn fw_dameng_auto_increment "$ai_bad" "AUTO_INCREMENT 仅 DM8 2023-05 后版本兼容（默认等价 IDENTITY(1,1)），更早版本语法报错；插 0 语义受 NO_AUTO_VALUE_ON_ZERO 控制与 IDENTITY 不同——跨版本脚本统一显式 IDENTITY(1,1)" "无 AUTO_INCREMENT 或版本已确认"

  # ====================================================================
  # fw_dameng_isolation(warn)：jdbc:dm:// 数据源须显式隔离级别
  # ====================================================================
  local ds_hit=0 iso_hit=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qiE 'jdbc:dm://' "$c" 2>/dev/null; then
      ds_hit=1
      if grep -qiE 'isolation' "$c" 2>/dev/null; then
        iso_hit=1
      fi
    fi
  done
  if [[ "$ds_hit" -eq 0 ]]; then
    pass "fw_dameng_isolation: 无达梦数据源配置，跳过"
  elif [[ "$iso_hit" -eq 1 ]]; then
    pass "fw_dameng_isolation: 已显式配置事务隔离级别"
  else
    warn "fw_dameng_isolation: 检出 jdbc:dm:// 数据源但未显式配置隔离级别（DM 默认 RC 与 MySQL 默认 RR 语义不同；RR 需服务端 ENABLE_REPEATABLEREAD，SERIALIZABLE 必须配重试）"
  fi

  # ====================================================================
  # fw_dameng_mysql_func(warn)：IFNULL/NOW/DATE_FORMAT 函数差异
  # ====================================================================
  local mf_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE 'IFNULL[[:space:]]*\(|NOW[[:space:]]*\(\)|DATE_FORMAT[[:space:]]*\(' || true)
    [[ -n "$ln" ]] && mf_bad="${mf_bad}${s}:${ln}
"
  done
  _fw_report warn fw_dameng_mysql_func "$mf_bad" "MySQL 函数在非兼容模式报错——IFNULL→NVL/COALESCE，NOW()→CURRENT_TIMESTAMP/SYSDATE，DATE_FORMAT→TO_CHAR；双库共跑收敛标准函数" "无 MySQL 专属函数"

  # ====================================================================
  # fw_dameng_empty_string(warn)：= / <> / != '' 判空
  # ====================================================================
  local es_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE "(=|<>|!=)[[:space:]]*''" || true)
    [[ -n "$ln" ]] && es_bad="${es_bad}${s}:${ln}
"
  done
  _fw_report warn fw_dameng_empty_string "$es_bad" "DM 空串不等于 NULL，= '' 判空静默漏 NULL 行——改 IS NULL；判空串或 NULL 须 (col IS NULL OR col = '')" "无空串等值判空"

  # ====================================================================
  # fw_dameng_varchar_length(warn)：LENGTH_IN_CHAR=0 字节语义
  # ====================================================================
  local vl_bad=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    ln=$(grep -inE 'LENGTH_IN_CHAR[[:space:]]*=[[:space:]]*0([^0-9]|$)' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && vl_bad="${vl_bad}${c}:${ln}
"
  done
  _fw_report warn fw_dameng_varchar_length "$vl_bad" "LENGTH_IN_CHAR=0（VARCHAR 按字节计，UTF8 下 1 汉字 3 字节，MySQL 同长迁移中文报\"长度超出定义\"）——建库设 1 或 DDL 按 x3 放大列长；无配置时默认即 0" "无显式字节模式配置"

  # ====================================================================
  # fw_dameng_schema(warn)：jdbc:dm:// 须显式 schema=
  # ====================================================================
  local sc_bad=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qiE 'jdbc:dm://' "$c" 2>/dev/null && ! grep -qiE 'schema=' "$c" 2>/dev/null; then
      sc_bad="${sc_bad}${c}
"
    fi
  done
  _fw_report warn fw_dameng_schema "$sc_bad" "jdbc:dm:// 未显式 schema=（默认落登录用户同名模式，初始化脚本易误入 SYSDBA 模式）——URL 加 ?schema=XXX，跨模式访问带模式前缀" "URL 已显式 schema 或无达梦数据源"

  # ====================================================================
  # fw_dameng_deep_paging(warn)：大 OFFSET 深分页（≥10 万）
  # ====================================================================
  local dp_bad=""
  for s in "${sqlarr[@]+"${sqlarr[@]}"}"; do
    ln=$(_fw_strip_comments_sql "$s" | grep -inE 'LIMIT[[:space:]]+[0-9]{6,}[[:space:]]*,|OFFSET[[:space:]]+[0-9]{6,}' || true)
    [[ -n "$ln" ]] && dp_bad="${dp_bad}${s}:${ln}
"
  done
  _fw_report warn fw_dameng_deep_paging "$dp_bad" "深分页 OFFSET ≥ 10 万（O(offset) 扫描丢弃前 N 行，DM 与 MySQL 同构）——改游标 WHERE id > ? 或子查询先取主键" "无 ≥10 万 offset 深分页"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
