---
ruleset_id: angular
适用版本: Angular 19.x / 20.x / 22.x（Signals 稳定 / standalone 默认 / zoneless 稳定；差异单独标注）
最后调研: 2026-07-17（来源：https://angular.dev/about ；https://angular.dev/guide/signals ；https://angular.dev/guide/components/importing ；https://angular.dev/guide/observables ）
深度门槛: 10
---

# Angular 规则集

<!--
本规则集覆盖 Angular 19.x / 20.x / 22.x（截至 2026-07 现行 22.x，Signals 稳定、standalone 默认、zoneless 稳定）。
调研时点：2026-07-17。Angular 17 起 standalone 组件为默认（无 NgModule）；Angular 18 起 zoneless change detection 稳定；Signals（signal/computed/effect）稳定。
NgModule 在 standalone 默认下仍支持但非推荐，新项目须 standalone。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `@angular/core` / `@angular/common` / `@angular/router` / `@angular/forms` / `rxjs`（package.json dependencies） | 高 |
| 文件 | `**/*.component.ts` / `**/*.service.ts` / `**/*.module.ts` / `angular.json` / `**/*.spec.ts` | 高 |
| 装饰器 | `@Component` / `@Injectable` / `@Directive` / `@Pipe` / `@NgModule` / `@Input` / `@Output` | 高 |
| 代码 | `signal(` / `computed(` / `effect(` / `ChangeDetectionStrategy.OnPush` / `takeUntilDestroyed(` / `AsyncPipe` | 高 |
| 配置 | `angular.json` / `tsconfig.json` 的 `strict` 模式 / `bootstrapApplication(` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 angular 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 组件：`grep -rlE '@Component\b' "${PROJECT_DIR}" --include='*.component.ts'`（计数核验基准：@Component 文件数）
- 服务：`grep -rlE '@Injectable\b' "${PROJECT_DIR}" --include='*.service.ts'`（计数核验基准：@Injectable 文件数）
- NgModule：`grep -rlE '@NgModule\b' "${PROJECT_DIR}" --include='*.module.ts'`（计数核验基准：@NgModule 文件数）
- signal 调用：`grep -rnE '\bsignal\(|\bcomputed\(|\beffect\(' "${PROJECT_DIR}" --include='*.ts'`（计数核验基准：signal API 调用行数）
- RxJS subscribe：`grep -rnE '\.subscribe\(' "${PROJECT_DIR}" --include='*.ts'`（计数核验基准：subscribe 调用行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：组件须用 standalone（无 NgModule），新项目禁用 NgModule
- **适用版本**: Angular 17+（standalone 默认）/ 14+（standalone 预览）
- **规律**: Angular 17 起 standalone 组件为默认（`@Component({ standalone: true })` 或省略默认 true），不再需要 NgModule 声明。新项目须 standalone，`bootstrapApplication` 启动。残留 `@NgModule` 仅用于迁移遗留代码。standalone 组件直接在 `imports` 数组声明依赖。
- **违反后果**: 新项目用 NgModule → 增加样板、与官方推荐范式背离、lazy routing 复杂化。
- **验证方法**: 检出 `@NgModule` 文件（`*.module.ts`）且非迁移标注 → warn（新项目应 standalone）。
- **对应门禁**: fw_angular_standalone(warn)

```verify
id: angular-r1
cmd: 
expect: always
```

### 规律：响应式状态须用 signal/computed/effect，禁裸 Subject/BehaviorSubject
- **适用版本**: Angular 16+（Signals 稳定）
- **规律**: Signals（`signal()` / `computed()` / `effect()`）提供细粒度响应式，比 RxJS Subject 性能更优（只通知真正依赖的视图）。状态管理优先 signal + computed 派生；RxJS 用于异步流（HTTP/WebSocket）。`toSignal` / `toObservable` 桥接二者。Zoneless 模式下 signal 是变更检测的来源。
- **违反后果**: 裸 Subject 管理状态 → 变更检测粗粒度、Zoneless 模式下 UI 不更新、性能差。
- **验证方法**: 检出 `Subject\b|BehaviorSubject\b` 但同文件无 `signal(` / `toSignal(` → warn（状态管理应优先 signal）。
- **对应门禁**: fw_angular_signals(warn)

```verify
id: angular-r2
cmd: 
expect: always
```

