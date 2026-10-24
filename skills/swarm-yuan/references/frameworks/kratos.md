---
ruleset_id: kratos
适用版本: go-kratos v2.x（kratos-layout v2 标准分层；v2.7.x 为 2026-07 调研时点主流稳定线）
最后调研: 2026-07-20（来源：https://go-kratos.dev/zh-cn/docs/ ；https://github.com/go-kratos/kratos-layout ；https://github.com/grpc/grpc-go/issues/3674 ；google/wire 官方文档）
深度门槛: 10
---

# go-kratos 规则集

<!--
本规则集覆盖 go-kratos v2.x（含 kratos-layout 标准工程布局 cmd/internal/{server,service,biz,data}/api/configs）。
调研时点：2026-07-20。Recovery 链首语义、kratos errors 包装（code+reason）、wire 编译期注入、
Unimplemented 值内嵌等均出自官方文档与 grpc-go/wire 上游 issue（各条「证据」字段注明）。
每条规律在「验证方法」后附「证据」字段（调研出处），无法联网核实的版本点不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `github.com/go-kratos/kratos/v2`（go.mod） | 高 |
| 文件 | `**/wire.go` + `**/wire_gen.go`（wire 编译期注入对） | 高 |
| 文件 | `internal/{server,service,biz,data}/` 四层目录（kratos-layout 标准布局） | 中（需组合信号） |
| 配置 | `configs/config.yaml` + `internal/conf/*.proto`（Bootstrap 配置契约） | 中 |
| 代码 | `kratos.New(` / `http.NewServer(` / `grpc.NewServer(` / `recovery.Recovery()` / `RegisterXxxHTTPServer(` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中「依赖」或「代码」高置信度行即可激活 kratos 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 服务注册：`grep -rnE 'Register[A-Za-z0-9_]+(HTTP)?Server\(' "${PROJECT_DIR}" --include='*.go'`（计数核验基准：Register 调用行数）
- 中间件栈：`grep -rnE '\.(Middleware)\(' "${PROJECT_DIR}" --include='*.go'`（计数核验基准：http/grpc/kratos Middleware 注册行数）
- wire provider：`grep -rnE 'func New[A-Za-z0-9_]+(Service|Usecase|Repo)\(' "${PROJECT_DIR}" --include='*.go'`（计数核验基准：provider 构造函数行数，须与 wire.NewSet 收录数一致）
- ProviderSet：`grep -rnE 'wire\.NewSet\(' "${PROJECT_DIR}" --include='*.go'`（计数核验基准：ProviderSet 定义行数）
- proto 契约：`find "${PROJECT_DIR}" -name '*.proto' -not -path '*/third_party/*'`（计数核验基准：proto 文件数；含 `google.api.http` 注解的 service 数须 ≤ RegisterXxxHTTPServer 数）
- 生成代码：`find "${PROJECT_DIR}" -name '*.pb.go' -o -name 'wire_gen.go'`（计数核验基准：生成文件数，DO NOT EDIT 头覆盖应 = 100%）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：服务端中间件栈须注册 recovery.Recovery() 且置于链首
- **适用版本**: go-kratos v2 全版本
- **规律**: `http.NewServer`/`grpc.NewServer` 通过 `grpc.Middleware(...)`/`http.Middleware(...)` 注册的中间件链，靠前者为外层。`recovery.Recovery()` 捕获下游 handler 与内层中间件的 panic 并转为 500/Internal 错误，须置于链首（第一个），否则排在它前面的中间件（如 logging/tracing 前置逻辑）内 panic 无人兜底，直接崩进程。
- **违反后果**: 单个恶意/异常请求触发 panic → 进程退出，全部在途请求中断（可用性事故）。
- **验证方法**: 检出 `(http|grpc).NewServer(` 且同文件有 `.Middleware(` 但无 `recovery.Recovery(` → fail；Recovery 行号非文件内最早中间件构造调用 → warn。
- **证据**: kratos 官方中间件文档与全部官方示例均将 recovery.Recovery() 列为首个中间件（https://go-kratos.dev/zh-cn/docs/component/middleware/ ；官方 issue #2953 示例 http.Middleware(recovery.Recovery(), ...) 置首）。
- **对应门禁**: fw_kratos_recovery_middleware(fail)

