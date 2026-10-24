# ruleset: fastapi  requires_conf: FASTAPI_SRC_GLOBS
# gates: fw_fastapi_blocking_async(fail) fw_fastapi_pydantic_v1(fail) fw_fastapi_response_model(warn) fw_fastapi_depends_yield(warn) fw_fastapi_background(warn) fw_fastapi_http_exception(warn) fw_fastapi_router_modular(warn) fw_fastapi_auth(warn) fw_fastapi_lifespan(warn) fw_fastapi_sync_io_async(warn) fw_fastapi_websocket(warn) fw_fastapi_cors(warn)
# harvested-from: P4（2026-07-17），规律源自 FastAPI 0.139.x / Pydantic v2 官方文档（https://fastapi.tiangolo.com/ ；https://docs.pydantic.dev/latest/migration/）
_fw_fastapi_check() {
  echo "  [fastapi] FastAPI 0.139.x / Pydantic v2 框架规律"

  # ---------- 收集源文件清单 ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${FASTAPI_SRC_GLOBS[@]+"${FASTAPI_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "fastapi: FASTAPI_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 代码正文过滤：调公共库 _fw_strip_comments_hash（Python 系，剔 # 注释）

  # ====================================================================
  # fw_fastapi_blocking_async(fail)：async 路由内 time.sleep 阻塞事件循环
  # ====================================================================
  local blk_bad=""
  for f in "${srcarr[@]}"; do
    if grep -qE 'async[[:space:]]+def' "$f" 2>/dev/null \
       && _fw_strip_comments_hash "$f" | grep -qE 'time\.sleep\('; then
      blk_bad="${blk_bad}${f}: async 路由内 time.sleep（事件循环全停）
"
    fi
  done
  _fw_report fail fw_fastapi_blocking_async "$blk_bad" "async 路由内阻塞调用（事件循环阻塞全 worker 停摆；改 def 路由或 await asyncio.sleep）" "async 路由无 time.sleep 阻塞"

  # ====================================================================
  # fw_fastapi_pydantic_v1(fail)：Pydantic v1 API 须迁 v2
  # ====================================================================
  local p1_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE '@validator\(|@root_validator\(|\.parse_obj\(|\.dict\(\)|class Config:' 2>/dev/null || true)
    [[ -n "$ln" ]] && p1_bad="${p1_bad}${f}:${ln}
"
  done
  _fw_report fail fw_fastapi_pydantic_v1 "$p1_bad" "Pydantic v1 API（@validator/class Config/.dict()/.parse_obj() 在 v2 已移除/弃用；迁 @field_validator + model_config + .model_dump()）" "无 Pydantic v1 API"

  # ====================================================================
  # fw_fastapi_response_model(warn)：路由须 response_model 过滤响应
  # ====================================================================
  local rm_bad=""
  for f in "${srcarr[@]}"; do
    if grep -qE '@[A-Za-z_]+\.(get|post|put|delete|patch)\(' "$f" 2>/dev/null \
       && ! grep -qE 'response_model' "$f" 2>/dev/null; then
      rm_bad="${rm_bad}${f}
"
    fi
  done
  _fw_report warn fw_fastapi_response_model "$rm_bad" "路由无 response_model（内部字段/ORM 全字段泄露风险）" "路由均声明 response_model 或无路由"

  # ====================================================================
  # fw_fastapi_depends_yield(warn)：yield 依赖须 try/finally 清理
  # ====================================================================
  local dy_bad=""
  for f in "${srcarr[@]}"; do
    if grep -qE 'Depends' "$f" 2>/dev/null \
       && _fw_strip_comments_hash "$f" | grep -qE '^[[:space:]]*yield[[:space:]]' \
       && ! grep -qE 'finally:' "$f" 2>/dev/null; then
      dy_bad="${dy_bad}${f}: yield 依赖无 finally（异常时资源不释放）
"
    fi
  done
  _fw_report warn fw_fastapi_depends_yield "$dy_bad" "yield 依赖缺 try/finally 清理（连接/会话泄漏）" "yield 依赖有 finally 或无 yield 依赖"

  # ====================================================================
  # fw_fastapi_background(warn)：BackgroundTasks 长任务须 Celery/RQ
  # ====================================================================
  local bg_bad=""
  for f in "${srcarr[@]}"; do
    if grep -qE 'BackgroundTasks' "$f" 2>/dev/null \
       && _fw_strip_comments_hash "$f" | grep -qE 'time\.sleep\('; then
      bg_bad="${bg_bad}${f}: BackgroundTasks 内长耗时任务（进程内执行不可靠，须 Celery/RQ 队列）
"
    fi
  done
  _fw_report warn fw_fastapi_background "$bg_bad" "BackgroundTasks 承载长任务（重启丢失/无重试，须可靠队列）" "BackgroundTasks 仅轻量任务或未使用"

  # ====================================================================
  # fw_fastapi_http_exception(warn)：路由内禁裸 raise Exception/ValueError
  # ====================================================================
  local he_bad=""
  for f in "${srcarr[@]}"; do
    if grep -qE '@[A-Za-z_]+\.(get|post|put|delete|patch)\(' "$f" 2>/dev/null; then
      local ln
      ln=$(_fw_strip_comments_hash "$f" | grep -nE 'raise[[:space:]]+(Exception|ValueError|RuntimeError|KeyError)\(' 2>/dev/null || true)
      [[ -n "$ln" ]] && he_bad="${he_bad}${f}:${ln}
