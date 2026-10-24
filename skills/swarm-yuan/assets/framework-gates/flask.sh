# ruleset: flask  requires_conf: FLASK_SRC_GLOBS
# gates: fw_flask_secret_key(fail) fw_flask_debug(fail) fw_flask_errorhandler(warn) fw_flask_blueprint_circular(warn) fw_flask_session_teardown(warn) fw_flask_app_factory(warn) fw_flask_db_credentials(fail) fw_flask_request_validation(warn) fw_flask_json_response(warn) fw_flask_xss(warn) fw_flask_cors(warn) fw_flask_ratelimit(warn)
# harvested-from: P4（2026-07-17），规律源自 Flask 3.1.x 官方文档（https://flask.palletsprojects.com/）
_fw_flask_check() {
  echo "  [flask] Flask 3.1.x 框架规律"

  # ---------- 收集源文件清单 ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${FLASK_SRC_GLOBS[@]+"${FLASK_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "flask: FLASK_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 代码正文过滤：调公共库 _fw_strip_comments_hash（Python 系，剔 # 注释）

  # ====================================================================
  # fw_flask_secret_key(fail)：SECRET_KEY / app.secret_key 禁止硬编码
  # ====================================================================
  local sk_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE '(secret_key|SECRET_KEY)[]"'"'"']*[[:space:]]*=[[:space:]]*["'"'"']' 2>/dev/null \
       | grep -vE 'os\.environ|getenv|env\(|config\.get' || true)
    [[ -n "$ln" ]] && sk_bad="${sk_bad}${f}:${ln}
"
  done
  _fw_report fail fw_flask_secret_key "$sk_bad" "SECRET_KEY 硬编码（会话签名泄露即可伪造 Cookie，CWE-798）" "SECRET_KEY 经环境变量注入"

  # ====================================================================
  # fw_flask_debug(fail)：禁 app.run(debug=True) 上生产
  # ====================================================================
  local dbg_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE '\.run\([^)]*debug[[:space:]]*=[[:space:]]*True|\.debug[[:space:]]*=[[:space:]]*True' 2>/dev/null || true)
    [[ -n "$ln" ]] && dbg_bad="${dbg_bad}${f}:${ln}
"
  done
  _fw_report fail fw_flask_debug "$dbg_bad" "debug=True（Werkzeug 调试器 PIN 可绕过→RCE，CWE-489/CWE-94）" "无 debug=True 硬编码"

  # ====================================================================
  # fw_flask_errorhandler(warn)：须有统一错误处理
  # ====================================================================
  local has_routes=0 has_eh=0
  # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
  has_routes=$(grep -rlE '@[A-Za-z_]+\.route\(' "${srcarr[@]}" 2>/dev/null | head -1 | wc -l | xargs || true)
  has_eh=$(grep -rlE 'errorhandler|register_error_handler' "${srcarr[@]}" 2>/dev/null | head -1 | wc -l | xargs || true)
  if [[ "$has_routes" -eq 0 ]]; then
    pass "fw_flask_errorhandler: 无路由，跳过"
  elif [[ "$has_eh" -eq 1 ]]; then
    pass "fw_flask_errorhandler: 已注册 errorhandler"
  else
    warn "fw_flask_errorhandler: 检出路由但无 @app.errorhandler/register_error_handler（异常将返回默认 HTML 500，泄露堆栈）"
  fi

  # ====================================================================
  # fw_flask_blueprint_circular(warn)：蓝图模块反向 import 应用模块 → 循环导入
  # ====================================================================
  local bp_bad=""
  for f in "${srcarr[@]}"; do
    if grep -qE 'Blueprint\(' "$f" 2>/dev/null \
       && _fw_strip_comments_hash "$f" | grep -qE '^(from|import)[[:space:]]+(app|main|run|wsgi)[[:space:]]'; then
      bp_bad="${bp_bad}${f}: 蓝图模块 import 应用模块（循环导入风险）