```verify
id: kratos-r1
cmd: 
expect: always
```

### 规律：业务错误须用 kratos errors 包装（code+reason），禁裸 fmt.Errorf/status.Error
- **适用版本**: go-kratos v2 全版本（`github.com/go-kratos/kratos/v2/errors`）
- **规律**: service/biz 层返回错误须用 `errors.New(code, reason, message)` / `errors.BadRequest(...)` 等 kratos errors 构造（或 proto 错误码经 protoc-gen-go-errors 生成的 `ErrorXxx()`），使 gRPC 状态码与 HTTP 状态码/reason 可机械判定。裸 `fmt.Errorf` / 标准库 `errors.New("...")` / 直连 `status.Error` 会被统一映射为 gRPC Unknown(2) / HTTP 500，客户端 `errors.Is/FromError` 无法区分业务错误类型。
- **违反后果**: 错误码语义丢失 → 客户端只能按 500 兜底，重试/降级/告警策略失效；错误响应格式碎片化。
- **验证方法**: `internal/{service,biz}` 下检出 `fmt.Errorf(` / `errors.New("`（单字符串实参=标准库形态）/ `status.Errorf?(` → warn。
- **证据**: kratos 官方 errors 文档「Error 原型定义 + errors.Is/FromError 判定」（https://go-kratos.dev/zh-cn/docs/component/errors/ ）；kratos errors 包源码将未知错误映射为 Unknown/500（errors/types.go）。
- **对应门禁**: fw_kratos_error_wrap(warn)

```verify
id: kratos-r2
cmd: 
expect: always
```

### 规律：请求链路内 ctx 须透传，禁新建 context.Background()/TODO()
- **适用版本**: go-kratos v2 全版本
- **规律**: service→biz→data 调用链须透传 handler 入参 `ctx`。链路中途新建 `context.Background()` / `context.TODO()` 会切断：①服务端 Timeout/客户端取消的传播；②`metadata` 中间件注入的元数据；③tracing 中间件的 span 父子关系（断链后 trace 出现孤点）。仅允许在异步脱链任务（如 fire-and-forget 后台 job）中显式新建，并注释说明。
- **违反后果**: 超时控制失效（慢查询挂死连接池）、链路追踪断点、取消信号不下传（客户端断开后 DB 查询照跑）。
- **验证方法**: `internal/{service,biz,data}`（排除 `_test.go`）检出 `context.Background()` / `context.TODO()` → warn。
- **证据**: kratos metadata/timeout/tracing 中间件均依赖 ctx 承载（https://go-kratos.dev/zh-cn/docs/component/middleware/ ；tracing 中间件实现 `tracer.Start(ctx, ...)` 注入 span，见 middleware/tracing 源码）。
- **对应门禁**: fw_kratos_context_propagation(warn)

```verify
id: kratos-r3
cmd: 
expect: always
```

### 规律：wire provider 定义后必须收录进同模块 ProviderSet
- **适用版本**: go-kratos v2 + google/wire 全版本（kratos-layout 标准布局）
- **规律**: `NewXxxService` / `NewXxxUsecase` / `NewXxxRepo` 构造函数（provider）定义后，必须加入同目录模块的 `var ProviderSet = wire.NewSet(...)`。wire 是编译期依赖注入：新增 provider 忘记收录 → `wire` 生成时报 "no provider" / 依赖链断裂；忘记重新执行 wire → wire_gen.go 与 wire.go 漂移，注入实例缺失或编译失败。
- **违反后果**: 启动即 panic（nil 依赖）或 CI 编译失败；新人加 Service 后服务注册静默缺失（路由 404）。
- **验证方法**: `internal/` 下检出 `func New[A-Za-z0-9_]+(Service|Usecase|Repo)(` 构造函数名未出现在同目录含 `wire.NewSet(` 的文件中 → fail。
- **证据**: kratos 官方 wire 指南「每个模块一个 ProviderSet，wire.go 汇总注入」（https://go-kratos.dev/zh-cn/docs/guide/wire/ ）；wire 官方文档「provider 未满足时生成期报错」（https://github.com/google/wire ）；kratos issue #916（ProviderSet 漏配/误配求助实例）。
- **对应门禁**: fw_kratos_wire_provider(fail)

