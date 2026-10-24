# ruleset: kratos  requires_conf: KRATOS_SRC_GLOBS
# gates: fw_kratos_recovery_middleware(fail) fw_kratos_error_wrap(warn) fw_kratos_context_propagation(warn) fw_kratos_wire_provider(fail) fw_kratos_generated_code_edit(fail) fw_kratos_plaintext_secret(fail) fw_kratos_layer_dependency(fail) fw_kratos_unimplemented_embed(warn) fw_kratos_http_register_missing(warn) fw_kratos_server_timeout(warn) fw_kratos_validate_middleware(warn) fw_kratos_app_metadata(warn) fw_kratos_wire_gen_missing(warn)
# harvested-from: P1/P2 批次新增（2026-07-20），规律源自 go-kratos v2 官方文档 / kratos-layout / grpc-go issue 调研
_fw_kratos_check() {
  echo "  [kratos] go-kratos v2.x（kratos-layout 分层）框架规律"

  # ---------- 收集源文件清单（go + proto + 配置统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${KRATOS_SRC_GLOBS[@]+"${KRATOS_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "kratos: KRATOS_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 go 源码 / proto / yaml 配置（go.mod 仅供 §1 探查信号，不入组）
  local goarr=() protoarr=() cfgarr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.go) goarr+=("$f") ;;
      *.proto) protoarr+=("$f") ;;
      *.yaml|*.yml) cfgarr+=("$f") ;;
    esac
  done

  # 代码正文过滤：调公共库 _fw_strip_comments_c_inline（C 系变体，多剥行内 /* */）

  local g ln

  # ====================================================================
  # fw_kratos_recovery_middleware(fail)：NewServer 注册中间件栈须含
  #   recovery.Recovery() 且置于链首（链首=最外层，靠前者 panic 无人兜底）
  # ====================================================================
  local rec_missing_bad="" rec_order_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    local code
    code=$(_fw_strip_comments_c_inline "$g" 2>/dev/null)
    [[ -z "$code" ]] && continue
    # 仅检「NewServer + Middleware 栈」文件：无中间件栈的裸 server 不在本门禁范围
    printf '%s\n' "$code" | grep -qE '(http|grpc)\.NewServer\(' || continue
    printf '%s\n' "$code" | grep -qE '\.Middleware\(' || continue
    if ! printf '%s\n' "$code" | grep -qE 'recovery\.Recovery\('; then
      rec_missing_bad="${rec_missing_bad}${g}: NewServer 注册中间件栈但无 recovery.Recovery()
"
      continue
    fi
    # Recovery 行号须等于文件内最早中间件构造调用行号（即链首）
    local rec_line first_mid
    # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
    rec_line=$(printf '%s\n' "$code" | grep -nE 'recovery\.Recovery\(' | head -1 | cut -d: -f1 || true)
    first_mid=$(printf '%s\n' "$code" | grep -nE '(recovery\.Recovery|logging\.Server|validate\.Validate|tracing\.Server|metrics\.Server|ratelimit\.Server|circuitbreaker\.Server|selector\.Server|metadata\.Server)\(' | head -1 | cut -d: -f1 || true)
    if [[ -n "$first_mid" && -n "$rec_line" && "$rec_line" -ne "$first_mid" ]]; then
      rec_order_bad="${rec_order_bad}${g}: Recovery(line ${rec_line}) 非链首中间件(链首 line ${first_mid})
"
    fi
  done
  if [[ -n "$rec_missing_bad" ]]; then
    fail "fw_kratos_recovery_middleware: NewServer 未注册 recovery.Recovery()（业务 panic 未捕获将崩进程）:
${rec_missing_bad}"
  elif [[ -n "$rec_order_bad" ]]; then
    warn "fw_kratos_recovery_middleware: recovery.Recovery() 非中间件链首（其前中间件内 panic 未被捕获）:
${rec_order_bad}"
  else
    pass "fw_kratos_recovery_middleware: Recovery 已注册且置链首（或无服务端中间件栈）"
  fi

  # ====================================================================
  # fw_kratos_error_wrap(warn)：service/biz 层禁用 fmt.Errorf/stdlib
  #   errors.New/grpc status.Error 直返，须 kratos errors 包装（code+reason）
  # ====================================================================
  local wrap_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    case "$g" in
      */internal/service/*|*/internal/biz/*) ;;
      *) continue ;;
    esac
    # errors.New("...") 单字符串实参为标准库形态；kratos errors.New(4xx, "REASON", ...) 首参为数字不误伤
    ln=$(_fw_strip_comments_c_inline "$g" | grep -nE 'fmt\.Errorf\(|errors\.New\("|status\.Errorf?\(' || true)
    [[ -n "$ln" ]] && wrap_bad="${wrap_bad}${g}:${ln}
"
  done
  _fw_report warn fw_kratos_error_wrap "$wrap_bad" "业务层直返 fmt.Errorf/stdlib errors.New/status.Error（未用 kratos errors 包装，gRPC 状态码恒 Unknown、HTTP 恒 500，客户端无法 errors.Is/FromError 判定）" "业务错误均经 kratos errors 包装"

  # ====================================================================
  # fw_kratos_context_propagation(warn)：请求链路内禁新建
  #   context.Background()/TODO()（超时/取消/metadata/trace 断链）
  # ====================================================================
  local ctx_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    case "$g" in
      */internal/service/*|*/internal/biz/*|*/internal/data/*) ;;
      *) continue ;;
    esac
    case "$(basename "$g")" in *_test.go) continue ;; esac
    ln=$(_fw_strip_comments_c_inline "$g" | grep -nE 'context\.(Background|TODO)\(\)' || true)
    [[ -n "$ln" ]] && ctx_bad="${ctx_bad}${g}:${ln}
"
  done
  _fw_report warn fw_kratos_context_propagation "$ctx_bad" "请求链路内新建 context.Background()/TODO()（入参 ctx 未透传，超时/取消/元数据/链路追踪在此断点）" "请求链路 ctx 均透传"

  # ====================================================================
  # fw_kratos_wire_provider(fail)：New*Service/New*Usecase/New*Repo
  #   provider 须收录进同目录 wire.NewSet(（否则 wire 生成报 provider 缺失）
  # ====================================================================
  local wire_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    case "$g" in
      */internal/*) ;;
      *) continue ;;
    esac
    local code names
    code=$(_fw_strip_comments_c_inline "$g" 2>/dev/null)
    [[ -z "$code" ]] && continue
    names=$(printf '%s\n' "$code" | grep -oE 'func New[A-Za-z0-9_]+(Service|Usecase|Repo)\(' || true)
    [[ -z "$names" ]] && continue
    names=$(printf '%s\n' "$names" | sed -e 's/^func //' -e 's/($//')
    # 同目录内含 wire.NewSet( 的文件集合
    local dir setfiles
    dir=$(dirname "$g")
    setfiles=$(grep -lE 'wire\.NewSet\(' "$dir"/*.go 2>/dev/null || true)
    local name
    while IFS= read -r name; do
      [[ -z "$name" ]] && continue
      if [[ -z "$setfiles" ]]; then
        wire_bad="${wire_bad}${g}: provider ${name} 所在目录无 wire.NewSet( 收录
"
        continue
      fi
      local found=0 sf
      for sf in $setfiles; do
        if _fw_strip_comments_c_inline "$sf" | grep -qw "$name"; then
          found=1
          break
        fi
      done
      [[ "$found" -eq 0 ]] && wire_bad="${wire_bad}${g}: provider ${name} 未收录进同目录 wire.NewSet(（wire 生成将报 provider 缺失/注入链断裂）
"
    done <<< "$names"
  done
  _fw_report fail fw_kratos_wire_provider "$wire_bad" "wire provider 定义后未收录 ProviderSet（编译期依赖注入断链，wire 构建报错或实例缺失）" "provider 均已收录 ProviderSet"

  # ====================================================================
  # fw_kratos_generated_code_edit(fail)：生成代码（*.pb.go / wire_gen.go）
  #   前 5 行须含 DO NOT EDIT 头（缺失=被手写替换/标记抹除，重生成即覆盖）
  # ====================================================================
  local gen_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    case "$(basename "$g")" in
      *.pb.go|wire_gen.go) ;;
      *) continue ;;
    esac
    if ! head -5 "$g" | grep -q 'DO NOT EDIT'; then
      gen_bad="${gen_bad}${g}: 生成文件缺「DO NOT EDIT」头（疑似手改生成代码，protoc/wire 重生成将覆盖）
"
    fi
  done
  _fw_report fail fw_kratos_generated_code_edit "$gen_bad" "手改 protoc/wire 生成代码（生成头被抹除，改动随重新生成丢失；定制须走 partial 方法/装饰层/option）" "生成代码头完整"

  # ====================================================================
  # fw_kratos_plaintext_secret(fail)：配置文件禁明文凭据
  #   (a) password/secret/token/api_key/access_key 非空非 ${ENV} 占位
  #   (b) DSN/URL 内嵌 user:pass@（scheme:// 形态与 MySQL @tcp( 形态）
  # ====================================================================
  local sec_bad=""
  for g in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    local code
    code=$(_fw_strip_comments_cfg "$g" 2>/dev/null)
    [[ -z "$code" ]] && continue
    # (a) 键名类：冒号后须紧跟字母数字（空值/${ENV}/{cipher} 占位不命中），含 ${ 者豁免
    ln=$(printf '%s\n' "$code" | grep -nEi "(password|secret|token|api_?key|access_?key)[[:space:]]*:[[:space:]]*[\"']?[A-Za-z0-9]" | grep -vF '${' || true)
    [[ -n "$ln" ]] && sec_bad="${sec_bad}${g}:${ln}
"
    # (b) DSN 内嵌凭据两种形态，含 ${ 占位者豁免
    ln=$(printf '%s\n' "$code" | grep -nE '://[^/@[:space:]"]+:[^/@[:space:]"]+@|:[^/@[:space:]"]+@tcp\(' | grep -vF '${' || true)
    [[ -n "$ln" ]] && sec_bad="${sec_bad}${g}:${ln}
"
  done
  _fw_report fail fw_kratos_plaintext_secret "$sec_bad" "配置文件明文凭据（password/secret/token 或 DSN user:pass@；须改 \${ENV} 占位 + 环境变量/配置中心/KMS 注入）" "未发现配置明文凭据"

  # ====================================================================
  # fw_kratos_layer_dependency(fail)：biz/service 禁 import internal/data
  #   （kratos-layout 依赖倒置：biz 定义 Repo 接口，data 实现，wire 注入）
  # ====================================================================
  local layer_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    case "$g" in
      */internal/biz/*|*/internal/service/*) ;;
      *) continue ;;
    esac
    ln=$(_fw_strip_comments_c_inline "$g" | grep -nE '"[^"]*/internal/data"' || true)
    [[ -n "$ln" ]] && layer_bad="${layer_bad}${g}:${ln}
