---
ruleset_id: nestjs
适用版本: NestJS 11（11.1.x 现行，2026-07 发布；差异单独标注）
最后调研: 2026-07-17（来源：https://github.com/nestjs/nest/releases ；https://docs.nestjs.com/fundamentals/injection-scopes ；https://docs.nestjs.com/faq/request-lifecycle ；https://docs.nestjs.com/techniques/validation ；https://docs.nestjs.com/modules ）
深度门槛: 10
---

# NestJS 规则集

<!--
本规则集覆盖 NestJS 11.x（现行 11.1.28，2026-07-08 发布；11 起要求 Node >= 20，默认 Express 5 适配器，
platform-fastify 内置 Fastify 5）。调研时点：2026-07-17，现行版本经 https://github.com/nestjs/nest/releases 联网核实。
门禁 id 用 fw_nest_ 前缀（ruleset_id 为 nestjs，函数 _fw_nestjs_check）。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `package.json` dependencies 含 `"@nestjs/core"` / `"@nestjs/common"` / `"@nestjs/platform-express"` / `"@nestjs/platform-fastify"` | 高 |
| 注解 | `@Module(` / `@Injectable(` / `@Controller(` / `@UseGuards(` / `@UseInterceptors(` / `@UsePipes(` | 高 |
| 文件 | `**/*.module.ts` / `**/*.controller.ts` / `**/*.service.ts` / `nest-cli.json` | 高 |
| 配置 | `tsconfig.json` 含 `emitDecoratorMetadata: true` + `experimentalDecorators: true` | 中（需组合依赖信号） |

## §2 特定构件枚举（命令 + 计数核验方式）

- 模块定义：`grep -rlE '@Module\(' "${PROJECT_DIR}" --include='*.ts'`（计数核验基准：@Module 文件数）
- Controller：`grep -rlE '@Controller\(' "${PROJECT_DIR}" --include='*.ts'`（计数核验基准：controller 文件数）
- Provider：`grep -rlE '@Injectable\(' "${PROJECT_DIR}" --include='*.ts'`（计数核验基准：@Injectable 文件数）
- Guard/Interceptor/Pipe：`grep -rnE 'implements (CanActivate|NestInterceptor|PipeTransform)' "${PROJECT_DIR}" --include='*.ts'`（计数核验基准：实现接口行数）
- REQUEST 作用域：`grep -rnE 'Scope\.REQUEST' "${PROJECT_DIR}" --include='*.ts'`（计数核验基准：REQUEST 作用域声明行数）
- DTO：`grep -rlE 'class .*Dto' "${PROJECT_DIR}" --include='*.ts'`（计数核验基准：DTO 文件数）

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：全局 ValidationPipe 必须 whitelist: true + forbidNonWhitelisted: true
- **适用版本**: 全版本（class-validator/class-transformer）
- **规律**: `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))` 是入参校验基线。缺 whitelist 时 DTO 未声明字段直透业务层；配合 ORM `save()` 批量赋值即 CWE-915 批量赋值漏洞（如请求塞 `role: 'admin'`）。transform: true 使 DTO 实例化供类型转换。
- **违反后果**: 批量赋值越权 CWE-915；脏输入直达业务 CWE-20。
- **验证方法**: 无 `ValidationPipe` 或无 `whitelist: true` → fail；whitelist 有但缺 forbidNonWhitelisted → warn。
- **对应门禁**: fw_nest_validation_whitelist(fail)

```verify
id: nestjs-r1
cmd: 
expect: always
```

### 规律：模块间禁止循环依赖，feature module 边界须清晰
- **适用版本**: 全版本
- **规律**: A.module imports B.module 且 B.module imports A.module 构成循环依赖，DI 容器实例化顺序不可预期（Webpack 构建直接报错，SWC/tsc 运行期 undefined）。解法：抽 SharedModule 下沉公共 provider，或最后手段 `forwardRef()`（显式信号须评审）。feature module 按业务域划分，跨域引用经 exports 显式导出。
- **违反后果**: 启动失败或 provider undefined；模块边界腐化。
- **验证方法**: 逐对检查 *.module.ts 互相 import → fail；检出 `forwardRef(` → warn 评审。
- **对应门禁**: fw_nest_circular_deps(fail)

```verify
id: nestjs-r2
cmd: 
expect: always
```

### 规律：REQUEST 作用域 provider 性能损耗大，须慎用
- **适用版本**: 全版本
- **规律**: `Scope.REQUEST` provider 每请求实例化，且**其整条注入链**（注入它的 controller、链上其他 provider）全部级联变为请求作用域，高 QPS 下 GC 压力显著（官方文档明示对性能有可观影响）。默认 DEFAULT 单例；请求态数据优先 AsyncLocalStorage（nestjs-cls）传递。
- **违反后果**: 高并发下延迟上升、内存抖动；链式污染使单例优化失效。
- **验证方法**: `Scope.REQUEST` 命中 → warn 逐处确认必要性。
- **对应门禁**: fw_nest_request_scope(warn)

