---
ruleset_id: opentelemetry
适用版本: OpenTelemetry 1.x（JS/TS @opentelemetry/api 1.9+ / sdk-node 0.50+；Python opentelemetry-sdk 1.27+；Go go.opentelemetry.io/otel v1.27+；Java io.opentelemetry 1.38+；版本差异单独标注）
最后调研: 2026-07-23（来源：opentelemetry.io 官方文档 / spec v1.39 / 各 SDK 仓库 README 与 CHANGELOG / opentelemetry-specification 语义约定）
深度门槛: 10
---

# OpenTelemetry 规则集

<!--
可观测性框架系规则集（WP-U 新增，填补 R4 §4.2「可观测性」缺口——此前仅 kafka 等中间件附带 metrics/lag 检测，无统一 OTel 规律集）。
判定哲学与 terraform/gin 一致：grep/awk 静态结构匹配，宁 warn 勿误判 fail；
多语言支持（JS/TS/Python/Go/Java）按扩展名分桶，每桶用对应注释剥离器（C 系 / hash 系）。
凡文件级启发式（非语义解析）的规律均在「验证方法」中写明口径边界。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `@opentelemetry/api` / `@opentelemetry/sdk-node` / `@opentelemetry/exporter-*`（package.json） | 高 |
| 依赖 | `opentelemetry-api` / `opentelemetry-sdk` / `opentelemetry-exporter-*`（requirements.txt / pyproject.toml） | 高 |
| 依赖 | `go.opentelemetry.io/otel` / `go.opentelemetry.io/otel/sdk` / `go.opentelemetry.io/otel/exporters/otlp`（go.mod） | 高 |
| 依赖 | `io.opentelemetry:opentelemetry-api` / `io.opentelemetry:opentelemetry-sdk` / `opentelemetry-exporter-*`（pom.xml） | 高 |
| 文件 | `**/otel{,init}.{js,ts,py,go,java}` / `**/instrumentation.{js,ts,py}` | 中 |
| 配置 | `OTEL_SERVICE_NAME=` / `OTEL_EXPORTER_OTLP_ENDPOINT=` 环境变量 | 中 |
| 代码 | `NodeSDK` / `resource.ServiceResource` / `Resource.create(` / `trace.getTracer(` / `OTEL_EXPORTER_OTLP_ENDPOINT` | 高 |
| 代码 | `tracer.startSpan(` / `span.setAttribute(` / `context.propagation` / `Baggage` / `otel.TracerProvider` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 exploration-guide.md §C+.0.5 区块。
detect 信号命中任一高置信度行即可激活 opentelemetry 框架规则集。
本框架为多语言：detect-frameworks.sh 通过 pkgjson/pyreq/pyproject/gomod/pom 多桶匹配，
cargo 式「file 类型」探测本框架不需要（依赖信号已覆盖四种语言生态）。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- tracer 获取：`grep -rnE 'getTracer\(|Tracer\(' --include='*.ts' --include='*.js' --include='*.py' --include='*.go' --include='*.java' .`（计数核验基准：tracer 实例获取点）
- span 创建：`grep -rnE 'startSpan\(|startActiveSpan\(' --include='*.ts' --include='*.js' --include='*.py' --include='*.go' --include='*.java' .`（计数核验基准：span 起点行数）
- span 属性：`grep -rnE '\.setAttribute\(|\.setAttributes\(' --include='*.ts' --include='*.js' --include='*.py' --include='*.go' --include='*.java' .`（计数核验基准：attribute 写入点）
- resource 配置：`grep -rnE 'Resource\.(create|new)|resource\.ServiceResource|service\.name|deployment\.environment' --include='*.ts' --include='*.js' --include='*.py' --include='*.go' --include='*.java' .`（计数核验基准：resource 定义点）
- exporter 配置：`grep -rnE 'OTLPExporter|otlpExporter|OTLP.*Exporter|ConsoleSpanExporter|JaegerExporter|ZipkinExporter' --include='*.ts' --include='*.js' --include='*.py' --include='*.go' --include='*.java' .`（计数核验基准：exporter 配置点）
- 采样器：`grep -rnE 'AlwaysOnSampler|TraceIdRatioBasedSampler|ParentBasedSampler|AlwaysOffSampler|sampler|Sampler' --include='*.ts' --include='*.js' --include='*.py' --include='*.go' --include='*.java' .`（计数核验基准：sampler 配置点）

