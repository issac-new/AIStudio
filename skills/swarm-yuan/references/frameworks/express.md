---
ruleset_id: express
适用版本: Express 5.x（5.2.x 现行，2025-12 发布）/ 4.x（4.22.x 维护分支；差异单独标注）
最后调研: 2026-07-17（来源：https://github.com/expressjs/express/releases ；https://expressjs.com/en/guide/migrating-5.html ；https://expressjs.com/en/advanced/best-practice-security.html ；https://expressjs.com/en/advanced/best-practice-performance.html ；https://helmetjs.github.io/ ；https://express-validator.github.io/docs ）
深度门槛: 10
---

# Express 规则集

<!--
本规则集覆盖 Express 5.x（现行 5.2.1，2025-12-01 发布）与 4.x 维护分支（4.22.2，2025-05）。
调研时点：2026-07-17，现行版本经 https://github.com/expressjs/express/releases 联网核实。
Express 5 关键行为变化：async 路由处理器 Promise 拒绝自动转发至错误处理中间件（不再须 try/catch + next(err)）；
路径匹配改 path-to-regexp v8（通配符 * 语法废弃，须 /*splat）；req.query 解析改 qs 简单模式。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `package.json` dependencies 含 `"express"` / `"express-validator"` / `"helmet"` | 高 |
| 代码 | `require('express')` / `from 'express'` / `express()` / `express.Router(` / `app.listen(` | 高 |
| 文件 | `**/app.js` / `**/server.js`（含 express 引用）/ `**/routes/**/*.js` | 中（需组合依赖信号） |
| 配置 | `NODE_ENV` / `PORT` 环境变量 + express 中间件链 `app.use(` | 中 |

## §2 特定构件枚举（命令 + 计数核验方式）

- 路由定义：`grep -rnE '(app|router)\.(get|post|put|delete|patch)\(' "${PROJECT_DIR}" --include='*.js' --include='*.ts'`（计数核验基准：路由注册行数）
- Router 模块：`grep -rlE 'express\.Router\(' "${PROJECT_DIR}" --include='*.js'`（计数核验基准：含 express.Router 的文件数）
- 中间件注册：`grep -rnE 'app\.use\(' "${PROJECT_DIR}" --include='*.js'`（计数核验基准：app.use 行数）
- 错误处理中间件：`grep -rnE '\((err|error),[[:space:]]*(req|request),[[:space:]]*(res|response),[[:space:]]*next' "${PROJECT_DIR}" --include='*.js'`（计数核验基准：4 参数函数数）
- 输入校验链：`grep -rnE 'body\(|param\(|query\(|validationResult' "${PROJECT_DIR}" --include='*.js'`（计数核验基准：校验链行数）

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：helmet 安全头为生产基线，须注册在所有路由之前
- **适用版本**: 全版本
- **规律**: Express 默认不含任何安全响应头。helmet 设置 X-Content-Type-Options / X-Frame-Options / Strict-Transport-Security / Content-Security-Policy 等基线头，须 `app.use(helmet())` 且注册在路由之前，否则先注册的路由不经 helmet。
- **违反后果**: 缺失安全基线头 → 点击劫持 / MIME 嗅探 / 降级攻击面 CWE-693。
- **验证方法**: `grep -rlE "require\(['\"]helmet['\"]\)|helmet\(\)"` 无命中 → fail。
- **对应门禁**: fw_express_helmet(fail)

```verify
id: express-r1
cmd: grep -rlE "require\(['\"]helmet['\"]\)|helmet\(\)" "${PROJECT_DIR}"
expect: hits>0
```

### 规律：4 参数错误处理中间件必须最后注册
- **适用版本**: 全版本
- **规律**: Express 按注册顺序匹配中间件；错误处理中间件（`(err, req, res, next)` 4 参数签名）仅在 `next(err)` 或 Express 5 async 拒绝时被调用，且只能捕获其**之前**注册的路由/中间件错误。在其后注册的路由错误将穿透默认错误处理器（返回 HTML 栈或直接挂起）。
- **违反后果**: 错误处理中间件前置 → 后续路由错误无统一处理，泄露错误栈 / 响应挂起。
- **验证方法**: 检出错处中间件注册行后仍存在 `app.use(`/`app.get(...)` 等注册 → fail。
- **对应门禁**: fw_express_error_handler_last(fail)

```verify
id: express-r2
cmd: 
expect: always
```

### 规律：外部输入须 express-validator 白名单校验
- **适用版本**: 全版本
- **规律**: `req.body`/`req.query`/`req.params` 为不可信输入，业务使用前须经 express-validator（`body('x').isString()` 链 + `validationResult`）或 joi/zod 白名单校验。Express 5 的 req.query 改 qs 简单解析（默认不再生成嵌套对象），依赖嵌套 query 的代码须显式校验形状。
- **违反后果**: 未校验输入直达业务/ORM → 注入、原型污染、类型混淆 CWE-20。
- **验证方法**: 源码无 `express-validator|validationResult|joi|zod` 任一命中 → warn。
- **对应门禁**: fw_express_input_validation(warn)

```verify
id: express-r3
cmd: 
expect: always
```

### 规律：body 解析须显式 limit，防大包 DoS
- **适用版本**: 全版本（body-parser 2.x 默认 limit 100kb）
- **规律**: `express.json()`/`express.urlencoded()` 默认 limit 100kb，须按业务显式声明（`express.json({ limit: '100kb' })`），文件/大 payload 接口单独放宽。显式 limit 使超限请求返回 413 而非进入业务。
- **违反后果**: 大包请求耗尽内存/带宽 CWE-400；默认 limit 与业务错配 → 正常请求被截断或攻击面过大。
- **验证方法**: `express.json()`/`bodyParser.json()` 空参调用 → warn。
- **对应门禁**: fw_express_body_limit(warn)

```verify
id: express-r4
cmd: 
expect: always
```

### 规律：须 app.disable('x-powered-by')，不泄露技术栈
- **适用版本**: 全版本
- **规律**: Express 默认返回 `X-Powered-By: Express` 响应头，泄露服务端技术栈，辅助攻击者定向漏洞利用。生产必须 `app.disable('x-powered-by')`。
- **违反后果**: 技术栈指纹泄露 CWE-200。
- **验证方法**: 无 `disable('x-powered-by')` 命中 → warn。
- **对应门禁**: fw_express_x_powered_by(warn)

```verify
id: express-r5
cmd: 
expect: always
```

### 规律：路由须按领域模块化 express.Router，禁止全部直挂 app
- **适用版本**: 全版本
- **规律**: 多路由应用须用 `express.Router()` 按领域拆分（routes/users.js 等），`module.exports = router` 后在入口 `app.use('/users', userRouter)` 挂载。全部直挂 app 导致入口文件膨胀、中间件作用域无法按域隔离（Router 级中间件失效）。
- **违反后果**: 入口文件数千行；域级中间件（认证/限流）无法按前缀隔离。
- **验证方法**: 存在 `app.(get|post|...)` 直挂路由且全项目无 `express.Router(` → warn。
- **对应门禁**: fw_express_router_module(warn)

```verify
id: express-r6
cmd: 
expect: always
```

### 规律：Express 5.x async 路由 Promise 拒绝自动捕获；4.x 须显式转发
- **适用版本**: 差异版——5.x 自动捕获；4.x 及以下须手动
- **规律**: Express 5 起，async 路由处理器返回的 Promise 被拒绝（rejected）时自动调用 `next(err)` 进入错误处理中间件，不再须 try/catch 包裹。Express 4.x 无此行为：async 处理器抛错成为 unhandledRejection，请求挂起直至超时；4.x 项目须 try/catch + `next(err)` 或 `express-async-errors` 补丁或 asyncHandler 包装。
- **违反后果**: 4.x 下 async 错误 → 请求挂起 + unhandledRejection 告警；5 迁移后残留 try/catch 样板无害但冗余。
- **验证方法**: package.json express major=4 且 async 处理器文件无 `try{`/`.catch(`/`express-async-errors` → warn；major=5 放行；版本未检出按待验证 warn。
- **对应门禁**: fw_express_async_error(warn)

```verify
id: express-r7
cmd: 
expect: always
```

### 规律：express.static 须配 maxAge 缓存策略
- **适用版本**: 全版本
- **规律**: `express.static(dir)` 默认 `maxAge=0`，静态资源每次回源。生产须 `express.static('public', { maxAge: '1d', immutable: true })`（指纹文件）或按资源类型分级缓存。
- **违反后果**: 静态资源无缓存 → 重复回源，带宽与延迟损耗。
- **验证方法**: `express.static(` 命中但同文件无 `maxAge|immutable|setHeaders` → warn。
- **对应门禁**: fw_express_static_cache(warn)

```verify
id: express-r8
cmd: 
expect: always
```

### 规律：文本响应须 compression 压缩中间件
- **适用版本**: 全版本
- **规律**: `app.use(compression())` 对 JSON/HTML 等文本响应 gzip/br 压缩，注册须早于路由。大 JSON 接口无压缩浪费带宽；流式/SSE 响应须按 `filter` 排除。
- **违反后果**: 响应体未压缩 → 带宽成本与首字节延迟上升。
- **验证方法**: 无 `compression` 引用 → warn。
- **对应门禁**: fw_express_compression(warn)

```verify
id: express-r9
cmd: 
expect: always
```

### 规律：生产必须 NODE_ENV=production
- **适用版本**: 全版本
- **规律**: `NODE_ENV=production` 时 Express 缓存视图模板、缓存 CSS 扩展、生成更少冗长错误信息；缺省 development 模式性能显著下降且错误栈外露。启动脚本须显式设置（`cross-env NODE_ENV=production` 跨平台）。
- **违反后果**: 生产跑 development 模式 → 性能下降 + 错误详情泄露 CWE-209。
- **验证方法**: package.json scripts 与源码均无 `NODE_ENV` → warn。
- **对应门禁**: fw_express_node_env(warn)

```verify
id: express-r10
cmd: 
expect: always
```

### 规律：公开端点须速率限制
- **适用版本**: 全版本
- **规律**: 登录/验证码/公开查询端点须 `express-rate-limit` 按 IP/账户维度限流（`windowMs` + `limit`），防爆破与滥用。限流须注册在目标路由之前。
- **违反后果**: 无限流 → 爆破/刷接口/资源耗尽 CWE-770。
- **验证方法**: 无 `express-rate-limit|rate-limiter-flexible` 命中 → warn。
- **对应门禁**: fw_express_rate_limit(warn)

```verify
id: express-r11
cmd: 
expect: always
```

### 规律：CORS 须显式 origin 白名单，禁止空参 cors() 或通配
- **适用版本**: 全版本
- **规律**: `app.use(cors())` 空参等价 `Access-Control-Allow-Origin: *`，任意站点可跨域读响应。须 `cors({ origin: ['https://app.example.com'] })` 白名单；携带凭据时 `credentials: true` 且 origin 不可为 `*`。
- **违反后果**: 任意源跨域读取敏感接口 CWE-942。
- **验证方法**: `cors()` 空参或 `origin: '*'`/`origin: true` → warn。
- **对应门禁**: fw_express_cors(warn)

```verify
id: express-r12
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。每条均挂门禁 id，无游离规律。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE / GB 映射 |
|---------|------|---------|---------|--------------|
| fw_express_helmet | fail | 源码无 helmet 引用 → fail 安全头基线缺失 | EXPRESS_SRC_GLOBS | CWE-693 |
| fw_express_error_handler_last | fail | 4 参数错误中间件注册行之后仍有路由/中间件注册 → fail | EXPRESS_SRC_GLOBS | — |
| fw_express_input_validation | warn | 无 express-validator/joi/zod 任一命中 → warn | EXPRESS_SRC_GLOBS | CWE-20；GB/T 38674-2020 §5.1 |
| fw_express_body_limit | warn | express.json()/urlencoded() 空参无 limit → warn | EXPRESS_SRC_GLOBS | CWE-400 |
| fw_express_x_powered_by | warn | 无 disable('x-powered-by') → warn | EXPRESS_SRC_GLOBS | CWE-200 |
| fw_express_router_module | warn | app 直挂路由且无 express.Router → warn | EXPRESS_SRC_GLOBS | — |
| fw_express_async_error | warn | Express 4 async 处理器无 try/catch 转发 → warn（5.x 放行） | EXPRESS_SRC_GLOBS | — |
| fw_express_static_cache | warn | express.static 无 maxAge/immutable → warn | EXPRESS_SRC_GLOBS | — |
| fw_express_compression | warn | 无 compression 中间件 → warn | EXPRESS_SRC_GLOBS | — |
| fw_express_node_env | warn | package.json/源码无 NODE_ENV → warn | EXPRESS_SRC_GLOBS | CWE-209 |
| fw_express_rate_limit | warn | 无 express-rate-limit → warn | EXPRESS_SRC_GLOBS | CWE-770 |
| fw_express_cors | warn | cors() 空参或 origin:* / origin:true → warn | EXPRESS_SRC_GLOBS | CWE-942 |

<!--
门禁 id 命名规范：fw_express_<rule>（rule 全小写下划线）。
本表 12 条 id 均在 assets/framework-gates/express.sh 中有同名实现，片段头注释 # gates: 与本表一致。
fixture 验证覆盖：violating 含错误处理中间件不在最后 + 无 helmet + 无输入校验 → helmet/error_handler_last fail 主触发（2/2 已断言）；
compliant 修正后全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| express × express-validator | 校验链须在 handler 之前执行且 handler 首查 validationResult | 校验未拦截的脏输入直达业务 |
| express × helmet | helmet 须注册在 cors/路由之前 | 先注册路由不经 helmet，安全头缺失 |
| express × express-rate-limit | 限流中间件须注册在被保护路由之前 | 顺序错误限流失效 |
| express × compression | compression 早于路由注册；SSE/流式接口须 filter 排除 | 压缩缓冲破坏流式响应 |

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Express 5.0（2024-10 GA） | async 路由 Promise 拒绝自动 next(err)；path-to-regexp v8（`*` 通配废弃改 `/*splat`）；req.query 改 qs 简单解析；`res.send(status)` 数字重载废弃；`app.del` 移除 | 4→5 迁移须改通配路由与状态码重载；try/catch 样板可移除 |
| Express 5.1（2025-03） | 支持 `/*splat` 命名通配、Uint8Array 响应 | 迁移期语法以 5.1 文档为准 |
| Express 5.2（2025-12） | body-parser 2.2.1；5.2.0 extended query parser 破坏性变更在 5.2.1 回滚 | 5.2.0 须直升 5.2.1 |
| body-parser 2.x | 默认 limit 100kb 保持；depth 限制收紧 | 深嵌套 body 须显式 depth |
| helmet 8.x | CSP 默认开启；`X-XSS-Protection` 移除 | 前端内联脚本须配 CSP nonce |