```verify
id: kratos-r4
cmd: 
expect: always
```

### 规律：protoc/wire 生成代码禁止手改（DO NOT EDIT 头不可抹除）
- **适用版本**: go-kratos v2 全版本（`*.pb.go` / `*_grpc.pb.go` / `*_http.pb.go` / `wire_gen.go`）
- **规律**: `kratos proto client/server`（protoc-gen-go / -go-grpc / -go-http / -go-errors）与 `wire` 产出的生成文件首行含 `// Code generated by ... DO NOT EDIT.`。手改生成文件（加字段、改方法、抹除生成头）会在下次 `make api` / `wire` 重新生成时被整体覆盖，改动静默丢失；定制需求须走：proto 扩展 option、装饰层（wrapper struct）、或 `partial` 业务方法文件（与生成文件同包不同文件）。
- **违反后果**: 手改逻辑随重新生成丢失 → 线上行为回退且 diff 不可见；生成头被抹除后 reviewer 无法识别该文件为生成物。
- **验证方法**: `*.pb.go` / `wire_gen.go` 前 5 行无 `DO NOT EDIT` 标记 → fail。
- **证据**: protoc-gen-go / wire 生成物首行强制写入 "DO NOT EDIT"（protoc-gen-go 源码与 google/wire 文档）；kratos Makefile `api` 目标重新生成即覆盖同路径文件（kratos-layout Makefile）。
- **对应门禁**: fw_kratos_generated_code_edit(fail)

```verify
id: kratos-r5
cmd: 
expect: always
```

### 规律：configs 配置禁止明文凭据（password/secret/token/DSN user:pass@）
- **适用版本**: go-kratos v2 全版本（`configs/config.yaml` + config 组件多数据源）
- **规律**: `configs/config.yaml` 入库文件中，`password` / `secret` / `token` / `api_key` / `access_key` 等键值与 DSN 内嵌凭据（`root:pass@tcp(...)`、`redis://user:pass@host`）一律禁止明文，须用 `${ENV_VAR}` 占位 + 环境变量注入，或接入配置中心（nacos/apollo/etcd）+ KMS 加密。kratos config 组件支持 env/file/配置中心多源合并，明文入库即泄露。
- **违反后果**: 仓库泄露=数据库/缓存/第三方密钥泄露（CWE-798 硬编码凭证）；git 历史不可清除，须按泄露事件轮换全部密钥。
- **验证方法**: yaml 中检出 `(password|secret|token|api_?key|access_?key): <非空非${占位值>` 或 `://user:pass@` / `:pass@tcp(` 内嵌凭据（含 `${` 占位豁免）→ fail。
- **证据**: CWE-798 Use of Hard-coded Credentials；kratos config 组件支持 env 数据源与配置中心合并（https://go-kratos.dev/zh-cn/docs/component/config/ ）；通用门禁 check_sensitive 同口径（precheck.sh）。
- **对应门禁**: fw_kratos_plaintext_secret(fail)

```verify
id: kratos-r6
cmd: 
expect: always
```

### 规律：biz/service 层禁止 import internal/data（kratos-layout 依赖倒置）
- **适用版本**: go-kratos v2 + kratos-layout 全版本
- **规律**: kratos-layout 四层单向依赖：server→service→biz←data。biz 层定义 `XxxRepo` 接口（依赖倒置），data 层实现之并经 wire 注入回 biz。biz/service 直接 `import ".../internal/data"` 属分层倒挂：层级耦合、Repo 无法 mock（单测须连真实 DB）、接口契约形同虚设。
- **违反后果**: 单测必须起真实数据库；data 实现（MySQL→TiDB/ES）无法无痛替换；wire 注入链失去意义。
- **验证方法**: `internal/biz` / `internal/service` 下检出 import 路径含 `/internal/data"` → fail。
- **证据**: kratos-layout 官方布局约定「biz 定义仓库接口、data 实现接口」（https://github.com/go-kratos/kratos-layout ；官方 blog《Go 工程化-依赖注入》2021-07）。
- **对应门禁**: fw_kratos_layer_dependency(fail)

```verify
id: kratos-r7
cmd: 
expect: always
```