<!--
枚举该框架特有的、生成时须全量列出的构件类型（与 §C+.1-FW 各框架枚举命令段呼应）。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
多语言统一用 --include 多扩展名覆盖 JS/TS/Python/Go/Java 五大生态。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：须显式配置 service.name，禁止默认 unknown_service
- **适用版本**: 全版本（spec 语义约定 service.name 为必填）
- **规律**: Resource 须显式配置 `service.name` 属性（或经 `OTEL_SERVICE_NAME` 环境变量注入）。未配置时 SDK 默认 `unknown_service`，导致 traces/metrics 在后端无法区分服务来源，可观测性失效。
- **违反后果**: 所有服务的 span 在 Tempo/Jaeger/Zipkin 后端聚合为 `unknown_service`，排障时无法定位责任服务，可观测性投资形同虚设（GB/T 22239-2019 8.1.4.7 安全审计要求可追溯；可观测性失效等同于审计盲区）。
- **验证方法**: `grep -rnE 'service\.name|ServiceName|service_name|serviceResource' --include='*.ts' --include='*.js' --include='*.py' --include='*.go' --include='*.java' .`（应非空），或存在 `OTEL_SERVICE_NAME` 环境变量配置文件命中；同时检出 `Resource` / `resourceAttributes` / `NodeSDK` 但无 service.name → warn
- **对应门禁**: fw_opentelemetry_service_name（warn 级）

```verify
id: opentelemetry-r1
cmd: grep -rnE 'service\.name|ServiceName|service_name|serviceResource' --include='*.ts' --include='*.js' --include='*.py' --include='*.go' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：须配置 exporter endpoint，非默认 localhost:4317
- **适用版本**: 全版本（OTLP exporter 默认 endpoint `http://localhost:4317`）
- **规律**: OTLP exporter 须显式配置 `endpoint`（或经 `OTEL_EXPORTER_OTLP_ENDPOINT` 环境变量），指向生产收集器（如 `http://otel-collector.observability:4317`）。默认 `localhost:4317` 仅本机 collector 可达，生产容器内 localhost 不通则数据静默丢失。
- **违反后果**: 默认 localhost 在容器/K8s 环境下不可达，trace/metrics 静默丢失无告警，线上故障无 trace 可查（可观测性静默失败比无监控更危险——给人"已监控"错觉）。
- **验证方法**: 检出 OTLP exporter 配置但无 `endpoint` / `OTEL_EXPORTER_OTLP_ENDPOINT` / `url:` / `endpoint:` 显式赋值 → warn
- **对应门禁**: fw_opentelemetry_exporter_endpoint（warn 级）

```verify
id: opentelemetry-r2
cmd: 
expect: always
```

### 规律：采样率须显式配置，非默认 always_on
- **适用版本**: 全版本（默认 AlwaysOnSampler 全量采样）
- **规律**: 生产高 QPS 服务须显式配置 sampler（`TraceIdRatioBasedSampler` 或 `ParentBasedSampler` + ratio），全量采样（默认 `AlwaysOnSampler`）会在高负载下撑爆后端存储与网络。ratio 须按流量与后端容量取值（0.01~0.1 量级常见）。
- **违反后果**: 全量采样致 Tempo/Jaeger 后端存储与查询压力激增，成本失控甚至拖垮后端；或被迫采样降级时无策略可循（CWE-400 资源消耗失控类同）。
- **验证方法**: 检出 tracer provider / NodeSDK / SDK 构建但无 `Sampler` / `sampler:` / `TraceIdRatioBased` / `ParentBased` 配置 → warn
- **对应门禁**: fw_opentelemetry_sampler（warn 级）