### 规律：组件须配 ChangeDetectionStrategy.OnPush，禁默认变更检测
- **适用版本**: Angular 全版本（zoneless 下可选）
- **规律**: 默认变更检测（CheckAlways）每次 zone tick 检查全树，性能差。须配 `changeDetection: ChangeDetectionStrategy.OnPush`，只在输入引用变更/事件/dom 事件触发时检查。Zoneless 模式下 OnPush 不是必须（signal 触发），但仍推荐显式标注。
- **违反后果**: 默认变更检测 → 大应用每 tick 全树检查 → 卡顿。
- **验证方法**: 检出 `@Component` 但无 `ChangeDetectionStrategy.OnPush` 且无 zoneless 配置 → warn。
- **对应门禁**: fw_angular_onpush(warn)

```verify
id: angular-r3
cmd: 
expect: always
```

### 规律：RxJS subscribe 须配 takeUntilDestroyed 或 AsyncPipe，禁裸 subscribe 泄漏
- **适用版本**: Angular 全版本（takeUntilDestroyed 16+）
- **规律**: 组件内 `.subscribe()` 订阅 RxJS 流须在组件销毁时取消，否则泄漏。推荐 `takeUntilDestroyed()`（注入 DestroyRef 自动取消）或模板用 `| async` 管道（订阅随视图生命周期管理）。裸 subscribe 无取消 = 内存泄漏 + 销毁后回调报错。
- **违反后果**: 裸 subscribe 泄漏 → 组件销毁后仍订阅 → 内存泄漏 / 回调访问已销毁视图报错。
- **验证方法**: 检出 `.subscribe(` 同行或前 2 行无 `takeUntilDestroyed` / `takeUntil(` → fail。
- **对应门禁**: fw_angular_subscribe_cleanup(fail)

```verify
id: angular-r4
cmd: 
expect: always
```

### 规律：HTTP 请求须通过 HttpClient + 拦截器，禁裸 fetch/XHR
- **适用版本**: Angular 全版本
- **规律**: HTTP 请求须用 `HttpClient`（`@angular/common/http`），通过 `HttpInterceptor` 统一处理鉴权/错误/日志/重试。禁裸 `fetch` / `XMLHttpRequest`（绕过拦截器、无类型、无测试性）。`provideHttpClient(withInterceptors([…]))` 注册函数式拦截器。
- **违反后果**: 裸 fetch → 绕过拦截器鉴权/错误处理、无类型、测试难。
- **验证方法**: 检出 `fetch(` / `new XMLHttpRequest` 在组件/服务中且非拦截器内 → warn。
- **对应门禁**: fw_angular_http_client(warn)

```verify
id: angular-r5
cmd: 
expect: always
```

### 规律：依赖注入须用 inject() 或构造函数注入，禁 new 实例化服务
- **适用版本**: Angular 全版本（inject() 14.2+）
- **规律**: 服务/组件依赖须通过 DI 注入（`inject(Token)` 或构造函数参数），由 DI 树管理生命周期与单例。直接 `new Service()` 绕过 DI，丢失单例/测试替身/配置注入。`inject()` 比 `constructor(private x: X)` 简洁，推荐。
- **违反后果**: new 服务 → 多实例/无测试替身/配置不注入。
- **验证方法**: 检出 `new [A-Z][a-zA-Z]+Service\(` 在组件/其他服务中 → warn（应通过 DI 注入）。
- **对应门禁**: fw_angular_di_inject(warn)

```verify
id: angular-r6
cmd: 
expect: always
```

### 规律：模板表达式须简单，禁复杂逻辑/方法调用链
- **适用版本**: Angular 全版本
- **规律**: 模板 `{{ }}` 与 `[prop]` 绑定表达式须简单（属性访问/管道），禁复杂运算/方法调用链/赋值。复杂逻辑移入组件 `computed` signal 或方法。表达式每次变更检测都求值，复杂表达式性能差且难追踪。
- **违反后果**: 模板复杂表达式 → 变更检测每次求值开销、难调试、与逻辑分离原则相悖。
- **验证方法**: 检出模板内 `{{ … }}` 含 >3 个运算符或方法调用链 → 人工确认。
- **对应门禁**: 人工检查

```verify
id: angular-r7
cmd: 
expect: always
```

### 规律：管道须优先 pure pipe，impure pipe 须谨慎
- **适用版本**: Angular 全版本
- **规律**: pure pipe（默认）仅在输入引用变更时求值，性能优。impure pipe（`pure: false`）每次变更检测都求值，性能差，仅在过滤/排序等需对同一引用内部变更响应时用。优先 pure pipe + signal/computed 派生数据。
- **违反后果**: impure pipe 滥用 → 每次变更检测求值 → 卡顿。
- **验证方法**: 检出 `pure:[[:space:]]*false` 或 `pure: false` 的 @Pipe → warn。
- **对应门禁**: fw_angular_impure_pipe(warn)

