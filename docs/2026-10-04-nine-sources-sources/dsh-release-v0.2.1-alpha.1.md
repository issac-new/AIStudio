[中文](#cn-v0.2.1-alpha.1-community) | [English](#en-v0.2.1-alpha.1-community)

<h3 id="cn-v0.2.1-alpha.1-community">✨ 新增功能</h3>

- 新增实验性 Claude Code Mods 兼容层。目前阶段的主要目的是验证 Claude Code Mods API 功能大致为 DeepSeek Harness 插件的一个子集，而非为用户提供实际的完整兼容性。 @tianyicui
- 插件管理页新增「让 Agent 创建插件」入口，可保留草稿进入创造模式；发送需求后才开始执行。 @ZiyaZhang
- 新会话支持预填未发送的提示；恢复草稿或切换工作区时保留文件、目录和会话引用。 @imccyu
- Markdown 文件预览将 YAML 头部元数据显示为清晰的字段列表。 @turtle2099
- Web 支持通过 `--public-url` 指定显示、打开及提供给模型的对外访问地址，支持带路径前缀的反向代理入口。 @oraluben
- 新增可选的开发者工具组合包，提供会话原始日志、聊天分组与正文的双向定位，以及内嵌 Host 调试工具；内嵌 DevTools 目前使用英文界面。 @imccyu

### 🐛 问题修复

- 目标编辑支持多行文本和 Shift+Enter 换行，并改善目标与排队消息编辑器的中文输入及宽度适配。 @turtle2099
- 修复目标任务停止、恢复并再次停止后，新消息滞留队列的问题。 @turtle2099
- 修复部分 Bash、PowerShell 和文件修改记录无法展开输出或差异的问题。 @turtle2099
- 关闭代码工作视图后仍可选择标准、创造和自定义模式；内置 PTC／极简默认值改为标准，已有会话保持原模式。 @ZiyaZhang
- 修复启停插件时其他插件的样式被移除、需要刷新页面才能恢复的问题。 @turtle2099
- 登录请求未收到响应时显示网络检查提示，便于区分连接问题与其他登录失败。 @lsdsjy
- 桌面端默认使用系统分配的端口，避免 Windows 保留端口范围导致应用无法启动。 @turtle2099
- 修复侧栏列表重排或重新显示后，会话加载动画不同步的问题。 @turtle2099
- 启用开发目录监听后，HMR 可刷新包入口和依赖映射配置，并正确重载仍在运行的原入口。 @imccyu
- 修复新组合包启用后找不到依赖，以及停用或卸载后残留依赖映射的问题；替换已安装包的版本仍需重启。 @imccyu

### 🎨 体验优化

- 改善自动化任务详情在窄窗口中的布局，关联会话入口会按可用空间收起为图标。 @turtle2099
- 组合包详情页显示代码来源和当前版本，便于查看安装来源及重装所需的信息。 @turtle1999
- 工具调用在准备阶段即可显示已到达的命令说明、文件路径和内容生成进度。 @imccyu
- 加快大量会话的列表读取，同时继续为其他操作提供执行机会。 @turtle1999
- 插件安装结果显示实际安装版本；因新版本冷却策略安装较旧版本时，提供说明和精确版本安装方式。 @turtle2099

### ⚠️ 其他变更

- 自动化任务改为 Web 内置能力，提醒工具按模式提供：标准、创造和 PTC 模式可用，极简模式和子代理不可用；旧实验组合包选择会自动清理，已有任务保留。 @Chinesezjc, @turtle1999
- 子路径插件不再读取独立的 `package.json`，显示文本和图标须通过对应子路径导出；插件开发模板同步补齐本地化信息与图标。 @turtle1999
- 破坏性变更：移除运行时 invariant 插件及各包的 `./invariant` 导出；依赖这些诊断入口的扩展和自定义 profile 需要调整。 @turtle2099
- 输入区统计扩展拆为 `activity` 和 `usage` 两个独立入口；覆盖旧 `stats` 整行的插件需要更新注册 ID。 @turtle1999

<h3 id="en-v0.2.1-alpha.1-community">New Features</h3>

- Add an experimental Claude Code Mods compatibility layer. At this stage, the main goal is to verify that the Claude Code Mods API's capabilities are broadly a subset of what DeepSeek Harness plugins can do, rather than to offer users complete, practical compatibility. by @tianyicui
- Add a “Let Agent create a plugin” entry to plugin management. It opens Creator mode while preserving the draft and starts work only after the request is sent. by @ZiyaZhang
- Support unsent initial prompts for new sessions and preserve file, folder, and session references when restoring drafts or moving them between workspaces. by @imccyu
- Display YAML frontmatter as a readable field list in Markdown file previews. by @turtle2099
- Add `--public-url` for the Web address shown to users, opened in the browser, and supplied to the model, including reverse-proxy URLs with a path prefix. by @oraluben
- Add an optional Developer Tools bundle with raw session logs, bidirectional navigation between chat groups and the conversation, and embedded Host diagnostics. The embedded DevTools currently uses an English interface. by @imccyu

### Bug Fixes

- Support multiline goal editing with Shift+Enter, and improve IME handling and resizing in goal and queued-message editors. by @turtle2099
- Fix new messages remaining queued after stopping, resuming, and stopping a goal-driven task again. by @turtle2099
- Fix some Bash, PowerShell, and file-mutation records failing to expand their output or diff. by @turtle2099
- Keep Standard, Creator, and custom modes available when coding view is disabled. Built-in PTC or Minimal defaults change to Standard, while existing sessions retain their mode. by @ZiyaZhang
- Fix toggling a plugin removing styles owned by other plugins until the page is refreshed. by @turtle2099
- Show a network-check message when a sign-in request receives no response, distinguishing connection problems from other sign-in failures. by @lsdsjy
- Let the operating system assign the Desktop port by default, avoiding startup failures caused by reserved port ranges on Windows. by @turtle2099
- Keep session loading animations synchronized after sidebar rows move or become visible again. by @turtle2099
- With development-directory watching enabled, refresh package-entry and dependency-mapping configuration while continuing to reload the entry that is already running. by @imccyu
- Fix missing dependencies after enabling a new bundle and stale dependency mappings after disabling or uninstalling bundles. Replacing an installed package version still requires a restart. by @imccyu

### Improvements

- Improve Automation task details in narrow windows by collapsing the linked-session action to an icon when space is limited. by @turtle2099
- Show a bundle’s code source and current version in its details, making installation and reinstallation information easier to find. by @turtle1999
- Show available command descriptions, file paths, and content-generation progress while tool calls are still preparing. by @imccyu
- Speed up large session listings while periodically allowing other work to run. by @turtle1999
- Show the version actually installed and explain how to request an exact version when pnpm’s release-age policy selects an older release. by @turtle2099

### Chores

- Make Automation tasks part of Web, with reminder tools scoped to Standard, Creator, and PTC modes. Minimal mode and subagents do not receive them. Retired experimental-bundle selections are cleaned up while existing tasks are preserved. by @Chinesezjc, @turtle1999
- Stop reading separate `package.json` files for subpath plugins; display text and icons must use the corresponding subpath exports. Plugin-development templates now include localized metadata and icons. by @turtle1999
- Breaking change: remove runtime invariant plugins and package `./invariant` exports. Extensions and custom profiles using these diagnostic entry points must be updated. by @turtle2099
- Split composer statistics into separate `activity` and `usage` extension entries. Plugins replacing the former `stats` row must update their registered IDs. by @turtle1999

Full Changelog: [dsh-v0.2.0-rc.2...dsh-v0.2.1-alpha.1](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.0-rc.2...dsh-v0.2.1-alpha.1)