### 规律：gRPC 服务 struct 须值内嵌 UnimplementedXxxServer
- **适用版本**: go-kratos v2（protoc-gen-go-grpc ≥ v1.0）
- **规律**: 实现 `RegisterXxxServer` 对应服务接口的 struct 须值内嵌（非指针）`UnimplementedXxxServer`。proto 给 service 增加方法属后向兼容变更，但未内嵌时生成代码接口新增方法 → 业务代码编译断裂；值内嵌后新方法默认返回 Unimplemented 错误，编译不炸。指针内嵌且未赋初值会在 Register 时 panic。
- **违反后果**: proto 演进一次全员编译失败；指针内嵌 nil → 启动注册即 panic。
- **验证方法**: 检出 `RegisterXxxServer(` 注册但全项目无 `UnimplementedXxxServer` 引用 → warn。
- **证据**: grpc-go issue #3674（官方决议强制内嵌以保前向兼容）；protoc-gen-go-grpc README「Unimplemented must be embedded by value, pointer embedding panics at Register time」。
- **对应门禁**: fw_kratos_unimplemented_embed(warn)

```verify
id: kratos-r8
cmd: 
expect: always
```

### 规律：proto 含 google.api.http 注解的 service 须注册 HTTP 网关
- **适用版本**: go-kratos v2（protoc-gen-go-http）
- **规律**: proto rpc 上写 `option (google.api.http) = {...}` 注解后，protoc-gen-go-http 生成 `RegisterXxxHTTPServer`，须在 `http.NewServer` 上注册；只注册 `RegisterXxxServer`（gRPC）则 REST 注解成摆设，浏览器/REST 客户端 404。双协议服务须 grpc+http 成对注册（kratos-layout newApp 即双注册范式）。
- **违反后果**: REST 客户端调用 404 / 连接拒绝；网关层路由配置与服务实际暴露面不一致。
- **验证方法**: proto 含 `google.api.http` 的 service 名在代码中无 `RegisterXxxHTTPServer(` → warn。
- **证据**: kratos-layout main.go newApp 双注册范式（`pb.RegisterGreeterServer(gs, greeter)` + `pb.RegisterGreeterHTTPServer(hs, greeter)`）；官方文档 transport 章节（https://go-kratos.dev/zh-cn/docs/component/transport/ ）。
- **对应门禁**: fw_kratos_http_register_missing(warn)

```verify
id: kratos-r9
cmd: 
expect: always
```

### 规律：NewServer 须配 Timeout 选项（慢请求防护）
- **适用版本**: go-kratos v2 全版本（`http.Timeout` / `grpc.Timeout` server option）
- **规律**: `http.NewServer` / `grpc.NewServer` 须配 `http.Timeout(d)` / `grpc.Timeout(d)` 选项。kratos timeout 中间件对超时请求提前返回并取消 ctx，防止慢请求/慢客户端长期占用连接与 goroutine。无 Timeout 时默认不超时，故障依赖（DB 慢查）会把服务端资源拖干。
- **违反后果**: 慢依赖故障 → 连接/goroutine 堆积 → 级联雪崩（无熔断第一道闸）。
- **验证方法**: 检出 `(http|grpc).NewServer(` 但同文件无 `(http|grpc).Timeout(` → warn。
- **证据**: kratos 官方 middleware/timeout 文档「Server 端超时会中断后续处理并返回超时错误」（https://go-kratos.dev/zh-cn/docs/component/middleware/ ）；kratos-layout server.go 模板默认带 grpc.Timeout/http.Timeout。
- **对应门禁**: fw_kratos_server_timeout(warn)

```verify
id: kratos-r10
cmd: 
expect: always
```

