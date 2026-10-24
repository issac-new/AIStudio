---
ruleset_id: harmonyos
适用版本: HarmonyOS NEXT（5.0 / API 12+）/ ArkTS + NDK native（C/C++）/ Stage 模型 Ability
最后调研: 2026-08-26（来源：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-V5/ ；https://developer.huawei.com/consumer/cn/doc/harmonyos-references-V5/ ；https://gitee.com/openharmony ）
深度门槛: 10
---

# HarmonyOS 规则集

<!--
本规则集覆盖 HarmonyOS NEXT（ArkTS + NDK native + Stage 模型 Ability 生命周期 + 权限声明）。
调研时点：2026-08-26。规律聚焦 NDK 桥接、ArkTS↔native 内存管理、权限声明、Ability 生命周期等原生开发核心陷阱。

§4 门禁清单的 id 与 assets/framework-gates/harmonyos.sh 的 `# gates:` 头注释严格一致。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 文件 | `*.ets` / `*.ts`（ArkTS）/ `CMakeLists.txt` / `*.cpp` / `*.c` / `*.h`（NDK native）/ `module.json5` / `app.json5` | 高 |
| 依赖 | `ohos` npm scope / `@ohos` 包 / `libace_napi.z.so` / `native_buffer` / `napi` | 高 |
| 配置 | `module.json5` 含 `requestPermissions` / `abilities` / `extensionAbilities` | 高 |
| 代码 | `napi_*` / `NAPI` / `ArkTSToNative` / `Native API` / `@Entry` / `@Component` / `AbilityStage` / `onCreate` | 高 |
| 目录 | `src/main/ets/` / `src/main/cpp/` / `src/main/resources/` / `entry/src/` | 中 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md。
detect 信号命中任一高置信度行即可激活 harmonyos 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- ArkTS 源文件：`grep -rlE '@Entry|@Component|struct .* \{' "${PROJECT_DIR}" --include='*.ets' --include='*.ts'`（计数核验基准：ArkTS 组件文件数）
- NDK native 代码：`grep -rlE 'napi_|NAPI|#include <napi' "${PROJECT_DIR}" --include='*.cpp' --include='*.c' --include='*.h'`（计数核验基准：native 桥接文件数）
- CMake 构建：`find "${PROJECT_DIR}" -name 'CMakeLists.txt' -not -path '*/node_modules/*' 2>/dev/null`（计数核验基准：文件数）
- 权限声明：`grep -rnE 'requestPermissions|"name":.*ohos\.permission' "${PROJECT_DIR}" --include='*.json5'`（计数核验基准：命中行数）
- Ability 生命周期：`grep -rnE 'AbilityStage|onCreate|onForeground|onBackground|onDestroy' "${PROJECT_DIR}" --include='*.ets' --include='*.ts'`（计数核验基准：命中行数）
- native 内存：`grep -rnE 'malloc|free|new |delete |napi_create|std::unique_ptr' "${PROJECT_DIR}" --include='*.cpp' --include='*.c'`

<!--
枚举该框架特有的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：NDK 未用 napi 封装直接调 native 致 ArkTS 崩溃

- **现象**：ArkTS 侧直接 import 裸 `.so` 函数（未走 napi 注册 `napi_define_properties` / `napi_module`），调用即崩溃或类型错乱。
- **根因**：HarmonyOS 的 ArkTS↔native 桥接必须经 NAPI 层（napi_module 注册 + napi_exports）；裸符号不可见。
- **影响**：运行时崩溃（CWE-476 空指针/未定义符号）。
- **证据**：HarmonyOS NDK 指南：所有 native 导出须通过 `napi_module` / `napi_define_properties` 注册到 ArkTS 全局。
- **对应门禁**：`fw_harmonyos_napi_bridge`（fail）。

```verify
id: harmonyos-r1
cmd: 
expect: always
```

### 规律：native 侧 malloc/new 未配对 free/delete 致内存泄漏

- **现象**：NDK C/C++ 中 `malloc`/`new` 分配后未 `free`/`delete`（尤其跨 napi 调用长生命周期对象），native 堆持续增长。
- **根因**：HarmonyOS native 无 GC，须手动释放；ArkTS 的 GC 不回收 native 堆。
- **影响**：native 内存泄漏、OOM（CWE-401 内存泄漏）。
- **证据**：HarmonyOS NDK 内存管理：native 堆独立于 ArkTS，须显式释放；建议 `std::unique_ptr`/RAII。
- **对应门禁**：`fw_harmonyos_native_mem`（fail）。