```verify
id: angular-r8
cmd: 
expect: always
```

### 规律：组件交互须用 signal inputs（input()/output()）或 @Input/@Output 装饰器
- **适用版本**: Angular 17+（signal inputs 稳定）
- **规律**: 组件输入/输出推荐 signal API（`input()` / `output()` / `input.required()` / `model()`），可信号化派生。遗留 `@Input()` / `@Output()` 装饰器仍支持但非首选。`input.required()` 编译期强制必填。
- **违反后果**: `@Input` + `ngOnChanges` 手动同步 → 范式旧、无信号化派生、生命周期复杂。
- **验证方法**: 检出 `@Input\(\)` / `@Output\(\)` 装饰器 → warn（推荐迁移 signal inputs）。
- **对应门禁**: fw_angular_signal_inputs(warn)

```verify
id: angular-r9
cmd: 
expect: always
```

### 规律：路由须懒加载（loadComponent/loadChildren），禁全量 eager
- **适用版本**: Angular 14+（lazy standalone）/ 全版本（loadChildren）
- **规律**: 路由须懒加载：standalone 用 `loadComponent` / `loadChildren`，模块用 `loadChildren: () => import(…).then(m => m.XModule)`。eager 全量加载首屏 chunk 过大。懒加载配合预加载策略（`preloadingStrategy: PreloadAllModules`）平衡。
- **违反后果**: eager 路由 → 首屏 bundle 过大 → 加载慢。
- **验证方法**: 检出路由配置 `component:` 直接引用组件（非 `loadComponent`）→ warn。
- **对应门禁**: fw_angular_lazy_route(warn)

```verify
id: angular-r10
cmd: 
expect: always
```

### 规律：路由守卫须用函数式（CanMatch/CanActivate），禁遗留 @Injectable Guard 类
- **适用版本**: Angular 15+（函数式守卫）
- **规律**: 路由守卫推荐函数式（`canMatch: [() => inject(Auth).isLoggedIn()]`），比遗留 `@Injectable({ providedIn: 'root' }) class XGuard implements CanActivate` 简洁、tree-shakable。`CanMatch`（15+）替代 `CanLoad`。
- **违反后果**: 遗留 Guard 类 → 样板多、不可 tree-shake、与函数式范式不一致。
- **验证方法**: 检出 `implements CanActivate|implements CanMatch|implements CanLoad` 的类 → warn（推荐函数式）。
- **对应门禁**: fw_angular_functional_guard(warn)

```verify
id: angular-r11
cmd: 
expect: always
```

### 规律：表单须用响应式表单（ReactiveForms），禁模板驱动表单（复杂场景）
- **适用版本**: Angular 全版本
- **规律**: 复杂表单（动态字段/嵌套/跨字段校验）须用响应式表单（`FormBuilder` / `FormGroup` / `FormControl`），类型安全用 `FormBuilder.nonNullable` / Typed Forms。模板驱动表单（`ngModel` + `#f="ngForm"`）仅适合简单表单，复杂场景难测试/难追踪。
- **违反后果**: 复杂表单用模板驱动 → 难测试/难动态/状态难追踪。
- **验证方法**: 检出 `[(ngModel)]` 在含 >3 字段的表单 → 人工确认（语义相关）。
- **对应门禁**: 人工检查

```verify
id: angular-r12
cmd: 
expect: always
```

### 规律：zoneless 模式须显式 provideZonelessChangeDetection，禁残留 zone.js
- **适用版本**: Angular 18+（zoneless 稳定）
- **规律**: zoneless 模式用 `provideZonelessChangeDetection()` 启用，移除 `polyfills` 中的 `zone.js`。zoneless 下变更检测由 signal/event/async pipe 触发，性能更优。残留 zone.js + zoneless 配置冲突。须确保所有异步用 signal/AsyncPipe/markForCheck 触发检测。
- **违反后果**: zoneless + 残留 zone.js → 配置冲突；zoneless 下裸 setTimeout 内改状态不触发检测 → UI 不更新。
- **验证方法**: 检出 `provideZonelessChangeDetection` 但 angular.json polyfills 仍含 zone.js → warn。
- **对应门禁**: fw_angular_zoneless(warn)

