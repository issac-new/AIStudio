---
ruleset_id: gin
适用版本: Gin 1.10.x / 1.11.x / 1.12.x（1.12.0 为 2026-07 调研时点最新稳定版；1.10+ 差异单独标注）
最后调研: 2026-07-17（来源：https://github.com/gin-gonic/gin/releases ；https://gin-gonic.com/docs/ ；https://raw.githubusercontent.com/gin-gonic/gin/master/docs/doc.md ）
深度门槛: 10
---

# Gin 规则集

<!--
本规则集覆盖 Gin 1.10.x ~ 1.12.x。1.12.0（2026-02-28 release train）为调研时点最新稳定版。
调研时点：2026-07-17。Bind 与 ShouldBind 的行为差异、c.Copy() 的 goroutine 安全约束均出自
官方 docs/doc.md（MustBindWith 触发 c.AbortWithError(400, err) 与 Content-Type: text/plain；
ShouldBindWith 返回错误交由开发者处理；goroutine 内禁止用原 Context，须用 c.Copy() 只读副本）。
无法联网核实的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `github.com/gin-gonic/gin` / `github.com/gin-contrib/...`（gzip/cors/sessions/jwt） | 高 |
| 注解 | 无（Gin 不依赖注解，以 import + API 调用识别） | — |
| 文件 | `**/go.mod` 含 `gin-gonic/gin` | 高 |
| 配置 | `GIN_MODE` 环境变量 / `gin.SetMode(` | 中 |
| 代码 | `gin.Engine` / `gin.Context` / `gin.Default()` / `gin.New()` / `c.JSON(` / `c.Abort(` / `c.Next()` / `engine.Run(` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 gin 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 路由处理函数：`grep -rnE '\.(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|Any|Group)\(' "${PROJECT_DIR}" --include='*.go'`（计数核验基准：路由注册行数）
- 中间件注册：`grep -rnE '\.(Use|UseFn)\(' "${PROJECT_DIR}" --include='*.go'`（计数核验基准：Use 调用行数）
- 绑定调用：`grep -rnE 'c\.(ShouldBind|ShouldBindJSON|ShouldBindQuery|ShouldBindURI|ShouldBindWith|Bind|BindJSON|BindQuery|BindURI|BindWith)\(' "${PROJECT_DIR}" --include='*.go'`（计数核验基准：绑定调用行数）
- Context 跨协程使用：`grep -rnE 'go[[:space:]]+func|go[[:space:]]+[a-zA-Z_]' "${PROJECT_DIR}" --include='*.go'`（计数核验基准：go 语句行数，用于交叉核验 c.Copy 覆盖率）
- 优雅关闭：`grep -rnE 'http\.Server|\.Shutdown\(|signal\.Notify|ShutdownTimeout' "${PROJECT_DIR}" --include='*.go'`（计数核验基准：shutdown 相关行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：绑定校验须用 ShouldBind 系列，禁用 Bind 系列（Bind 自动 400 + Abort）
- **适用版本**: Gin 全版本（1.10.x ~ 1.12.x）
- **规律**: `c.Bind` / `BindJSON` / `BindQuery` / `BindURI` 等属 Must bind，绑定失败时自动 `c.AbortWithError(400, err)` 并写 `text/plain` 响应，开发者无法自定义错误格式与状态码；后续修改状态码会触发 "headers already written" 警告。生产应使用 `ShouldBind` / `ShouldBindJSON` / `ShouldBindQuery` / `ShouldBindURI`（Should bind），错误交由开发者处理，可统一返回业务错误体（如 JSON `{code,msg}`）与合适状态码。
- **违反后果**: 绑定失败时泄漏内部错误到响应体、响应格式不统一（部分 text/plain 部分 JSON）、无法与全局错误处理对齐。
- **验证方法**: `grep -rnE 'c\.(Bind|BindJSON|BindQuery|BindURI|BindWith|BindHeader)\(' --include='*.go'` 命中 → warn。
- **对应门禁**: fw_gin_should_bind_not_bind(warn)

