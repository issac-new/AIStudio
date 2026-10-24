---
ruleset_id: react-native
适用版本: React Native 0.72+（0.73 起 Hermes 为默认引擎；0.74+ 新架构 Bridgeless 差异单独标注）
最后调研: 2026-07-23（来源：React Native 官方文档 / react-native-webview·@react-native-async-storage README / OWASP MASVS / Hermes·Flipper 官方文档）
深度门槛: 10
---

# React Native 规则集

<!--
移动端跨平台（JS/TS）规则集（WP-V 批次新增，填补「移动端框架」缺口）。
判定哲学与 terraform/opentelemetry 一致：grep/awk 静态结构匹配，宁 warn 勿误判 fail；
「须配」类规律（ProGuard/Hermes/Flipper）仅在对应配置文件进入扫描范围时判定，
文件缺失时不报——门禁为静态辅助，不替代真机构建审查。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | package.json dependencies 含 `react-native` | 高（核心包独立可定） |
| 依赖 | `react-native-webview` / `@react-native-async-storage/async-storage` / `react-native-safe-area-context` | 中（生态组合信号） |
| 文件 | `metro.config.js` / `react-native.config.js` | 高（RN 专属构建配置） |
| 文件 | `android/app/build.gradle` + `ios/Podfile` 双端工程并存 | 中（需排除原生工程） |
| 配置 | `app.json` 含 `"expo"` 或 RN 工程名/入口 | 低（仅作辅助） |

## §2 特定构件枚举（命令 + 计数核验方式）

- 组件文件：`find . -name '*.tsx' -o -name '*.jsx' | grep -v node_modules | wc -l`（计数核验基准：JSX 组件文件数）
- WebView 使用：`grep -rlE 'react-native-webview' --include='*.tsx' --include='*.jsx' --include='*.ts' --include='*.js' . | wc -l`（计数核验基准：引入 WebView 的文件数）
- AsyncStorage 调用：`grep -rhE 'AsyncStorage\.(setItem|getItem|mergeItem)' --include='*.tsx' --include='*.ts' --include='*.jsx' --include='*.js' . | wc -l`（计数核验基准：存储 API 调用行数）
- 列表构件：`grep -rhE '<(FlatList|SectionList|ScrollView|VirtualizedList)' --include='*.tsx' --include='*.jsx' . | wc -l`（计数核验基准：列表类 JSX 出现行数）

## §3 领域规律（≥ 深度门槛 条，每条五要素 + 证据）

### 规律：WebView 加载远程 URL 必须配置 originWhitelist
- **适用版本**: react-native-webview 全版本（≥11 默认 `originWhitelist={['*']}` 历史陷阱单独标注）
- **规律**: `<WebView source={{ uri: 'https://...' }}>` 加载远程内容时，同文件必须显式 `originWhitelist` 收窄可信源；仅加载本地 `require`/`file://` 资源属合规例外。
- **违反后果**: 任意源页面（含钓鱼/恶意 JS bridge 目标）均可载入 WebView，配合 `injectedJavaScript` 即远程代码执行面（CWE-79 跨站脚本/CWE-749 暴露危险方法；OWASP MASVS-PLATFORM WebView 族）。
- **验证方法**: 剥注释后同文件同时命中 `<WebView` 与 `https?://` 且无 `originWhitelist` → 违规
- **对应门禁**: fw_react_native_webview_no_whitelist（fail 级）

```verify
id: react-native-r1
cmd: 
expect: always
```

- **证据**: react-native-webview 官方文档 `originWhitelist` "List of origin strings to allow being navigated to"；OWASP MASVS "WebViews 须限制可加载的源"；Expo 安全基线同口径

### 规律：AsyncStorage 禁止存敏感数据（token/密码/密钥）
- **适用版本**: 全版本（@react-native-async-storage/async-storage 2.x 同构）
- **规律**: `AsyncStorage.setItem` 的 key 不得含 `token|password|passwd|secret|credential|api_key|session` 等敏感语义。凭证一律走 `react-native-keychain` / `expo-secure-store`（Keychain/Keystore 硬件级加密）。
- **违反后果**: AsyncStorage 在 iOS 为明文 plist、Android 为明文 SQLite（未加密），越狱/root 或备份导出即凭证泄露（CWE-312 明文存储敏感信息；GB/T 22239-2019 8.1.4.6 数据保密性）。
- **验证方法**: `grep -inE 'AsyncStorage\.setItem\(.{0,60}(token|password|passwd|secret|credential|api_?key|session)' --include='*.tsx' --include='*.ts' --include='*.jsx' --include='*.js' .`（应为空）
- **对应门禁**: fw_react_native_asyncstorage_secret（fail 级）