```verify
id: opentelemetry-r3
cmd: 
expect: always
```

### 规律：资源属性须含 deployment.environment
- **适用版本**: 全版本（spec 语义约定 deployment.environment 为推荐属性）
- **规律**: Resource 须含 `deployment.environment`（或 `deployment.environment` / `service.namespace`），用于区分 prod/staging/dev。未配置则后端无法按环境隔离/筛选，生产 trace 与测试 trace 混淆。
- **违反后果**: prod 与 staging trace 混在一起，排障时误读测试数据为生产问题或反之；环境维度的告警/告警抑制失效（GB/T 22239-2019 8.1.4.7 审计上下文完整性）。
- **验证方法**: 检出 Resource 配置但无 `deployment.environment` / `deployment\.environment` / `DEPLOYMENT_ENV` → warn
- **对应门禁**: fw_opentelemetry_deployment_env（warn 级）

```verify
id: opentelemetry-r4
cmd: 
expect: always
```

### 规律：须用 OTLP exporter，禁用已废弃的 Jaeger/Zipkin exporter
- **适用版本**: OTel spec ≥1.0（Jaeger exporter 2023 起废弃，推荐 OTLP；Zipkin exporter 维护停滞）
- **规律**: 须用 `OTLPExporter` / `OTLPSpanExporter` / `OTLPTraceExporter` 导出，禁用 `JaegerExporter` / `JaegerHttpTraceExporter` / `ZipkinExporter`。Jaeger collector 自 1.35 起原生支持 OTLP，废弃 Jaeger exporter 是社区共识。
- **违反后果**: 用废弃 exporter 失去新特性（exemplar / baggage / logs 统一）、维护停滞修 bug 慢；Jaeger exporter 对 OTel Logs API 不支持，可观测性三支柱（traces/metrics/logs）割裂（对应 GB/T 25000.51-2016 可维护性要求）。
- **验证方法**: `grep -rnE 'JaegerExporter|JaegerHttpTraceExporter|JaegerTraceExporter|ZipkinExporter' --include='*.ts' --include='*.js' --include='*.py' --include='*.go' --include='*.java' .` 命中 → fail
- **对应门禁**: fw_opentelemetry_deprecated_exporter（fail 级）

