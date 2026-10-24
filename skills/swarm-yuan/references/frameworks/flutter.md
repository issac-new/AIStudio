---
ruleset_id: flutter
适用版本: Flutter 3.x（Dart 3；3.22+ wasm/impeller 差异单独标注）
最后调研: 2026-07-23（来源：Flutter/Dart 官方文档 / webview_flutter·shared_preferences·flutter_secure_storage README / flutter_lints 官方仓库 / OWASP MASVS）
深度门槛: 10
---

# Flutter 规则集

<!--
移动端跨平台（Dart）规则集（WP-V 批次新增，与 react-native 同批填补「移动端框架」缺口）。
判定哲学与 react-native 一致：grep/awk 静态结构匹配，宁 warn 勿误判 fail；
「须配」类规律（ProGuard/flutter_lints）仅在对应配置文件进入扫描范围时判定，
文件缺失时不报——门禁为静态辅助，不替代 flutter analyze / 真机构建审查。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 文件 | `pubspec.yaml` 存在（含 `flutter:` sdk 段） | 高（file 类型信号；detect-frameworks.sh 不支持 file 探测，须手动 ACTIVE_FRAMEWORKS） |
| 依赖 | pubspec.yaml dependencies 含 `flutter` / `flutter_test` | 高 |
| 文件 | `lib/main.dart` 入口 + `analysis_options.yaml` | 中（目录结构组合） |
| 配置 | `import 'package:flutter/material.dart'` / `package:flutter/cupertino.dart` | 高（框架专属导入） |
| 文件 | `android/app/build.gradle` + `ios/Podfile` 双端工程并存 | 低（仅作辅助） |

## §2 特定构件枚举（命令 + 计数核验方式）

- Widget 类：`grep -rhE 'class[[:space:]]+[A-Z][A-Za-z0-9_]*[[:space:]]+extends[[:space:]]+(StatelessWidget|StatefulWidget)' --include='*.dart' . | wc -l`（计数核验基准：Widget 类声明行数）
- build 方法：`grep -rhE 'Widget[[:space:]]+build\(' --include='*.dart' . | wc -l`（计数核验基准：build 方法数）
- setState 调用：`grep -rhE 'setState\(' --include='*.dart' . | wc -l`（计数核验基准：setState 调用行数）
- 列表构件：`grep -rhE 'ListView(\.builder|\.separated|\.custom)?\(' --include='*.dart' . | wc -l`（计数核验基准：ListView 构造行数）
- 存储调用：`grep -rhE '\.set(String|Int|Bool|Double|StringList)\(' --include='*.dart' . | wc -l`（计数核验基准：shared_preferences 写入行数）

## §3 领域规律（≥ 深度门槛 条，每条五要素 + 证据）

### 规律：WebView 加载远程 URL 必须配导航限制
- **适用版本**: webview_flutter 3.x/4.x（4.x 起 `WebView` 拆分 `WebViewController`+`WebViewWidget`，判定口径同构）
- **规律**: `WebView`/`WebViewWidget`/`InAppWebView` 加载 `https?://` 远程内容时，同文件必须有 `navigationDelegate`/`shouldOverrideUrlLoading`/`onNavigationRequest` 等导航拦截与源校验。
- **违反后果**: 任意源页面（含钓鱼/恶意 JS bridge 目标）均可载入，配合 `addJavaScriptHandler` 即远程代码执行面（CWE-79/CWE-749；OWASP MASVS-PLATFORM WebView 族）。
- **验证方法**: 剥注释后同文件命中 `WebView(|WebViewWidget(|InAppWebView(` 与 `https?://` 且无 `navigationDelegate|shouldOverrideUrlLoading|onNavigationRequest` → 违规
- **对应门禁**: fw_flutter_webview_unrestricted（fail 级）

```verify
id: flutter-r1
cmd: 
expect: always
```

- **证据**: webview_flutter 官方文档 NavigationDelegate "control or block navigation requests"；OWASP MASVS WebView 源限制口径；flutter_inappwebview shouldOverrideUrlLoading 文档