"
    fi
  done
  _fw_report warn fw_fastapi_http_exception "$he_bad" "路由内裸异常将成 500（须 raise HTTPException(status_code=...)）" "路由用 HTTPException 或无裸异常"

  # ====================================================================
  # fw_fastapi_router_modular(warn)：路由须 APIRouter 模块化
  # ====================================================================
  local has_routes=0 has_router=0
  # SIGPIPE 加固（head 截断致 grep SIGPIPE，在 $() 末尾加 || true）
  has_routes=$(grep -rlE '@[A-Za-z_]+\.(get|post|put|delete|patch)\(' "${srcarr[@]}" 2>/dev/null | head -1 | wc -l | xargs || true)
  if [[ "$has_routes" -eq 0 ]]; then
    pass "fw_fastapi_router_modular: 无路由，跳过"
  else
    has_router=$(grep -rlE 'APIRouter\(' "${srcarr[@]}" 2>/dev/null | head -1 | wc -l | xargs || true)
    if [[ "$has_router" -eq 1 ]]; then
      pass "fw_fastapi_router_modular: 路由经 APIRouter 模块化"
    else
      warn "fw_fastapi_router_modular: 全部路由堆在 app 上无 APIRouter（单体不可拆分，须按域模块化）"
    fi
  fi

  # ====================================================================
  # fw_fastapi_auth(warn)：须有认证依赖（OAuth2/Security/HTTPBearer）
  # ====================================================================
  local has_auth=0
  if [[ "$has_routes" -eq 0 ]]; then
    pass "fw_fastapi_auth: 无路由，跳过"
  else
    has_auth=$(grep -rlE 'OAuth2|Security\(|HTTPBearer|APIKeyHeader|Depends\([A-Za-z_]*auth' "${srcarr[@]}" 2>/dev/null | head -1 | wc -l | xargs || true)
    if [[ "$has_auth" -eq 1 ]]; then
      pass "fw_fastapi_auth: 已配认证依赖"
    else
      warn "fw_fastapi_auth: 检出路由但无 OAuth2/Security/HTTPBearer 认证（接口裸奔）"
    fi
  fi

  # ====================================================================
  # fw_fastapi_lifespan(warn)：@app.on_event 弃用须 lifespan
  # ====================================================================
  local ls_bad=""
  for f in "${srcarr[@]}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE '@[A-Za-z_]+\.on_event\(' 2>/dev/null || true)
    [[ -n "$ln" ]] && ls_bad="${ls_bad}${f}:${ln}
"
  done
  _fw_report warn fw_fastapi_lifespan "$ls_bad" "@app.on_event 已弃用（须 lifespan asynccontextmanager 管理启动/关闭）" "无 on_event（用 lifespan 或无启动逻辑）"

  # ====================================================================
  # fw_fastapi_sync_io_async(warn)：async 路由内同步 IO 库须改 httpx/threadpool
  # ====================================================================
  local sio_bad=""
  for f in "${srcarr[@]}"; do
    if grep -qE 'async[[:space:]]+def' "$f" 2>/dev/null \
       && _fw_strip_comments_hash "$f" | grep -qE '\brequests\.(get|post|put|delete|patch)\(|urllib'; then
      sio_bad="${sio_bad}${f}: async 路由内 requests/urllib 同步 IO（须 httpx.AsyncClient 或 run_in_threadpool）
"
    fi
  done
  _fw_report warn fw_fastapi_sync_io_async "$sio_bad" "async 路由内同步 IO 库阻塞事件循环" "async 路由无同步 IO 库调用"

  # ====================================================================
  # fw_fastapi_websocket(warn)：WebSocket 路由须处理 WebSocketDisconnect
  # ====================================================================
  local has_ws=0 has_wsd=0
  has_ws=$(grep -rlE '@[A-Za-z_]+\.websocket\(' "${srcarr[@]}" 2>/dev/null | head -1 | wc -l | xargs || true)
  if [[ "$has_ws" -eq 0 ]]; then
    pass "fw_fastapi_websocket: 无 WebSocket 路由，跳过"
  else
    has_wsd=$(grep -rlE 'WebSocketDisconnect' "${srcarr[@]}" 2>/dev/null | head -1 | wc -l | xargs || true)
    if [[ "$has_wsd" -eq 1 ]]; then
      pass "fw_fastapi_websocket: WebSocket 断连有处理"
    else
      warn "fw_fastapi_websocket: WebSocket 路由未捕获 WebSocketDisconnect（客户端断开将抛未处理异常）"
    fi
  fi

  # ====================================================================
  # fw_fastapi_cors(warn)：CORSMiddleware allow_origins 禁 ["*"]
  # ====================================================================
  local cors_bad=""
  for f in "${srcarr[@]}"; do
    if grep -qE 'CORSMiddleware' "$f" 2>/dev/null \
       && grep -qE "allow_origins[[:space:]]*=[[:space:]]*\[[[:space:]]*[\"'][[:space:]]*\*" "$f" 2>/dev/null; then
      cors_bad="${cors_bad}${f}: allow_origins=[\"*\"]（跨域全开放）
"
    fi
  done
  _fw_report warn fw_fastapi_cors "$cors_bad" "allow_origins 通配（配合 allow_credentials 将放大窃取面，须白名单）" "CORS origins 收敛或未使用"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
