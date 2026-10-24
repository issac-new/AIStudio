# ruleset: nacos  requires_conf: NACOS_SRC_GLOBS NACOS_CONFIG_GLOBS
# gates: fw_nacos_namespace_isolation(warn) fw_nacos_config_encrypt(fail) fw_nacos_instance_ephemeral(warn) fw_nacos_gray_release(warn) fw_nacos_value_refresh(warn) fw_nacos_server_cluster(warn) fw_nacos_client_heartbeat(warn) fw_nacos_config_listener(warn) fw_nacos_config_priority(warn) fw_nacos_profile_isolation(warn) fw_nacos_metadata(warn)
# harvested-from: P3 框架规则引擎（2026-07-17），规律源自 Nacos 3.x 官方文档（2.5.x 维护线差异单独标注）
_fw_nacos_check() {
  echo "  [nacos] Nacos 3.x / 2.5.x 框架规律"

  # ---------- 收集源文件清单（Java 入 javaarr；配置/构建文件入 cfgarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${NACOS_SRC_GLOBS[@]+"${NACOS_SRC_GLOBS[@]}"} ${NACOS_CONFIG_GLOBS[@]+"${NACOS_CONFIG_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "nacos: NACOS_SRC_GLOBS/NACOS_CONFIG_GLOBS 未配置或无文件可检"
    return
  fi

  local javaarr=() cfgarr=()
  local f c j
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.java) javaarr+=("$f") ;;
      *.yml|*.yaml|*.properties|pom.xml|*.xml|build.gradle|*.gradle|*.gradle.kts|*.conf) cfgarr+=("$f") ;;
    esac
  done

  # ---------- Nacos 使用痕迹总判定 ----------
  local nacos_used=0
  local nu_hit
  # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
  nu_hit=$(grep -rlE 'spring\.cloud\.nacos|nacos\.server-addr|^[[:space:]]*nacos:|@NacosValue|@NacosPropertySource|@NacosConfigListener|NamingService|ConfigService|NacosConfigManager|com\.alibaba\.nacos|nacos-client' "${javaarr[@]+"${javaarr[@]}"}" "${cfgarr[@]+"${cfgarr[@]}"}" 2>/dev/null | head -1 || true)
  [[ -n "$nu_hit" ]] && nacos_used=1

  # ---------- 含 nacos 引用的配置文件子集（敏感值检查范围） ----------
  local nacos_cfgs=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qiE 'nacos' "$c" 2>/dev/null; then
      nacos_cfgs="${nacos_cfgs}${c}
"
    fi
  done

  # ====================================================================
  # fw_nacos_namespace_isolation(warn)：环境隔离必须用 namespace
  # ====================================================================
  if [[ "$nacos_used" -eq 0 ]]; then
    pass "fw_nacos_namespace_isolation: 无 Nacos 使用痕迹，跳过"
  else
    local ns_hit=0
    for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
      if grep -qE 'namespace[[:space:]]*[:=][[:space:]]*[A-Za-z0-9$_{-]' "$c" 2>/dev/null; then
        ns_hit=1
        break
      fi
    done
    if [[ "$ns_hit" -eq 1 ]]; then
      pass "fw_nacos_namespace_isolation: 已配 namespace 环境隔离"
    else
      warn "fw_nacos_namespace_isolation: 检出 Nacos 配置但无 namespace（全环境共用 public → 配置串读/跨环境服务发现风险）"
    fi
  fi

  # ====================================================================
  # fw_nacos_config_encrypt(fail)：敏感配置禁止明文入 Nacos
  # ====================================================================
  local enc_bad=""
  while IFS= read -r c; do
    [[ -z "$c" ]] && continue
    local ln
    ln=$(grep -nE '(password|passwd|secret|api-key|apikey|access-key|secret-key|token|credential)[[:space:]]*[:=][[:space:]]*[^[:space:]#]' "$c" 2>/dev/null \
       | grep -vE '[:=][[:space:]]*(\$\{|\{cipher\}|ENC\(|KMS\(|<|'"'"'?\$)' \
       | grep -viE 'example|change-?me|changeme|placeholder|your-|xxx' || true)
    [[ -n "$ln" ]] && enc_bad="${enc_bad}${c}:${ln}
