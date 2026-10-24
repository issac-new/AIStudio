# ruleset: angular  requires_conf: ANGULAR_SRC_GLOBS
# gates: fw_angular_standalone(warn) fw_angular_signals(warn) fw_angular_onpush(warn) fw_angular_subscribe_cleanup(fail) fw_angular_http_client(warn) fw_angular_di_inject(warn) fw_angular_impure_pipe(warn) fw_angular_signal_inputs(warn) fw_angular_lazy_route(warn) fw_angular_functional_guard(warn) fw_angular_zoneless(warn)
# harvested-from: P5 范例（2026-07-17），规律源自 Angular 19.x / 22.x 官方文档
_fw_angular_check() {
  echo "  [angular] Angular 19.x / 22.x 框架规律"

  # ---------- 收集源文件清单 ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${ANGULAR_SRC_GLOBS[@]+"${ANGULAR_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "angular: ANGULAR_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 代码正文过滤：调公共库 _fw_strip_comments_c（C 系，剔 // 与块注释行）

  # ====================================================================
  # fw_angular_standalone(warn)：检出 @NgModule → 新项目应 standalone
  # ====================================================================
  local ngmodule_files=""
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.module.ts)
        if grep -qE '@NgModule\b' "$f" 2>/dev/null; then
          ngmodule_files="${ngmodule_files}${f}
"
        fi
        ;;
    esac
  done
  _fw_report warn fw_angular_standalone "$ngmodule_files" "检出 @NgModule 文件（Angular 17+ standalone 默认，新项目应 standalone，遗留模块须标注迁移）" "无 @NgModule（已 standalone）"

  # ====================================================================
  # fw_angular_signals(warn)：Subject 须配合 signal/toSignal
  # ====================================================================
  local sig_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_c "$f")
    if printf '%s\n' "$body" | grep -qE '\b(Subject|BehaviorSubject|ReplaySubject)\b' 2>/dev/null; then
      if ! printf '%s\n' "$body" | grep -qE '\bsignal\(|\btoSignal\(|\btoObservable\(' 2>/dev/null; then
        local ln
        # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
        ln=$(printf '%s\n' "$body" | grep -nE '\b(Subject|BehaviorSubject|ReplaySubject)\b' 2>/dev/null | head -1 || true)
        sig_bad="${sig_bad}${f}:${ln}
"
      fi
    fi
  done
  _fw_report warn fw_angular_signals "$sig_bad" "检出 Subject 但同文件无 signal/toSignal（状态管理应优先 signal，性能优且 zoneless 下必需）" "未检出裸 Subject 状态管理（或已配 signal）"

  # ====================================================================
  # fw_angular_onpush(warn)：@Component 须配 OnPush
  # ====================================================================
  local onpush_bad=""
  local has_zoneless=0
  for f in "${srcarr[@]}"; do
    if grep -qE 'provideZonelessChangeDetection' "$f" 2>/dev/null; then
      has_zoneless=1
    fi
  done
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_c "$f")
    if printf '%s\n' "$body" | grep -qE '@Component\b' 2>/dev/null; then
      if ! printf '%s\n' "$body" | grep -qE 'ChangeDetectionStrategy\.OnPush|changeDetection:' 2>/dev/null; then
        local ln
        ln=$(printf '%s\n' "$body" | grep -nE '@Component\b' 2>/dev/null | head -1 || true)
        onpush_bad="${onpush_bad}${f}:${ln}
"
      fi
    fi
  done
  if [[ "$has_zoneless" -eq 1 ]]; then
    pass "fw_angular_onpush: 检出 zoneless 配置，OnPush 非必须"
  elif [[ -n "$onpush_bad" ]]; then
    warn "fw_angular_onpush: @Component 未配 ChangeDetectionStrategy.OnPush（默认变更检测性能差）:
${onpush_bad}"
  else
    pass "fw_angular_onpush: @Component 均配 OnPush（或无组件）"
  fi

  # ====================================================================
  # fw_angular_subscribe_cleanup(fail)：subscribe 须配 takeUntilDestroyed/takeUntil
  # ====================================================================
  local sub_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_c "$f")
    # 找每个 .subscribe( 调用行，检查前 2 行 + 本行是否含 takeUntilDestroyed / takeUntil
    local lines i
    lines=$(printf '%s\n' "$body" | grep -nE '\.subscribe\(' 2>/dev/null || true)
    [[ -z "$lines" ]] && continue
    while IFS=: read -r lnum rest; do
      [[ -z "$lnum" ]] && continue
      # lnum 须为纯数字（grep -n 行号）
      [[ "$lnum" =~ ^[0-9]+$ ]] || continue
      local start
      if [[ "$lnum" -gt 2 ]]; then start=$((lnum - 2)); else start=1; fi
      local window
      window=$(printf '%s\n' "$body" | sed -n "${start},${lnum}p" 2>/dev/null)
      if ! printf '%s\n' "$window" | grep -qE 'takeUntilDestroyed|takeUntil\(' 2>/dev/null; then
        sub_bad="${sub_bad}${f}:${lnum}: .subscribe 无 takeUntilDestroyed/takeUntil