```verify
id: harmonyos-r2
cmd: 
expect: always
```

### 规律：权限未在 module.json5 声明致运行时授权失败

- **现象**：代码调用受限 API（如定位、相机、文件读写）但未在 `module.json5` 的 `requestPermissions` 声明，运行时抛 `Permission denied`。
- **根因**：HarmonyOS NEXT 强制声明式权限；未声明则系统拒绝授权。
- **影响**：功能不可用（CWE-285 不当授权）。
- **证据**：HarmonyOS 权限指南：所有 `ohos.permission.*` 须在 `module.json5` 声明；动态权限还需 `requestPermissionsFromUser`。
- **对应门禁**：`fw_harmonyos_permission`（fail）。

```verify
id: harmonyos-r3
cmd: 
expect: always
```

### 规律：Ability 生命周期回调未释放资源致泄漏

- **现象**：`onBackground`/`onDestroy` 未释放定时器、订阅、native 句柄，应用切后台后资源仍驻留。
- **根因**：Stage 模型 Ability 有生命周期回调；未在其中释放资源致泄漏。
- **影响**：资源泄漏、后台耗电（CWE-404 不当资源释放）。
- **证据**：HarmonyOS Ability 生命周期文档：`onBackground` 释放非必要资源、`onDestroy` 释放全部。
- **对应门禁**：`fw_harmonyos_ability_lifecycle`（warn）。

```verify
id: harmonyos-r4
cmd: 
expect: always
```

### 规律：ArkTS 使用 any/泛型逃逸类型检查致运行时错误

- **现象**：ArkTS 严格模式禁用 `any`（除 `@ts-ignore`），但强转 `as any` 或 `unknown` 逃逸类型系统，运行时字段缺失报错。
- **根因**：ArkTS 是 TypeScript 严格子集，禁用动态类型；滥用 `any` 绕过编译期检查。
- **影响**：运行时字段访问错误（CWE-704 类型混淆）。
- **证据**：ArkTS 语言规范：禁用 `any`/`Object` 宽松类型；仅允许受限类型。
- **对应门禁**：`fw_harmonyos_arkts_strict`（warn）。

```verify
id: harmonyos-r5
cmd: 
expect: always
```

### 规律：主线程执行重计算致 UI 卡顿

- **现象**：ArkTS 主线程（UI 线程）跑重计算/大循环，掉帧、ANR。
- **根因**：HarmonyOS UI 渲染在主线程；耗时操作须 `TaskPool`/`Worker` 异步。
- **影响**：UI 卡顿（CWE-400 资源不当使用）。
- **证据**：HarmonyOS 并发文档：主线程禁重计算，须 TaskPool/Worker 转移。
- **对应门禁**：`fw_harmonyos_main_thread`（warn）。

```verify
id: harmonyos-r6
cmd: 
expect: always
```

### 规律：native 与 ArkTS 对象生命周期跨界持有致 UAF/泄漏

- **现象**：napi 侧 `napi_create_reference` 持有 ArkTS 对象但 ArkTS 侧已 GC，或 ArkTS 侧持有 native 指针未释放。
- **根因**：双运行时对象生命周期独立；须用 `napi_ref` 显式管理跨界引用。
- **影响**：Use-After-Free / 泄漏（CWE-416/CWE-401）。
- **证据**：HarmonyOS NAPI 引用管理：`napi_create_reference`/`napi_delete_reference` 配对。
- **对应门禁**：`fw_harmonyos_cross_ref`（warn）。

```verify
id: harmonyos-r7
cmd: 
expect: always
```

### 规律：CMakeLists 未链接必要 NDK 库致链接失败

- **现象**：native 用 `libace_napi.z.so`/`libnative_buffer.so` 但 `CMakeLists.txt` 未 `target_link_libraries`，链接期 undefined reference。
- **根因**：HarmonyOS NDK 库须显式链接；缺则符号未解析。
- **影响**：构建失败（CWE-754 不当构建）。
- **证据**：HarmonyOS NDK 构建：须 `target_link_libraries(${target} PUBLIC libace_napi.z.so ...)`。
- **对应门禁**：`fw_harmonyos_cmake_link`（warn）。

```verify
id: harmonyos-r8
cmd: 
expect: always
```

### 规律：UI 组件未用 @State/@Prop 状态管理致不刷新