```verify
id: opentelemetry-r5
cmd: grep -rnE 'JaegerExporter|JaegerHttpTraceExporter|JaegerTraceExporter|ZipkinExporter' --include='*.ts' --include='*.js' --include='*.py' --include='*.go' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：Span 须含 attributes 业务上下文
- **适用版本**: 全版本
- **规律**: 业务关键 span（HTTP handler、DB query、RPC 调用）须 `span.setAttribute(key, value)` 写入业务上下文（如 `user.id` / `order.id` / `http.route` / `db.statement`）。空 span 仅有时延无业务关联，排障时无法从 trace 跳转到业务实体。
- **违反后果**: trace 只有耗时无业务字段，故障定位需二次查日志关联，排障链路断裂；无法按业务维度（订单/用户）聚合分析（GB/T 22239-2019 8.1.4.7 审计事件上下文）。
- **验证方法**: 检出 `startSpan` / `startActiveSpan` 但同项目无 `setAttribute` / `setAttributes` → warn
- **对应门禁**: fw_opentelemetry_span_attributes（warn 级）

```verify
id: opentelemetry-r6
cmd: 
expect: always
```

### 规律：须配置 baggage propagation
- **适用版本**: 全版本（Baggage API 是 OTel 跨服务传递业务上下文的规范机制）
- **规律**: 跨服务调用须配置 baggage propagator（与 traceContext 一并注册 `W3CTraceContextPropagator` + `W3CBaggagePropagator`），用于透传 `user.id` / `tenant.id` / `request.id` 等业务上下文。默认 SDK 仅启 traceContext，baggage 须显式开启 propagation。
- **违反后果**: 跨服务业务上下文丢失，下游 span 无法关联上游业务实体；需手动透传 header 致业务代码侵入（GB/T 22239-2019 8.1.4.7 跨服务审计链路完整性）。
- **验证方法**: 检出 trace 配置但无 `Baggage` / `W3CBaggagePropagator` / `baggagePropagator` → warn
- **对应门禁**: fw_opentelemetry_baggage_propagation（warn 级）

```verify
id: opentelemetry-r7
cmd: 
expect: always
```

### 规律：须配置 metrics 仪表盘导出
- **适用版本**: 全版本（metrics 是 OTel 三支柱之一）
- **规律**: 须配置 metrics exporter（`OTLPMetricExporter` / `PeriodicExportingMetricReader` / `MeterProvider`），不仅 trace。仅 trace 无 metrics 则无法做 RED 指标（Rate/Errors/Duration）长效监控，故障检测只能靠 trace 采样有盲区。
- **违反后果**: 缺 metrics 则无长效聚合视图，只能靠 trace 采样近似（采样漏掉低频故障）；告警无指标基线可设（CWE-1053 缺少可观测性监控）。
- **验证方法**: 检出 trace 配置但无 `MeterProvider` / `metricReader` / `OTLPMetricExporter` / `metrics` → warn
- **对应门禁**: fw_opentelemetry_metrics_export（warn 级）

```verify
id: opentelemetry-r8
cmd: 
expect: always
```

### 规律：日志须接入 OTel Logs API，禁用裸 console.log
- **适用版本**: OTel Logs API（spec ≥1.27 稳定；JS @opentelemetry/api-logs / Python opentelemetry-api logs 模块 / Go otellogrus / Java io.opentelemetry.instrumentation:opentelemetry-logback）
- **规律**: 结构化日志须经 OTel Logs API（`logs.getLogger()` / `LoggerProvider` / `OTLPLogExporter`）导出，使日志与 trace/metrics 共享 Resource 与 trace 上下文。裸 `console.log` / `print()` / `fmt.Println` 的日志与 trace 无关联，无法跳转。
- **违反后果**: 日志与 trace 割裂，排障时需人工按时间戳近似关联；日志无 trace_id 字段则无法在后端从 trace 跳日志（GB/T 22239-2019 8.1.4.7 审计事件关联性）。
- **验证方法**: 检出 trace 配置但无 `LoggerProvider` / `OTLPLogExporter` / `logs.getLogger` / `otelLogger` → warn（口径：仅当项目已用 OTel trace 才检；纯无 OTel 项目不报）
- **对应门禁**: fw_opentelemetry_logs_api（warn 级）

```verify
id: opentelemetry-r9
cmd: 
expect: always
```

### 规律：须配置 graceful shutdown，Exporter 正常 flush
- **适用版本**: 全版本（Span/Metric/Log exporter 均为批量异步导出）
- **规律**: 进程退出前须 `provider.shutdown()` / `sdk.shutdown()` / `tracerProvider.forceFlush()`，确保缓冲区内的 span/metric/log flush 到 collector。SIGTERM 直接退出会丢失最后一批数据。标准模式：`signal.Notify(SIGTERM) → ctx, cancel := context.WithTimeout(...) → sdk.shutdown(ctx)`。
- **违反后果**: 进程退出丢失最后一批 span（含错误现场），故障恰好发生在退出时刻则无 trace（GB/T 22239-2019 8.1.4.6 数据完整性；可观测性数据丢失=审计证据灭失）。
- **验证方法**: 检出 trace provider / NodeSDK / SDK 配置但无 `\.shutdown\(` / `forceFlush` / `gracefulShutdown` → warn
- **对应门禁**: fw_opentelemetry_graceful_shutdown（warn 级）

```verify
id: opentelemetry-r10
cmd: 
expect: always
```

<!--
共 10 条规律（= 门槛 10）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_opentelemetry_service_name | warn | 检出 Resource/NodeSDK 但无 service.name → warn | OPENTELEMETRY_GLOBS |
| fw_opentelemetry_exporter_endpoint | warn | 检出 OTLP exporter 但无 endpoint 配置 → warn | OPENTELEMETRY_GLOBS |
| fw_opentelemetry_sampler | warn | 检出 provider 但无 sampler 配置 → warn | OPENTELEMETRY_GLOBS |
| fw_opentelemetry_deployment_env | warn | 检出 Resource 但无 deployment.environment → warn | OPENTELEMETRY_GLOBS |
| fw_opentelemetry_deprecated_exporter | fail | 命中 Jaeger/Zipkin exporter → fail | OPENTELEMETRY_GLOBS |
| fw_opentelemetry_span_attributes | warn | 检出 startSpan 但无 setAttribute → warn | OPENTELEMETRY_GLOBS |
| fw_opentelemetry_baggage_propagation | warn | 检出 trace 配置但无 Baggage propagator → warn | OPENTELEMETRY_GLOBS |
| fw_opentelemetry_metrics_export | warn | 检出 trace 配置但无 MeterProvider/metrics → warn | OPENTELEMETRY_GLOBS |
| fw_opentelemetry_logs_api | warn | 检出 trace 配置但无 OTel Logs API → warn | OPENTELEMETRY_GLOBS |
| fw_opentelemetry_graceful_shutdown | warn | 检出 provider 但无 shutdown/forceFlush → warn | OPENTELEMETRY_GLOBS |

<!--
门禁 id 命名规范：fw_opentelemetry_<rule>（rule 全小写下划线）。
本表 10 条 id 须在 assets/framework-gates/opentelemetry.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_opentelemetry_<rule>(...) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: opentelemetry  requires_conf: OPENTELEMETRY_GLOBS` 声明。
fixture 验证覆盖：violating/tracing.ts 无 service.name + 无 exporter endpoint + 无 sampler + 用 JaegerExporter
→ deprecated_exporter fail 主触发（1/1 已断言）；compliant/tracing.ts 修正后全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| opentelemetry × gin | gin handler 须 `tracer.startSpan` 取 `c.Request.Context()` 作父 context | 否则 span 与请求生命周期脱钩，trace 断链 |
| opentelemetry × gin | gin middleware 须注册在 OTel trace middleware 之后 | 否则 OTel middleware 产的 span 漏掉上游路由信息 |
| opentelemetry × kafka | kafka producer/consumer 须注入/提取 trace context（traceparent header） | 否则跨消息 trace 断链，端到端时延不可见 |
| opentelemetry × redis | redis 命令须 `tracer.startSpan` 包裹并 `setAttribute("db.statement", cmd)` | 否则 redis 调用在 trace 中不可见，缓存层时延盲区 |

<!--
无强交互的框架组合省略；本表聚焦 OTel 与常用框架的 instrumentation 上下文传播约束。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| spec ≥1.0 | Jaeger exporter 标记废弃，推荐 OTLP | 新项目不应再用 Jaeger exporter；老项目须迁移 |
| @opentelemetry/sdk-node 0.50+ | `NodeSDK` API 取代旧 `NodeTracerProvider` 组合配置 | 旧 `NodeTracerProvider` + `registerInstrumentations` 写法仍兼容但不再演进 |
| opentelemetry-sdk (Python) 1.27+ | Logs API 稳定（`opentelemetry._logs`） | 旧 `_logs` 私有模块须迁 `opentelemetry.api.logs` |
| go.opentelemetry.io/otel v1.27+ | metric API 稳定 | v1.27 前 metric 为 alpha，API 变更频繁 |
| Java io.opentelemetry 1.38+ | auto-instrumentation agent 推荐替代手写 SDK | 手写 SDK 仅在需细控时用；常规项目用 agent 零侵入 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
