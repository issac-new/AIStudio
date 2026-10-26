# 2026-10-26 产品名统一 AIStudio（SwarmStudio 品牌面收敛）

## 变更

用户指示「SwarmStudio 统一改为 AIStudio」。范围判断：改用户看到的品牌，不改系统赖以兼容的标识。

1. **补丁 690（vendor/hermes-studio 树，64 文件）**——zh/en locale 各 21 处品牌串；client（index.html title/apple-title/boot-fallback、manifest.webmanifest、main.ts 兜底标题、ChatView productTitle、AppConnectionsPanel 显示标签）；desktop 用户可见文案（tray tooltip、通知标题、错误页、desktop-i18n.ts、cli-shim 报错文案、README、electron-builder 协议显示名与麦克风权限描述、group-chat-agent-popup、webui-server、electron-builder.mjs Linux Name、installer.nsh）；server 全部用户可见文案（session-push 13 语言×3、live-activity、update/app-relay/stt/tts/sessions/session-command/webhooks/kanban、coding-agents 展示名回流×6、prompt 品牌叙述）；ekko-agent（X-OpenRouter-Title 归因头、recovery/memory/tools/provider-presets/browser、skills 文档、README/API.md/package.json 描述面）；apikey-image-gen SKILL；vendor 测试 agent-bridge-manager 的 `HERMES_OPENROUTER_APP_TITLE` 断言。
2. **custom/ 直改**——IaSideNav:236 侧栏品牌、MatrixChatPanel:32（含带空格 'Swarm Studio' 统一）、AccountAdminView:32,35、bpa/i18n:13,199、mcpConfigPrompt:34、chat-bridge:414、report/part1-skeleton:31 报告 H1、native-routes:473；engine-controller/engine-bridge 的 clientId/appVersion 内部标识**保留**。
3. **根配置与现行文档**——package.json description、README、AGENTS、CLAUDE.md、docs/USAGE、docs/intro.html、docs/windows-x64-setup 散文；team/skills、simharness/README、runtime/ 散文（`/Applications/SwarmStudio.app` 路径与 `swarmstudio.style-charter` 段 ID 保留）；diagram 品牌档案显示名改 AIStudio、slug `swarmstudio` 保留（标识符稳定）。
4. **测试同步**——verify-dist fixture title、ia-shell-header 品牌守卫扩拦两个旧名、diagram 显示名断言。

## 决策记录

- **保留清单（改了即破坏，逐项定性）**：apk 下载 URL×2（真实远端文件名）；electron-builder appId/artifactName/productName/package.json name（安装身份+升级链+team/profiles 路径+after-pack 测试耦合）；`setName`（macOS 数据目录锚点，desktop-identity.ts 注释明言先 pin 后改名）；深链 scheme `swarmstudio://`（OS 注册协议+快捷方式）；cli-shim PATH MARKER（已装机器幂等标记）；`SwarmStudio-updater`（已装缓存目录）；esp32-c3 全部（烧录设备配网标识 SSID）；`com.swarmstudio.*` wire 协议（存量 Matrix 房间落盘）；`isSwarmStudioEventType` 等标识符、clientId、段 ID、icon.json（Linux 图标注册名与安装身份配套）。
- **单补丁单树**：ekko-agent/esp32 均在 vendor/hermes-studio 树内，resolvePatchTargetRoot 按 patch 首路径路由整补丁，故 690 一枚覆盖全部，无需 691。
- **历史不改写**（2026-10-24 先例沿用）：specs/plans/notes 带日期文件、RELEASE-NOTES、wx-research、旧补丁（Ekko→Swarm 史实）零触碰。
- **桌面身份不动**与 web-only 立法一致（浏览器 web 版交付，桌面构建非交付面）。

## 验证

- 目标守门 9 文件 76 测全绿（i18n 双门/ia-shell-header 扩拦守卫/verify-dist/diagram 三件/report 双件）。
- 注入闭环：clean（残留 0，上一轮兜底步生效）→ inject 重放全 series 含 690 → zh locale title、index.html title、agent-bridge 断言全部 AIStudio 在位。
- 全量 `npm test` 零失败（随批回填）。
- serve-main 差量补套后活体：标签页 title=AIStudio、侧栏品牌位、用户打开中的 8649 页签重载生效。

## 实施补记（范围比探查报告扩大的部分）

- custom 树散文面比初盘多 18 文件（ontology/delivery/governance/loop/graph/cua/expertise/bpa/qgate 注释与标签）——全部替换；4 个含 `isSwarmStudioEventType` 标识符引用的文件（task-protocol/protocol/team-registry/task-dispatch）**整组跳过**（纯代码引用零散文）。
- 现行工具与档案面追加：simharness/mux 报告生成器族（报告 H1/叙事文案）、simharness/skills/pm-planning、runtime/ 散文与 manifest、team/skills 全量、team/profiles/_shared 契约文档散文、orchestrator SOUL.md、scripts/plan-html/render.sh（8667 方案页标题）、scripts/inject.mjs 运行消息、diagram profile 正文与 PROVENANCE、skills/swarm-yuan usage-manual 与 generate-skill.sh、docs/comm-collab-v13-research、zcode-3123 两份基准文档、absorption-domain-README。
- 追加保留（定性）：`team/profiles/orchestrator/references/hermes-complete-design-doc.md`（历史正本镜像）；`skills/swarm-yuan/docs/design-evolution.md` 等 R 编号决策史；`.swarm-yuan/notes/`（时间戳工作笔记）；README/USAGE 中《SwarmStudio 完整设计文档》书名引用（文件名与正本标题不改写）；ia-shell-header 守卫两行断言本身（拦旧名是它的职责）。
