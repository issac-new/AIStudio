# AIStudio 技术组件调研台账（历史档案）

> 退役指针（2026-10-28）：现行唯一正本已迁至
> [技术组件台账终态单文件](../../team/shared/research/tech-components-ledger-20261027/tech-components-ledger.md)。
> 本文件保留 2026-10-27 立账原文供反查，不再更新；判级与待办以终态单文件为准。
> 2026-10-31 补：2026-10-30 曾在本文件追加的 HelixHarness 行已迁入终态表 §3.2，本文件恢复冻结态。
> 原阅读顺序：当前状态 → 当前待办 → 组件主账 → 技能与知识来源 → 历史索引。

## 0. 使用与维护

本台账登记 AIStudio 历史调研过的外部组件、参考实现、协议标准、技能来源和方法论来源。正文只保留当前事实与未决事项。每轮工作过程放入对应 spec，不在这里堆流水。

### 三份账的分工

| 账本 | 管什么 | 本台账的关系 |
|---|---|---|
| `vendor/VENDOR.md` | 三棵 vendor 树的钉版 commit、升级流程 | 本台账记录调研与差异；钉版以它为准 |
| 本文件 | 组件版本、能力差异、AIStudio 用途、未决事项 | **历史反查，不再维护**（终态单文件见 `team/shared/research/tech-components-ledger-20261027/tech-components-ledger.md`） |
| `skills/swarm-yuan/references/capability-map.md` | 技能域 56 档文档与 22 个运行时的实施对账 | 技能域清单在本台账可见；实施对账以它为准（G25 机器执法） |

### 维护规则

1. 每轮调研、升级、吸收后更新对应行。未决事项只放 §2，完成事项移到 §6。
2. 版本号必须来自官方 release/tag/npm 页面或本地 `git fetch` 实测。未发版的 main/canary 不算稳定升级。
3. 证据写官方 URL、commit、spec 或 `file:line`。未核实的写“未核实”，不得推断补齐。
4. 同一来源可服务多个用途，按类别登记，不强行做跨口径总数加总。

## 1. 当前状态

截至 2026-10-27，三棵基线树都没有新稳定发版：studio 仍为 v0.7.39，agent 仍为 v0.22.5，zcode 与 origin/main 持平。两棵树有未发版 main 移动，已完成主题级预研，见 §3.1。

本轮核对覆盖 14 棵 upstream 树和 16 项官方源。变化较大的两项是 quality-gate v1.31.1→v2.0.0（新增 AsyncAPI 事件契约核验）与 mimo-code 0.1.16（compose 改为六段流），见 §3.4。

| 当前分类 | 内容 | 去向 |
|---|---|---|
| 基线与运行时 | 3 棵 vendor 树、2 个 runtime pin、7 项协议标准 | §3.1、§3.3、§3.6 |
| 参照与产品 | 11 棵参照树、7 个无本地树开源组件、6 个闭源产品 | §3.2、§3.4、§3.5 |
| 技能与知识 | 技能运行时、team/skills 来源、标准规范、方法论来源 | §4 |
| 文章与论文 | 31 轮调研、36 篇文章/报告、3 个公众号 295 篇语料 | §5 |

## 2. 当前待办与触发条件

这里只列仍需执行或等待条件的事项。已完成事项见 §6.1，不再重复列为待办。

| 事项 | 当前状态 | 触发条件与下一步 | 证据 |
|---|---|---|---|
| hermes-studio 升级轮 | 阻塞：最新 tag 仍 v0.7.39，main 有 28 个未发版提交 | 新稳定 tag 发布后走 vendor:sync 与五门验证；浏览器工具族优先评估 | §3.1 |
| hermes-agent 升级轮 | 阻塞：最新稳定仍 v0.22.5，main 有 1852 个未发版提交，只有每日 canary | 新稳定版发布后升级；重点评估 A2A 加固与 unbroker lane | §3.1 |
| swarm-eval 主链实验 | 轻链路已跑；主链级数值仍缺 | 需要专门 SIM run 窗口，执行每角色消融 criticality 与注入 BCR/暴露窗读数 | `2026-10-27-ledger-todos-clearance.md` |
| wx 系列其余挂账 | 未清偿 | Action 执行运行时、权限即上下文注入、独立 BadCase 库、判据突变验证门禁等，按正本 §9.2 分批 | `2026-10-23-swarmstudio-integrated-design.md` |
| 五文轮 P1b/P3-P6 | 未清偿 | P4 依赖远程 embedding，与零依赖纪律冲突，先裁定再实施 | `2026-10-06-five-article-research-and-capability-plan.md` |