"
  done
  _fw_report fail fw_kratos_layer_dependency "$layer_bad" "biz/service 层直接 import internal/data（分层倒挂：层级耦合、Repo 无法 mock 替换，违反 kratos-layout 依赖倒置）" "无跨层 import internal/data"

  # ====================================================================
  # fw_kratos_unimplemented_embed(warn)：注册 Register*Server 的服务 struct
  #   须值内嵌 Unimplemented*Server（grpc-go 官方前向兼容要求）
  # ====================================================================
  # 先提取全项目 gRPC 服务注册名（RegisterXxxServer，剔除 HTTP 网关的 XxxHTTP）
  local regnames="" rn
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    ln=$(_fw_strip_comments_c_inline "$g" | grep -oE 'Register[A-Za-z0-9_]+Server\(' || true)
    [[ -z "$ln" ]] && continue
    ln=$(printf '%s\n' "$ln" | sed -e 's/^Register//' -e 's/Server($//')
    while IFS= read -r rn; do
      [[ -z "$rn" ]] && continue
      case "$rn" in *HTTP) continue ;; esac
      regnames="${regnames}${rn}
"
    done <<< "$ln"
  done
  regnames=$(printf '%s\n' "$regnames" | sort -u)
  local unimpl_bad=""
  while IFS= read -r rn; do
    [[ -z "$rn" ]] && continue
    local hit=0
    for g in "${goarr[@]+"${goarr[@]}"}"; do
      if _fw_strip_comments_c_inline "$g" | grep -qE "Unimplemented${rn}Server"; then
        hit=1
        break
      fi
    done
    [[ "$hit" -eq 0 ]] && unimpl_bad="${unimpl_bad}Register${rn}Server 已注册但无 Unimplemented${rn}Server 内嵌
"
  done <<< "$regnames"
  _fw_report warn fw_kratos_unimplemented_embed "$unimpl_bad" "服务 struct 未值内嵌 UnimplementedXxxServer（proto 增方法即编译断裂；grpc-go 要求值内嵌前向兼容）" "均已内嵌 Unimplemented 基座"

  # ====================================================================
  # fw_kratos_http_register_missing(warn)：proto 含 google.api.http 注解的
  #   service 须在代码中 RegisterXxxHTTPServer(（REST 网关未挂载则注解失效）
  # ====================================================================
  local http_bad="" svc gg
  for g in "${protoarr[@]+"${protoarr[@]}"}"; do
    grep -qE 'google\.api\.http' "$g" 2>/dev/null || continue
    svc=$(grep -oE '^service[[:space:]]+[A-Za-z0-9_]+' "$g" 2>/dev/null | head -1 | awk '{print $2}' || true)
    [[ -z "$svc" ]] && continue
    local hit=0
    for gg in "${goarr[@]+"${goarr[@]}"}"; do
      if _fw_strip_comments_c_inline "$gg" | grep -qE "Register${svc}HTTPServer\("; then
        hit=1
        break
      fi
    done
    [[ "$hit" -eq 0 ]] && http_bad="${http_bad}${g}: proto service ${svc} 含 google.api.http 注解但缺 Register${svc}HTTPServer(（REST 客户端不可达）
