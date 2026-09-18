# ZCode 3.12.3 settings 增量盘点（M1.8，+118 键对账）

**主旨**：3.12.3 的 `settings.*` 比 3.11.2 净增 118 键（1678→1796）。本文逐子域对 SwarmStudio SettingsView 家族现状给出裁决：对等 / 缺口（含去向）/ 不适用。事实源=快照 `notes/zcode-3123/ns-counts.json` + 逐键抽查。写给维护者，结论供 spec §二「设置」行引用。

## 子域对账（3.12.3 键数 → 裁决）

| 子域（键数） | 现状 | 裁决 |
|---|---|---|
| memory(37) | SwarmStudio 无对应 | **缺口 → M3 记忆查看器**（已立项） |
| plugins(247)+plugin(39) | SkillsView/McpManagerView 覆盖插件管理 | 大体对等；3.11.3 增量「按工作区安装/新版本提醒」需复核插件设置页（留 M4 小项） |
| resourceFilter/Actions/Group(9) | 无 | **缺口 → M2 资源管理器**（已立项，键并入其词表） |
| taskAutoArchive(Days)(5) | 侧栏归档区已落地（M1.1）；自动归档未做 | 缺口小项 → 随 M4 任务分组置顶一起 |
| indexing(6) | hermes 无独立索引设置 | 不适用（ZCode 本地知识索引私有体系） |
| toolGrouping{Explore,Terminal,Changes}(6) | MessageList 工具卡已有分组渲染（分组设置开关无） | 缺口小项 → M4（价值中：渲染偏好开关） |
| performanceMode(2) / modelIoFullRetention(2) / optimizeAgentExperience(2) | 无 | ZCode 性能调优项（大历史会话优化）， SwarmStudio 会话量级未到痛点 → 记 backlog 不排期 |
| askUserQuestionAutoResolution(2) / zcodeInteractionBehavior(3) | 无 | ZCode agent 行为偏好 → 对应物=未来 agent 配置面，backlog |
| notification(2)+notificationSound(2)+keepAwakeWhileRunning(2)+closeToTrayOnWindows(2) | desktop patch 体系有托盘/通知基础 | 部分对等；缺项随 desktop 需求补（低优） |
| httpProxy 族(8) | 无 | SwarmStudio 桌面走系统代理 → 缺口低优（服务器部署用户可能需要，M4+） |
| dataBaseDir 族(6) | SwarmStudio 数据目录固定 | 不适用（对应 M2 资源管理器可见性） |
| embeddedBrowserAllowInsecureCertificates(2) / nativeSearchEnhancements(2) / desktopChromiumHardwareAcceleration(2) | DesktopBrowserPanel 无证书开关 | 低优 backlog |
| receivePreviewUpdates(2) / autoDownloadAndInstallUpdates(2) | 无 | **不适用**（gh release 分发既定） |
| uiFontSize(1) / showLineNumbers(1) / wrapLongLines(1) / fontSize(1) / themeMode(6) / appearance(4) | 主题体系已有；字号/行号/折行设置缺 | 缺口小项 → M4 视觉设置批 |
| terminalProfile(1)+FontFamily(3)+integratedTerminalShell(2) | IdeTerminalPanel 无个性化设置 | 缺口小项 → M4 终端设置批 |
| modelProvider(594)/usage(143)/skills(125)/mcp(102)+mcpServers(29)/subagents(86)/commands(66)/hooks(60)/migration(46)/browser(44)/computerUse(14) | SettingsView/ModelsView/McpManagerView/SkillsView/ProfilesView 家族覆盖 | 对等（3112 轮结论维持；增量键抽查未见新功能面，多为既有面文案细化） |

## 结论

+118 键中：**37 键已立项 M3、9 键已立项 M2、约 20 键为低优视觉/终端/通知小项（归 M4 分批）**，其余为既有面细化或 ZCode 云特性/私有体系不适用。无遗漏未裁决子域。