```verify
id: react-native-r2
cmd: grep -inE 'AsyncStorage\.setItem\(.{0,60}(token|password|passwd|secret|credential|api_?key|session)' --include='*.tsx' --include='*.ts' --include='*.jsx' --include='*.js' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: async-storage README "unencrypted, asynchronous, persistent, key-value storage"；react-native-keychain README 定位"secure storage for credentials"；OWASP MASVS-STORAGE-1 敏感数据须系统级安全存储

### 规律：生产代码禁止 console.log（Hermes 字节码可见）
- **适用版本**: 全版本
- **规律**: 业务源码不得残留 `console.log/info/debug`；调试输出走 `__DEV__` 守卫或 babel-plugin-transform-remove-console 在 release 剥离。
- **违反后果**: release 包日志经 logcat/Xcode Devices 任意可读，Hermes 字节码反编译后日志点连同上下文暴露内部状态与敏感变量（CWE-209 错误信息泄露/CWE-532 日志敏感信息）。
- **验证方法**: `grep -rnE 'console\.(log|info|debug)\(' --include='*.tsx' --include='*.ts' --include='*.jsx' --include='*.js' .`（应为空）
- **对应门禁**: fw_react_native_console_log（warn 级）

```verify
id: react-native-r3
cmd: grep -rnE 'console\.(log|info|debug)\(' --include='*.tsx' --include='*.ts' --include='*.jsx' --include='*.js' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: React Native 官方性能文档"console statements cause bottleneck in JS thread, remove in release"；babel-plugin-transform-remove-console 为标准剥离手段；Hermes 文档字节码可反编译口径

### 规律：必须使用 Hermes 引擎（禁止显式回退 JSC）
- **适用版本**: 0.70+ Hermes 默认；0.73 起 iOS 亦默认 Hermes
- **规律**: `android/app/build.gradle` 的 `enableHermes`、iOS Podfile 的 `:hermes_enabled`、package.json 引擎配置不得显式置 `false` 回退 JavaScriptCore。
- **违反后果**: JSC 无字节码预编译，启动慢且源码 bundle 明文可提取；同时失去 Hermes 字节码混淆层，逆向面扩大（对应 OWASP MASVS-RESILIENCE 逆向防护要求）。
- **验证方法**: `grep -rinE '(hermesEnabled|enableHermes|hermes_enabled)[[:space:]]*[:=][[:space:]]*false' android/ ios/ package.json`（应为空）
- **对应门禁**: fw_react_native_hermes_disabled（fail 级）

```verify
id: react-native-r4
cmd: grep -rinE '(hermesEnabled|enableHermes|hermes_enabled)[[:space:]]*[:=][[:space:]]*false' --include='package.json' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: React Native 0.70 发布日志"Hermes becomes the default engine"；Hermes 官方文档"bytecode precompilation, optimized for mobile"

### 规律：Android release 必须启用 ProGuard/R8 混淆
- **适用版本**: 全版本（AGP 7+ 默认 R8）
- **规律**: `android/app/build.gradle` 含 `buildTypes`/`release` 配置时必须 `minifyEnabled true`（建议 `shrinkResources true` + proguard-rules.pro 维护 keep 规则）。
- **违反后果**: release APK 类名/方法名明文，jadx 一键还原业务逻辑，密钥常量与接口路径直读（CWE-656；OWASP MASVS-RESILIENCE-2 混淆要求）。
- **验证方法**: 含 `buildTypes|release` 的 .gradle 文件须命中 `minifyEnabled[[:space:]]+true`
- **对应门禁**: fw_react_native_proguard（warn 级）

```verify
id: react-native-r5
cmd: 
expect: always
```

- **证据**: RN 官方《Signed APK》文档"Enabling Proguard to reduce the size of the APK"；Android 开发者文档 R8 shrink/obfuscate 口径

### 规律：权限必须最小化（AndroidManifest / Info.plist）
- **适用版本**: 全版本
- **规律**: AndroidManifest.xml 申请的危险权限（SMS/通讯录/通话记录/录音/相机/精确位置/体感）须逐项有业务依据并登记；Info.plist 的 `NS*UsageDescription` 同理。无依据的危险权限一律移除。
- **违反后果**: 过度索权违反应用市场上架规范与个保法最小必要原则，审核驳回或被通报（GB/T 35273-2020 个人信息最小化；OWASP MASVS-PRIVACY）。
- **验证方法**: `grep -nE 'android\.permission\.(READ_SMS|SEND_SMS|READ_CONTACTS|WRITE_CONTACTS|RECORD_AUDIO|CAMERA|ACCESS_FINE_LOCATION|READ_CALL_LOG|BODY_SENSORS)' AndroidManifest.xml`（命中即进入人工最小化审查清单）
- **对应门禁**: fw_react_native_permissions（warn 级）

```verify
id: react-native-r6
cmd: grep -nE 'android\.permission\.(READ_SMS|SEND_SMS|READ_CONTACTS|WRITE_CONTACTS|RECORD_AUDIO|CAMERA|ACCESS_FINE_LOCATION|READ_CALL_LOG|BODY_SENSORS)' --include='AndroidManifest.xml' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: Google Play 政策"Request the minimum permissions necessary"；工信部 App 侵害用户权益专项整治过度索权通报口径

