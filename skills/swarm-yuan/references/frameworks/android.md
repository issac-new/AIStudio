---
ruleset_id: android
适用版本: Android 原生（Kotlin/Java；AGP 7+/8.x，minSdk 24+，targetSdk 34+；Kotlin 1.9+/2.x）
最后调研: 2026-07-23（来源：Android 开发者官方文档 / OWASP MASVS / ProGuard·R8 官方手册 / Room·LeakCanary 官方仓库）
深度门槛: 10
---

# Android 原生（Kotlin/Java）规则集

<!--
移动端原生 Android 规则集（WP-W 批次新增，与 ios-swiftui 同批填补「移动端原生双端」缺口）。
判定哲学与 react-native/flutter 一致：grep/awk 静态结构匹配，宁 warn 勿误判 fail；
「须配」类规律（ProGuard/Network Security Config/LeakCanary）仅在对应配置文件进入扫描范围时判定，
文件缺失时不报——门禁为静态辅助，不替代真机构建与上架审查。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 文件 | `build.gradle(.kts)` 含 `com.android.application` 插件 | 高（file 类型信号；detect-frameworks.sh 不支持 file 探测，须手动 ACTIVE_FRAMEWORKS） |
| 文件 | `AndroidManifest.xml`（`app/src/main/` 下） | 高（Android 工程专属清单） |
| 文件 | `settings.gradle` + `gradle.properties` + `app/` 模块目录结构 | 中（目录结构组合） |
| 配置 | 源码含 `import android.` / `import androidx.` | 高（平台专属导入） |
| 配置 | `local.properties` 含 `sdk.dir`（Android SDK 路径） | 中（本地环境信号） |

## §2 特定构件枚举（命令 + 计数核验方式）

- Kotlin/Java 源码：`find . -name '*.kt' -o -name '*.java' | grep -v build/ | wc -l`（计数核验基准：源码文件数）
- WebView 使用：`grep -rlE 'WebView|setJavaScriptEnabled|javaScriptEnabled' --include='*.kt' --include='*.java' . | wc -l`（计数核验基准：引入 WebView 的文件数）
- SharedPreferences 写调用：`grep -rhE '\.put(String|Int|Long|Boolean|Float|StringSet)\(' --include='*.kt' --include='*.java' . | wc -l`（计数核验基准：KV 写入行数）
- 日志调用：`grep -rhE 'Log\.(d|v|i|w|e)\(' --include='*.kt' --include='*.java' . | wc -l`（计数核验基准：Log 调用行数）

## §3 领域规律（≥ 深度门槛 条，每条五要素 + 证据）

### 规律：WebView 启用 JavaScript 加载远程 URL 必须配源审计
- **适用版本**: 全 API 级别（`WebView#setWebViewClient` 全版本可用）
- **规律**: `settings.javaScriptEnabled = true`（或 Java `setJavaScriptEnabled(true)`）且 `loadUrl("https?://...")` 加载远程内容时，同文件必须有源审计痕迹（`shouldOverrideUrlLoading` 拦截白名单 / `@JavascriptInterface` 暴露面人工登记）；仅加载本地 `file:///android_asset/` 资源属合规例外。
- **违反后果**: 任意源页面（含被劫持跳转/钓鱼页）均可在启用 JS 的 WebView 内执行脚本，配合 `addJavascriptInterface` 即远程代码执行面（CWE-79 跨站脚本/CWE-749 暴露危险方法；OWASP MASVS-PLATFORM WebView 族）。
- **验证方法**: 剥注释后同文件同时命中 `javaScriptEnabled = true`/`setJavaScriptEnabled(true)` 与 `loadUrl("https?://` 且无 `shouldOverrideUrlLoading` → 违规
- **对应门禁**: fw_android_webview_js_enabled（fail 级）
- **证据**: Android 官方 WebView 文档 "Enabling JavaScript... can introduce cross-site-scripting attacks"；OWASP MASVS "WebViews 须限制可加载的源并最小化 JS 暴露面"

```verify
id: android-r1
cmd: 
expect: always
```

### 规律：SharedPreferences 禁止明文存敏感数据（token/密码/密钥）
- **适用版本**: 全版本（EncryptedSharedPreferences 需 androidx.security:security-crypto 1.0+）
- **规律**: `getSharedPreferences(...).edit().putString(...)` 的 key 不得含 `token|password|passwd|secret|credential|api_key|session` 等敏感语义；凭证一律走 `EncryptedSharedPreferences`（Keystore 主密钥）或纯 Keystore 方案。
- **违反后果**: SharedPreferences 为明文 XML（`/data/data/<pkg>/shared_prefs/`），root/备份导出/调试桥即凭证泄露（CWE-312 明文存储敏感信息；GB/T 22239-2019 8.1.4.6 数据保密性）。
- **验证方法**: `grep -inE '\.put(String|Int|Long|Boolean|Float|StringSet)\(.{0,60}(token|password|passwd|secret|credential|api_?key|session)' --include='*.kt' --include='*.java' .`（命中文件须含 SharedPreferences 使用且非 EncryptedSharedPreferences）
- **对应门禁**: fw_android_sharedprefs_secret（fail 级）
- **证据**: androidx security-crypto 官方文档 "EncryptedSharedPreferences wraps SharedPreferences and encrypts keys and values"；OWASP MASVS-STORAGE-1 敏感数据须系统级安全存储