"
    fi
  done
  _fw_report warn fw_flask_blueprint_circular "$bp_bad" "蓝图循环导入（须工厂模式 + current_app 延迟引用）" "蓝图无反向导入"

  # ====================================================================
  # fw_flask_session_teardown(warn)：SQLAlchemy 会话须 teardown/remove
  # ====================================================================
  local has_sm=0 has_td=0
  has_sm=$(grep -rlE 'scoped_session\(|sessionmaker\(' "${srcarr[@]}" 2>/dev/null | head -1 | wc -l | xargs || true)
  if [[ "$has_sm" -eq 0 ]]; then
    pass "fw_flask_session_teardown: 无 sessionmaker/scoped_session，跳过"
  else
    has_td=$(grep -rlE 'teardown_appcontext|\.remove\(\)' "${srcarr[@]}" 2>/dev/null | head -1 | wc -l | xargs || true)
    if [[ "$has_td" -eq 1 ]]; then
      pass "fw_flask_session_teardown: 会话有 teardown/remove 边界"
    else
      warn "fw_flask_session_teardown: scoped_session/sessionmaker 无 teardown_appcontext/remove（请求间会话泄漏、连接耗尽）"
    fi
  fi

  # ====================================================================
  # fw_flask_app_factory(warn)：应用工厂模式
  # ====================================================================
  local has_flaskapp=0 has_factory=0
  has_flaskapp=$(grep -rlE 'Flask\(__name__\)' "${srcarr[@]}" 2>/dev/null | head -1 | wc -l | xargs || true)
  if [[ "$has_flaskapp" -eq 0 ]]; then
    pass "fw_flask_app_factory: 未检出 Flask 应用，跳过"
  else
    has_factory=$(grep -rlE 'def create_app' "${srcarr[@]}" 2>/dev/null | head -1 | wc -l | xargs || true)
    if [[ "$has_factory" -eq 1 ]]; then
      pass "fw_flask_app_factory: 使用 create_app 工厂"
    else
      warn "fw_flask_app_factory: 顶层全局 app = Flask(__name__) 无工厂（测试/多实例/扩展初始化受阻，建议 create_app）"
    fi
  fi

  # ====================================================================
  # fw_flask_db_credentials(fail)：数据库 URI 禁明文凭据
  # ====================================================================
  local db_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE '[a-zA-Z][a-zA-Z0-9+]*://[A-Za-z0-9_-]+:[^@"'"'"'[:space:]]+@' 2>/dev/null \
       | grep -vE 'os\.environ|getenv|%\(|format\(|example|user:pass|user:password' || true)
    [[ -n "$ln" ]] && db_bad="${db_bad}${f}:${ln}
"
  done
  _fw_report fail fw_flask_db_credentials "$db_bad" "连接 URI 明文凭据（CWE-798，须环境变量注入）" "无明文凭据 URI"

  # ====================================================================
  # fw_flask_request_validation(warn)：请求体须校验
  # ====================================================================
  local rv_bad=""
  for f in "${srcarr[@]}"; do
    if grep -qE 'request\.get_json\(|request\.form\[|request\.args\[' "$f" 2>/dev/null \
       && ! grep -qE 'validate|Schema|pydantic|marshmallow|BaseModel' "$f" 2>/dev/null; then
      rv_bad="${rv_bad}${f}
"
    fi
  done
  _fw_report warn fw_flask_request_validation "$rv_bad" "直接使用 request 数据无校验（须 pydantic/marshmallow Schema）" "请求数据有校验或无请求解析"

  # ====================================================================
  # fw_flask_json_response(warn)：禁 return json.dumps，须 jsonify
  # ====================================================================
  local jr_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE 'return[[:space:]]+json\.dumps\(' 2>/dev/null || true)
    [[ -n "$ln" ]] && jr_bad="${jr_bad}${f}:${ln}
"
  done
  _fw_report warn fw_flask_json_response "$jr_bad" "return json.dumps 缺 Content-Type: application/json（须 jsonify）" "无 json.dumps 直返"

  # ====================================================================
  # fw_flask_xss(warn)：Markup/|safe 拼接绕过自动转义
  # ====================================================================
  local xss_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE 'Markup\(|render_template_string\([^)]*(\+|%|f["'"'"'])' 2>/dev/null || true)
    [[ -n "$ln" ]] && xss_bad="${xss_bad}${f}:${ln}
"
  done
  _fw_report warn fw_flask_xss "$xss_bad" "Markup/拼接模板串绕过 Jinja 自动转义（XSS，CWE-79）" "无 Markup/拼接模板"

  # ====================================================================
  # fw_flask_cors(warn)：CORS 禁全开放 origins=*
  # ====================================================================
  local cors_bad=""
  for f in "${srcarr[@]}"; do
    if ! grep -qE 'CORS\(' "$f" 2>/dev/null; then
      continue
    fi
    if grep -qE "origins[[:space:]]*=[[:space:]]*[\\[\"']*[[:space:]]*\\*" "$f" 2>/dev/null \
       || grep -qE 'CORS\([A-Za-z_]+\)[[:space:]]*$' "$f" 2>/dev/null; then
      cors_bad="${cors_bad}${f}: CORS 全开放（origins=*）
"
    fi
  done
  _fw_report warn fw_flask_cors "$cors_bad" "CORS origins=*（配合 Cookie 会话将放大 CSRF/数据窃取面）" "CORS origins 收敛或未使用"

  # ====================================================================
  # fw_flask_ratelimit(warn)：登录等敏感路由须限流
  # ====================================================================
  local has_login=0 has_limiter=0
  has_login=$(grep -rlE '["'"'"']/(login|signin|auth/token)["'"'"']' "${srcarr[@]}" 2>/dev/null | head -1 | wc -l | xargs || true)
  if [[ "$has_login" -eq 0 ]]; then
    pass "fw_flask_ratelimit: 无登录路由，跳过"
  else
    has_limiter=$(grep -rlE 'Limiter|flask_limiter|ratelimit' "${srcarr[@]}" 2>/dev/null | head -1 | wc -l | xargs || true)
    if [[ "$has_limiter" -eq 1 ]]; then
      pass "fw_flask_ratelimit: 已配限流（flask-limiter）"
    else
      warn "fw_flask_ratelimit: 检出登录路由但无限流（暴破/撞库风险，建议 flask-limiter）"
    fi
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