- **现象**：ArkTS `@Component` 内部直接改普通变量，UI 不重新渲染（无响应式）。
- **根因**：ArkTS 响应式须 `@State`/`@Prop`/`@Link` 装饰器；普通变量变更不触发 UI 更新。
- **影响**：UI 与状态不一致（功能缺陷，非安全）。
- **证据**：ArkTS 状态管理：仅装饰器变量触发 UI 刷新。
- **对应门禁**：`fw_harmonyos_state_decorator`（warn）。

```verify
id: harmonyos-r9
cmd: 
expect: always
```

### 规律：未处理 Worker/TaskPool 异常致后台任务静默失败

- **现象**：`TaskPool.execute`/`Worker.postMessage` 抛异常未捕获，后台任务失败无反馈。
- **根因**：并发任务异常须显式处理；未捕获则任务静默丢失。
- **影响**：功能不可用（CWE-755 不当异常处理）。
- **证据**：HarmonyOS 并发文档：`TaskPool` 任务须 `try/catch` 或 `error` 回调。
- **对应门禁**：`fw_harmonyos_concurrency_err`（warn）。

```verify
id: harmonyos-r10
cmd: 
expect: always
```

<!--
规律数 = 10（≥ 深度门槛 10）。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_harmonyos_napi_bridge | fail | 检出 .so 调用但无 napi 注册（napi_module/napi_define_properties 缺失） → ArkTS 崩溃 CWE-476 fail | HARMONYOS_SRC_GLOBS |
| fw_harmonyos_native_mem | fail | native malloc/new 无配对 free/delete → 内存泄漏 CWE-401 fail | HARMONYOS_SRC_GLOBS |
| fw_harmonyos_permission | fail | 代码用受限 API 但 module.json5 未声明对应权限 → 授权失败 CWE-285 fail | HARMONYOS_SRC_GLOBS |
| fw_harmonyos_ability_lifecycle | warn | Ability 有 onCreate 但 onDestroy 未释放资源 → 资源泄漏 warn | HARMONYOS_SRC_GLOBS |
| fw_harmonyos_arkts_strict | warn | ArkTS 用 any/as any 逃逸类型 → 运行时错误 warn | HARMONYOS_SRC_GLOBS |
| fw_harmonyos_main_thread | warn | 主线程重计算（大循环/同步 IO） → UI 卡顿 warn | HARMONYOS_SRC_GLOBS |
| fw_harmonyos_cross_ref | warn | napi_create_reference 无 napi_delete_reference 配对 → 跨界引用泄漏 warn | HARMONYOS_SRC_GLOBS |
| fw_harmonyos_cmake_link | warn | CMakeLists 用 NDK 库但未 target_link_libraries → 链接失败 warn | HARMONYOS_SRC_GLOBS |
| fw_harmonyos_state_decorator | warn | @Component 内改普通变量无 @State/@Prop → UI 不刷新 warn | HARMONYOS_SRC_GLOBS |
| fw_harmonyos_concurrency_err | warn | TaskPool/Worker 调用无异常捕获 → 后台任务静默失败 warn | HARMONYOS_SRC_GLOBS |

<!--
门禁 id 命名规范：fw_harmonyos_<rule>。
本表 10 条 id 须在 assets/framework-gates/harmonyos.sh 中有同名实现痕迹。
依赖变量 HARMONYOS_SRC_GLOBS 在片段头注释声明。
-->

## §5 跨框架交互规则

- **与 ArkUI 组件库**：ArkTS 组件须用声明式 UI（`Column`/`Row`/`List`），状态管理装饰器（规律9）与 ArkUI 渲染联动。
- **与 NDK 三方库**：native 侧依赖三方 `.so` 须随 HAP 打包（`libs/` 目录）并在 `CMakeLists` 链接（规律8）。
- **与分布式软总线**：跨设备 Ability 调用须额外权限（`ohos.permission.DISTRIBUTED_DATASYNC`）声明（规律3 扩展）。
- **与 HAR/HSP 模块化**：native 模块须封装为 HAR 并导出 NAPI 接口（规律1 桥接规范）。

## §6 版本陷阱速查

| 版本 | 陷阱 |
|------|------|
| NEXT 5.0 / API 12 | ArkTS 严格模式禁用 any；Stage 模型 Ability 生命周期回调强制 |
| API 12+ | NAPI 接口稳定；`napi_create_reference` 须配对 `napi_delete_reference` |
| NEXT 5.x | 权限声明移至 `module.json5` 的 `requestPermissions`；动态权限须 `requestPermissionsFromUser` |
| 最新 | TaskPool 替代旧 Worker 部分场景；旧 `worker` 线程 API 弃用提示 |
