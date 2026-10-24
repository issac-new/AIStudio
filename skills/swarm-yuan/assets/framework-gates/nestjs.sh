# ruleset: nestjs  requires_conf: NEST_SRC_GLOBS
# gates: fw_nest_validation_whitelist(fail) fw_nest_circular_deps(fail) fw_nest_request_scope(warn) fw_nest_global_module(warn) fw_nest_exception_filter(warn) fw_nest_serialization(warn) fw_nest_typeorm_sync(fail) fw_nest_swagger(warn)
# harvested-from: P4 调研（2026-07-17），规律源自 NestJS 11 官方文档
_fw_nestjs_check() {
  echo "  [nestjs] NestJS 11 框架规律"

  # ---------- 收集源文件清单（ts 源码 + package.json 统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${NEST_SRC_GLOBS[@]+"${NEST_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "nestjs: NEST_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  local tsarr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.ts|*.js) tsarr+=("$f") ;;
    esac
  done

  # ====================================================================
  # fw_nest_validation_whitelist(fail)：全局 ValidationPipe 须 whitelist: true
  # ====================================================================
  local vp_files
  vp_files=$(grep -rlE 'ValidationPipe' "${tsarr[@]+"${tsarr[@]}"}" 2>/dev/null || true)
  if [[ -z "$vp_files" ]]; then
    fail "fw_nest_validation_whitelist: 未检出 ValidationPipe（DTO 入参无校验，须 useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))）"
  else
    local wl_ok=0 fnw_missing=0 vf
    for vf in $vp_files; do
      if grep -qE 'whitelist[[:space:]]*:[[:space:]]*true' "$vf" 2>/dev/null; then
        wl_ok=1
        if ! grep -qE 'forbidNonWhitelisted[[:space:]]*:[[:space:]]*true' "$vf" 2>/dev/null; then
          fnw_missing=1
        fi
      fi
    done
    if [[ "$wl_ok" -eq 0 ]]; then
      fail "fw_nest_validation_whitelist: ValidationPipe 未配 whitelist: true（DTO 未声明字段直透业务/ORM，CWE-915 批量赋值风险）"
    elif [[ "$fnw_missing" -eq 1 ]]; then
      warn "fw_nest_validation_whitelist: whitelist 已配但缺 forbidNonWhitelisted: true（未知字段仅剥离不报错，排障困难）"
    else
      pass "fw_nest_validation_whitelist: ValidationPipe whitelist + forbidNonWhitelisted 已配"
    fi
  fi

  # ====================================================================
  # fw_nest_circular_deps(fail)：模块循环依赖（A.module imports B.module 且 B imports A）
  # ====================================================================
  local cyc_bad=""
  local mf
  for mf in "${tsarr[@]+"${tsarr[@]}"}"; do
    case "$mf" in *.module.ts) ;; *) continue ;; esac
    local mdir self_base imports imp cand
    mdir=$(dirname "$mf")
    self_base=$(basename "$mf" .ts)
    imports=$(grep -oE "from[[:space:]]+['\"][^'\"]+['\"]" "$mf" 2>/dev/null | sed -E "s/from[[:space:]]+['\"]//; s/['\"]$//" || true)
    while IFS= read -r imp; do
      case "$imp" in ./*|../*) ;; *) continue ;; esac
      case "$imp" in *.module|*.module/*) ;; *) continue ;; esac
      for cand in "$mdir/$imp.ts" "$mdir/$imp/index.ts"; do
        [[ -f "$cand" ]] || continue
        case "$cand" in *.module.ts) ;; *) continue ;; esac
        if grep -qE "from[[:space:]]+['\"][^'\"]*${self_base}['\"]" "$cand" 2>/dev/null; then
          cyc_bad="${cyc_bad}${mf} <-> ${cand}
"
        fi
      done
    done <<< "$imports"
  done
  # forwardRef 是循环依赖的显式信号
  local fr_hit
  fr_hit=$(grep -rnE 'forwardRef\(' "${tsarr[@]+"${tsarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$cyc_bad" ]]; then
    fail "fw_nest_circular_deps: 检出模块循环依赖（imports 互相引用；DI 容器实例化顺序不可预期，须抽 SharedModule 或 forwardRef 并评审）:
${cyc_bad}"
  elif [[ -n "$fr_hit" ]]; then
    warn "fw_nest_circular_deps: 检出 forwardRef（循环依赖信号，须评审模块边界）:
${fr_hit}"
  else
    pass "fw_nest_circular_deps: 未检出模块循环依赖"
  fi

  # ====================================================================
  # fw_nest_request_scope(warn)：Scope.REQUEST 性能损耗须慎用
  # ====================================================================
  local rs_hit
  rs_hit=$(grep -rnE 'Scope\.REQUEST|scope[[:space:]]*:[[:space:]]*Scope\.REQUEST' "${tsarr[@]+"${tsarr[@]}"}" 2>/dev/null || true)
  _fw_report warn fw_nest_request_scope "$rs_hit" "检出 REQUEST 作用域 provider（每请求实例化整条依赖链，性能损耗；须确认确需请求态，优先 DEFAULT 单例 + AsyncLocalStorage）" "无 REQUEST 作用域滥用"

  # ====================================================================
  # fw_nest_global_module(warn)：@Global() 模块滥用破坏边界
  # ====================================================================
  local gm_hit
  gm_hit=$(grep -rnE '@Global\(\)' "${tsarr[@]+"${tsarr[@]}"}" 2>/dev/null || true)
  _fw_report warn fw_nest_global_module "$gm_hit" "检出 @Global() 模块（provider 全局可见，破坏模块边界；仅基础设施模块允许，须评审）" "无 @Global() 模块滥用"

  # ====================================================================
  # fw_nest_exception_filter(warn)：统一异常过滤器
  # ====================================================================
  local ef_hit
  ef_hit=$(grep -rlE '@Catch\(|useGlobalFilters|APP_FILTER' "${tsarr[@]+"${tsarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$ef_hit" ]]; then
    pass "fw_nest_exception_filter: 异常过滤器存在"
  else
    warn "fw_nest_exception_filter: 未检出统一异常过滤器（@Catch/useGlobalFilters/APP_FILTER；异常响应格式不统一且错误栈外露风险 CWE-209）"
  fi

  # ====================================================================
  # fw_nest_serialization(warn)：序列化拦截器（隐藏敏感字段）
  # ====================================================================
  local se_hit
  se_hit=$(grep -rlE 'ClassSerializerInterceptor|SerializeInterceptor|@Exclude|@Expose' "${tsarr[@]+"${tsarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$se_hit" ]]; then
    pass "fw_nest_serialization: 序列化拦截器/排除注解存在"
  else
    warn "fw_nest_serialization: 未检出 ClassSerializerInterceptor（实体 password 等敏感字段直出风险 CWE-200）"
  fi

  # ====================================================================
  # fw_nest_typeorm_sync(fail)：TypeORM synchronize: true 生产禁用
  # ====================================================================
  local ts_bad=""
  for f in "${tsarr[@]+"${tsarr[@]}"}"; do
    local ln
    ln=$(grep -nE 'synchronize[[:space:]]*:[[:space:]]*true' "$f" 2>/dev/null || true)
    [[ -n "$ln" ]] && ts_bad="${ts_bad}${f}:${ln}
"
  done
  _fw_report fail fw_nest_typeorm_sync "$ts_bad" "TypeORM synchronize: true（启动即改生产库结构，数据丢失风险；须 false + migration）" "未检出 synchronize: true"

  # ====================================================================
  # fw_nest_swagger(warn)：Swagger 文档
  # ====================================================================
  local sw_hit
  sw_hit=$(grep -rlE '@nestjs/swagger|SwaggerModule' "${tsarr[@]+"${tsarr[@]}"}" 2>/dev/null || true)
  if [[ -n "$sw_hit" ]]; then
    pass "fw_nest_swagger: Swagger 文档存在"
  else
    warn "fw_nest_swagger: 未检出 @nestjs/swagger（API 契约无自描述文档，协作与契约测试困难）"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