### 规律：必须使用 SafeAreaView / SafeAreaProvider 处理刘海屏
- **适用版本**: 全版本（内置 SafeAreaView 仅 iOS；跨端须 react-native-safe-area-context）
- **规律**: 任一含页面级 JSX 的工程必须有 SafeArea 处理（`SafeAreaView`/`SafeAreaProvider`/`useSafeAreaInsets` 至少一处）；裸 `<View>` 顶格布局在刘海/灵动岛/底部手势区被遮挡。
- **违反后果**: 顶部状态栏区/底部 Home 指示区遮挡交互元素，iOS 审核人机界面准则（HIG）驳回风险；Android 15 强制 edge-to-edge 后同病。
- **验证方法**: 扫描全部组件文件，无任一命中 `SafeAreaView|SafeAreaProvider|useSafeAreaInsets|react-native-safe-area-context` → 违规
- **对应门禁**: fw_react_native_safe_area（warn 级）

```verify
id: react-native-r7
cmd: 
expect: always
```

- **证据**: react-native-safe-area-context README "handle safe area insets on Android, iOS, and web"；Apple HIG Layout 安全区要求；Android 15 edge-to-edge 强制公告

### 规律：长列表必须用 FlatList，禁止 ScrollView 全量渲染
- **适用版本**: 全版本
- **规律**: 超过一屏的同质数据列表必须用 `FlatList`/`SectionList`/`VirtualizedList`（虚拟化按需渲染）；`<ScrollView>` 包裹 map 全量子项在长列表下一次性挂载全部行。
- **违反后果**: 千行列表一次性渲染致 JS 线程长阻塞、内存暴涨（每行视图常驻），低端机直接 OOM/掉帧（对应 GB/T 25000.51-2016 性能效率要求）。
- **验证方法**: 文件含 `<ScrollView` 且无 `FlatList|SectionList|VirtualizedList|FlashList` → 嫌疑（短静态布局属例外，人工复核）
- **对应门禁**: fw_react_native_flatlist（warn 级）

```verify
id: react-native-r8
cmd: 
expect: always
```

- **证据**: RN 官方《Optimizing Flatlist Configuration》"avoid rendering all items at once"；FlatList 文档"performant interface for rendering basic lists"

### 规律：组件须 React.memo/useMemo 防无效重渲染
- **适用版本**: 全版本（React 18+ 并发特性同构适用）
- **规律**: 导出组件所在文件应有 memo 化痕迹（`React.memo`/`useMemo`/`useCallback` 至少其一）；纯展示子组件不 memo 时父级每次渲染全树级联重渲。
- **违反后果**: 高频 state 变更（输入框/滚动）触发整树 reconciliation，列表滚动掉帧（对应 RN 性能文档 re-render 口径）。
- **验证方法**: 文件命中 `export (default )?function [A-Z]` 或 `export const [A-Z]` 组件定义但无 `React.memo|memo(|useMemo|useCallback` → 嫌疑（静态启发式，warn 级人工复核）
- **对应门禁**: fw_react_native_memo（warn 级）

```verify
id: react-native-r9
cmd: 
expect: always
```

- **证据**: React 官方文档 memo/useMemo"When to use"；RN 性能文档"Use memo to skip re-rendering"