### 条件触发而非当前待办

- quality-gate scope:event：仓内暂无 AsyncAPI 事件契约场景，暂缓。出现场景后再立项对译上游 172 行实现。
- semantica/pua/fibo：本轮 pin 均零移动，维持现 pin，下轮核对时顺查。
- 明确不做：音视频、spaces、Tauri、容器沙箱、主会话 append-only、Jev-Omni。tmall 首响 P90 属 hermes-agent 运行时，overlay 不可达。

## 3. 组件主账

状态口径：**参考实现**＝只读对照，不是运行依赖。**已吸收**＝能力已落到 custom/patches/技能。**pin**＝runtime 固定版本，不随调研自动升级。

### 3.1 基线三树

| 树 | AIStudio 基线 | 最新核实 | 未发版差异与下一步 |
|---|---|---|---|
| hermes-studio | v0.7.39 @8f215f59d（tag 2026-10-23） | 最新 tag 仍 v0.7.39；main 领先 28 提交（tip 650982cc5） | 浏览器弹窗/iframe/真实鼠标/拖拽/文件上下传不落盘/网络记录；desktop 设备窗口复用与存储隔离；任务手工状态与关闭目标；MiniMax M3.1 Flash 偏好；CJK 斜杠参数分隔；Claude 指令跨 prompt 刷新保留。v1.0.x tag 线（v1.0.0 2026-08-16→v1.0.8 2026-10-19）实测为 v0.7.39 祖先，已含于基线。 |
| hermes-agent | v0.22.5 @bf0203a794（tag 2026-10-22） | 最新稳定仍 v0.22.5（GitHub Latest 交叉确认）；main 领先 1852 提交 | A2A 服务加固（拒绝浏览器源 POST/非回环 Host、loopback 字面量、token 模式 Host 校验）；unbroker 垃圾电话下架 lane；plugin-catalog pin 治理；desktop i18n/chat 修复。main 提交分布：fix 845/chore 370/test 161/feat 123/refactor 71。上游 curated notes 推迟至 v0.23.0。 |
| zcode | @3c5b2276（pkg 3.16.2，2026-10-20 sync；装机 3.16.2 build 8769） | origin/main 持平 @3c5b2276 | 零移动；下次按“跟 main”政策 fetch 复核。 |

### 3.2 参照树（upstream/ 缓存）