```verify
id: nestjs-r3
cmd: 
expect: always
```

### 规律：@Global() 模块仅限基础设施，滥用破坏模块边界
- **适用版本**: 全版本
- **规律**: `@Global()` 模块的 provider 全应用可见，绕过 imports 显式声明。仅日志/配置等基础设施允许 Global；业务 provider 全局化导致依赖关系不可追踪、测试须全量装配。
- **违反后果**: 模块边界名存实亡；循环依赖与重复实例化风险上升。
- **验证方法**: `@Global()` 命中 → warn 评审是否基础设施。
- **对应门禁**: fw_nest_global_module(warn)

```verify
id: nestjs-r4
cmd: 
expect: always
```

### 规律：Guard/Interceptor/Pipe/Middleware/Filter 执行顺序固定，编排须按序
- **适用版本**: 全版本
- **规律**: 请求生命周期顺序固定：Middleware → Guards → Interceptors（前）→ Pipes → Handler → Interceptors（后）→ Filters。全局/控制器/路由三级绑定同序执行（全局先于控制器先于路由）。编排假设错误（如 Pipe 依赖 Guard 之后的数据）会导致验证时机错误。
- **违反后果**: 校验/鉴权时机错位 → 未鉴权数据进入校验或业务。
- **验证方法**: 人工检查绑定顺序与依赖假设（对照 request-lifecycle 文档）。
- **对应门禁**: 人工检查

```verify
id: nestjs-r5
cmd: 
expect: always
```

### 规律：统一异常过滤器收敛错误响应格式
- **适用版本**: 全版本
- **规律**: 须全局 `@Catch()` 异常过滤器（`APP_FILTER` 或 `useGlobalFilters`）统一错误响应格式（code/message/traceId），屏蔽内部错误栈；HttpException 之外的未捕获异常一律 500 且不暴露细节。
- **违反后果**: 错误栈/内部细节外露 CWE-209；错误响应格式不一致。
- **验证方法**: 无 `@Catch(`/`useGlobalFilters`/`APP_FILTER` → warn。
- **对应门禁**: fw_nest_exception_filter(warn)

```verify
id: nestjs-r6
cmd: 
expect: always
```

### 规律：响应序列化须 ClassSerializerInterceptor，排除敏感字段
- **适用版本**: 全版本
- **规律**: 实体直接 `@Get()` 返回会把 password/密钥等字段序列化出去。须全局 `ClassSerializerInterceptor` + 实体 `@Exclude()` 注解（或 DTO 映射 + `SerializeInterceptor`）收敛出参。
- **违反后果**: 敏感字段直出 CWE-200。
- **验证方法**: 无 `ClassSerializerInterceptor|SerializeInterceptor|@Exclude` → warn。
- **对应门禁**: fw_nest_serialization(warn)

```verify
id: nestjs-r7
cmd: 
expect: always
```

### 规律：TypeORM synchronize: true 仅限本地开发，生产必须 migration
- **适用版本**: @nestjs/typeorm 全版本
- **规律**: `synchronize: true` 启动时按实体自动 DDL 改库结构，生产环境字段重命名即丢列（数据丢失）。生产必须 `synchronize: false` + migration（`migration:run`）显式变更。
- **违反后果**: 生产数据丢失 / 库结构漂移。
- **验证方法**: `synchronize: true` 命中 → fail。
- **对应门禁**: fw_nest_typeorm_sync(fail)

```verify
id: nestjs-r8
cmd: 
expect: always
```

### 规律：CQRS 模式 Command/Query/Event 须分离且模块边界内聚
- **适用版本**: @nestjs/cqrs 全版本
- **规律**: @nestjs/cqrs 下 Command（写）与 Query（读）分离，Event 承载领域事件；CommandHandler 内禁止跨聚合直查直写其他模块库表，跨模块协作经 EventBus/Saga。模块按聚合边界划分。
- **违反后果**: CQRS 退化为消息总线式面条代码；读写耦合失去扩展性。
- **验证方法**: 人工检查 CommandHandler 是否跨聚合直改数据。
- **对应门禁**: 人工检查

```verify
id: nestjs-r9
cmd: 
expect: always
```

### 规律：缓存拦截器须按端点 TTL 声明，禁止全局一刀切
- **适用版本**: @nestjs/cache-manager 全版本
- **规律**: `CacheInterceptor` 全局注册会对所有 GET 端点缓存，动态数据端点（订单状态等）被错误缓存。须按需 `@UseInterceptors(CacheInterceptor)` + `@CacheTTL()` 声明；用户态数据须自定义 cacheKey 含用户标识。
- **违反后果**: 动态数据陈旧 / 跨用户数据串号。
- **验证方法**: 人工检查全局缓存拦截器与 TTL 声明。
- **对应门禁**: 人工检查

```verify
id: nestjs-r10
cmd: 
expect: always
```