### 规律：必须接入 Flipper 调试工具链
- **适用版本**: 0.62+ 内置支持；0.73+ Flipper 默认集成（RN 0.74 起 Flipper 移出默认模板、改为按需接入，差异单独标注）
- **规律**: package.json（或 devDependencies）应有 `react-native-flipper`/Flipper 相关依赖，保障网络/布局/性能/数据库可调试；release 构建须排除 Flipper 初始化。
- **违反后果**: 无调试工具链时网络请求/AsyncStorage/布局问题只能盲猜，排障周期倍增；团队无统一调试基线。
- **验证方法**: 扫描范围内的 package.json 无 `flipper`（大小写不敏感）→ 提醒
- **对应门禁**: fw_react_native_flipper（warn 级）

```verify
id: react-native-r10
cmd: 
expect: always
```

- **证据**: Flipper 官方文档"extensible mobile app debugger"；RN 0.74 变更日志"Flipper removed from default template（可手动集成）"

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_react_native_webview_no_whitelist | fail | 剥注释后同文件命中 `<WebView` + `https?://` 且无 `originWhitelist` → fail | REACT_NATIVE_GLOBS |
| fw_react_native_asyncstorage_secret | fail | `AsyncStorage.setItem(` 行首 60 字符内含敏感 key 语义（token/password/secret 等，大小写不敏感）→ fail | REACT_NATIVE_GLOBS |
| fw_react_native_console_log | warn | `console.log/info/debug(` 命中行 → warn | REACT_NATIVE_GLOBS |
| fw_react_native_hermes_disabled | fail | gradle/Podfile/package.json 命中 `hermesEnabled\|enableHermes\|hermes_enabled = false` → fail | REACT_NATIVE_GLOBS |
| fw_react_native_proguard | warn | 含 `buildTypes\|release` 的 .gradle 文件无 `minifyEnabled true` → warn | REACT_NATIVE_GLOBS |
| fw_react_native_permissions | warn | AndroidManifest.xml 命中危险权限族 → warn 进入最小化审查清单 | REACT_NATIVE_GLOBS |
| fw_react_native_safe_area | warn | 有组件文件但全工程无 SafeArea 处理痕迹 → warn | REACT_NATIVE_GLOBS |
| fw_react_native_flatlist | warn | 文件含 `<ScrollView` 且无 FlatList/SectionList/VirtualizedList/FlashList → warn | REACT_NATIVE_GLOBS |
| fw_react_native_memo | warn | 文件含导出组件定义但无 memo/useMemo/useCallback → warn（启发式） | REACT_NATIVE_GLOBS |
| fw_react_native_flipper | warn | 扫描内 package.json 无 flipper 依赖痕迹 → warn | REACT_NATIVE_GLOBS |

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| react-native × react | JSX/Hook 规律（fw_react_*）在 .tsx/.jsx 上同构适用；本规则集只管移动端特有风险（WebView/存储/引擎/权限） | 职责切分同 R4 §五.7：通用前端规律归 react，移动平台规律归 react-native，避免双报 |
| react-native × nextjs/expo | Expo 工程 package.json 同时含 expo 与 react-native；Hermes/ProGuard 判定口径一致 | Expo 是 RN 元框架，门禁不因 Expo 壳层豁免 |
| react-native × 通用 check_sensitive | 通用门禁报"存在口令模式"，本规则集报"AsyncStorage 语义上存敏感 key" | 同 terraform × check_sensitive 分工：通用报存在、框架报语义，避免 `Keychain.setGenericPassword` 被双报 |

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| 0.70 | Hermes 成为默认 JS 引擎（Android+iOS） | fw_react_native_hermes_disabled 仅报显式回退；老工程升级默认已合规 |
| 0.73 | iOS 亦默认 Hermes；Flipper 默认集成 | Podfile `:hermes_enabled => true` 为默认形态 |
| 0.74 | Flipper 移出默认模板（按需手动集成）；Bridgeless 新架构推进 | fw_react_native_flipper 仅对扫描内 package.json 提醒，不判 fail |
| react-native-webview ≥11 | `originWhitelist` 历史版本默认 `['*']` 陷阱修复，但远程加载仍须显式收窄 | 门禁按"远程 URL 必须有 originWhitelist"判定，与版本无关 |
| AsyncStorage 2.x | 包迁 @react-native-async-storage 组织；明文存储本质未变 | fw_react_native_asyncstorage_secret 按调用点判定，与包版本无关 |