### 规律：proto 声明 validate.rules 须挂 validate.Validate() 中间件
- **适用版本**: go-kratos v2 + protoc-gen-validate（PGV）
- **规律**: proto message 字段上的 `(validate.rules)...` 校验规则由 PGV 生成 `Validate()` 方法，但规则不会自动执行——须在服务端中间件栈挂 `validate.Validate()`（kratos middleware/validate），对入参统一校验并返回 InvalidArgument。只写 rules 不挂中间件 → 校验形同虚设，非法输入直达业务层。
- **违反后果**: 非法/越界输入穿透到 biz/data（CWE-20 输入校验不当）；rules 给 reviewer 虚假安全感。
- **验证方法**: proto 检出 `validate.rules` 但全项目无 `validate.Validate(` → warn。
- **证据**: kratos 官方 middleware/validate 文档「通过中间件对请求参数进行校验」（https://go-kratos.dev/zh-cn/docs/component/middleware/ ）；PGV 生成的 Validate() 须显式调用（protovalidate / protoc-gen-validate 文档）。
- **对应门禁**: fw_kratos_validate_middleware(warn)

```verify
id: kratos-r11
cmd: 
expect: always
```

### 规律：kratos.New 须配 kratos.Name / kratos.Version 实例元数据
- **适用版本**: go-kratos v2 全版本
- **规律**: `kratos.New(...)` 须显式传 `kratos.Name(...)` 与 `kratos.Version(...)`。Name/Version 写入 registry.ServiceInstance 元数据，是注册中心实例标识、灰度路由、监控标签（service.name/version）的来源。缺失则注册实例名为空串，多版本并存时无法区分。
- **违反后果**: 注册中心实例列表无名/无版本 → 流量治理（按版本灰度、摘流）失效；监控标签缺失。
- **验证方法**: 检出 `kratos.New(` 但同文件无 `kratos.Name(` / `kratos.Version(` → warn。
- **证据**: kratos 官方 app 文档与 kratos-layout main.go（`kratos.Name(Name)` / `kratos.Version(Version)` 经 -ldflags -X 注入）；app.go buildInstance() 将 Name/Version 写入 ServiceInstance（kratos 源码）。
- **对应门禁**: fw_kratos_app_metadata(warn)

```verify
id: kratos-r12
cmd: 
expect: always
```

### 规律：wire.go 存在则 wire_gen.go 必须生成并提交
- **适用版本**: go-kratos v2 + google/wire 全版本
- **规律**: `cmd/<app>/wire.go`（`//go:build wireinject` + `panic(wire.Build(...))`）只是 injector 声明；实际注入代码在同目录 `wire_gen.go`（`//go:build !wireinject`）。只提交 wire.go 不提交 wire_gen.go（或新增 provider 后未重跑 wire）→ `wireApp` 未定义/漂移，编译失败或注入链与声明不符。CI 若不跑 wire 步骤，必须将 wire_gen.go 入库。
- **违反后果**: 克隆即编译失败（wireApp undefined）；wire.go 与 wire_gen.go 漂移导致注入实例静默缺失。
- **验证方法**: 检出 `wire.go` 含 `wire.Build(` 但同目录无 `wire_gen.go` → warn。
- **证据**: kratos 官方 wire 指南「在 main 目录运行 wire 生成 wire_gen.go」（https://go-kratos.dev/zh-cn/docs/guide/wire/ ）；kratos-layout 将 wire_gen.go 入库的既定做法。
- **对应门禁**: fw_kratos_wire_gen_missing(warn)

```verify
id: kratos-r13
cmd: 
expect: always
```