"
  done
  _fw_report warn fw_kratos_http_register_missing "$http_bad" "proto 声明 HTTP 注解但未注册 HTTP 网关（注解成摆设，REST/浏览器客户端 404）" "HTTP 网关注册齐备"

  # ====================================================================
  # fw_kratos_server_timeout(warn)：NewServer 须配 (http|grpc).Timeout(
  # ====================================================================
  local to_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    local code
    code=$(_fw_strip_comments_c_inline "$g" 2>/dev/null)
    [[ -z "$code" ]] && continue
    printf '%s\n' "$code" | grep -qE '(http|grpc)\.NewServer\(' || continue
    printf '%s\n' "$code" | grep -qE '(http|grpc)\.Timeout\(' && continue
    to_bad="${to_bad}${g}: NewServer 未配 (http|grpc).Timeout(（慢请求/慢客户端耗尽连接与 goroutine）
"
  done
  _fw_report warn fw_kratos_server_timeout "$to_bad" "服务端无 Timeout 选项（慢请求长期占用连接/goroutine，故障时资源耗尽）" "NewServer 均配 Timeout"

  # ====================================================================
  # fw_kratos_validate_middleware(warn)：proto 含 validate.rules 则服务端
  #   中间件栈须挂 validate.Validate(（否则校验规则不生效）
  # ====================================================================
  local val_proto_hit=0
  for g in "${protoarr[@]+"${protoarr[@]}"}"; do
    grep -qE 'validate\.rules' "$g" 2>/dev/null && val_proto_hit=1
  done
  if [[ "$val_proto_hit" -eq 1 ]]; then
    local val_hit=0
    for g in "${goarr[@]+"${goarr[@]}"}"; do
      _fw_strip_comments_c_inline "$g" | grep -qE 'validate\.Validate\(' && val_hit=1
    done
    if [[ "$val_hit" -eq 0 ]]; then
      warn "fw_kratos_validate_middleware: proto 含 validate.rules 校验规则但服务端未挂 validate.Validate()（规则不生效，非法输入直达业务层）"
    else
      pass "fw_kratos_validate_middleware: validate.rules 已配 validate.Validate() 中间件"
    fi
  else
    pass "fw_kratos_validate_middleware: 无 validate.rules 声明（跳过）"
  fi

  # ====================================================================
  # fw_kratos_app_metadata(warn)：kratos.New( 须配 kratos.Name/kratos.Version
  # ====================================================================
  local meta_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    local code
    code=$(_fw_strip_comments_c_inline "$g" 2>/dev/null)
    [[ -z "$code" ]] && continue
    printf '%s\n' "$code" | grep -qE 'kratos\.New\(' || continue
    if ! printf '%s\n' "$code" | grep -qE 'kratos\.Name\('; then
      meta_bad="${meta_bad}${g}: kratos.New( 缺 kratos.Name(（注册中心实例名为空）
"
    fi
    if ! printf '%s\n' "$code" | grep -qE 'kratos\.Version\('; then
      meta_bad="${meta_bad}${g}: kratos.New( 缺 kratos.Version(（实例元数据/版本缺失）
"
    fi
  done
  _fw_report warn fw_kratos_app_metadata "$meta_bad" "kratos.New 缺 Name/Version 选项（注册中心实例标识为空，灰度/路由/监控难区分版本）" "kratos.New 元数据齐备"

  # ====================================================================
  # fw_kratos_wire_gen_missing(warn)：存在 wire.go(wire.Build) 但同目录无
  #   wire_gen.go（未执行 wire 生成/未提交，wireApp 未定义编译失败）
  # ====================================================================
  local wgen_bad=""
  for g in "${goarr[@]+"${goarr[@]}"}"; do
    case "$(basename "$g")" in
      wire.go) ;;
      *) continue ;;
    esac
    grep -qE 'wire\.Build\(' "$g" 2>/dev/null || continue
    local dir
    dir=$(dirname "$g")
    if [[ ! -f "${dir}/wire_gen.go" ]]; then
      wgen_bad="${wgen_bad}${g}: 存在 wire.go(wire.Build) 但同目录无 wire_gen.go（injector 未生成，wireApp 编译期未定义）
"
    fi
  done
  _fw_report warn fw_kratos_wire_gen_missing "$wgen_bad" "wire_gen.go 缺失（须执行 wire 生成并提交；CI 不含 wire 步骤时直接编译失败）" "wire_gen.go 已生成"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