| 组件 | 上次调研 → 最新核实 | 主要差异 | AIStudio 状态 |
|---|---|---|---|
| claude-code | v2.1.310（2026-10-23）→ v2.1.311（2026-10-26） | self-hosted-runner 新增 --hold-idle-file/--max-hold-min；标准会话超 200K 自动压缩续跑；子代理可用迟连接完成的 MCP 工具；Write/Edit 大文件停顿与 SubagentStop hook 误跑修复 | 参考实现；审批语义/diff 旁栏已吸收，代码零拷贝 |
| codex | rust-v0.164.0（2026-10-22）→ CLI npm latest 0.164.0（2026-10-23）；main 领先 214 提交 | /presets 十槽；TUI 安全阻断给回合级申诉与更安全改写；模型目录细粒度审批模板；失败子代理不再误标任务；会话索引跨进程串行化 | 参考实现 |
| kimi-code | 2.1.1-81-g7ccac2b45（2026-10-23）→ 2.1.1-104-g78b72fe45（2026-10-27）；发版线 2.3.3 | 导入 Claude Code/Codex 会话；审批与提问推送为交互框架；MCP 传输后自动重连；TUI OSC 7501 与全屏 dock；独立 dev 发布通道 | 参考实现；steer/queue/goal 已吸收 |
| minimax-code | v0.6.3-21-gda22f11（pkg 0.6.5）→ 持平 | 无 | 参考实现；History 浏览器/rewind 已吸收 |
| deepseek-harness | dsh-v0.2.1-rc.3-1533-g22ddee3792 → 持平 | 无 | 参考实现 |
| dsh-TUI | v0.17.0（2026-10-24）→ v0.17.0+4-g339de231（2026-10-27） | @ 补全与附件展开 ~/ 路径；插件授权贯穿生命周期；todo 侧栏滚动；采纳官方 Git worktree 实验插件 | 参考实现；Trajectory 已吸收 |
| dsh-context | v0.75.1-8-g5742e67（2026-10-25）→ v0.77.0（2026-10-26） | Fleet 通信枢纽重建为自动频道驾驶舱；context 卡重建为四道会话台账；stats 板重组；命令接 shiki 高亮；find 匹配跨文本节点 | 已吸收·自实现；P1-P4 Context 页已落，Fleet 形态可作参考 |
| element-web | v1.12.32（2026-10-16）→ v1.12.32（develop 领先 147 个未发版提交） | 无新稳定版 | 仅参照不入仓；patch 008/667/693/694 挂载面 |
| fibo | master_2026Q3 @2d73435a → 持平 | 无 | 已吸收；ontology-fibo.ts 37 概念单一事实源 |
| multica | v0.7.0-1-g3de79cbea（2026-10-24）→ v0.7.0-48-gb8306f975（2026-10-27） | issues 大纲增总览与子 issue；Gantt 分页全量加载；移动 web 适配；Claude resume 保住逐 run 用量；Qoder Cloud Agents/Bedrock 定价；GA opt-in | 参考实现；用量排行/live-peek 已吸收 |
| routa | 9dc7b7be（2026-10-14）→ 持平 | 无 | 参考实现＋局部吸收；requiredArtifacts 已落 |

### 3.3 外部受管运行时镜像

| 组件 | pin | 最新核实 | AIStudio 状态 |
|---|---|---|---|
| semantica | v0.7.0（`runtime/semantica/manifest.yaml`） | v0.7.0 持平（GitHub releases 与 PyPI 交叉一致） | stdio MCP 目录经 patch 375 挂 optional-mcps/ |
| pua | @e6e6cd2（`runtime/pua/PIN.yaml`） | v3.5.1@e6e6cd2 持平，仍是 main HEAD | skills.external_dirs 只读挂载 |

### 3.4 无本地树开源组件