<!--
共 13 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE / GB 映射 |
|---------|------|---------|---------|--------------|
| fw_kratos_recovery_middleware | fail | NewServer+Middleware 无 recovery.Recovery → fail；Recovery 非链首 → warn | KRATOS_SRC_GLOBS | — |
| fw_kratos_error_wrap | warn | service/biz 检出 fmt.Errorf/stdlib errors.New/status.Error → warn | KRATOS_SRC_GLOBS | — |
| fw_kratos_context_propagation | warn | service/biz/data 检出 context.Background()/TODO() → warn | KRATOS_SRC_GLOBS | — |
| fw_kratos_wire_provider | fail | New*Service/Usecase/Repo 未收录同目录 wire.NewSet → fail | KRATOS_SRC_GLOBS | — |
| fw_kratos_generated_code_edit | fail | *.pb.go/wire_gen.go 前 5 行无 DO NOT EDIT → fail | KRATOS_SRC_GLOBS | — |
| fw_kratos_plaintext_secret | fail | yaml 明文凭据键值 / DSN user:pass@（${} 占位豁免）→ fail | KRATOS_SRC_GLOBS | CWE-798 |
| fw_kratos_layer_dependency | fail | biz/service import /internal/data → fail | KRATOS_SRC_GLOBS | — |
| fw_kratos_unimplemented_embed | warn | RegisterXxxServer 无 UnimplementedXxxServer 内嵌 → warn | KRATOS_SRC_GLOBS | — |
| fw_kratos_http_register_missing | warn | proto 含 google.api.http 但缺 RegisterXxxHTTPServer → warn | KRATOS_SRC_GLOBS | — |
| fw_kratos_server_timeout | warn | NewServer 无 (http\|grpc).Timeout → warn | KRATOS_SRC_GLOBS | CWE-400 |
| fw_kratos_validate_middleware | warn | proto 含 validate.rules 但无 validate.Validate() → warn | KRATOS_SRC_GLOBS | CWE-20 |
| fw_kratos_app_metadata | warn | kratos.New 缺 kratos.Name/kratos.Version → warn | KRATOS_SRC_GLOBS | — |
| fw_kratos_wire_gen_missing | warn | wire.go 有 wire.Build 但同目录无 wire_gen.go → warn | KRATOS_SRC_GLOBS | — |

<!--
门禁 id 命名规范：fw_kratos_<rule>（rule 全小写下划线）。
本表 13 条 id 须在 assets/framework-gates/kratos.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_kratos_<rule>(...) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: kratos  requires_conf: KRATOS_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 无 Recovery 中间件栈 + NewOrderService 未入 ProviderSet
+ 手改 pb.go（抹 DO NOT EDIT 头）+ config.yaml 明文密码/DSN 凭据 + biz 倒挂 import data
→ recovery_middleware/wire_provider/generated_code_edit/plaintext_secret/layer_dependency
fail 主触发（5/5 已断言 expected-fail-ids）；compliant 修正后 exit 0。
CWE/GB 映射列（2026-07-20 P1/P2 批次）：plaintext_secret→CWE-798（硬编码凭证）、
server_timeout→CWE-400（资源耗尽）、validate_middleware→CWE-20（输入校验不当），
均出自本文件 §3 规律「违反后果」既有论证；— = 工程规范类门禁，无 CWE 直挂。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| kratos × gorm | biz/data 层查询须 `WithContext(ctx)` 且 ctx 来自入参透传 | 与 fw_kratos_context_propagation 联动：断链 ctx 使 DB 查询无法随请求取消 |
| kratos × redis | 缓存操作须传入参 ctx，禁 context.Background() | 同上：请求结束后缓存操作仍阻塞连接池 |
| kratos × nacos/apollo | 明文凭据从 config.yaml 迁配置中心后仍禁明文落库 | fw_kratos_plaintext_secret 只扫入库文件，配置中心值须 KMS/加密存储 |
| kratos × grpc-go | proto 演进（增方法/增字段）后必须全量重生成 pb.go 并复核 Unimplemented 内嵌 | 生成物漂移 + 未内嵌 = 编译断裂双杀 |

<!--
本表聚焦 kratos 生态内高频组合；与既有 gin/gorm/redis/nacos 规则集呼应。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| kratos v2.0 ~ v2.4 | `errors.New(code, reason, message)` 签名稳定；HTTP 错误体含 code/reason/message | 规律照旧 |
| kratos v2.5+ | middleware/validate 基于 protoc-gen-validate v0.6+ API（`Validate()` 接口断言） | PGV v1 生成物接口变化时须同步升级 validate 中间件 |
| kratos v2.7.x | 2026-07 调研时点主流稳定线；`kratos.New` 元数据写入 ServiceInstance 行为稳定 | 规律照旧 |
| protoc-gen-go-grpc ≥ v1.0 | `require_unimplemented_servers=true` 默认：不内嵌 Unimplemented 即编译失败 | fw_kratos_unimplemented_embed 在旧生成物（=false）项目降级为 warn 语义不变 |
| wire v0.5+ | `wire.Build` 不再依赖 build tag 之外额外参数；wire_gen.go 头固定 `Code generated by Wire. DO NOT EDIT.` | fw_kratos_generated_code_edit 头检测照旧 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的
版本号匹配本表，落在受影响区间的项目须额外提示。
-->
