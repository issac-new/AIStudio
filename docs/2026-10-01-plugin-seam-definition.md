# Swarm Studio 插件接缝定义（API 面枚举）

日期：2026-10-01　　性质：设计文档（定义先行，不含实施）　　来源：吸收二期清单 #15
参照系：deepseek-harness ctx 接缝全表（`upstream/deepseek-harness/docs/capability-seams.md`，约 90 键）、dsh-TUI 插件四接缝（`upstream/dsh-TUI/docs/interaction.md:43-73` + `src/dsh-adapter/scenes.ts:43-56`）、element-web 运行时模块 API 22 面（`upstream/element-web/packages/module-api/src/api/`）、hermes dashboard slot 机制（`upstream/hermes-agent/web/src/plugins/slots.ts:61-96`，30 个命名 slot）。

> 主旨三句话：本文唯一主旨是定义 Swarm Studio 未来插件体系的"接缝面"——插件能注册什么、不能碰什么，一次性枚举完毕。受众是后续实施会话与插件作者。读完后建议动作是裁决是否立项实施插件宿主（本文不实施任何代码）。

## 一、设计原则（与驾驶舱聚焦对齐）

1. **接缝枚举先于实现**：先把"允许注册的面的全集"定义成文档与类型，再写宿主代码——deepseek-harness 的教训是插件能力随实现漂移（90 键是事后盘点出来的），我们先定义后放行。
2. **只读优先**：第一版接缝以"呈现与导航"为主（面板/页签/命令/状态项），写操作（任务变更/审批动作）走既有 server 域 API，不经插件通道放权。
3. **驾驶舱聚焦不可破坏**：插件不能新增一级路由，不能挂载到 /app 树外；落点=既有功能区的命名槽位。
4. **撤销即恢复**：插件卸载必须撤掉全部注册面（dsh-TUI settings-sections 的"卸载即撤"语义，`settings-sections.ts:144-164`）。

## 二、接缝面枚举（八组 24 缝）

### G1 导航与面板
| 缝 | 说明 | 参照锚点 |
|---|---|---|
| `sidePaneTab` | IDE 右辅助面板新页签（图标+组件+标题键） | zcode SidePane tab 族；studio 落点 IdeSidePane |
| `boardTab` | /app/board 页签条注入（TasksView tab 序列） | studio TasksView TabKey 机制 |
| `govSection` | 治理中心分区卡片 | studio GovernanceView 分区 |
| `runCenterPanel` | 运行中心页签/面板 | studio RunDetailView 页签族 |

### G2 命令与动作
| 缝 | 说明 | 参照锚点 |
|---|---|---|
| `slashCommand` | 聊天/IDE 输入区斜杠命令（含补全） | element-web SlashCommands+6 类 provider |
| `commandPaletteItem` | Spotlight 命令组条目 | studio SpotlightPanel COMMANDS 表 |
| `messageAction` | 消息操作栏动作（回复/引用族并列） | element-web 上下文菜单分层 |
| `taskAction` | 看板卡/抽屉动作按钮 | studio KanbanTaskDrawer 三键面 |

### G3 状态与指示
| 缝 | 说明 | 参照锚点 |
|---|---|---|
| `statusBarSlot` | IDE 状态栏槽位项 | studio IdeStatusBar 槽位系统（ide_status_slots） |
| `attentionSource` | 注意力条梯队数据源（blocked/review/triage 并列） | studio mergeAttention 聚合面 |
| `badgeProvider` | 列表/页签徽章计数源 | element-web NotificationBadge 分层 |
| `headerIndicator` | 页头指示器（与铃铛/日程钮并列） | studio IaShellHeader 按钮族 |

### G4 数据与查询
| 缝 | 说明 | 参照锚点 |
|---|---|---|
| `serverDomain` | 新 /api/* 域挂载（命名空间 /api/ext/<name>/* 前缀强制） | studio custom/server 97 域先例 |
| `projectionSource` | 只读数据投影（供面板消费） | hermes /api/events 只读事件总线 |
| `searchProvider` | Spotlight 结果组新源 | element-web Spotlight provider 族 |

### G5 设置与偏好
| 缝 | 说明 | 参照锚点 |
|---|---|---|
| `settingsSection` | 设置页新节（schema 驱动表单） | dsh-TUI 插件设置 section（命名空间校验+卸载即撤） |
| `featureFlag` | 插件自持功能开关（默认关） | studio features.ts S3 模式 |

### G6 主题与外观
| 缝 | 说明 | 参照锚点 |
|---|---|---|
| `themeTokens` | CSS token 补丁包（导出可合并补丁而非直写源文件） | multica ui-lab 范式；element-web 自定义主题派生 |
| `iconPack` | CockpitIcon 图标集扩展 | studio CockpitIcon 注册表 |

### G7 通知与外发
| 缝 | 说明 | 参照锚点 |
|---|---|---|
| `notifyChannel` | 通知分级中心新类目（受 notify-prefs 六分组降噪约束） | studio notify-prefs 单一事实源 |
| `webhookEmitter` | 事件外发（签名密钥+deliveries 回放） | multica autopilot webhook 面 |

### G8 工作流与自动化
| 缝 | 说明 | 参照锚点 |
|---|---|---|
| `automationBlueprint` | 定时任务蓝图模板（槽位表单声明） | hermes cron blueprint_catalog BlueprintSlot |
| `columnSpecialist` | 看板列 specialist 契约（证据要求声明） | routa resources/specialists/workflows/kanban 九件套 |
| `workflowActor` | DWF 工作流 actor 类型 | zcode workflow 族渲染器 |

## 三、明确不开放（Non-goals）

- 一级路由注册（违反驾驶舱聚焦，B3）。
- 直接 DOM 注入到任意位置（只能进命名槽位；element-web PersistedElement 式的全局挂载不开放）。
- 审批/门禁绕过通道（写操作一律走既有 server 域，插件无特权面）。
- 主进程/Node 能力（渲染层沙箱原则；desktop 壳面不暴露给插件，参照 element-web module-api 的白名单思路）。
- 插件内嵌远程脚本（安全面：全部资源本地打包，参照 deepseek-harness pendingBuilds 审批的保守姿态）。

## 四、实施前提（立项裁决点）

1. 宿主机制选型：hermes dashboard slot（30 命名 slot 字符串约定）vs element-web module-api（22 个类型化 API 面+Watchable 配置）——建议后者思路+前者槽位命名法，Vue 化重写。
2. 清单文件格式：参照 hermes plugins/kanban/dashboard/manifest.json（tab.path/entry/css/api 四字段）扩展 seams 声明段。
3. 守门：每缝一个注册/卸载测试（注册可见、卸载零残留）；接缝枚举表即测试清单。
4. 本文档落地前不实施宿主代码——先裁决八组 24 缝的取舍。