| 组件 | 上次调研 → 最新核实 | 主要差异与处置 | AIStudio 状态 |
|---|---|---|---|
| quality-gate（lazyzhsh） | v1.31.1 → v2.0.0（2026-10-08/09，commit 86f5e8d） | 唯一功能增量为 scope:event：AsyncAPI 3.0.x 子集核验（消息方向/通道/载荷约束，越界 ERROR）；回归 692/692，较 1.31.1 增 14 项。裁定暂缓：仓内无 AsyncAPI 场景；交付工具链加固属上游私有流程，不并入 | custom/qgate 本地 0.1.0 分叉 |
| HarnessPro（pzs19） | main@2026-10-19 → 持平（仍单 commit 8ae622e） | 无 | 已吸收；十一坑双文轮 |
| REA-Prompts（JoasASantos） | 2026-10-25（23 场景/26 技能包）→ main@ccb02b8（2026-10-26） | 新增 MIT License，结构未变 | 已吸收；rea-reverse-engineering v1.2.0 全 fleet 生效 |
| diagram-design（cathrynlavery） | v2.6.110 @550fd66 → 2.6.131（2026-10-26，以 commit bump 为准） | 21 个 patch 均为修复：mermaid-import、draw.io 尖括号、Excalidraw 外层组、svg-only 排除规则等；无新机制 | 技能已吸收 v2.6.110，不升级；runtime 镜像见 §4.1 |
| agent-governance-toolkit（微软） | v4.1.0（调研日 2026-10-21）→ v4.1.0 持平 | 官方发布日为 2026-06-09；此前“10-21 发布”实为调研日 | 部分吸收；A-F 六件＋MCP 扫描 |
| Anthropic-Cybersecurity-Skills（mukul975） | 571 净增技能索引 → 上游 817/818（页面两数不一致；main 最后提交 2026-08-31） | 571 与 818 是同一快照的净增/总数两口径；我方融合日 2026-10-12 晚于上游 HEAD，改判无需刷新 | 索引技能＋hack-team 消费 |
| mimo-code（npm @mimo-ai/cli） | 456678b（2026-09-24）→ 0.1.16（2026-10-26） | legacy compose 退役，改 /compose-next 六段流；MCP 会话级懒加载；npm 薄启动器；实验 Orchestrator 移除；Claude 会话导入改启动时 opt-in | 已吸收；第 8 个托管 Agent＋LSP/FIFO 栅栏；六段流作范式参考 |

### 3.5 闭源/商业产品

| 产品 | 上次调研 → 最新核实 | 主要差异 |
|---|---|---|
| OpenAI Codex CLI | 0.163.0（2026-10-15）→ 0.164.0（2026-10-23） | /presets 十槽；企业 MCP 认证与 Bedrock 向导默认启用；终端图片预览；压缩失败不残留半截摘要 |
| ChatGPT 桌面 | 26.1007（2026-10-08）→ 26.1021.x（2026-10-24；官方不公布 build 号，第三方收录站口径） | Slides 创建/编辑/导出 PowerPoint；Locked chats；GPT-6.1 Terra 上线 Work 与 Codex |
| Google Antigravity | App 2.24.0 / CLI 1.4.0 → App 2.26.0（2026-10-22）/ CLI 1.4.8（2026-10-27） | App：通知设置、提问/权限弹窗停靠输入框上方；CLI：/diff 大仓库提速、hooks 经 stdin 读 lastUserInput、沙箱默认禁读 ~/.docker/~/.kube/~/_netrc |
| Qoder（阿里） | 0.4.8（2026-10-15）→ 0.4.11（2026-10-23） | 企业微信内对话与任务协作；视频生成与 MP4/WebM 预览；Linux ARM64；模型列表分组与繁忙标识 |
| 腾讯 WorkBuddy / CodeBuddy IDE | 5.8.2 / 版本未公布 → 5.9.2（2026-10-26）/ IDE 4.12.2（2026-10-14） | WorkBuddy：文件浏览器新窗口、跨设备导入任务、语音识别终稿回填；IDE：上下文长度档位、超长工具输出截断落盘可回读 |
| Anthropic Claude Code | v2.1.310（2026-10-23）→ v2.1.311（2026-10-26） | 同 §3.2 claude-code；ultrathink 在 Opus/Sonnet/Haiku 5.5 跑 xhigh effort |

### 3.6 协议与标准

| 协议/标准 | 当前锚点 | AIStudio 状态 |
|---|---|---|
| Zcode Protocol V4 | 3.15.1=37 方法；3.16.1=+7 新方法零删除；48 RPC 服务频道（`2026-10-21-zcode-3161-baseline-upgrade.md` §1） | 已吸收；Ycode 引擎 |
| ACP | JSON-RPC over stdio；Ycode 桥 zcode-acp-server；2026-10-26 客户端加固 | 已吸收 |
| A2A | hermes-agent 上游适配器（端口 9900，token fail-closed）；上游 main 未发版加固预研在案 | 已吸收；随 agent 升级轮跟进 |
| MCP | @modelcontextprotocol/client ^2.0.0；optional-mcps 66/67；安全扫描＋漂移门 | 已吸收 |
| Matrix / Synapse | matrix-js-sdk ^41.8.0-rc.0；Synapse 1.154.0（本机） | 已吸收；通信基座 |
| FIBO | master_2026Q3 @2d73435a；37 概念/21 属性/16 公理，ontology-fibo.ts 单一事实源 | 已吸收 |
| WCAG 对比度 | muted 对比度门（`2026-10-18-wcag-muted-contrast.md`） | 已吸收 |

