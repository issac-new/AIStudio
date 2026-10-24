---
ruleset_id: ios-swiftui
适用版本: iOS 14+ / Swift 5.5+ / SwiftUI 3.0+
最后调研: 2026-07-23（来源：Apple Developer Documentation + OWASP MASVS）
深度门槛: 10
---
## §1 探查信号
| 信号类型 | 模式 | 置信度 |
|---|---|---|
| 文件 | `*.swift` 含 `import SwiftUI` | 高 |
| 文件 | `*.xcodeproj` 或 `Package.swift` | 高 |
| 依赖 | `import UIKit` + `import SwiftUI` | 中 |

## §2 特定构件枚举
- SwiftUI 视图：`grep -rlE 'import SwiftUI' --include='*.swift'`
- WKWebView 使用点：`grep -rlE 'WKWebView' --include='*.swift'`
- UserDefaults 使用点：`grep -rlE 'UserDefaults' --include='*.swift'`

## §3 领域规律（≥ 深度门槛 条，每条五要素 + 证据）
### 规律：WKWebView 须禁用 JavaScript 或加内容过滤
- **适用版本**: iOS 14+
- **规律**: WKWebView 默认启用 JavaScript，加载远程 URL 时存在 XSS 风险。须禁用 JS 或加 WKContentRuleList 过滤。
- **违反后果**: 远程页面注入恶意 JS → 应用内执行任意代码（CWE-79）。
- **验证方法**: 检出 `WKWebView` 且 `javaScriptEnabled` 未设为 false → fail。
- **对应门禁**: fw_ios_webview_js(fail)

```verify
id: ios-swiftui-r1
cmd: 
expect: always
```

### 规律：UserDefaults 禁存敏感数据
- **适用版本**: 全版本
- **规律**: UserDefaults 为明文 plist 存储，禁存 token/password/secret。敏感数据须用 Keychain。
- **违反后果**: 敏感数据明文泄露（CWE-312）。
- **验证方法**: UserDefaults 操作含敏感 key（token/password/secret）且无 Keychain → fail。
- **对应门禁**: fw_ios_userdefaults_secret(fail)

```verify
id: ios-swiftui-r2
cmd: 
expect: always
```

### 规律：禁 print() 生产代码
- **适用版本**: 全版本
- **规律**: print() 输出到 Console，生产环境可被其他应用读取。
- **违反后果**: 信息泄露（CWE-209）。
- **验证方法**: 检出 `print(` → warn。
- **对应门禁**: fw_ios_print(warn)

```verify
id: ios-swiftui-r3
cmd: 
expect: always
```

### 规律：须用 ATS（App Transport Security）
- **适用版本**: iOS 9+
- **规律**: ATS 强制 HTTPS，禁用 NSAllowsArbitraryLoads。
- **违反后果**: 明文传输（CWE-319）。
- **验证方法**: Info.plist 含 `NSAllowsArbitraryLoads` = true → fail。
- **对应门禁**: fw_ios_ats(fail)

```verify
id: ios-swiftui-r4
cmd: 
expect: always
```

### 规律：须用 Keychain 存敏感数据
- **适用版本**: 全版本
- **规律**: 密码/token/证书须用 Keychain Services，非 UserDefaults/文件。
- **违反后果**: 敏感数据明文存储（CWE-312）。
- **验证方法**: 含密码/token 操作但无 Keychain 痕迹 → warn。
- **对应门禁**: fw_ios_keychain(warn)

```verify
id: ios-swiftui-r5
cmd: 
expect: always
```

### 规律：须配隐私清单（PrivacyInfo.xcprivacy）
- **适用版本**: iOS 17+ / 2024 年起 Apple 要求
- **规律**: App 须声明使用的隐私 API 与数据类型。
- **违反后果**: App Store 审核被拒。
- **验证方法**: 无 PrivacyInfo.xcprivacy 文件 → warn。
- **对应门禁**: fw_ios_privacy_manifest(warn)

```verify
id: ios-swiftui-r6
cmd: 
expect: always
```

### 规律：须用 @StateObject/@ObservedObject 状态管理
- **适用版本**: iOS 14+
- **规律**: 复杂状态须用 @StateObject，非裸 @State 全量重建。
- **违反后果**: 性能退化（全量重建）。
- **验证方法**: 多 @State 但无 @StateObject/@ObservedObject → warn。
- **对应门禁**: fw_ios_state_object(warn)

```verify
id: ios-swiftui-r7
cmd: 
expect: always
```

### 规律：须用 LazyVStack/LazyHStack 长列表
- **适用版本**: iOS 14+
- **规律**: 长列表须用 LazyVStack，非 VStack 全量渲染。
- **违反后果**: 内存溢出/性能退化。
- **验证方法**: VStack 含 ForEach 且无 LazyVStack → warn。
- **对应门禁**: fw_ios_lazy_list(warn)

```verify
id: ios-swiftui-r8
cmd: 
expect: always
```

### 规律：须配 SwiftLint 静态分析
- **适用版本**: 全版本
- **规律**: 项目须配 .swiftlint.yml 强制代码规范。
- **违反后果**: 代码质量退化。
- **验证方法**: 无 .swiftlint.yml → warn。
- **对应门禁**: fw_ios_swiftlint(warn)

```verify
id: ios-swiftui-r9
cmd: 
expect: always
```

### 规律：须用 async/await 网络请求
- **适用版本**: iOS 15+
- **规律**: 网络请求须用 async/await，禁 completion handler 回调地狱。
- **违反后果**: 代码可维护性差。
- **验证方法**: URLSession 含 completionHandler 且无 async → warn。
- **对应门禁**: fw_ios_async(warn)

```verify
id: ios-swiftui-r10
cmd: 
expect: always
```

## §4 门禁清单
| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---|---|---|---|---|
| fw_ios_webview_js | fail | WKWebView 且 javaScriptEnabled 未设 false → fail | IOS_SWIFTUI_GLOBS | CWE-79 |
| fw_ios_userdefaults_secret | fail | UserDefaults 含敏感 key 且无 Keychain → fail | IOS_SWIFTUI_GLOBS | CWE-312 |
| fw_ios_print | warn | print( 命中 → warn | IOS_SWIFTUI_GLOBS | CWE-209 |
| fw_ios_ats | fail | Info.plist 含 NSAllowsArbitraryLoads=true → fail | IOS_SWIFTUI_GLOBS | CWE-319 |
| fw_ios_keychain | warn | 敏感操作无 Keychain → warn | IOS_SWIFTUI_GLOBS | CWE-312 |
| fw_ios_privacy_manifest | warn | 无 PrivacyInfo.xcprivacy → warn | IOS_SWIFTUI_GLOBS | — |
| fw_ios_state_object | warn | 多 @State 无 @StateObject → warn | IOS_SWIFTUI_GLOBS | — |
| fw_ios_lazy_list | warn | VStack+ForEach 无 LazyVStack → warn | IOS_SWIFTUI_GLOBS | — |
| fw_ios_swiftlint | warn | 无 .swiftlint.yml → warn | IOS_SWIFTUI_GLOBS | — |
| fw_ios_async | warn | URLSession completionHandler 无 async → warn | IOS_SWIFTUI_GLOBS | — |

## §5 跨框架交互规则
无已知强交互。

## §6 版本陷阱速查
| 版本 | 变化 | 影响 |
|---|---|---|
| iOS 14 | @StateObject 引入 | @State 在 View 重建时丢失 |
| iOS 17 | 隐私清单强制 | 须声明 PrivacyInfo.xcprivacy |
