---
ruleset_id: fastify
适用版本: Fastify 5.x（当前 latest 文档线 v5.10.x，2026-07 核实；v4.x 差异单独标注）
最后调研: 2026-07-17（来源：https://fastify.dev/docs/latest/ ；https://fastify.dev/docs/latest/Reference/Hooks/ ；https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/ ；https://fastify.dev/docs/latest/Reference/Encapsulation/ ；https://github.com/fastify/fastify-plugin ；https://github.com/fastify/fastify-rate-limit ；https://github.com/fastify/fastify-auth ；https://github.com/fastify/fastify-swagger ）
深度门槛: 10
---

# Fastify 规则集

<!--
本规则集覆盖 Fastify 5.x（2026-07-17 联网核实：官方文档 latest 线为 v5.10.x，版本选择器含 v5.0.x–v5.10.x，
无 v6 线）。核心机理：Ajv JSON Schema 校验 + fast-json-stringify 序列化、封装上下文（插件隔离）、
生命周期钩子（onSend 修改 payload 须 return/done）、pino 日志内置。
onSend async 钩子返回值即新 payload 行为已依官方 Hooks 文档核实（2026-07-17）。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `package.json` 含 `"fastify"` / `"@fastify/cors"` / `"@fastify/rate-limit"` / `"@fastify/auth"` / `"@fastify/swagger"` / `"fastify-plugin"` | 高 |
| 代码 | `require('fastify')` / `from 'fastify'` / `fastify.register(` / `fastify.addHook(` / `fastify.decorate` | 高 |
| 配置 | `fastify({ logger: ... })` 初始化 / `setErrorHandler` / `setNotFoundHandler` | 高 |
| 文件 | `**/plugins/*.js`（fastify 插件目录约定） | 中（需排除他用，须组合依赖信号） |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 fastify 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 路由声明：`grep -rnE '(app|fastify|server|router)\.(get|post|put|delete|patch|route)\(' "${PROJECT_DIR}" --include='*.js' --include='*.ts'`（计数核验基准：路由注册行数）
- 插件注册：`grep -rnE '\.register\(' "${PROJECT_DIR}" --include='*.js' --include='*.ts'`（计数核验基准：register 调用行数）
- 生命周期钩子：`grep -rnE "addHook\(['\"]" "${PROJECT_DIR}" --include='*.js' --include='*.ts'`（计数核验基准：addHook 调用行数）
- 装饰器：`grep -rnE '\.decorate(Request|Reply)?\(' "${PROJECT_DIR}" --include='*.js' --include='*.ts'`（计数核验基准：decorate 调用行数）
- schema 定义：`grep -rnE 'schema[[:space:]]*:' "${PROJECT_DIR}" --include='*.js' --include='*.ts'`（计数核验基准：schema 选项出现行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：路由必须声明 schema 校验（Ajv JSON Schema 输入校验）
- **适用版本**: Fastify 5.x / 4.x
- **规律**: Fastify 内建 Ajv（v8，5.x 线）对 `schema.body`/`schema.querystring`/`schema.params`/`schema.headers` 做输入校验。路由不传 `schema` 选项则输入完全不校验，handler 直接消费未信任数据。所有接收外部输入的路由（POST/PUT/PATCH/带 query 的 GET）必须声明 JSON Schema 白名单。
- **违反后果**: 未校验输入直达业务逻辑 → 注入/类型混淆/越界 CWE-20。
- **验证方法**: `grep -rnE '(app|fastify|server|router)\.(get|post|put|delete|patch|route)\(' --include='*.js' --include='*.ts'` 命中的文件未含 `schema:` → fail。
- **对应门禁**: fw_fastify_schema_validation(fail)