### 3.7 差异吸收裁定（2026-10-27 逐项）

对 §3 里本轮有版本移动的组件逐项裁定：能落码的吸收，不能落码的写明理由与触发条件，避免"只了解不处置"。

| 差异 | 裁定 | 理由与触发条件 |
|---|---|---|
| kimi-code 2.3.3 导入 Claude Code/Codex 会话（#4342） | **已吸收（只读版）** | 新增 `custom/server/sessionarchive/external-cli-sessions.ts` 与 `GET /api/harness/external-sessions`：扫两源会话目录归一成索引，不搬正文、不写源目录。上游是内容导入，本仓只做索引，差异已声明。spec `2026-10-27-version-diff-absorption.md` |
| dsh-context 0.77 Fleet 通信驾驶舱与四道会话台账 | 暂缓 | 数据面已有（`tokens/fleet-tree.ts` 子树聚合、`tokens/context-trend.ts` 四桶趋势），缺的是界面形态。触发条件：Fleet/Context 页面改版时一并做 |
| mimo-code 0.1.16 `/compose-next` 六段流 | 不落码 | 与仓内 spec-first 九节点同构，属方法论参考；硬做会造第二套流程 |
| qgate v2.0 `scope:event`（AsyncAPI 3.0.x 子集核验） | 暂缓 | 仓内无事件契约消费者，无验收面。触发条件：出现 AsyncAPI/事件契约场景时对译上游 172 行零依赖实现 |
| claude-code 2.1.311（自动压缩续跑、MCP 迟连接、停滞修复） | 不适用 | 属 CLI 运行时行为，overlay 无接线点；随上游升级轮跟进 |
| codex 0.164（presets、安全阻断申诉、审批模板） | 不适用（记录在案） | 同上；`/presets` 若后续要做，先确认有 UI 承载再立项，不先造死端点 |
| kimi 2.3.3 其余（会话导入之外：MCP 重连、TUI 状态、子代理部分输出） | 不适用 | 运行时与 TUI 面 |
| multica 0.7.0（移动端适配、Gantt 分页全量） | 不适用 | 仓内无移动端与 Gantt 视图 |
| diagram-design 2.6.131 | 不升级 | 21 个 patch 全为修复类，无新机制；物化镜像版本口径单列在 §4.1 |
| hermes-studio main 未发版（浏览器工具族等） | 等发版 | 属基线升级轮内容，见 §2 第一行 |
| hermes-agent main 未发版（A2A 加固、unbroker lane） | 等发版 | 同上，见 §2 第二行 |

## 4. 技能与知识来源

本节是清单层，保证 swarm-yuan 调研来源可检索。实施对账仍以 `capability-map.md` 为准。证据分级沿用其口径：A=本机实测，B=官方一手，C=二手转述（不进基线）。

### 4.1 深度/物化运行时（12 项）

统一证据：`capability-map.md` §二、§三。