### 规律：多写操作必须事务包裹，TypeORM/MikroORM 事务边界在服务层
- **适用版本**: 全版本
- **规律**: 一个用例多次写库必须 `dataSource.transaction()`（TypeORM）或 `em.transactional()`（MikroORM）包裹，事务边界在服务层用例方法而非 repository 单方法；事务内禁止使用被注入的原 repository（须用事务 EntityManager）。
- **违反后果**: 部分写入成功 → 数据不一致。
- **验证方法**: 人工检查多写用例的事务包裹。
- **对应门禁**: 人工检查

```verify
id: nestjs-r11
cmd: 
expect: always
```

### 规律：API 须 Swagger 自描述文档，且生产环境收敛暴露
- **适用版本**: @nestjs/swagger 全版本
- **规律**: `SwaggerModule.setup('api', app, document)` 生成 OpenAPI 文档，DTO 用 `@ApiProperty()` 注解。生产环境文档端点须鉴权或禁用（`/api` 路径暴露全部接口形状）。
- **违反后果**: 无文档协作成本上升；生产文档端点泄露接口结构 CWE-200。
- **验证方法**: 无 `@nestjs/swagger|SwaggerModule` → warn。
- **对应门禁**: fw_nest_swagger(warn)

```verify
id: nestjs-r12
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。每条均挂门禁 id 或标注人工检查，无游离规律。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE / GB 映射 |
|---------|------|---------|---------|--------------|
| fw_nest_validation_whitelist | fail | 无 ValidationPipe → fail；无 whitelist: true → fail；缺 forbidNonWhitelisted → warn | NEST_SRC_GLOBS | CWE-915 / CWE-20；GB/T 38674-2020 §5.1 |
| fw_nest_circular_deps | fail | *.module.ts 互相 import → fail；forwardRef → warn | NEST_SRC_GLOBS | — |
| fw_nest_request_scope | warn | Scope.REQUEST 命中 → warn 性能评审 | NEST_SRC_GLOBS | — |
| fw_nest_global_module | warn | @Global() 命中 → warn 边界评审 | NEST_SRC_GLOBS | — |
| fw_nest_exception_filter | warn | 无 @Catch/useGlobalFilters/APP_FILTER → warn | NEST_SRC_GLOBS | CWE-209 |
| fw_nest_serialization | warn | 无 ClassSerializerInterceptor/@Exclude → warn | NEST_SRC_GLOBS | CWE-200 |
| fw_nest_typeorm_sync | fail | synchronize: true → fail 生产数据风险 | NEST_SRC_GLOBS | CWE-672 |
| fw_nest_swagger | warn | 无 @nestjs/swagger → warn | NEST_SRC_GLOBS | CWE-200 |

<!--
门禁 id 命名规范：fw_nest_<rule>（ruleset_id=nestjs，门禁前缀按任务约定用 nest）。
本表 8 条 id 均在 assets/framework-gates/nestjs.sh 中有同名实现，片段头注释 # gates: 与本表一致。
fixture 验证覆盖：violating 含 REQUEST 作用域滥用 + ValidationPipe 无 whitelist + users/orders 模块循环依赖
+ TypeOrmModule.forRoot synchronize: true → validation_whitelist/circular_deps/typeorm_sync fail 主触发（3/3 已断言）；compliant 修正后全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| nestjs × typeorm | synchronize 生产必须 false；事务内经事务 EntityManager | 自动 DDL 丢数据；原 repository 不经事务 |
| nestjs × class-validator | ValidationPipe whitelist 依赖 DTO 全部字段有装饰器 | 未装饰字段被剥离，须 DTO 完备 |
| nestjs × fastify | platform-fastify 下中间件 API 不同（无 Express 签名）；multipart 须 @fastify/multipart | Express 中间件直用在 fastify 适配器下不生效 |
| nestjs × express | Express 5 适配器下 async 错误自动捕获；4.x 行为不同 | 升级 NestJS 11 时错误处理行为变化 |

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| NestJS 10（2023-06） | 要求 Node >= 16；cache-manager v5 适配 | 老 Node 项目须升级 |
| NestJS 11（2025-01 GA） | 要求 Node >= 20；默认 Express 5 适配器；platform-fastify 内置 Fastify 5；中间件通配路由语法改 path-to-regexp v8（`forRoutes('*')` 改 `{*splat}`） | Express 4 中间件/路由通配写法迁移；async 错误处理行为随 Express 5 变化 |
| NestJS 11.1（2026-06/07） | multer 升 v2.2.0（安全修复）；Fastify 5.10 | 文件上传组件须跟进 |
| @nestjs/swagger 8.x / 11.x | 与 NestJS 11 配套；OpenAPI 3.1 输出 | 文档生成器版本须对齐 NestJS major |
| @nestjs/typeorm 11 | 配套 NestJS 11；TypeORM 0.3.x | TypeORM 0.2 API 不兼容 |