```verify
id: fastify-r1
cmd: grep -rnE '(app|fastify|server|router)\.(get|post|put|delete|patch|route)\(' --include='*.js' --include='*.ts' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：响应 schema 启用 fast-json-stringify 序列化（性能 + 响应字段白名单）
- **适用版本**: Fastify 5.x / 4.x
- **规律**: `schema.response` 按状态码声明响应结构后，Fastify 编译为 fast-json-stringify，序列化速度远超 `JSON.stringify`，且响应字段被白名单裁剪（多余字段不泄露）。未声明 response schema 的路由走 `JSON.stringify` 且可能泄露实体内部字段。
- **违反后果**: 响应泄露内部字段（如 password hash）CWE-200；高 QPS 下序列化成 CPU 瓶颈。
- **验证方法**: 含路由与 `schema:` 的文件未含 `response:` → warn。
- **对应门禁**: fw_fastify_response_schema(warn)

```verify
id: fastify-r2
cmd: 
expect: always
```

### 规律：封装上下文默认隔离，跨上下文共享装饰器须 fastify-plugin
- **适用版本**: Fastify 5.x / 4.x
- **规律**: `register()` 内的插件运行在自己的封装上下文（encapsulation context），插件内 `fastify.decorate()`/`addHook()`（除 onClose/onReady 外）仅对该上下文及子上下文可见。要让装饰器/钩子对全局生效，插件须用 `fastify-plugin`（fp）包裹打破封装。误用表现为：插件内 decorate 的工具在外部 `undefined`。封装本身是安全特性，fp 须有意识使用。
- **违反后果**: 装饰器在父上下文 undefined（TypeError）；或滥用 fp 导致全局命名空间污染、装饰器互相覆盖。
- **验证方法**: 检出插件函数（形参含 `fastify`）内有 `.decorate(` 且文件未引入 `fastify-plugin`/`fp(` → warn 确认封装隔离是否有意。
- **对应门禁**: fw_fastify_encapsulation(warn)

```verify
id: fastify-r3
cmd: 
expect: always
```

### 规律：onSend 钩子修改 payload 必须 return（async）或 done(null, payload)（callback）
- **适用版本**: Fastify 5.x / 4.x
- **规律**: onSend 钩子是响应发出前最后可改 payload 的时机。官方 Hooks 文档（2026-07 核实）：async onSend 中 `return newPayload` 才替换 payload；callback 风格须 `done(err, newPayload)`。合法类型仅 string/Buffer/stream/ReadableStream/Response/null。只修改局部变量不 return/done 的 onSend 静默丢弃修改（原 payload 照发），属于隐蔽 bug。
- **违反后果**: payload 包装/脱敏/签名逻辑静默失效（如统一响应壳未生效），问题在响应体层面难以排查。
- **验证方法**: `addHook('onSend'` 起 15 行窗口内含 payload 改写（`payload.replace`/`payload.toString`/`JSON.stringify`/`newPayload`）但无 `return` 且无 `done(` → fail。
- **对应门禁**: fw_fastify_onsend_return(fail)

```verify
id: fastify-r4
cmd: 
expect: always
```

### 规律：必须 setErrorHandler 统一错误处理，避免默认错误响应泄露堆栈
- **适用版本**: Fastify 5.x / 4.x
- **规律**: Fastify 默认错误处理器返回 `{ statusCode, error, message }`；未捕获异常经默认处理器可能暴露内部信息。生产须 `setErrorHandler` 统一：4xx 透传 message、5xx 脱敏为通用文案并记录原始错误（request.log.error(err)）。
- **违反后果**: 未处理异常泄露内部细节 CWE-209；各路由 try/catch 重复造轮子、错误格式不一致。
- **验证方法**: 存在路由声明但全部源码未含 `setErrorHandler` → fail。
- **对应门禁**: fw_fastify_error_handler(fail)

```verify
id: fastify-r5
cmd: 
expect: always
```

### 规律：路由选项 config/logLevel 按路由粒度收敛（敏感路由降日志）
- **适用版本**: Fastify 5.x / 4.x
- **规律**: 路由选项 `logLevel` 可按路由调整日志级别（如健康检查 `logLevel: 'warn'` 降噪，敏感操作 `logLevel: 'debug'` 留痕）；`config` 存放路由级元数据供钩子读取（配合 @fastify/rate-limit 的 `config.rateLimit` 实现路由级限流）。
- **违反后果**: 健康检查刷爆日志 / 敏感路由无审计痕迹 / 限流无法按路由差异化。
- **验证方法**: 人工检查（逐路由确认 logLevel/config 是否按敏感性配置）。
- **对应门禁**: 人工检查

```verify
id: fastify-r6
cmd: 
expect: always
```

### 规律：pino 日志集成——logger 选项必须显式启用，生产禁用 pretty transport
- **适用版本**: Fastify 5.x / 4.x（pino 内建）
- **规律**: Fastify 内建 pino，初始化 `fastify({ logger: true })` 或传入 pino 实例/配置。`logger: false`（默认）则无请求日志。开发可用 `transport: { target: 'pino-pretty' }`，生产必须 JSON 输出（pino-pretty 高开销）。`request.log`/`reply.log` 自动带 request-id。
- **违反后果**: 无请求日志 → 事故无法回溯；生产 pino-pretty → 日志吞吐骤降。
- **验证方法**: 检出 fastify 初始化文件但无 `logger:` 选项且无 pino 引入 → warn。
- **对应门禁**: fw_fastify_logger(warn)

```verify
id: fastify-r7
cmd: 
expect: always
```

### 规律：插件注册顺序敏感——register 须先于依赖其装饰器/钩子的路由声明
- **适用版本**: Fastify 5.x / 4.x
- **规律**: Fastify 按 register/路由声明顺序构建 avvio 启动图；后注册的插件其钩子不影响先声明的路由（封装上下文已建立）。鉴权/装饰器插件必须先 register，再声明依赖它们的路由；或用 `fastify.after()`/`await register` 显式排序。
- **违反后果**: 鉴权钩子对先声明的路由不生效 → 未授权访问 CWE-862；装饰器 undefined。
- **验证方法**: 同一文件内首个路由声明行号 < 首个 `.register(` 行号 → warn（路由先于插件注册）。
- **对应门禁**: fw_fastify_plugin_order(warn)

```verify
id: fastify-r8
cmd: 
expect: always
```

### 规律：decorateRequest/decorateReply 禁止对象/数组字面量默认值（跨请求引用共享）
- **适用版本**: Fastify 5.x / 4.x
- **规律**: 官方文档明确：`decorateRequest('user', {})` 的对象字面量在所有请求间共享同一引用，一个请求修改即污染全部请求。请求级状态须传 `null` 后在钩子中赋值，或用 getter。`decorate`（server 级）共享无状态工具对象合法。
- **违反后果**: 跨请求数据串扰（用户 A 数据泄露给用户 B）CWE-668；并发下状态错乱。
- **验证方法**: `grep -nE 'decorate(Request|Reply)\([^,]+,[[:space:]]*(\{|\[)'` 命中 → warn。
- **对应门禁**: fw_fastify_decorate_reference(warn)

```verify
id: fastify-r9
cmd: grep -nE 'decorate(Request|Reply)\([^,]+,[[:space:]]*(\{|\[)' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@fastify/cors origin 须显式白名单，禁止 origin: true / '*'
- **适用版本**: @fastify/cors 9.x+（Fastify 5.x 对应线，待验证具体配套小版本）
- **规律**: `@fastify/cors` 默认 `origin: false`（v9 起收紧，待验证默认演变）。`origin: true` 反射任意 Origin、`origin: '*'` 放行任意源，浏览器跨域防线全失。生产须显式域名白名单数组或校验函数；携带 credentials 时绝不可 `*`。
- **违反后果**: 任意站点可跨域调用 API → 数据被恶意站点读取 CWE-942。
- **验证方法**: 检出 `@fastify/cors` 注册且同行/邻近行 `origin[[:space:]]*:[[:space:]]*(true|['"]\*['"])` → warn。
- **对应门禁**: fw_fastify_cors(warn)

```verify
id: fastify-r10
cmd: 
expect: always
```

### 规律：公开端点须注册 @fastify/rate-limit 速率限制
- **适用版本**: @fastify/rate-limit 10.x（Fastify 5.x 对应线，待验证具体配套小版本）
- **规律**: `@fastify/rate-limit` 提供全局 `max`/`timeWindow` 与路由级 `config.rateLimit`。无速率限制的公开端点（尤其登录/注册/发短信）可被暴力枚举/撞库。生产须按端点敏感度配置，并考虑多实例下用 Redis store（内存 store 仅单实例有效）。
- **违反后果**: 暴力破解/撞库/接口刷量 CWE-770。
- **验证方法**: 全部源码未检出 `@fastify/rate-limit` → warn。
- **对应门禁**: fw_fastify_rate_limit(warn)

```verify
id: fastify-r11
cmd: 
expect: always
```

### 规律：受保护路由须有认证机制（@fastify/auth 或 preHandler/onRequest 钩子）
- **适用版本**: @fastify/auth 5.x（Fastify 5.x 对应线，待验证具体配套小版本）
- **规律**: 除显式公开端点外，路由须挂认证：`preHandler: fastify.auth([...])`（@fastify/auth 支持多策略）或 onRequest/preHandler 自定义钩子校验 JWT/session。Fastify 无内建认证，漏挂即未授权。
- **违反后果**: 受保护资源未授权访问 CWE-862。
- **验证方法**: 存在路由声明但全部源码未检出 `@fastify/auth`/`preHandler`/`authenticate`/`onRequest` 认证钩子 → warn。
- **对应门禁**: fw_fastify_auth(warn)

```verify
id: fastify-r12
cmd: 
expect: always
```

### 规律：API 文档由 @fastify/swagger 从 schema 生成，禁止手维护漂移文档
- **适用版本**: @fastify/swagger 9.x（Fastify 5.x 对应线，待验证具体配套小版本）
- **规律**: `@fastify/swagger` 直接从路由 JSON Schema 生成 OpenAPI 文档（dynamic 模式），文档与校验同源不漂移。手维护的静态文档必然与实现漂移。配套 `@fastify/swagger-ui` 提供调试界面（生产须评估是否暴露）。
- **违反后果**: 文档与实现漂移 → 前后端联调扯皮、契约失真。
- **验证方法**: 全部源码未检出 `@fastify/swagger` → warn。
- **对应门禁**: fw_fastify_swagger(warn)

```verify
id: fastify-r13
cmd: 
expect: always
```

<!--
共 13 条规律（≥10 门槛）。每条规律均挂门禁 id 或"人工检查"，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE / GB 映射 |
|---------|------|---------|---------|--------------|
| fw_fastify_schema_validation | fail | 含路由声明的文件未含 schema: → fail 输入未校验 | FASTIFY_SRC_GLOBS | CWE-20；GB/T 38674-2020 §5.1 |
| fw_fastify_response_schema | warn | 含 schema: 但无 response: → warn 序列化未优化 | FASTIFY_SRC_GLOBS | CWE-200 |
| fw_fastify_encapsulation | warn | 插件函数内 .decorate( 且未引入 fastify-plugin/fp( → warn | FASTIFY_SRC_GLOBS | — |
| fw_fastify_onsend_return | fail | onSend 窗口内含 payload 改写但无 return/done → fail 修改静默丢弃 | FASTIFY_SRC_GLOBS | — |
| fw_fastify_error_handler | fail | 有路由但无 setErrorHandler → fail 错误响应未收敛 | FASTIFY_SRC_GLOBS | CWE-209 |
| fw_fastify_logger | warn | fastify 初始化无 logger: 且无 pino → warn | FASTIFY_SRC_GLOBS | — |
| fw_fastify_plugin_order | warn | 同文件首个路由先于首个 register( → warn 钩子不生效 | FASTIFY_SRC_GLOBS | CWE-862；GB/T 38674-2020 §5.3 |
| fw_fastify_decorate_reference | warn | decorateRequest/decorateReply 第二参为对象/数组字面量 → warn 跨请求共享引用 | FASTIFY_SRC_GLOBS | CWE-668 |
| fw_fastify_cors | warn | @fastify/cors origin: true/'*' → warn 任意源放行 | FASTIFY_SRC_GLOBS | CWE-942 |
| fw_fastify_rate_limit | warn | 未检出 @fastify/rate-limit → warn | FASTIFY_SRC_GLOBS | CWE-770 |
| fw_fastify_auth | warn | 有路由但无 @fastify/auth/preHandler/authenticate → warn | FASTIFY_SRC_GLOBS | CWE-862；GB/T 38674-2020 §5.3 |
| fw_fastify_swagger | warn | 未检出 @fastify/swagger → warn 文档漂移风险 | FASTIFY_SRC_GLOBS | — |

<!--
门禁 id 命名规范：fw_fastify_<rule>（rule 全小写下划线）。
本表 12 条 id 须在 assets/framework-gates/fastify.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_fastify_<rule>(...) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: fastify  requires_conf: FASTIFY_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含无 schema 路由 + onSend 改写未 return + 无 setErrorHandler
→ schema_validation/onsend_return/error_handler fail 主触发（3/3 已断言）；compliant 修正后全 pass。
2026-07-20 唤醒登记：error_handler 曾因 fixture 注释自含 setErrorHandler 字面量假 pass、
onsend_return 因 hook 距 EOF 不足 15 行窗口不闭合，均经 fixture 修正唤醒（门禁脚本未动）；
EOF 窗口不兜底属已知限制，留 P1 评估（见 tests/fixtures/fastify/README.md）。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| fastify × prisma | Fastify 插件内以 fastify-plugin 挂 `fastify.prisma` 装饰器共享 PrismaClient | 每请求新建 client 会耗尽连接池；封装上下文内 decorate 不共享 |
| fastify × typeorm | DataSource 初始化须先于路由可用（onReady/await initialize），勿在 handler 内 new DataSource | handler 内建连接 → 连接池耗尽 |
| fastify × zod/typebox | 用 zod/typebox 定义 schema 时须接 validatorCompiler（fastify-type-provider-zod / @fastify/type-provider-typebox） | Fastify 默认 Ajv，外来 schema 库不接 compiler 不生效 |
| fastify × pino 生态 | 与 express 混部时日志实例须各自独立，勿共用 transport | pino transport worker 线程绑定单实例 |

<!--
本表聚焦 fastify 生态内高频组合；无强交互的框架组合省略。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Fastify 4.x → 5.x | Node 最低版本提升；路由 find-my-way 更新；部分弃用 API 移除（`reply.context` 等） | v4 插件须确认声明兼容 v5（fastify-plugin 版本约束） |
| Fastify 5.x | 当前 latest 文档线 v5.10.x（2026-07-17 核实），无 v6 线 | 规律按 5.x 陈述 |
| @fastify/cors v8 → v9 | 默认 origin 行为收紧（待验证默认演变细节） | 升级后未显式配 origin 的跨域行为变化须复核 |
| Ajv v8（Fastify 4/5 内建） | strict 模式默认更严，JSON Schema draft-07 | 松散 schema（未声明 type/嵌套 properties）校验告警，须显式 |
| onSend async return | async onSend `return newPayload` 才替换 payload（官方 Hooks 文档 2026-07 核实）；callback 风格 done(err, payload) | 只改局部变量不 return → 修改静默丢弃 |
| fast-json-stringify | 仅按 response schema 白名单序列化；schema 缺字段则该字段不输出 | response schema 漏字段 → 响应丢字段（非校验错误） |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