| 组件 | 来源/版本 | 集成形态与用途 |
|---|---|---|
| GitNexus | github.com/Aleksiori/GitNexus（B） | 深度×4；探查图谱优先（code-graph-tools 三选型之一） |
| graphify | 本仓 skills/swarm-yuan 域内（A） | 深度×4；图谱工具族 |
| codegraph | 调研选型（A） | watch 备选；未装降级静态扫描 |
| claude-mem | github.com/dingjan/claude-mem（A） | 深度×4；Step 12 记忆写回后端，经 memory-backends.sh 注册 |
| ocr | 本地 OCR 工具（A） | 深度×4；测试验证第 5 审查维度，未装降 4 维 |
| OpenSpec | github.com/Fission-AI/OpenSpec（B） | CLI×6；节点②③ spec proposal/tasks 格式 |
| comet | 本仓 comet 技能族（A） | CLI×6；工作流骨架仪式/resume-probe，未装降 state-machine.sh |
| gsd-core | gsd 系列（A） | CLI×6；计划验证/STATE 戳模式 |
| codex-security | github.com/openai/codex-security（A） | CLI×6；安全扫描门禁子进程 |
| mattpocock-skills | github.com/mattpocock/skills v1.2.3（A） | `skills/swarm-yuan/runtime/mattpocock-skills/` 27 技能整镜像；探查访谈/领域建模/调研/原型/retro |
| ponytail | 蒸馏源（A） | 机制源×7；lazy-generation 档，编码七层下探 |
| pi | Pi 1.0（九源调研，B） | 机制源×7；机制参考 |

补充事实：diagram-design 物化镜像版本真值为 v2.6.120（`skills/swarm-yuan/runtime/diagram-design/MANIFEST.md`）。它与 facts.conf 的 `FACT_DIAGRAM_DESIGN_VERSION=2.6.120` 一致，比产品面吸收的 v2.6.110 新一档。修复类无新机制，不触发技能升级。superpowers/gstack/ECC/Ruflo/impeccable（pbakaus/impeccable，B）为纯文档方法论引用，无运行时依赖。

### 4.2 team/skills 融合技能的第三方源（6 项）

| 技能 | 上游源 | 用途与证据 |
|---|---|---|
| computer-use | github.com/trycua/cua（cua-driver） | 计算机操作底座；studio 依赖 @trycua/cua-driver 0.35.4 同源；`team/skills/computer-use/SKILL.md` |
| skill-self-evolution-fusion | github.com/openJiuwen-ai/jiuwenswarm（Apache-2.0，Symphony 引擎） | 动态 overlay＋experience bank＋5D 评估；`team/skills/skill-self-evolution-fusion/SKILL.md` |
| remotion | Remotion（经 skills-sh/google-labs-code/stitch-skills 渠道） | HTML 合成视频；`team/skills/remotion/SKILL.md` |
| prompt-as-model-adapter | 微信公众号「Vibe编码」《Opus 4.8 删掉了 73% 的提示词…》（2026-07-27） | 提示词即模型适配器；`team/skills/prompt-as-model-adapter/SKILL.md` |
| minimax-image-to-video / grok-image-to-video | MiniMax / Grok 模型 API | 图生视频通道；`team/skills/` 对应目录 |
| wechat-article-search / extractor | 微信公众平台通道（自研封装） | 公众号语料检索/提取；`team/skills/` 对应目录 |

### 4.3 标准与规范

统一证据：`capability-map.md` 族⑤及来源列。

| 来源 | 在 AIStudio 的用途 |
|---|---|
| GB/T 42588 | AI 服务成本度量，cost-estimation 档 |
| GB/T 39786 | 密码应用，crypto 门禁 |
| GB/T 8566 | 软件生存周期，trace/decisions 留痕口径 |
| GB/T 25000 系列 | SQuaRE 合规矩阵 |
| ISO 9001 / CMMI | 质量认证映射 |
| OWASP / STRIDE / CWE 视图 799 | security 门禁与 cwe_audit |
| 等级保护 / PCI-DSS 等 | security-certification-profiles |
| ASD-STE100 | 受控语言规范，controlled-language 与 gongwen-bifa 保真契约 |
| TOGAF BDAT 元模型（The Open Group） | 架构探查四层视角 |
| 行业法规七档 | 金融/政务/医疗/电信/汽车/能源/工控/支付，--industry 立法 |
| 执法检查底稿 | 主表 173 条经原文核实，inspection-ledger 数据正本 |

### 4.4 方法论、论文与文章源