```verify
id: gin-r1
cmd: grep -rnE 'c\.(Bind|BindJSON|BindQuery|BindURI|BindWith|BindHeader)\(' --include='*.go' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：goroutine 内禁止直接用 gin.Context，须 c.Copy()
- **适用版本**: Gin 全版本（Context 对象池复用）
- **规律**: `gin.Context` 由 sync.Pool 复用，请求结束后会被回收并复用于下一请求。在 handler/middleware 中起 `go func() { ... c ... }()` 直接捕获原 Context 会触发数据竞争 / 串响应（读到下一请求的 URL/Header）。跨 goroutine 须先 `cCp := c.Copy()` 再用只读副本 `cCp`。
- **违反后果**: 数据竞争导致响应串号、Header 错乱；race detector 报错；高并发下偶发难复现 bug。
- **验证方法**: 检出 `go func` 或 `go <fn>` 调用，其函数体/参数引用了 `c`（gin.Context）但同作用域未出现 `c.Copy()` → fail。
- **对应门禁**: fw_gin_context_copy(fail)

```verify
id: gin-r2
cmd: 
expect: always
```

### 规律：生产须配 Recovery 中间件并置于链首
- **适用版本**: Gin 全版本
- **规律**: `gin.Default()` 自带 Logger + Recovery；`gin.New()` 不带任何中间件，须手动 `engine.Use(gin.Recovery())`。Recovery 捕获 panic 防止进程退出，须置于中间件链首（先于业务中间件），否则 panic 在 Recovery 之前的中间件中未被捕获。Recovery 之前注册的中间件若 panic 会直接崩进程。
- **违反后果**: 业务 panic 未捕获 → 单请求崩溃进程，影响全部在途请求。
- **验证方法**: 检出 `gin.New()` 但同文件无 `gin.Recovery()` 注册 → fail；检出 Recovery 但非首个 Use 调用 → warn。
- **对应门禁**: fw_gin_recovery_middleware(fail)

```verify
id: gin-r3
cmd: 
expect: always
```

### 规律：生产须优雅关闭，禁用 engine.Run 阻塞主协程
- **适用版本**: Gin 全版本（搭配 net/http）
- **规律**: `engine.Run(addr)` 内部用 `http.ListenAndServe`，收到 SIGTERM 立即关闭监听 socket，在途请求被强制断开。生产须自建 `&http.Server{Handler: engine}` 并用 `srv.Shutdown(ctx)` 配合 `signal.Notify(SIGTERM, SIGINT)` 优雅关闭，给在途请求 drain 时间。
- **违反后果**: 滚动发布时在途请求 502 / 连接重置；长连接/上传被截断；K8s preStop hook 无效。
- **验证方法**: 检出 `engine.Run(` 或 `\.ListenAndServe(` 且同项目无 `\.Shutdown(` → warn。
- **对应门禁**: fw_gin_graceful_shutdown(warn)

```verify
id: gin-r4
cmd: 
expect: always
```

### 规律：中间件须显式 c.Next() 串联后置逻辑，Abort 须配合 return
- **适用版本**: Gin 全版本
- **规律**: Gin 中间件是显式链，后置逻辑（如响应日志、耗时统计）须在中间件中调用 `c.Next()` 后执行；不调用 `c.Next()` 则后续中间件与 handler 不会执行（除非本中间件本身就是前置守卫）。`c.Abort()` 仅阻止后续中间件执行，不会 return 当前函数，须 `c.Abort(); return` 配合，否则当前函数继续执行导致已 Abort 的请求仍跑业务逻辑。
- **违反后果**: 中间件顺序失效；Abort 后业务逻辑仍执行 → 鉴权失效 / 越权。
- **验证方法**: 检出 `c.Abort(` 但同行/紧邻无 `return` → warn（启发式：Abort 后下一非空行非 `}` 非 `return`）。
- **对应门禁**: fw_gin_abort_return(warn)

```verify
id: gin-r5
cmd: 
expect: always
```

### 规律：绑定校验须配 validator 标签并处理校验错误
- **适用版本**: Gin 全版本（binding 标签 `binding:"required"` 等）
- **规律**: Gin 的 `ShouldBind` 系列依赖 `go-playground/validator`，须在结构体字段打 `binding:"required,email,max=..."` 标签。仅 `ShouldBind` 不打标签则任何输入都通过；校验失败返回 `validator.ValidationErrors`，须统一翻译为业务错误（避免直接返回结构体内部的字段名/标签给客户端）。
- **违反后果**: 缺标签 → 非法输入静默通过 → 下游 NPE / 脏数据；未翻译错误 → 内部字段名泄露。
- **验证方法**: 检出 `ShouldBind` 调用但同项目无 `binding:"` 标签 → warn。
- **对应门禁**: fw_gin_binding_validator(warn)

```verify
id: gin-r6
cmd: 
expect: always
```

### 规律：CORS 须显式配置 AllowOrigins，禁用 AllowAllOrigins + 凭证
- **适用版本**: Gin + gin-contrib/cors 全版本
- **规律**: 跨域请求须用 `github.com/gin-contrib/cors` 显式配置 `AllowOrigins`（白名单）或 `AllowOriginFunc`。`AllowAllOrigins: true` 时禁止同时 `AllowCredentials: true`（浏览器规范禁止 `Access-Control-Allow-Origin: *` 与 `Access-Control-Allow-Credentials: true` 共存，浏览器会拒绝带凭证的跨域请求）。
- **违反后果**: CORS 配置失效 → 前端跨域请求被浏览器拦截；或安全隐患：任意源带凭证访问。
- **验证方法**: 检出 `AllowAllOrigins[[:space:]]*:[[:space:]]*true` 且同作用域 `AllowCredentials[[:space:]]*:[[:space:]]*true` → fail；检出 `AllowAllOrigins: true` 但无 AllowOriginFunc → warn。
- **对应门禁**: fw_gin_cors(fail)

```verify
id: gin-r7
cmd: 
expect: always
```

### 规律：JWT/Session 认证中间件须校验失效态并 Abort 非法请求
- **适用版本**: Gin + gin-contrib/sessions / golang-jwt 全版本
- **规律**: 认证中间件解析 token/session 后须校验有效性（签名、过期、吊销），失败须 `c.AbortWithStatusJSON(401, ...); return`，不得仅记日志后继续 `c.Next()`。token 须从 Authorization header（`Bearer <token>`）取，禁用 URL query 传 token（会进 access log / referer 泄露）。
- **违反后果**: 鉴权绕过 → 越权访问；URL token 泄露到日志/Referer → 会话劫持 CWE-598。
- **验证方法**: 检出 `c.Next()` 在认证中间件函数体内，但无 `c.Abort` 分支 → warn；检出 `c.Query("token")` 或 `c.Query("access_token")` 用于鉴权 → fail。
- **对应门禁**: fw_gin_auth_middleware(fail)

```verify
id: gin-r8
cmd: 
expect: always
```

### 规律：文件上传须设 MultipartMemory 上限与 maxMultipartMemory
- **适用版本**: Gin 全版本
- **规律**: Gin 默认 `DefaultMultipartMemory = 32 MB`，超出部分写临时文件。攻击者可上传超大 multipart 体耗尽内存/磁盘（DoS）。生产须 `engine.MaxMultipartMemory = 8 << 20`（8MB 量级）并配合反向代理 `client_max_body_size`。同时须校验文件类型/扩展名，禁用原文件名直接落盘（路径穿越 CWE-22）。
- **违反后果**: 大文件上传 DoS（内存/磁盘耗尽）；原文件名落盘 → 路径穿越写任意文件。
- **验证方法**: 检出 `c.FormFile(` 或 `c.MultipartForm(` 且同项目无 `MaxMultipartMemory` 设置 → warn。
- **对应门禁**: fw_gin_upload_limit(warn)

```verify
id: gin-r9
cmd: 
expect: always
```

### 规律：Gzip 中间件须配压缩级别与排除已压缩内容，避免 CPU 浪费
- **适用版本**: Gin + gin-contrib/gzip 全版本
- **规律**: `gzip.Gzip(gzip.DefaultCompression)` 中间件对响应压缩。已压缩内容（jpg/png/视频/已 gzip 的响应）再压缩无收益反耗 CPU；须用 `gzip.WithExcludedPaths` 或 `WithExcludedExtensions` 排除。压缩级别默认 `DefaultCompression`（-1 → zlib 默认 6），高并发场景可降到 `gzip.BestSpeed`（1）。
- **违反后果**: 已压缩响应二次压缩 → CPU 浪费 + 延迟上升；无排除 → 图片接口 CPU 飙升。
- **验证方法**: 检出 `gzip.Gzip(` 但同项目无 `WithExcludedExtensions`/`WithExcludedPaths`/`WithExcludedPathRegexps` → warn。
- **对应门禁**: fw_gin_gzip(warn)

```verify
id: gin-r10
cmd: 
expect: always
```

### 规律：错误处理须用 c.Error 累积 + 统一 c.JSON 响应，禁用零散 c.String
- **适用版本**: Gin 全版本
- **规律**: `c.Error(err)` 将错误累积到 `c.Errors`，最后一个中间件可统一格式化为业务错误体（如 `{code,msg,trace}`）。零散 `c.String(500, ...)` / `c.AbortWithStatus(500)` 散落各处会导致错误响应格式不统一、难以统一埋点。生产须有统一错误处理中间件读取 `c.Errors` 统一输出。
- **违反后果**: 错误响应格式碎片化 → 前端难解析、监控难聚合。
- **验证方法**: 检出 `c.String(` 用于错误响应（同行含 4xx/5xx 状态码）且同项目无 `c.Error(` → warn。
- **对应门禁**: fw_gin_error_handling(warn)

```verify
id: gin-r11
cmd: 
expect: always
```

### 规律：限流须在入口中间件层配置，禁用仅业务层无防护
- **适用版本**: Gin + ulule/limiter / didip/tollbooth 等全版本
- **规律**: 公开接口（登录、短信、查询）须在 Gin 中间件层限流（按 IP / 用户 / 接口维度），防止刷接口。无限流的公开接口会被脚本刷爆（短信轰炸、撞库）。常用 `github.com/ulule/limiter/v3` 配 Redis 后端。
- **违反后果**: 接口被刷 → 短信成本飙升 / 撞库成功 / 后端被打满。
- **验证方法**: 检出 `gin.Engine` + 公开 POST 路由（如 `/login` `/sms` `/register`）但同项目无 `limiter`/`tollbooth`/`rate` 限流中间件 → warn。
- **对应门禁**: fw_gin_rate_limit(warn)

```verify
id: gin-r12
cmd: 
expect: always
```

### 规律：健康检查端点须独立路由且不走鉴权与限流
- **适用版本**: Gin 全版本
- **规律**: `/healthz` / `/readyz` 须注册在鉴权与限流中间件之前的根路由组，否则 K8s 探针被鉴权拦截（401）或被限流误杀（429）导致 Pod 被反复重启。健康检查须轻量（不查 DB/外部依赖的 liveness；readiness 可查 DB）。
- **违反后果**: 探针失败 → Pod 被 K8s 反复重启 / 摘流；探针走限流 → 高频探针触发 429。
- **验证方法**: 检出鉴权/限流中间件 Use 在 Engine 根级（非 Group 内），且同项目存在 `/healthz` 或 `/ready` 路由 → warn。
- **对应门禁**: fw_gin_health_check(warn)

```verify
id: gin-r13
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE / GB 映射 |
|---------|------|---------|---------|--------------|
| fw_gin_should_bind_not_bind | warn | 检出 c.Bind/BindJSON/BindQuery/BindURI 等 Must bind → warn | GIN_SRC_GLOBS | — |
| fw_gin_context_copy | fail | goroutine 内引用 c 但同作用域无 c.Copy() → fail | GIN_SRC_GLOBS | — |
| fw_gin_recovery_middleware | fail | gin.New() 无 gin.Recovery() → fail；Recovery 非首中间件 → warn | GIN_SRC_GLOBS | — |
| fw_gin_graceful_shutdown | warn | engine.Run/ListenAndServe 无 Shutdown → warn | GIN_SRC_GLOBS | — |
| fw_gin_abort_return | warn | c.Abort() 后无 return → warn | GIN_SRC_GLOBS | — |
| fw_gin_binding_validator | warn | ShouldBind 无 binding: 标签 → warn | GIN_SRC_GLOBS | CWE-20；GB/T 38674-2020 §5.1 |
| fw_gin_cors | fail | AllowAllOrigins+AllowCredentials 同时 true → fail | GIN_SRC_GLOBS | CWE-942 |
| fw_gin_auth_middleware | fail | 鉴权用 c.Query("token") → fail；无 Abort 分支 → warn | GIN_SRC_GLOBS | CWE-598 |
| fw_gin_upload_limit | warn | FormFile/MultipartForm 无 MaxMultipartMemory → warn | GIN_SRC_GLOBS | CWE-400 / CWE-22 |
| fw_gin_gzip | warn | gzip.Gzip 无 WithExcludedExtensions/Paths → warn | GIN_SRC_GLOBS | — |
| fw_gin_error_handling | warn | c.String(4xx/5xx) 且无 c.Error → warn | GIN_SRC_GLOBS | — |
| fw_gin_rate_limit | warn | 公开 POST 路由无限流中间件 → warn | GIN_SRC_GLOBS | CWE-770 |
| fw_gin_health_check | warn | 根级鉴权/限流 + /healthz 路由 → warn | GIN_SRC_GLOBS | — |

<!--
门禁 id 命名规范：fw_gin_<rule>（rule 全小写下划线）。
本表 13 条 id 须在 assets/framework-gates/gin.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_gin_<rule>(...) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: gin  requires_conf: GIN_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 c.Bind + goroutine 用 c（非 c.Copy）+ gin.New 无 Recovery
+ AllowAllOrigins/AllowCredentials 双 true + c.Query("token") 鉴权
→ context_copy/recovery_middleware/cors/auth_middleware fail 主触发（4/4 已断言）；compliant 修正后全 pass。
2026-07-20 唤醒登记：cors/auth_middleware 门禁逻辑健全但原 fixture 缺触发内容（原 2/4 命中），补触发后命中（门禁脚本未动）。
CWE/GB 列中 fw_gin_cors→CWE-942、fw_gin_rate_limit→CWE-770、fw_gin_upload_limit→CWE-400
为跨框架同类弱点补齐标注（express/koa/fastify 同规律已挂）；CWE-22/CWE-598 出自本文件 §3 规律。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| gin × gorm | handler 内查询须 `WithContext(c.Request.Context())`，请求取消时 DB 查询自动取消 | 否则客户端断开后 DB 查询仍在跑，浪费连接池 |
| gin × gorm | 事务须在 handler 内开启并在 defer 中 commit/rollback，禁用跨 handler 长事务 | 跨 handler 事务持有连接导致连接池耗尽 |
| gin × redis | 缓存操作须传 c.Request.Context()，与请求生命周期对齐 | 否则请求结束后缓存操作仍阻塞 |
| gin × gin-contrib/cors | CORS 中间件须注册在鉴权之前 | 否则预检 OPTIONS 被鉴权拦截 |

<!--
无强交互的框架组合省略；本表聚焦 gin 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Gin 1.10.0 | `Context.QueryString` / `QueryArray` 行为稳定；`ShouldBindUri` 推荐替代 `BindUri` | 残留 `BindUri` 仍会自动 400，须迁 `ShouldBindUri` |
| Gin 1.11.0 | Go 版本最低要求提升至 Go 1.21+（待验证具体最低版本） | 待验证：旧 Go 工具链项目升级 Gin 1.11+ 须先升 Go |
| Gin 1.12.0 | 最新稳定版（2026-02-28）；`MaxMultipartMemory` 默认仍 32MB 未变 | 规律照旧 |
| gin-contrib/cors 1.x | `AllowAllOrigins: true` 与 `AllowCredentials: true` 组合无内置校验直接放行 | 须门禁拦截该组合 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