```verify
id: angular-r13
cmd: 
expect: always
```

<!--
共 13 条规律（≥10 门槛）。11 条挂门禁（fw_angular_*），2 条标"人工检查"（语义相关规律，机械 grep 易误报）。
每条规律均挂门禁 id 或"人工检查"，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / CWE·GB 元数据）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|------------|
| fw_angular_standalone | warn | 检出 @NgModule 文件（非迁移标注）→ warn 新项目应 standalone | ANGULAR_SRC_GLOBS | — |
| fw_angular_signals | warn | 检出 Subject/BehaviorSubject 但同文件无 signal/toSignal → warn 状态管理应优先 signal | ANGULAR_SRC_GLOBS | — |
| fw_angular_onpush | warn | @Component 未配 OnPush 且无 zoneless 配置 → warn | ANGULAR_SRC_GLOBS | — |
| fw_angular_subscribe_cleanup | fail | .subscribe 调用前 2 行无 takeUntilDestroyed/takeUntil → fail 泄漏风险 | ANGULAR_SRC_GLOBS | CWE-772（订阅未释放致内存泄漏/回调悬置） |
| fw_angular_http_client | warn | 组件/服务中检出 fetch/XMLHttpRequest（非拦截器内）→ warn | ANGULAR_SRC_GLOBS | — |
| fw_angular_di_inject | warn | 检出 new XxxService() 绕过 DI → warn | ANGULAR_SRC_GLOBS | — |
| fw_angular_impure_pipe | warn | @Pipe 配 pure: false → warn（每次变更检测求值） | ANGULAR_SRC_GLOBS | — |
| fw_angular_signal_inputs | warn | 检出 @Input()/@Output() 装饰器 → warn 推荐迁移 signal inputs | ANGULAR_SRC_GLOBS | — |
| fw_angular_lazy_route | warn | 路由配置 component: 直接引用组件（非 loadComponent）→ warn | ANGULAR_SRC_GLOBS | — |
| fw_angular_functional_guard | warn | 检出 implements CanActivate/CanMatch/CanLoad 的类 → warn 推荐函数式 | ANGULAR_SRC_GLOBS | — |
| fw_angular_zoneless | warn | provideZonelessChangeDetection 但 polyfills 仍含 zone.js → warn 配置冲突 | ANGULAR_SRC_GLOBS | — |

<!--
门禁 id 命名规范：fw_angular_<rule>（rule 全小写下划线）。
本表 11 条 id 须在 assets/framework-gates/angular.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_angular_<rule>(warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: angular  requires_conf: ANGULAR_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 subscribe 无 takeUntilDestroyed（fw_angular_subscribe_cleanup fail 主触发，1/1）+ @NgModule 非 standalone（warn）+ 模板复杂表达式；compliant 全 pass。expected-fail-ids 已登记 1/1 fail id（2026-07-20 P1）。CWE/GB 映射列（同批补录）：仅对具直接安全/可靠性语义的行引证，其余标 —。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| angular × rxjs | subscribe 须 takeUntilDestroyed 或 AsyncPipe | 否则订阅泄漏 |
| angular × ngrx | selector 须用 createSelector memo，禁在 mapStateToProps 内新建对象 | 新建对象导致全树 re-render |
| angular × typescript | 须启用 strict 模式（tsconfig.json strict: true） | 类型严格减少运行期错误 |
| angular × ng-zorro / material | 组件须按需导入（standalone imports 数组），禁全量 module | 否则 bundle 过大 |

<!--
无强交互的框架组合省略；本表聚焦 angular 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Angular 14 | standalone 组件预览 | NgModule 非必须，新组件可 standalone |
| Angular 15 | 函数式守卫/拦截器稳定 / directive composition | CanMatch 替代 CanLoad；HttpInterceptor 函数式 |
| Angular 16 | Signals 稳定 / takeUntilDestroyed | signal/computed/effect 可用；subscribe 清理简化 |
| Angular 17 | standalone 默认 / 新控制流 @if/@for/@switch | 新项目无 NgModule；模板控制流替代 *ngIf/*ngFor |
| Angular 18 | zoneless 稳定 / signal inputs 稳定 | provideZonelessChangeDetection 可用；input()/output() 推荐 |
| Angular 19-22 | signal forms / hydration 改进 / 待验证细节（22.x） | 待验证：22.x 具体行为差异须人工核实 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
22.x 具体差异待验证。
-->