| 来源 | 用途与证据 |
|---|---|
| addyosmani/agent-skills | 反借口/Prove-It（B） |
| Kahneman 认知偏差框架 | cognitive-bias 档 |
| 工程控制论等四源 | four-theories 档；R17/R18 轮深读 |
| AMAP LongHorizon-Harness | mea-loop 长任务审计 |
| 京东海博知识管理文章＋OKF 核验 | knowledge-lifecycle 档 |
| 行者明灵文章 | lazy-generation 联合来源 |
| Anthropic 官方文档 | context-engineering 分层 |
| 清华 RSI 404 篇综述＋D2I-ai＋字节三论文 | rsi-evidence 档 |
| Palantir 映射 | R11 轮档 |
| HarnessEval | R15 吸收轮 |
| better-harness | R14 吸收轮 |

补充：用户级 `~/.zcode/AGENTS.md` §5 验证门禁七条源自 agentpay 项目 69 轮回归实践，属于外部项目经验迁移，不是仓内调研。技能域轮档全集为 `skills/swarm-yuan/docs/research/` 103 份（R1-R142）。

## 5. 文章与论文调研系列

31 轮、36 篇文章/报告、3 个公众号 295 篇语料的总纲在整合正本 §7.7。逐轮明细见附录 A spec 索引。本节只保留已吸收能力地图，未决事项统一放 §2。

- 评测体系：美团 M1-M4、腾讯七面、百度六面＋红队、京东采集器族。
- 机制吸收：四源文 12/12、六文 A-H3、RRSI 七机制、HarnessPro 七机制、AGT 六件、trust 四机制、diagram 六件套。
- 协同与画像：阿里 15-Agent 六件、群体协作四维读数、数据飞轮、天猫四件套。另有 Qoder 两轴、JoyAI 四处断链＋三轮清偿、三公众号六项。

证据：`2026-10-23-swarmstudio-integrated-design.md` §7.7。另见 `2026-10-21-swarmstudio-appendix-a-spec-index.md`。

## 6. 历史索引与维护边界

### 6.1 2026-10-27 已完成事项

- 版本核对与四挂账清偿：callgate 执法、taskledger 接线、红队 S1、A2A 看板归属端点。spec `2026-10-27-tech-component-ledger-refresh.md`。
- 七项待办终态：qgate v2.0 调研完成并暂缓，CyberSec 改判无需刷新。RELEASE-NOTES 三轮补记及 2.x 收线，semantica/pua/fibo pin 零移动。
- swarm-eval 轻链路三跑完成。两个升级轮仍按 §2 等待稳定发版。spec `2026-10-27-ledger-todos-clearance.md`。
- 版本差异吸收第一批：外部 CLI 会话索引（kimi 2.3.3 #4342 的只读版）落地，其余 8 项差异逐项裁定入 §3.7。spec `2026-10-27-version-diff-absorption.md`。
- 会话索引边界闭合（同日第二批）：Codex `.jsonl.zst` 就地解压（Node 22+ 内置 zstd，缺失时如实降级）；单文件上限 8MB→32MB 且可注入，解压后二次限流。
- swarm-eval 轻链路实测：mixed-motive 两轮（welfare=480/gini=0.333/nashDev=0.667，保底出价口径）。消融 mention 过滤留痕，拜占庭 noise DM 实发留痕。主链级数字仍在 §2。

### 6.2 关联文档

- `docs/absorption-domain-README.md`：吸收实施事实索引，组件版本指引已指向本台账。
- `docs/upstream-analysis/2026-10-18-latest-coding-tools-matrix.md`：2026-10-18 历史快照，已由本台账接替，不随版本更新。
- `vendor/VENDOR.md`：基线钉版与升级流程。
- `skills/swarm-yuan/references/capability-map.md`：技能域实施对账正本。
- `docs/superpowers/specs/2026-10-27-tech-component-ledger-refresh.md`、`2026-10-27-ledger-todos-clearance.md`：本轮调研与清偿的完整过程、验证和决策记录。