"
      fi
    done <<< "$lines"
  done
  _fw_report fail fw_angular_subscribe_cleanup "$sub_bad" ".subscribe 调用未配 takeUntilDestroyed/takeUntil（组件销毁后订阅泄漏）" "subscribe 均配清理（或无 subscribe）"

  # ====================================================================
  # fw_angular_http_client(warn)：禁裸 fetch/XHR
  # ====================================================================
  local http_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_c "$f")
    # 跳过拦截器文件
    if printf '%s\n' "$body" | grep -qE 'HttpInterceptor|HttpInterceptorFn' 2>/dev/null; then
      continue
    fi
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE '\bfetch\(|new XMLHttpRequest\(' 2>/dev/null || true)
    [[ -n "$ln" ]] && http_bad="${http_bad}${f}:${ln}
"
  done
  _fw_report warn fw_angular_http_client "$http_bad" "检出 fetch/XHR（须用 HttpClient + 拦截器，否则绕过鉴权/错误处理）" "未检出裸 fetch/XHR"

  # ====================================================================
  # fw_angular_di_inject(warn)：禁 new XxxService()
  # ====================================================================
  local di_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_c "$f")
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE '\bnew [A-Z][a-zA-Z]*(Service|Repository|Store)\(' 2>/dev/null || true)
    [[ -n "$ln" ]] && di_bad="${di_bad}${f}:${ln}
"
  done
  _fw_report warn fw_angular_di_inject "$di_bad" "检出 new XxxService()（须通过 DI inject()/构造函数注入，否则丢失单例/测试替身）" "未检出 new 服务实例（已用 DI）"

  # ====================================================================
  # fw_angular_impure_pipe(warn)：impure pipe 风险
  # ====================================================================
  local pipe_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_c "$f")
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE 'pure:[[:space:]]*false|pure:[[:space:]]*0\b' 2>/dev/null || true)
    [[ -n "$ln" ]] && pipe_bad="${pipe_bad}${f}:${ln}
"
  done
  _fw_report warn fw_angular_impure_pipe "$pipe_bad" "检出 impure pipe（每次变更检测求值，性能差，须确认必要性）" "未检出 impure pipe"

  # ====================================================================
  # fw_angular_signal_inputs(warn)：@Input/@Output 装饰器 → 推荐信号输入
  # ====================================================================
  local dec_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_c "$f")
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE '@Input\(\)|@Output\(\)' 2>/dev/null || true)
    [[ -n "$ln" ]] && dec_bad="${dec_bad}${f}:${ln}
"
  done
  _fw_report warn fw_angular_signal_inputs "$dec_bad" "检出 @Input()/@Output() 装饰器（Angular 17+ 推荐 signal inputs: input()/output()）" "未检出 @Input/@Output 装饰器（已用 signal inputs）"

  # ====================================================================
  # fw_angular_lazy_route(warn)：路由须懒加载
  # ====================================================================
  local route_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_c "$f")
    # 检出 Routes 配置中 component: 直接引用（非 loadComponent/loadChildren）
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE 'component:[[:space:]]*[A-Z][a-zA-Z]*Component' 2>/dev/null || true)
    [[ -n "$ln" ]] && route_bad="${route_bad}${f}:${ln}
"
  done
  _fw_report warn fw_angular_lazy_route "$route_bad" "路由用 component: 直接引用（须 loadComponent/loadChildren 懒加载，否则首屏 bundle 过大）" "未检出 eager 路由（或无路由配置）"

  # ====================================================================
  # fw_angular_functional_guard(warn)：遗留 Guard 类
  # ====================================================================
  local guard_bad=""
  for f in "${srcarr[@]}"; do
    local body
    body=$(_fw_strip_comments_c "$f")
    local ln
    ln=$(printf '%s\n' "$body" | grep -nE 'implements (CanActivate|CanMatch|CanLoad|CanActivateChild)' 2>/dev/null || true)
    [[ -n "$ln" ]] && guard_bad="${guard_bad}${f}:${ln}
"
  done
  _fw_report warn fw_angular_functional_guard "$guard_bad" "检出遗留 Guard 类（Angular 15+ 推荐函数式守卫 canMatch/canActivate: [() => …]）" "未检出遗留 Guard 类"

  # ====================================================================
  # fw_angular_zoneless(warn)：zoneless + 残留 zone.js 冲突
  # ====================================================================
  local zoneless_hit=0 zone_residual=0
  for f in "${srcarr[@]}"; do
    if grep -qE 'provideZonelessChangeDetection' "$f" 2>/dev/null; then
      zoneless_hit=1
    fi
  done
  # 检查 angular.json（若在 srcarr 中）或任何配置文件含 zone.js polyfill
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      angular.json)
        if grep -qE 'zone\.js' "$f" 2>/dev/null; then
          zone_residual=1
        fi
        ;;
    esac
  done
  if [[ "$zoneless_hit" -eq 0 ]]; then
    pass "fw_angular_zoneless: 未启用 zoneless，跳过"
  elif [[ "$zone_residual" -eq 1 ]]; then
    warn "fw_angular_zoneless: provideZonelessChangeDetection 已启用但 angular.json 仍含 zone.js polyfill（配置冲突，须移除 zone.js）"
  else
    pass "fw_angular_zoneless: zoneless 配置一致"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
