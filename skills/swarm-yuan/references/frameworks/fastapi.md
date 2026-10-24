---
ruleset_id: fastapi
适用版本: FastAPI 0.139.x（2026-07 现行 0.139.2）/ Pydantic v2
最后调研: 2026-07-17（来源：https://pypi.org/pypi/fastapi/json ；https://fastapi.tiangolo.com/ ；https://fastapi.tiangolo.com/advanced/events/ ；https://docs.pydantic.dev/latest/migration/ ）
深度门槛: 10
---

# FastAPI 规则集

<!--
本规则集覆盖 FastAPI 0.139.x（2026-07 现行）+ Pydantic v2 + Starlette 现行版本。
调研时点：2026-07-17。@app.on_event 已标记弃用，官方推荐 lifespan；FastAPI 1.0 时点：待验证（未 GA 信息可核实）。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `fastapi` / `uvicorn`（requirements.txt / pyproject.toml） | 高 |
| 代码 | `from fastapi import` / `FastAPI(` / `APIRouter(` / `Depends(` | 高 |
| 代码 | `from pydantic import` / `BaseModel` / `field_validator` | 中（pydantic 可独立于 FastAPI 使用） |
| 脚本调用 | `uvicorn .* :app` / `fastapi run` | 高 |
| 配置 | `allow_origins` / `CORSMiddleware` / `response_model` | 中 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 fastapi 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 路由：`grep -rnE '@[A-Za-z_]+\.(get|post|put|delete|patch)\(' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：路由装饰器行数）
- APIRouter：`grep -rnE 'APIRouter\(' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：命中行数）
- Pydantic 模型：`grep -rnE 'class [A-Za-z_]+\(BaseModel\)' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：模型类数）
- 依赖注入：`grep -rnE 'Depends\(' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：Depends( 命中行数）
- WebSocket 路由：`grep -rnE '@[A-Za-z_]+\.websocket\(' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：命中行数）
- 后台任务：`grep -rnE 'BackgroundTasks' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：命中文件数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：async 路由内禁止 time.sleep 等阻塞调用，事件循环一停全 worker 停摆
- **适用版本**: 全版本（0.139.x 同）
- **规律**: async 路由跑在事件循环上，`time.sleep()` / 同步 IO / CPU 密集计算会阻塞整个事件循环，该 worker 全部并发请求停摆。阻塞 IO 用 `def` 路由（Starlette 自动放线程池）或 `run_in_threadpool`；睡眠用 `await asyncio.sleep()`；CPU 密集用进程池。
- **违反后果**: 单请求阻塞拖垮整 worker 吞吐量，超时雪崩。
- **验证方法**: 文件含 `async def` 且检出 `time.sleep(` → fail。
- **对应门禁**: fw_fastapi_blocking_async(fail)

```verify
id: fastapi-r1
cmd: 
expect: always
```

### 规律：Pydantic v1 API 必须迁移 v2（@validator→@field_validator，Config→model_config，.dict()→.model_dump()）
- **适用版本**: FastAPI ≥0.100（Pydantic v2）
- **规律**: Pydantic v2 移除/弃用 v1 API：`@validator` → `@field_validator`（须 `@classmethod`）；`@root_validator` → `@model_validator`；`class Config` → `model_config = ConfigDict(...)`；`.dict()` → `.model_dump()`；`.parse_obj()` → `.model_validate()`；`.json()` → `.model_dump_json()`。v1 兼容层 `pydantic.v1` 仅为过渡。
- **违反后果**: 升级即 ImportError/弃用警告；行为差异（v2 默认严格性变化）引入静默 bug。
- **验证方法**: 检出 `@validator(`/`@root_validator(`/`.parse_obj(`/`.dict()`/`class Config:` → fail。
- **对应门禁**: fw_fastapi_pydantic_v1(fail)

```verify
id: fastapi-r2
cmd: 
expect: always
```

### 规律：路由必须声明 response_model，过滤内部字段
- **适用版本**: 全版本
- **规律**: 不声明 `response_model` 时路由返回值原样序列化，ORM 对象/dict 的内部字段（密码哈希、内部状态）随之泄露。response_model 同时承担响应校验与 OpenAPI 文档生成。
- **违反后果**: 敏感字段泄露；响应结构不受控。
- **验证方法**: 文件含路由装饰器但全文无 `response_model` → warn。
- **对应门禁**: fw_fastapi_response_model(warn)

```verify
id: fastapi-r3
cmd: 
expect: always
```

### 规律：yield 依赖必须 try/finally 清理，异常路径也要释放资源
- **适用版本**: 全版本（0.106+ yield 依赖退出时机改为请求处理后）
- **规律**: `Depends` 的生成器依赖 `yield` 后代码在响应发送后执行；不写 `try/finally` 时，yield 点抛出异常（如 HTTPException）将跳过资源释放。数据库会话/文件句柄/锁必须 finally 关闭。
- **违反后果**: 连接/句柄泄漏，池耗尽。
- **验证方法**: 文件含 `Depends` 与 `yield` 但无 `finally:` → warn。
- **对应门禁**: fw_fastapi_depends_yield(warn)

```verify
id: fastapi-r4
cmd: 
expect: always
```

### 规律：BackgroundTasks 仅承载轻量任务，长任务/需重试任务须 Celery/RQ
- **适用版本**: 全版本
- **规律**: `BackgroundTasks` 在同一进程内响应后执行：进程重启任务丢失、无重试、无分布式扩展、长任务占 worker 资源。发邮件等轻量任务可用；耗时/关键任务（支付回调、批量处理）必须 Celery/RQ/Dramatiq 可靠队列。
- **违反后果**: 任务静默丢失；worker 被长任务拖垮。
- **验证方法**: 文件含 `BackgroundTasks` 且含 `time.sleep(`（长任务信号）→ warn。
- **对应门禁**: fw_fastapi_background(warn)

```verify
id: fastapi-r5
cmd: 
expect: always
```

### 规律：路由内禁裸 raise Exception/ValueError，须 HTTPException 带状态码
- **适用版本**: 全版本
- **规律**: 路由内 `raise Exception("...")` 未经异常处理器即成 500 + 堆栈日志，客户端无法区分错误类型。业务错误须 `raise HTTPException(status_code=4xx, detail=...)`；非 HTTP 异常注册全局 exception_handler 统一转换。
- **违反后果**: 错误语义丢失；客户端误把业务错误当服务故障重试。
- **验证方法**: 路由文件检出 `raise (Exception|ValueError|RuntimeError|KeyError)(` → warn。
- **对应门禁**: fw_fastapi_http_exception(warn)

```verify
id: fastapi-r6
cmd: 
expect: always
```

### 规律：路由须 APIRouter 按域模块化，禁全部堆在 app 上
- **适用版本**: 全版本
- **规律**: 所有路由直接装饰 `app` 的单体结构无法按域拆分、前缀/tags/依赖无法分组管理。须 `APIRouter(prefix="/orders", tags=["orders"])` 按域组织，`app.include_router()` 挂载，路由依赖（认证/权限）在 router 级统一声明。
- **违反后果**: 单体路由文件膨胀；权限声明散落遗漏。
- **验证方法**: 检出路由但全工程无 `APIRouter(` → warn。
- **对应门禁**: fw_fastapi_router_modular(warn)

```verify
id: fastapi-r7
cmd: 
expect: always
```

### 规律：接口须认证依赖保护（OAuth2/Security/HTTPBearer），禁止裸奔
- **适用版本**: 全版本
- **规律**: FastAPI 无默认认证。除健康检查等公开端点外，路由须 `Depends(get_current_user)` / `Security(...)` 保护；OAuth2PasswordBearer/JWT 是常规方案，文档 UI 自动集成。
- **违反后果**: 未授权访问、数据泄露。
- **验证方法**: 检出路由但全工程无 `OAuth2|Security(|HTTPBearer|APIKeyHeader` → warn。
- **对应门禁**: fw_fastapi_auth(warn)

```verify
id: fastapi-r8
cmd: 
expect: always
```

### 规律：@app.on_event 已弃用，启动/关闭逻辑须 lifespan
- **适用版本**: FastAPI 0.93+（lifespan 引入）/ 0.139.x
- **规律**: `@app.on_event("startup"/"shutdown")` 官方标记弃用，推荐 `lifespan` asynccontextmanager：`FastAPI(lifespan=lifespan)`，yield 前为启动逻辑、yield 后为关闭逻辑。lifespan 与测试客户端/子应用挂载语义更一致。
- **违反后果**: 弃用警告；未来版本移除导致启动逻辑失效。
- **验证方法**: 检出 `@app.on_event(` → warn。
- **对应门禁**: fw_fastapi_lifespan(warn)

```verify
id: fastapi-r9
cmd: 
expect: always
```

### 规律：async 路由内同步 IO 库（requests/urllib）须改 httpx.AsyncClient 或线程池
- **适用版本**: 全版本
- **规律**: async 路由内调用 `requests.get(...)` 等同步 IO 库与 time.sleep 同害——阻塞事件循环。HTTP 客户端须 `httpx.AsyncClient`；不得不用同步库时改 `def` 路由或 `run_in_threadpool`。
- **违反后果**: 事件循环阻塞，并发吞吐崩塌。
- **验证方法**: 文件含 `async def` 且检出 `requests.(get|post|...)`/`urllib` → warn。
- **对应门禁**: fw_fastapi_sync_io_async(warn)

```verify
id: fastapi-r10
cmd: 
expect: always
```

### 规律：WebSocket 路由必须捕获 WebSocketDisconnect
- **适用版本**: 全版本
- **规律**: 客户端断开 WebSocket 时 Starlette 抛 `WebSocketDisconnect`；不捕获则连接关闭路径打未处理异常日志，连接管理器（广播池）残留死连接。receive/send 循环须 try/except WebSocketDisconnect 并清理。
- **违反后果**: 连接池泄漏死连接；日志噪音掩盖真异常。
- **验证方法**: 检出 `@*.websocket(` 路由但无 `WebSocketDisconnect` → warn。
- **对应门禁**: fw_fastapi_websocket(warn)

```verify
id: fastapi-r11
cmd: 
expect: always
```

### 规律：CORSMiddleware allow_origins 禁 ["*"]，须白名单
- **适用版本**: 全版本（Starlette 现行）
- **规律**: `allow_origins=["*"]` 放开全部跨域来源；与 `allow_credentials=True` 同配时 Starlette 虽按规范回显 Origin 但浏览器语义复杂易误判。生产必须白名单具体域名，credentials 场景严禁通配。
- **违反后果**: 跨域数据窃取面放大。
- **验证方法**: 检出 CORSMiddleware 且 `allow_origins=["*"]` → warn。
- **对应门禁**: fw_fastapi_cors(warn)

```verify
id: fastapi-r12
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / 标准映射（CWE/GB））

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | 标准映射（CWE/GB） |
|---------|------|---------|---------|---------|
| fw_fastapi_blocking_async | fail | async def 文件检出 time.sleep( → fail 事件循环阻塞 | FASTAPI_SRC_GLOBS | CWE-400 |
| fw_fastapi_pydantic_v1 | fail | @validator(/@root_validator(/.parse_obj(/.dict()/class Config: → fail | FASTAPI_SRC_GLOBS | — |
| fw_fastapi_response_model | warn | 路由文件无 response_model → warn | FASTAPI_SRC_GLOBS | — |
| fw_fastapi_depends_yield | warn | Depends + yield 无 finally: → warn | FASTAPI_SRC_GLOBS | — |
| fw_fastapi_background | warn | BackgroundTasks + time.sleep( → warn 长任务须队列 | FASTAPI_SRC_GLOBS | — |
| fw_fastapi_http_exception | warn | 路由文件裸 raise Exception/ValueError → warn | FASTAPI_SRC_GLOBS | CWE-209 |
| fw_fastapi_router_modular | warn | 有路由无 APIRouter( → warn | FASTAPI_SRC_GLOBS | — |
| fw_fastapi_auth | warn | 有路由无 OAuth2/Security(/HTTPBearer → warn | FASTAPI_SRC_GLOBS | CWE-306；GB/T 38674-2020 §5.3 |
| fw_fastapi_lifespan | warn | @app.on_event( → warn 须 lifespan | FASTAPI_SRC_GLOBS | — |
| fw_fastapi_sync_io_async | warn | async def 文件检出 requests./urllib → warn | FASTAPI_SRC_GLOBS | — |
| fw_fastapi_websocket | warn | websocket 路由无 WebSocketDisconnect → warn | FASTAPI_SRC_GLOBS | — |
| fw_fastapi_cors | warn | CORSMiddleware allow_origins=["*"] → warn | FASTAPI_SRC_GLOBS | CWE-942 |

<!--
门禁 id 命名规范：fw_fastapi_<rule>（rule 全小写下划线）。
本表 12 条 id 须在 assets/framework-gates/fastapi.sh 中有同名实现痕迹（grep 命中）。
标准映射列 2026-07-20 P1 补登：CWE 取自本文件 §3/门禁输出口径与通行分类，GB 条款沿用 references/standards-compliance.md §D 口径，无明确映射标 —。
片段头注释 `# gates: fw_fastapi_<rule>(warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: fastapi  requires_conf: FASTAPI_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 async 路由 time.sleep + Pydantic v1 @validator + 无 response_model/auth → blocking_async/pydantic_v1 fail 主触发；compliant 全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| fastapi × sqlalchemy | async 路由须 AsyncSession/async engine；同步 Session 调用须 run_in_threadpool | 同步 ORM 调用阻塞事件循环 |
| fastapi × celery | 长任务/可靠任务推 Celery，BackgroundTasks 仅轻量场景 | 进程内后台任务无重试不持久 |
| fastapi × pydantic | 响应经 response_model 序列化，ORM 模型须 model_config from_attributes | v1 orm_mode 已改名 from_attributes |
| fastapi × uvicorn/gunicorn | 生产 gunicorn -k uvicorn.workers.UvicornWorker 多 worker；禁单 uvicorn --reload | reload/单 worker 无生产可用性 |

<!--
无强交互的框架组合省略；本表聚焦 fastapi 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| FastAPI 0.93 | lifespan 参数引入 | on_event 迁移起点 |
| FastAPI 0.100 | Pydantic v2 支持（默认）；v1 API 经 pydantic.v1 兼容层 | v1 模型行为差异须全量回归 |
| FastAPI 0.106 | yield 依赖退出时机改为响应发送后；HTTPException 经 finally 传播 | 依赖清理逻辑时序变化 |
| FastAPI 0.110+ | @app.on_event 正式弃用警告 | 须迁 lifespan |
| FastAPI 0.139.x | 2026-07 现行（0.139.2）；FastAPI 1.0 GA 时点待验证 | 待验证：1.0 破坏性变更清单未发布核实 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
