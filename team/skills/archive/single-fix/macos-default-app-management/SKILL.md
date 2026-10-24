---
name: macos-default-app-management
description: 设置 macOS 文件类型默认打开方式（LaunchServices）。
version: 1.0.0
metadata:
  hermes:
    tags: [macos, launchservices, default-apps, system-config]
---

# macOS 默认应用管理（LaunchServices）

## When to Use

- 用户要求「.md 默认用 VSCode 打开」「把某扩展名默认打开方式改成 X」
- 诊断双击文件打开了错误的应用
- 本机没有 `duti` 等第三方工具，需用系统自带能力完成

## 核心机制

macOS 的「默认打开方式」由 **LaunchServices** 维护，按 UTI（Uniform Type Identifier）记录，不是按扩展名字符串。设置时要覆盖该类型可能注册的所有 UTI。

## 无 duti 时：Swift 调 LaunchServices API（推荐，免安装）

写一个临时 Swift 脚本调 `LSSetDefaultRoleHandlerForContentType`：

```swift
import Foundation
import UniformTypeIdentifiers

let bundleID = "com.microsoft.VSCode"   // 目标 App 的 bundle id
for ext in ["md", "markdown"] {
    if let uti = UTType(filenameExtension: ext) {
        let s = LSSetDefaultRoleHandlerForContentType(uti.identifier as CFString, .all, bundleID as CFString)
        print("\(ext): \(s == noErr ? "OK" : "err \(s)")")
    }
}
// 常见内容类型 UTI 也一并覆盖（有些注册在不同 UTI 下）
for utiStr in ["net.daringfireball.markdown"] {
    LSSetDefaultRoleHandlerForContentType(utiStr as CFString, .all, bundleID as CFString)
}
```

执行：`swift /tmp/xxx.swift`

## 关键要点 / 坑

- **先查目标 App 的 bundle id**：`mdls -name kMDItemCFBundleIdentifier -r "/Applications/Visual Studio Code.app"`（VSCode = `com.microsoft.VSCode`）
- **某些 UTI 未注册会报 `err -50`**（如 `public.markdown` 在本机未注册）——只要主扩展对应的 UTI 设置成功即可，未注册的忽略
- **验证要用「实际打开」而非回读 API**：`LSCopyDefaultRoleHandlerForContentType` 在新 SDK 返回类型有坑（CFString 不能直接转 URL）。可靠验证 = 建个临时该类型文件，`open <file>`（不带 -a）后用 osascript 看前台进程：
  ```
  echo test > /tmp/_t.md && open /tmp/_t.md && sleep 2 && \
  osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'
  ```
- **agent 侧记忆**：用户若要求「以后默认用 X 打开某类文件」，除了改系统，还要把偏好写进 agent 记忆（agent 自己 `open` 时用 `-a "<App>"`），两层都覆盖

## Related

- 文档/PDF 渲染分发见 `as-is-design-doc`（default profile）