### 规律：shared_preferences 禁止存敏感数据
- **适用版本**: shared_preferences 2.x 全版本
- **规律**: `SharedPreferences` 的 `setString/setInt/setBool/...` 的 key 不得含 `token|password|passwd|secret|credential|api_key|session` 等敏感语义。凭证一律走 `flutter_secure_storage`（Keychain/Keystore）。
- **违反后果**: shared_preferences 在 iOS 为明文 plist、Android 为明文 XML（未加密），root/备份导出即凭证泄露（CWE-312；GB/T 22239-2019 8.1.4.6 数据保密性）。
- **验证方法**: `grep -inE '\.set(String|Int|Bool|Double|StringList)\(.{0,60}(token|password|passwd|secret|credential|api_?key|session)' --include='*.dart' .`（应为空）
- **对应门禁**: fw_flutter_sharedprefs_secret（fail 级）

```verify
id: flutter-r2
cmd: grep -inE '\.set(String|Int|Bool|Double|StringList)\(.{0,60}(token|password|passwd|secret|credential|api_?key|session)' --include='*.dart' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: shared_preferences README "store simple data… not for critical data"；flutter_secure_storage README 定位"secure storage"；OWASP MASVS-STORAGE-1 敏感数据须系统级安全存储

### 规律：生产代码禁止 print()
- **适用版本**: 全版本
- **规律**: 业务源码不得残留裸 `print(`；调试输出用 `debugPrint`（release 可经 `debugPrint = (message, {wrapWidth}) {}` 置空）或 `log`/`dart:developer` + `kReleaseMode` 守卫。
- **违反后果**: release 包日志经 logcat/Xcode Devices 任意可读，内部状态与敏感变量外泄（CWE-209/CWE-532 日志敏感信息）。
- **验证方法**: `grep -rnE '(^|[^a-zA-Z_.])print\(' --include='*.dart' .`（应为空；debugPrint 大写 P 天然豁免）
- **对应门禁**: fw_flutter_print（warn 级）

```verify
id: flutter-r3
cmd: grep -rnE '(^|[^a-zA-Z_.])print\(' --include='*.dart' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: Flutter 官方文档 debugPrint "throttles output… avoid print in production"；Dart linter `avoid_print` 规则（flutter_lints 内置）

### 规律：必须使用 const 构造函数（性能）
- **适用版本**: Dart 2.17+（增强枚举/超类初始化器同构）
- **规律**: 含 `Widget build` 的文件应有 `const` 构造痕迹；静态子树（Text/Icon/Padding/SizedBox 等固定参数）一律 `const` 前缀。lint `prefer_const_constructors` 为 flutter_lints 内置规则。
- **违反后果**: 非 const Widget 每次 build 重建实例并失效 Element 比对，无谓的 Widget 树 diff 与 GC 压力，滚动/动画掉帧（对应 Flutter 性能最佳实践）。
- **验证方法**: 文件命中 `Widget[[:space:]]+build` 但全文件无 `const[[:space:]]` → 嫌疑（启发式，warn 级人工复核）
- **对应门禁**: fw_flutter_const_ctor（warn 级）

```verify
id: flutter-r4
cmd: 
expect: always
```

- **证据**: Flutter 官方《Performance best practices》"Use const constructors on widgets"；flutter_lints 含 prefer_const_constructors/declarations

### 规律：Android release 必须启用 ProGuard/R8 混淆
- **适用版本**: 全版本（Flutter AOT 产物已编译为机器码，但 Java/Kotlin 壳层与插件代码仍可逆向）
- **规律**: `android/app/build.gradle` 含 `buildTypes`/`release` 配置时必须 `minifyEnabled true`（建议 `shrinkResources true` + proguard-rules.pro 对插件 keep 规则登记）。
- **违反后果**: Java/Kotlin 桥接层与三方插件类名明文，jadx 还原平台通道与密钥常量（OWASP MASVS-RESILIENCE-2 混淆要求）。
- **验证方法**: 含 `buildTypes|release` 的 .gradle 文件须命中 `minifyEnabled[[:space:]]+true`
- **对应门禁**: fw_flutter_proguard（warn 级）

```verify
id: flutter-r5
cmd: 
expect: always
```

- **证据**: Flutter 官方《Build and release an Android app》"enable obfuscation / R8"；Android 开发者文档 R8 口径

### 规律：必须使用 SafeArea 处理刘海屏
- **适用版本**: 全版本
- **规律**: 页面级 Scaffold body 须以 `SafeArea` 包裹（或 `MediaQuery` padding 显式处理）；裸 Column/Stack 顶格布局在刘海/灵动岛/底部手势区被遮挡。
- **违反后果**: 状态栏/挖孔/Home 指示区遮挡交互元素，iOS HIG 驳回风险；Android 15 强制 edge-to-edge 后同病。
- **验证方法**: 扫描全部 .dart 文件，无任一命中 `SafeArea` → 违规（工程级启发式）
- **对应门禁**: fw_flutter_safe_area（warn 级）

```verify
id: flutter-r6
cmd: 
expect: always
```

- **证据**: Flutter 官方 SafeArea API 文档"avoid operating system intrusions"；Android 15 edge-to-edge 强制公告

### 规律：长列表必须用 ListView.builder 懒加载
- **适用版本**: 全版本
- **规律**: 超过一屏的同质数据列表必须用 `ListView.builder`/`ListView.separated`（按需构建）；`ListView(children: [...])` 一次性构建全部子项仅限确定短静态列表。
- **违反后果**: 千行列表一次性实例化全部 Widget+Element，首帧卡顿、内存暴涨（对应 GB/T 25000.51-2016 性能效率要求）。
- **验证方法**: 文件含 `ListView(` 且无 `ListView.builder|ListView.separated|ListView.custom` → 嫌疑
- **对应门禁**: fw_flutter_listview_builder（warn 级）

```verify
id: flutter-r7
cmd: 
expect: always
```

- **证据**: Flutter 官方 ListView.builder 文档"created on demand… for large or infinite lists"； cookbook《Use lists》builder 为长列表标准形态

### 规律：状态管理禁止裸 setState 全量重建蔓延
- **适用版本**: 全版本
- **规律**: 单文件 `setState(` 调用 ≥3 处即状态管理失序信号——须引入 provider/riverpod/bloc/getx 等结构化状态管理，或按职责拆分 StatefulWidget 收敛重建范围。
- **违反后果**: setState 触发整个子树重建，状态点散落各处致重建范围失控与状态一致性缺陷（对应 Flutter 状态管理官方指引）。
- **验证方法**: `grep -cE 'setState\(' <file>` ≥3 → 嫌疑（阈值启发式，warn 级人工复核）
- **对应门禁**: fw_flutter_setstate_sprawl（warn 级）

```verify
id: flutter-r8
cmd: grep -cE 'setState\(' <file> "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: Flutter 官方《State management》"ephemeral state vs app state"指引；provider/riverpod 官方定位"state management beyond setState"

### 规律：复杂滚动布局必须用 Sliver（CustomScrollView）
- **适用版本**: 全版本
- **规律**: 嵌套滚动/折叠头/混合列表网格场景须用 `CustomScrollView` + `SliverAppBar`/`SliverList`/`SliverGrid`；`SingleChildScrollView` 内嵌 `ListView`/`GridView` 或 `shrinkWrap: true` 是公认反模式。
- **违反后果**: shrinkWrap 强制列表一次性测量+构建全部子项（性能同 ListView(children)），嵌套滚动手势冲突与视口错乱（对应 Flutter 滚动性能口径）。
- **验证方法**: `grep -rnE 'shrinkWrap[[:space:]]*:[[:space:]]*true' --include='*.dart' .`，或同文件 `SingleChildScrollView` 与 `ListView|GridView` 共现 → 嫌疑
- **对应门禁**: fw_flutter_sliver（warn 级）

```verify
id: flutter-r9
cmd: grep -rnE 'shrinkWrap[[:space:]]*:[[:space:]]*true' --include='*.dart' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: Flutter shrinkWrap 文档注释"expensive… avoid when possible"；官方 Slivers 介绍"custom scroll effects with CustomScrollView"

### 规律：必须接入 flutter_lints 静态分析
- **适用版本**: flutter_lints 2.x/3.x（Flutter SDK 推荐官方 lint 集）
- **规律**: `pubspec.yaml` dev_dependencies 须含 `flutter_lints` 且 `analysis_options.yaml` 须 `include: package:flutter_lints/flutter.yaml`（或同等级自定义集）；团队禁裸 `dart analyze` 零规则基线。
- **违反后果**: avoid_print/prefer_const_constructors 等本规则集依赖的静态防线缺失，问题只能运行时暴露（对应 Dart 官方 linter 指引）。
- **验证方法**: 扫描内 pubspec.yaml 或 analysis_options.yaml 无 `flutter_lints` → 提醒
- **对应门禁**: fw_flutter_lints（warn 级）

```verify
id: flutter-r10
cmd: 
expect: always
```

- **证据**: Flutter 官方《Customize static analysis》推荐 flutter_lints；flutter create 模板默认生成 flutter_lints 配置

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_flutter_webview_unrestricted | fail | 剥注释后同文件命中 WebView/WebViewWidget/InAppWebView + `https?://` 且无导航拦截 API → fail | FLUTTER_GLOBS |
| fw_flutter_sharedprefs_secret | fail | `setString/setInt/...(` 调用点起 60 字符内含敏感 key 语义（大小写不敏感）→ fail | FLUTTER_GLOBS |
| fw_flutter_print | warn | 裸 `print(` 命中行（debugPrint 豁免）→ warn | FLUTTER_GLOBS |
| fw_flutter_const_ctor | warn | 文件含 `Widget build` 但无 `const` 关键字 → warn（启发式） | FLUTTER_GLOBS |
| fw_flutter_proguard | warn | 含 `buildTypes\|release` 的 .gradle 文件无 `minifyEnabled true` → warn | FLUTTER_GLOBS |
| fw_flutter_safe_area | warn | 有 .dart 文件但全工程无 SafeArea 痕迹 → warn | FLUTTER_GLOBS |
| fw_flutter_listview_builder | warn | 文件含 `ListView(` 且无 builder/separated/custom → warn | FLUTTER_GLOBS |
| fw_flutter_setstate_sprawl | warn | 单文件 setState 调用 ≥3 → warn | FLUTTER_GLOBS |
| fw_flutter_sliver | warn | `shrinkWrap: true` 或 SingleChildScrollView 内嵌 ListView/GridView → warn | FLUTTER_GLOBS |
| fw_flutter_lints | warn | 扫描内 pubspec.yaml/analysis_options.yaml 无 flutter_lints → warn | FLUTTER_GLOBS |

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| flutter × react-native | 同为移动端跨平台：WebView/敏感存储/日志/混淆/SafeArea 五大规律语义一一对应，门禁实现各按语言解析 | 移动端风险面同构，两规则集互为镜像，便于跨栈审计口径对齐 |
| flutter × 通用 check_sensitive | 通用门禁报"存在口令模式"，本规则集报"shared_preferences 语义上存敏感 key" | 同 terraform × check_sensitive 分工：通用报存在、框架报语义，避免 `FlutterSecureStorage.write` 被双报 |
| flutter × dart 纯后端（shelf/serverpod 等） | 本规则集仅当 pubspec.yaml 含 flutter SDK 依赖时激活；纯 Dart 后端不适用 SafeArea/const Widget 规律 | 激活信号以 flutter 框架依赖为准，防纯 Dart 工程误报 |

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Flutter 2.x → 3.x | Dart 2.17 增强枚举/超类初始化器；null safety 全面落地 | const 构造判定不受影响（关键字稳定） |
| webview_flutter 4.x | `WebView` 拆分 `WebViewController` + `WebViewWidget`，导航限制迁 `setNavigationDelegate` | 门禁按三类构造名并集 + 导航拦截 API 判定，两版同构适用 |
| Flutter 3.22+ | Impeller 默认渲染器（Android 跟进中）、wasm 编译预览 | 性能规律（const/builder/Sliver）与渲染器无关，口径不变 |
| Android 15（API 35） | edge-to-edge 强制，targetSdk 35 起无 opt-out | fw_flutter_safe_area 权重上升：不处理安全区即布局错位 |
| flutter_lints 3.x | 规则集随 Dart 3 扩充（如 no_wildcard_variable_uses） | 门禁只判 flutter_lints 接入与否，不绑规则集版本 |