"
  done <<< "$nacos_cfgs"
  _fw_report fail fw_nacos_config_encrypt "$enc_bad" "敏感配置明文（须 \${ENV} 外部化注入 / 加密插件 / KMS，明文入 Nacos 泄露即全泄露 CWE-312）" "未检出明文敏感配置"

  # ====================================================================
  # fw_nacos_instance_ephemeral(warn)：持久化实例选型须人工确认
  # ====================================================================
  local eph_hit=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    local ln
    ln=$(grep -nE 'ephemeral[[:space:]]*[:=][[:space:]]*false' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && eph_hit="${eph_hit}${c}:${ln}
"
  done
  _fw_report warn fw_nacos_instance_ephemeral "$eph_hit" "ephemeral=false 持久化实例（CP/Raft，宕机不剔除仅标不健康）——须人工确认选型必要性，普通微服务应用默认临时实例" "未检出持久化实例声明（默认临时实例 AP/Distro）"

  # ====================================================================
  # fw_nacos_gray_release(warn)：生产配置变更须走灰度发布
  # ====================================================================
  local prod_hit=0 gray_hit=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE 'active[[:space:]]*[:=][[:space:]]*prod|namespace.*prod|[-.]prod\.' "$c" 2>/dev/null; then
      prod_hit=1
    fi
    if grep -qiE 'gray|beta' "$c" 2>/dev/null; then
      gray_hit=1
    fi
  done
  if [[ "$prod_hit" -eq 1 && "$gray_hit" -eq 0 ]]; then
    warn "fw_nacos_gray_release: 检出 prod 环境配置但无 gray/beta 灰度痕迹（高风险配置生产变更须先灰度验证再全量；3.x 正式灰度规则待验证）"
  else
    pass "fw_nacos_gray_release: 无 prod 直发风险（或已有灰度配置）"
  fi

  # ====================================================================
  # fw_nacos_value_refresh(warn)：@NacosValue 须 autoRefreshed=true
  # ====================================================================
  local nv_files
  nv_files=$(grep -rlE '@NacosValue\b' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
  local nv_bad=""
  if [[ -n "$nv_files" ]]; then
    while IFS= read -r j; do
      [[ -z "$j" ]] && continue
      if ! grep -qE 'autoRefreshed[[:space:]]*=[[:space:]]*true' "$j" 2>/dev/null; then
        nv_bad="${nv_bad}${j}
"
      fi
    done <<< "$nv_files"
  fi
  if [[ -z "$nv_files" ]]; then
    pass "fw_nacos_value_refresh: 无 @NacosValue，跳过"
  elif [[ -n "$nv_bad" ]]; then
    warn "fw_nacos_value_refresh: @NacosValue 未显式 autoRefreshed=true（默认 false，配置推送后字段不刷新）:
${nv_bad}"
  else
    pass "fw_nacos_value_refresh: @NacosValue 均已开自动刷新"
  fi

  # ====================================================================
  # fw_nacos_server_cluster(warn)：Server 生产须集群部署，禁止 standalone
  # ====================================================================
  local sa_single="" sa_hit=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    local ln
    ln=$(grep -nE 'server-addr[[:space:]]*[:=][[:space:]]*[^[:space:]#]+' "$c" 2>/dev/null || true)
    if [[ -n "$ln" ]]; then
      sa_hit=1
      # 地址值不含逗号（单节点）→ 记录
      local one
      one=$(printf '%s\n' "$ln" | grep -v ',' || true)
      [[ -n "$one" ]] && sa_single="${sa_single}${c}:${one}
"
    fi
    ln=$(grep -niE 'standalone' "$c" 2>/dev/null || true)
    [[ -n "$ln" ]] && sa_single="${sa_single}${c}:${ln}
"
  done
  if [[ "$sa_hit" -eq 0 && -z "$sa_single" ]]; then
    pass "fw_nacos_server_cluster: 无 server-addr 配置，跳过"
  elif [[ -n "$sa_single" ]]; then
    warn "fw_nacos_server_cluster: server-addr 单地址或 standalone 痕迹（生产须 ≥3 节点集群 + 外置存储；3.x server/console 需 Java 17）:
${sa_single}"
  else
    pass "fw_nacos_server_cluster: server-addr 已配多节点"
  fi

  # ====================================================================
  # fw_nacos_client_heartbeat(warn)：心跳间隔不得擅自调小（默认 5s 基线）
  # ====================================================================
  local hb_bad=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    local ln v
    ln=$(grep -nE 'heart-beat-interval|beatInterval|beat-interval' "$c" 2>/dev/null || true)
    [[ -z "$ln" ]] && continue
    v=$(printf '%s\n' "$ln" | grep -oE '[0-9]+' | head -1 || true)
    if [[ -n "$v" && "$v" -lt 5000 ]]; then
      hb_bad="${hb_bad}${c}:${ln}
"
    fi
  done
  for j in "${javaarr[@]+"${javaarr[@]}"}"; do
    local ln
    ln=$(grep -nE 'setBeatInterval|beatInterval' "$j" 2>/dev/null || true)
    [[ -n "$ln" ]] && hb_bad="${hb_bad}${j}:${ln}（代码自定义心跳，须人工核对值）
"
  done
  _fw_report warn fw_nacos_client_heartbeat "$hb_bad" "心跳间隔 <5000ms 或代码自定义（默认 5s 基线；过频心跳风暴，过疏故障发现延迟）" "未检出异常心跳配置"

  # ====================================================================
  # fw_nacos_config_listener(warn)：@Value 注入 Nacos 配置须配 @RefreshScope
  # ====================================================================
  local nc_used=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE 'spring\.cloud\.nacos\.config|nacos\.config' "$c" 2>/dev/null \
       || { grep -qE '^[[:space:]]*nacos:' "$c" 2>/dev/null && grep -qE '^[[:space:]]*config:' "$c" 2>/dev/null; }; then
      nc_used=1
      break
    fi
  done
  if [[ "$nc_used" -eq 0 ]]; then
    for j in "${javaarr[@]+"${javaarr[@]}"}"; do
      grep -qE '@NacosPropertySource|NacosConfigManager|ConfigService' "$j" 2>/dev/null && { nc_used=1; break; }
    done
  fi
  if [[ "$nc_used" -eq 0 ]]; then
    pass "fw_nacos_config_listener: 无 Nacos config 使用，跳过"
  else
    local val_files rs_hit=0 nval_hit=0
    val_files=$(grep -rlE '@Value\b' "${javaarr[@]+"${javaarr[@]}"}" 2>/dev/null || true)
    for j in "${javaarr[@]+"${javaarr[@]}"}"; do
      grep -qE '@RefreshScope' "$j" 2>/dev/null && rs_hit=1
      grep -qE '@NacosValue|@ConfigurationProperties' "$j" 2>/dev/null && nval_hit=1
    done
    if [[ -n "$val_files" && "$rs_hit" -eq 0 && "$nval_hit" -eq 0 ]]; then
      warn "fw_nacos_config_listener: Nacos config + @Value 但无 @RefreshScope/@NacosValue/@ConfigurationProperties（配置推送后注入值不刷新）:
${val_files}"
    else
      pass "fw_nacos_config_listener: 配置刷新机制在位（或无 @Value 注入）"
    fi
  fi

  # ====================================================================
  # fw_nacos_config_priority(warn)：shared/extension/主配置优先级覆盖须核对
  # ====================================================================
  local shared_hit=0 ext_hit=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    grep -qE 'shared-configs|shared-config' "$c" 2>/dev/null && shared_hit=1
    grep -qE 'extension-configs|extension-config' "$c" 2>/dev/null && ext_hit=1
  done
  if [[ "$shared_hit" -eq 1 && "$ext_hit" -eq 1 ]]; then
    warn "fw_nacos_config_priority: shared-configs 与 extension-configs 同存（优先级 shared < extension < 主配置 < profile 配置，同 key 覆盖关系须人工核对）"
  else
    pass "fw_nacos_config_priority: 无 shared+extension 组合，跳过"
  fi

  # ====================================================================
  # fw_nacos_profile_isolation(warn)：profiles.active 不得硬编码字面值
  # ====================================================================
  local prof_bad=""
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    local ln
    ln=$(grep -nE 'profiles\.active[[:space:]]*[:=][[:space:]]*[A-Za-z]|^[[:space:]]*active[[:space:]]*:[[:space:]]*[A-Za-z]' "$c" 2>/dev/null \
       | grep -v '\${' || true)
    [[ -n "$ln" ]] && prof_bad="${prof_bad}${c}:${ln}
"
  done
  _fw_report warn fw_nacos_profile_isolation "$prof_bad" "profiles.active 硬编码字面值（dataId 按 \${prefix}-\${profiles.active} 解析，环境须部署期注入 \${DEPLOY_ENV:dev}）" "profiles.active 由占位符注入或未配置"

  # ====================================================================
  # fw_nacos_metadata(warn)：服务元数据须支撑版本/权重路由
  # ====================================================================
  local disc_hit=0 meta_hit=0
  for c in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    if grep -qE 'spring\.cloud\.nacos\.discovery|nacos\.discovery' "$c" 2>/dev/null \
       || { grep -qE '^[[:space:]]*nacos:' "$c" 2>/dev/null && grep -qE '^[[:space:]]*discovery:' "$c" 2>/dev/null; }; then
      disc_hit=1
      grep -qE 'metadata[[:space:]]*:|metadata\.' "$c" 2>/dev/null && meta_hit=1
    fi
  done
  if [[ "$disc_hit" -eq 0 ]]; then
    pass "fw_nacos_metadata: 无 Nacos discovery 配置，跳过"
  elif [[ "$meta_hit" -eq 1 ]]; then
    pass "fw_nacos_metadata: 服务元数据已配置"
  else
    warn "fw_nacos_metadata: discovery 配置无 metadata（version/region 等元数据是灰度路由、同可用区优先的基础，裸注册无法精细流量治理）"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