```verify
id: android-r2
cmd: grep -inE '\.put(String|Int|Long|Boolean|Float|StringSet)\(.{0,60}(token|password|passwd|secret|credential|api_?key|session)' --include='*.kt' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：生产代码禁止 Log.d/Log.v 残留
- **适用版本**: 全版本
- **规律**: 业务源码不得残留 `Log.d(`/`Log.v(`；调试输出走 `BuildConfig.DEBUG` 守卫或 ProGuard 规则 `-assumenosideeffects class android.util.Log` 在 release 剥离。
- **违反后果**: release 包日志经 logcat 任意可读（同设备恶意应用 adb 授权亦可），日志点连同变量值暴露内部状态与敏感数据（CWE-209 错误信息泄露/CWE-532 日志敏感信息）。
- **验证方法**: `grep -rnE 'Log\.(d|v)\(' --include='*.kt' --include='*.java' .`（应为空）
- **对应门禁**: fw_android_log_debug（warn 级）
- **证据**: Android 官方性能文档 "Remove Log statements in release builds"；ProGuard 手册 assumenosideeffects 剥离 Log 的标准做法

```verify
id: android-r3
cmd: grep -rnE 'Log\.(d|v)\(' --include='*.kt' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：必须使用 HTTPS（禁止明文 HTTP 流量）
- **适用版本**: API 23+ `usesCleartextTraffic` 可配；API 28+ 默认禁止明文
- **规律**: AndroidManifest 不得显式 `android:usesCleartextTraffic="true"`；业务代码 `loadUrl`/`OkHttp`/`HttpURLConnection` 不得请求 `http://` 明文地址。明文例外（如内网调试域名）必须经 Network Security Config 按域名白名单收窄。
- **违反后果**: 明文流量可被中间人篡改/窃听，token 与会话内容链路直读（CWE-319 明文传输敏感信息；GB/T 22239-2019 8.1.4.5 传输保密性）。
- **验证方法**: XML 命中 `usesCleartextTraffic="true"` → 违规；源码 `loadUrl("http://` / `URL("http://` → 违规
- **对应门禁**: fw_android_cleartext_traffic（fail 级）
- **证据**: Android 官方 Network security configuration 文档 "Android P 起 cleartext 默认禁用"；OWASP MASVS-NETWORK-1 数据须 TLS 加密传输

```verify
id: android-r4
cmd: 
expect: always
```

### 规律：release 构建必须启用 ProGuard/R8 混淆
- **适用版本**: AGP 3.4+ 默认 R8；AGP 7+/8.x 同口径
- **规律**: `app/build.gradle(.kts)` 含 `buildTypes`/`release` 配置时必须 `minifyEnabled true`（Kotlin DSL `isMinifyEnabled = true`），建议 `shrinkResources true` + 维护 proguard-rules.pro keep 规则。
- **违反后果**: release APK 类名/方法名明文，jadx 一键还原业务逻辑，密钥常量与接口路径直读（CWE-656；OWASP MASVS-RESILIENCE-2 混淆要求）。
- **验证方法**: 含 `buildTypes|release` 的 .gradle(.kts) 文件须命中 `minifyEnabled[[:space:]]+true|isMinifyEnabled[[:space:]]*=[[:space:]]*true`
- **对应门禁**: fw_android_proguard（warn 级）
- **证据**: Android 官方《Shrink, obfuscate, and optimize your app》"R8 is the default compiler"；Play 上架逆向防护基线

```verify
id: android-r5
cmd: 
expect: always
```

### 规律：必须配置 Network Security Config 声明明文策略
- **适用版本**: API 23+（`android:networkSecurityConfig` 属性）
- **规律**: AndroidManifest.xml 的 `<application>` 应显式 `android:networkSecurityConfig="@xml/network_security_config"`，在 `res/xml/network_security_config.xml` 声明 `<base-config cleartextTrafficPermitted="false">` 与证书固定/调试覆盖；隐式依赖系统默认值不利于审计与按域收紧。
- **违反后果**: 无明文策略声明时历史兼容域名/第三方 SDK 的 cleartext 行为不可见，安全评审无基线（OWASP MASVS-NETWORK；等保 2.0 通信传输审计要求）。
- **验证方法**: 扫描范围内 AndroidManifest.xml 无 `networkSecurityConfig` 属性 → 提醒
- **对应门禁**: fw_android_network_security_config（warn 级）
- **证据**: Android 官方 Network security configuration 文档 `<domain-config>`/`<base-config>` 语义；Google Play 安全基线建议显式声明

```verify
id: android-r6
cmd: 
expect: always
```

### 规律：权限必须最小化（AndroidManifest）
- **适用版本**: 全版本（API 23+ 运行时权限；API 33+ 通知权限细化）
- **规律**: AndroidManifest.xml 申请的危险权限（SMS/通讯录/通话记录/录音/相机/精确位置/体感/后台定位）须逐项有业务依据并登记；无依据的危险权限一律移除，能用 `uses-permission-sdk-23` 限定版本即限定。
- **违反后果**: 过度索权违反应用市场上架规范与个保法最小必要原则，审核驳回或被通报（GB/T 35273-2020 个人信息最小化；OWASP MASVS-PRIVACY）。
- **验证方法**: `grep -nE 'android\.permission\.(READ_SMS|SEND_SMS|READ_CONTACTS|WRITE_CONTACTS|RECORD_AUDIO|CAMERA|ACCESS_FINE_LOCATION|ACCESS_BACKGROUND_LOCATION|READ_CALL_LOG|BODY_SENSORS)' AndroidManifest.xml`（命中即进入人工最小化审查清单）
- **对应门禁**: fw_android_permissions（warn 级）
- **证据**: Google Play 政策 "Request the minimum permissions necessary"；工信部 App 侵害用户权益专项整治过度索权通报口径

```verify
id: android-r7
cmd: grep -nE 'android\.permission\.(READ_SMS|SEND_SMS|READ_CONTACTS|WRITE_CONTACTS|RECORD_AUDIO|CAMERA|ACCESS_FINE_LOCATION|ACCESS_BACKGROUND_LOCATION|READ_CALL_LOG|BODY_SENSORS)' --include='AndroidManifest.xml' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：必须使用 ViewBinding/DataBinding（禁止裸 findViewById）
- **适用版本**: AGP 3.6+ ViewBinding 稳定；DataBinding AGP 4+
- **规律**: 视图引用一律走 `ActivityMainBinding.inflate(...)` / `DataBindingUtil` 编译期绑定；裸 `findViewById` 靠运行时转型，id 漂移/类型不匹配即 NPE/ClassCastException，且跨模块重构无编译期校验。
- **违反后果**: findViewById 返回空或类型错配在运行时崩溃（CWE-476 空指针解引用）；id 重命名/复用布局场景静态不可查，回归靠人肉。
- **验证方法**: 剥注释后 Kotlin/Java 文件命中 `findViewById` 且无 `ViewBinding|DataBinding|Binding\b` 痕迹 → 嫌疑（启发式，人工复核）
- **对应门禁**: fw_android_findviewbyid（warn 级）
- **证据**: Android 官方 View Binding 文档 "View binding is null-safe and type-safe"；官方迁移指南建议以 ViewBinding 替代 findViewById

```verify
id: android-r8
cmd: 
expect: always
```

### 规律：持久化必须走 Room（禁止裸 SQLite API）
- **适用版本**: Room 1.x/2.x（androidx.persistence；KSP 2.x 同口径）
- **规律**: 结构化持久化须用 Room（`@Database`/`@Entity`/`@Dao` 编译期 SQL 校验）；裸 `SQLiteOpenHelper`/`SQLiteDatabase.rawQuery`/`execSQL` 手写 SQL 无编译期校验，拼串即注入面。
- **违反后果**: 手写 SQL 拼接存在注入风险（CWE-89），schema 迁移靠手工版本号易错致线上崩溃/数据损坏；字段变更无编译期保障。
- **验证方法**: 剥注释后文件命中 `SQLiteOpenHelper|SQLiteDatabase|rawQuery|execSQL` 且无 `androidx.room|@Database|@Dao|Room\.` → 嫌疑
- **对应门禁**: fw_android_room_sqlite（warn 级）
- **证据**: Android 官方 Room 文档 "Room provides compile-time verification of SQL queries"；官方持久化指南明确推荐 Room 替代裸 SQLite

```verify
id: android-r9
cmd: 
expect: always
```

### 规律：必须接入 LeakCanary 内存泄漏检测（debug 构建）
- **适用版本**: LeakCanary 2.x（`com.squareup.leakcanary:leakcanary-android` debugImplementation）
- **规律**: 应用模块 `build.gradle(.kts)`（含 `com.android.application` 或 `applicationId`）应有 `leakcanary` 依赖痕迹（debugImplementation 自动初始化）；release 构建不打包（LeakCanary 2.x debug 依赖天然隔离）。
- **违反后果**: Activity/Fragment 泄漏（长生命周期持有 Context、静态引用、未注销回调）只能靠 OOM 后回溯，定位成本倍增；团队无泄漏基线，线上 OOM 率失控。
- **验证方法**: 含 `com.android.application|applicationId` 的 gradle 文件无 `leakcanary`（大小写不敏感）→ 提醒
- **对应门禁**: fw_android_leakcanary（warn 级）
- **证据**: LeakCanary 官方 README "LeakCanary is a memory leak detection library for Android，debugImplementation 即自动生效"；Square 工程实践基线

```verify
id: android-r10
cmd: 
expect: always
```

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_android_webview_js_enabled | fail | 剥注释后同文件命中 `javaScriptEnabled[[:space:]]*=[[:space:]]*true\|setJavaScriptEnabled(true)` + `loadUrl("https?://` 且无 `shouldOverrideUrlLoading` → fail | ANDROID_GLOBS |
| fw_android_sharedprefs_secret | fail | 文件含 SharedPreferences 使用 + `put*(..., token/password/secret 等敏感 key)`（60 字符窗口，大小写不敏感）+ 无 EncryptedSharedPreferences → fail | ANDROID_GLOBS |
| fw_android_log_debug | warn | `Log.(d|v)(` 命中行 → warn | ANDROID_GLOBS |
| fw_android_cleartext_traffic | fail | XML 命中 `usesCleartextTraffic="true"` 或源码 `loadUrl("http://`/`URL("http://` → fail | ANDROID_GLOBS |
| fw_android_proguard | warn | 含 `buildTypes\|release` 的 .gradle(.kts) 无 `minifyEnabled true`/`isMinifyEnabled = true` → warn | ANDROID_GLOBS |
| fw_android_network_security_config | warn | 扫描内 AndroidManifest.xml 无 `networkSecurityConfig` 属性 → warn | ANDROID_GLOBS |
| fw_android_permissions | warn | AndroidManifest.xml 命中危险权限族 → warn 进入最小化审查清单 | ANDROID_GLOBS |
| fw_android_findviewbyid | warn | 文件命中 `findViewById` 且无 ViewBinding/DataBinding 痕迹 → warn（启发式） | ANDROID_GLOBS |
| fw_android_room_sqlite | warn | 文件命中裸 SQLite API（SQLiteOpenHelper/SQLiteDatabase/rawQuery/execSQL）且无 Room 痕迹 → warn | ANDROID_GLOBS |
| fw_android_leakcanary | warn | 含 `com.android.application\|applicationId` 的 gradle 无 leakcanary 依赖 → warn | ANDROID_GLOBS |

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| android × react-native/flutter | RN/Flutter 工程的 `android/app/` 壳层与本规则集命中同一批文件；ProGuard/权限/Manifest 判定口径一致，各自规则集独立判定不互斥 | 壳层归跨端规则集，纯原生工程归本规则集；探测信号（build.gradle 插件 + 无 package.json/pubspec）负责区分激活，避免双报 |
| android × spring 系 | 同仓库后端 Java 工程（pom.xml）与 Android 工程（build.gradle + com.android.application）并存时各自激活 | 构建文件与探查信号不同族，门禁 globs 天然隔离 |
| android × 通用 check_sensitive | 通用门禁报"存在口令模式"，本规则集报"SharedPreferences 语义上存敏感 key" | 同 react-native × check_sensitive 分工：通用报存在、框架报语义，避免 EncryptedSharedPreferences 被双报 |

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| API 28（Android 9） | 明文 HTTP 默认禁用（`cleartextTrafficPermitted` 默认 false） | fw_android_cleartext_traffic 仅报显式开启 true 与代码层 http:// 硬编码；低 targetSdk 老工程默认行为不同，人工复核 |
| AGP 3.4 | R8 成为默认压缩/混淆器（替代 ProGuard 独立配置） | fw_android_proguard 按 `minifyEnabled` 判定，与选用 R8/ProGuard 无关 |
| AGP 3.6 | ViewBinding 稳定发布 | fw_android_findviewbyid 判定与 AGP 版本无关；Kotlin synthetic 已废弃，同属迁移对象 |
| security-crypto 1.1 | EncryptedSharedPreferences 部分 API 废弃（master key 构建方式演进） | fw_android_sharedprefs_secret 按调用点判定，与加密库版本无关 |
| Room 2.6 / KSP | Room 全面迁 KSP 注解处理 | fw_android_room_sqlite 按 API 痕迹判定，与注解处理器无关 |
