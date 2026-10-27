# AIStudio 技术组件调研台账（正本）

本台账是全部历史调研外部技术组件的唯一合并账。每项记录五个字段：上次调研版本、本轮最新核实、能力差异、仓内现状、后续动作，证据锚点可解析。与两份既有账的分界：vendor 钉版基线以 `vendor/VENDOR.md` 为准，swarm-yuan 技能域吸收账以 `skills/swarm-yuan/references/capability-map.md` 为准。本台账管其余全部（参照树、外部产品、开源组件、协议标准、文章方法论系列）。

更新纪律：每轮调研、升级、吸收随批修订对应行。版本号必须来自官方页面或本地 git 实测（fetch 后 describe），不得推断。日期一律绝对日期。

- 本轮全面核对：2026-10-27（本地 14 棵 upstream 树 fetch 实测＋16 项官方源 web 核对）；同日二次复核（待办清偿轮：三基线树与三 pin 重核，结论未变）
- 总条目：46＋技能域补录（§10：swarm-yuan 技能域第三方运行时/组件/标准/方法论源，2026-10-27 用户指令补录）

## 1. 结论速览

三棵 vendor 基线树均无新稳定发版，本轮升级批未触发。逐树核实结果：

- hermes-studio：最新 tag 仍是所钉 v0.7.39，main 领先 28 个未发版提交。
- hermes-agent：最新稳定仍是 v0.22.5（GitHub Latest 交叉确认），其后仅每日 canary，main 领先 1852 个提交。
- zcode：与 origin/main 持平，零移动。

两棵树的未发版移动已完成主题级预研（§2），发版后即可启动升级轮。

有新版本的组件共 9 个。其中 quality-gate 跨大版本（v1.31.1→v2.0.0，新增 AsyncAPI 3.0.x 事件契约核验）与 mimo-code（0.1.16，compose 智能体全面换血为 /compose-next 六段流）差异最大，其余多为修复与小步增强（§3、§5）。旧挂账本轮清偿四项：callgate 执法、taskledger 接线、红队 S1、A2A 看板归属端点。swarm-eval 数值 run 仍挂账（§9）。

## 2. 基线三树（vendor 钉版）

| 树 | 钉版 | 本轮核实 | 移动 | 未发版差异要点（主题级预研） | 后续动作 |
|---|---|---|---|---|---|
| hermes-studio | v0.7.39 @8f215f59d（tag 2026-10-23） | 最新 tag 仍 v0.7.39；main 领先 28 提交（tip 650982cc5，未发版） | 无新稳定版 | 浏览器工具族增强（弹窗/iframe/真实鼠标/拖拽/文件上下传不落盘/网络记录，#3522/#3523）；desktop 设备窗口复用与存储隔离（#3515/#3521）；任务手工状态变更与关闭目标（#3535）；MiniMax M3.1 Flash 文本模型偏好（#3476）；CJK 标点作斜杠命令参数分隔（#3484）；Claude 指令跨 prompt 刷新保留（#3553）。v1.0.x tag 线（v1.0.0 2026-08-16 → v1.0.8 2026-10-19）经实测是 v0.7.39 的祖先，已含于钉版 | v0.7.40 发布后启动升级轮（浏览器工具族与我们 ia2/走查面最相关） |
| hermes-agent | v0.22.5 @bf0203a794（tag 2026-10-22） | 最新稳定仍 v0.22.5（GitHub Latest 交叉确认）；main 领先 1852 提交（fix 845/chore 370/test 161/feat 123/refactor 71）；其后仅每日 canary tag | 无新稳定版 | A2A 服务加固系列（拒绝浏览器源 POST/非回环 Host、loopback 字面量、token 模式 Host 校验，带测试）；unbroker 垃圾电话下架 lane（电话主导 run＋DNC 一次性动作，主题量最大）；plugin-catalog pin 治理（kinocut 多次 repin）；desktop i18n 与 chat 修复。上游自述 curated notes 推迟至 v0.23.0 | v0.22.6/v0.23.0 发布后启动升级轮（A2A 加固与我们 a2a 域直接相关） |
| zcode | @3c5b2276（pkg 3.16.2，2026-10-20 sync；装机 3.16.2 build 8769） | origin/main 持平 @3c5b2276 | 零移动 | 无 | 无（下次按「跟 main」政策 fetch 复核） |

## 3. 参照树（upstream/ 缓存，本轮已同步检出）

| 组件 | 上次调研 | 本轮最新 | 差异要点 | 仓内现状 |
|---|---|---|---|---|
| claude-code | v2.1.310（2026-10-23 检出） | v2.1.311（2026-10-26） | self-hosted-runner 新增 --hold-idle-file/--max-hold-min；标准会话超 200K 自动压缩续跑（不再误报 Usage credits）；子代理可用迟连接完成的 MCP 工具；Write/Edit 千行大文件 5 秒停顿修复；SubagentStop hook 每子代理约每半分钟误跑修复。修复为主 | 仅调研·范式吸收（审批语义/diff 旁栏已落；代码零拷贝） |
| codex | rust-v0.164.0（2026-10-22 检出；稳定 tag 持平，新 tag 仅 0.165/0.166 alpha） | CLI npm latest 0.164.0（2026-10-23）；main 领先 214 提交 | /presets 十槽可复用提示；TUI 安全阻断给回合级申诉通道与更安全改写建议；模型目录新增细粒度审批模板字段；失败子代理不再把任务标记为需关注；会话索引跨进程串行化 | 仅调研·范式吸收 |
| kimi-code | 2.1.1-81-g7ccac2b45（2026-10-23） | 2.1.1-104-g78b72fe45（2026-10-27）；发版线 2.3.3（2026-10-26） | 导入 Claude Code 与 Codex 会话（#4342）；审批与提问推送为交互框架；MCP 传输后自动重连；TUI OSC 7501 程序状态、全屏 dock；独立 dev 发布通道 | 仅调研·范式吸收（steer/queue/goal 已吸收） |
| minimax-code | v0.6.3-21-gda22f11（pkg 0.6.5） | 持平 | 无 | 仅调研·范式吸收（History 浏览器/rewind 已落） |
| deepseek-harness | dsh-v0.2.1-rc.3-1533-g22ddee3792 | 持平 | 无 | 仅调研·范式吸收 |
| dsh-TUI | v0.17.0（2026-10-24） | v0.17.0+4-g339de231（2026-10-27） | @ 补全与附件展开 ~/ 路径；插件授权贯穿插件生命周期；todo 侧栏滚动；采纳官方 Git worktree 实验插件 | 仅调研·范式吸收（Trajectory 已落） |
| dsh-context | v0.75.1-8-g5742e67（2026-10-25） | v0.77.0（2026-10-26） | Fleet 通信枢纽重建为自动频道驾驶舱（comms hub cockpit）；context 卡重建为四道会话台账；stats 板重组、Fleet 行可点入；命令文本接 harness shiki 高亮；find 匹配跨文本节点 | 已吸收·自实现（P1-P4 会话内 Context 页已落；Fleet 驾驶舱形态可作后续参考） |
| element-web | v1.12.32（2026-10-16 检出） | v1.12.32（develop 领先 147 个未发版提交） | 无新稳定版 | 仅参照不入仓（patch 008/667/693/694 挂载面） |
| fibo | master_2026Q3 @2d73435a | 持平 | 无 | 已吸收（ontology-fibo.ts 37 概念单一事实源） |
| multica | v0.7.0-1-g3de79cbea（2026-10-24） | v0.7.0-48-gb8306f975（2026-10-27） | issues 大纲新增总览与子 issue；Gantt 服务端分页时全量加载；移动 web 适配 iPhone Duo；Claude resume 基线捕获保住逐 run 用量；运行时定价覆盖 Qoder Cloud Agents 与 Bedrock Anthropic id；GA 分析 opt-in | 仅调研·范式吸收（用量排行/live-peek 已落） |
| routa | 9dc7b7be（2026-10-14） | 持平 | 无 | 仅调研＋局部吸收（requiredArtifacts 已落） |

## 4. 外部受管运行时镜像（runtime/ pin，不随批升级）

| 组件 | pin | 本轮核实 | 仓内现状 |
|---|---|---|---|
| semantica | v0.7.0（runtime/semantica/manifest.yaml） | v0.7.0 持平（GitHub releases 与 PyPI 交叉一致） | stdio MCP 目录经 patch 375 挂 optional-mcps/ |
| pua | @e6e6cd2（runtime/pua/PIN.yaml） | v3.5.1@e6e6cd2 持平（仍是 main HEAD） | skills.external_dirs 只读挂载 |

## 5. 无本地树开源组件（web 官方源核对）

| 组件 | 上次调研 | 本轮最新 | 差异要点 | 仓内现状与后续 |
|---|---|---|---|---|
| quality-gate（lazyzhsh） | v1.31.1（2026-10-06/08 两轮） | **v2.0.0**（2026-10-08/09，commit 86f5e8d） | v2.0 需求终审（ADR-0017，L3.5 按现有边界达成）；alignment 新增 scope:event，直接核验 AsyncAPI 3.0.x JSON 子集（消息方向/通道/载荷约束，越界报 ERROR）；全量回归 692/692（较 1.31.1 新增 14 项） | custom/qgate 本地 0.1.0 分叉线；v2.0 增量调研已完成（2026-10-27，源码级）：唯一功能增量=scope:event（AsyncAPI 3.0.x 子集核验，上游 172 行零依赖实现）；**裁定暂缓**——仓内无 AsyncAPI 事件契约场景，无消费方即无验收面，出现场景再立项对译；交付工具链加固（build_delivery）属上游私有流程不并入 |
| HarnessPro（pzs19） | main@2026-10-19（单 commit 仓） | 持平（仍单 commit 8ae622e） | 无 | 已吸收（十一坑双文轮） |
| REA-Prompts（JoasASantos） | 2026-10-25（23 场景/26 技能包） | main@ccb02b8（2026-10-26 新增 MIT License） | 授权明确化；结构未变 | 已吸收（rea-reverse-engineering v1.2.0 全 fleet 生效） |
| diagram-design（cathrynlavery） | v2.6.110 @550fd66（2026-10-19） | 2.6.131（2026-10-26，无 tag 以 commit bump 为准） | 21 个 patch 全为修复类：mermaid-import 系列（autonumber/edge ID/config 计数）、import/export 边缘（draw.io 尖括号、Excalidraw 外层组、svg-only 排除规则） | 技能已吸收 v2.6.110；修复类无新机制，不升级技能 |
| agent-governance-toolkit（微软） | v4.1.0（调研日 2026-10-21） | v4.1.0 持平（官方发布日 2026-06-09，本行修正此前「10-21 发布」的口径混淆——那是我们的调研日） | 无 | 部分吸收（A-F 六件＋MCP 扫描） |
| Anthropic-Cybersecurity-Skills（mukul975） | 571 skills（2026-10 吸收索引） | 817/818 skills（页面两数不一致，如实双记；main 最后提交 2026-08-31） | 增量 246+ 技能：MITRE F3 映射、ATT&CK v19.1、GDPR 评估等 | 索引技能＋hack-team 消费；语料增量刷新列入待办（择期） |
| mimo-code（npm @mimo-ai/cli） | 456678b（2026-09-24，临时克隆） | 0.1.16（2026-10-26） | legacy compose 智能体/workflow 退役，改 /compose-next 六段流（clarify→spec→implement→verify→review→finish）；MCP 工具会话级懒加载＋后台连接；npm 包改薄启动器；实验 Orchestrator 移除、Claude 会话导入改启动时 opt-in | 已吸收（第 8 个托管 Agent＋LSP/FIFO 栅栏等）；compose-next 六段流与我们的 spec-first 工作流同构，作范式参考 |

## 6. 闭源/商业产品（web 官方源核对）

| 产品 | 上次调研 | 本轮最新 | 差异要点 |
|---|---|---|---|
| OpenAI Codex CLI | 0.163.0（2026-10-15） | 0.164.0（2026-10-23，npm latest 与开源仓 tag 一致） | /presets 十槽；企业 MCP 认证与 Bedrock 向导默认启用；终端图片预览（Kitty/Sixel）；压缩失败不再残留半截摘要 |
| ChatGPT 桌面 | 26.1007（2026-10-08） | 26.1021.x（2026-10-24；官方不公布 build 号，第三方收录站口径） | Slides 创建/编辑/导出 PowerPoint；Locked chats 锁定对话；GPT-6.1 Terra 上线 Work 与 Codex |
| Google Antigravity | App 2.24.0 / CLI 1.4.0（2026-10-15/16） | App 2.26.0（2026-10-22）/ CLI 1.4.8（2026-10-27） | App：通知设置、提问/权限弹窗停靠输入框上方；CLI：/diff 大仓库提速、hooks 可经 stdin 读 lastUserInput 拦截提示词、沙箱默认禁读 ~/.docker/~/.kube/~/_netrc |
| Qoder（阿里） | 0.4.8（2026-10-15） | 0.4.11（2026-10-23） | 企业微信内对话与任务协作；视频生成与 MP4/WebM 预览；Linux ARM64（麒麟/龙芯）；模型列表分组与繁忙标识 |
| 腾讯 WorkBuddy / CodeBuddy IDE | 5.8.2（2026-10-16）/ 版本未公布 | 5.9.2（2026-10-26）/ IDE 4.12.2（2026-10-14，官方已公布版本号） | WorkBuddy：文件浏览器新窗口、跨设备导入任务、语音识别终稿回填；IDE：上下文长度档位选择（200K/1M）、超长工具输出截断落盘可回读 |
| Anthropic Claude Code | v2.1.310（2026-10-23） | v2.1.311（2026-10-26，官方 CHANGELOG 与本地镜像仓一致） | 同 §3 claude-code 行；ultrathink 在 Opus/Sonnet/Haiku 5.5 跑 xhigh effort |

## 7. 协议与标准（版本锚点）

| 协议/标准 | 锚点 | 状态 |
|---|---|---|
| Zcode Protocol V4 | 3.15.1=37 方法；3.16.1=+7 新方法零删除（specs/2026-10-21-zcode-3161-baseline-upgrade.md §1）；48 RPC 服务频道 | 已吸收（Ycode 引擎） |
| ACP | JSON-RPC over stdio；Ycode 桥 zcode-acp-server；2026-10-26 客户端加固轮 | 已吸收 |
| A2A | hermes-agent 上游适配器（端口 9900，token fail-closed）；上游 main 未发版加固（回环/浏览器源拒绝）预研在案 | 已吸收；升级轮随 agent 版本走 |
| MCP | @modelcontextprotocol/client ^2.0.0；optional-mcps 66/67；安全扫描＋漂移门在位 | 已吸收 |
| Matrix / Synapse | matrix-js-sdk ^41.8.0-rc.0；Synapse 1.154.0（本机） | 已吸收（通信基座） |
| FIBO | master_2026Q3 @2d73435a（37 概念/21 属性/16 公理，ontology-fibo.ts 单一事实源） | 已吸收 |
| WCAG 对比度 | muted 对比度门（specs/2026-10-18-wcag-muted-contrast.md） | 已吸收 |

## 8. 文章/论文方法论系列（版本 N/A，状态与挂账指针）

31 轮、36 篇文章/报告、3 公众号 295 篇的总纲在整合正本 §7.7（`2026-10-23-swarmstudio-integrated-design.md`）。已落 main 的吸收面（压缩计 17 行，逐轮明细见附录 A spec 索引 `2026-10-21-swarmstudio-appendix-a-spec-index.md`）：

- 评测体系四套：美团 M1-M4、腾讯七面、百度六面＋红队、京东采集器族。
- 机制吸收：四源文 12/12、六文 A-H3、RRSI 七机制、HarnessPro 七机制、AGT 六件、trust 四机制、diagram 六件套。
- 协同与画像：阿里 15-Agent 六件、群体协作四维读数、数据飞轮、天猫四件套、Qoder 两轴、JoyAI 四处断链＋三轮清偿、三公众号六项。

挂账状态（正本 §9.2 点名项的本轮变动）：

- 已清偿（2026-10-27 本轮）四项：callgate 执法接线（wx #14）、taskledger 派发入口接线（wx #7）、红队 S1 裁判接线（京东评测挂账 #3）、A2A 看板归属产品面读模型端点。
- 仍挂账三项。swarm-eval 数值 run（消融每角色一轮、注入 run、mixed-motive 首跑）需 SIM 实例小时级窗口。wx 系列其余编号项（Action 执行运行时、权限即上下文注入、独立 BadCase 库、判据突变验证门禁等）处置见正本 §9.2。五文轮 P1b/P3-P6 中，P4 依赖远程 embedding，与零依赖纪律冲突，需先裁定。
- 明确不做（正本否决清单）：音视频、spaces、Tauri、容器沙箱、主会话 append-only、Jev-Omni。tmall 首响 P90 属 hermes-agent 运行时，overlay 不可达。

## 9. 待办与升级建议（2026-10-27 清偿轮终态）

1. **hermes-studio v0.7.40 升级轮**——仍阻塞：2026-10-27 两次复核最新 tag 均为 v0.7.39（main+28 未发版）。发版即启动，28 提交预研在 §2。
2. **hermes-agent v0.22.6/v0.23.0 升级轮**——仍阻塞：最新稳定仍 v0.22.5（main+1852 未发版，仅每日 canary）。发版即启动，主题预研在 §2。
3. **quality-gate v2.0.0 增量调研**——已完成（2026-10-27）：唯一功能增量 scope:event/AsyncAPI 3.0.x 子集核验（上游 172 行零依赖）；裁定**暂缓**（仓内无事件契约场景），出现场景再立项对译。
4. **swarm-eval 数值 run**——执行中（2026-10-27 清偿轮）：SIM 实例起跑＋mixed-motive/消融/注入 run，数字回填 spec。
5. **Anthropic-Cybersecurity-Skills 语料刷新**——**改判为无需刷新**：我方融合日 2026-10-12（git 2a5fa1cb7）晚于上游 main 最后提交 2026-08-31，571 净增数与 818 总数是同一快照的两口径；上游零移动，重扫无意义。（原待办系把两口径错对所致，如实修正。）
6. **RELEASE-NOTES 2.x 补档**——已完成（2026-10-27）：v0.7.32/0.7.34/0.7.35 三轮按 tag 日期＋specs 锚点补记（构建物与补丁计数未随轮留档，补记不虚构）；2.x 线以 2.37 收线，正式版本转 RELEASE-MANIFEST 四模块对账。
7. **semantica/pua/fibo pin 评估**——已完成（2026-10-27）：三 pin 全部零移动（semantica v0.7.0 最新 release/pua e6e6cd2 仍 main HEAD/fibo master_2026Q3 持平），维持现 pin。

## 10. swarm-yuan 技能域第三方组件与技能（2026-10-27 用户指令补录）

分界：本节是**清单层**——技能域调研的全部第三方来源在此可见；实施对账正本仍是 `skills/swarm-yuan/references/capability-map.md`（56 档文档＋22 上游运行时，G25 双向一致性机器执法），两表互链不合并。来源证据分级 A/B/C 沿用 capability-map 口径（A=本机实测；B=官方一手；C=二手转述不进基线）。

### 10.1 深度/物化运行时（capability-map §三，净新增 12 项）

| 组件 | 上游 | 集成形态 | 用途 | 证据 |
|---|---|---|---|---|
| GitNexus | github.com/Aleksiori/GitNexus（B） | 深度×4 运行时 | 探查图谱优先（code-graph-tools 三选型之一） | capability-map.md §三 |
| graphify | 本仓 skills/swarm-yuan 域内（A） | 深度×4 运行时 | 同上（图谱工具族） | 同上 |
| codegraph | 调研选型（A） | watch 备选 | 图谱工具第三候选（未装降级静态扫描） | 同上 |
| claude-mem | github.com/dingjan/claude-mem（A） | 深度×4 运行时 | Step 12 记忆写回后端（memory-backends.sh 适配层注册） | 同上 |
| ocr | 本地 OCR 工具（A） | 深度×4 运行时 | ⑥ 测试验证第 5 审查维度（未装降 4 维） | 同上 |
| OpenSpec | github.com/Fission-AI/OpenSpec（B） | CLI×6 | 节点②③ spec proposal/tasks 格式 | 同上 |
| comet | 本仓 comet 技能族（A） | CLI×6 | 工作流骨架仪式/resume-probe（未装降 state-machine.sh） | 同上 |
| gsd-core | gsd 系列（A） | CLI×6 | 计划验证/STATE 戳模式 | 同上 |
| codex-security | github.com/openai/codex-security（A） | CLI×6 | 安全扫描门禁子进程 | 同上 |
| mattpocock-skills | github.com/mattpocock/skills **v1.2.3**（A） | 物化镜像（runtime/mattpocock-skills/ 27 技能整镜像） | 探查访谈/领域建模/调研/原型/retro 直调 | capability-map.md §二＋§三 |
| ponytail | 蒸馏源（A） | 机制源×7 | lazy-generation 档（编码七层下探） | capability-map.md §二来源列 |
| pi | Pi 1.0（九源调研，B） | 机制源×7 | 机制参考 | 同上 |

物化镜像版本真值：diagram-design=**v2.6.120**（runtime/diagram-design/MANIFEST.md；facts.conf `FACT_DIAGRAM_DESIGN_VERSION=2.6.120`，R140 零差异升锚/R141 刷新）——比产品面技能吸收的 v2.6.110 新一档（修复类，无新机制，不触发技能升级）。superpowers/gstack/ECC/Ruflo/impeccable（pbakaus/impeccable，B）为方法论引用型（纯文档，无运行时依赖）。

### 10.2 team/skills 融合技能的第三方源（净新增 6 项）

| 技能 | 上游源 | 用途 | 证据 |
|---|---|---|---|
| computer-use | github.com/trycua/cua（cua-driver） | 计算机操作底座（studio 依赖 @trycua/cua-driver 0.35.4 同源） | team/skills/computer-use/SKILL.md |
| skill-self-evolution-fusion | github.com/openJiuwen-ai/jiuwenswarm（Apache-2.0，Symphony 引擎） | 动态 overlay＋experience bank＋5D 评估 | team/skills/skill-self-evolution-fusion/SKILL.md |
| remotion | Remotion（经 skills-sh/google-labs-code/stitch-skills 渠道） | HTML 合成视频技能 | team/skills/remotion/SKILL.md |
| prompt-as-model-adapter | 微信公众号「Vibe编码」《Opus 4.8 删掉了 73% 的提示词…》（2026-07-27） | 提示词即模型适配器方法论 | team/skills/prompt-as-model-adapter/SKILL.md |
| minimax-image-to-video / grok-image-to-video | MiniMax / Grok 模型 API | 图生视频通道技能 | team/skills/ 对应目录 |
| wechat-article-search / extractor | 微信公众平台通道（自研封装） | 公众号语料检索/提取（多轮调研的取数通道） | team/skills/ 对应目录 |

### 10.3 标准与规范（capability-map 族⑤＋来源列，净新增 14 组）

GB/T 42588（AI 服务成本度量，cost-estimation 档）；GB/T 39786（密码应用，crypto 门禁）；GB/T 8566（软件生存周期，trace/decisions 留痕口径）；GB/T 25000 系列（SQuaRE 合规矩阵）；ISO 9001/CMMI（质量认证映射）；OWASP＋STRIDE＋CWE 视图 799（security 门禁与 cwe_audit）；等级保护＋PCI-DSS 等（security-certification-profiles）；ASD-STE100 受控语言规范（controlled-language 档，gongwen-bifa 保真契约同源）；TOGAF BDAT 元模型（The Open Group，架构探查四层视角）；行业法规七档（金融/政务/医疗/电信/汽车/能源/工控/支付，--industry 立法）；执法检查底稿（主表 173 条经原文核实，inspection-ledger 数据正本）。证据锚点：capability-map.md 族⑤各行。

### 10.4 方法论/论文/文章源（净新增 11 项）

addyosmani/agent-skills（反借口/Prove-It，B）；Kahneman 认知偏差框架（cognitive-bias 档）；工程控制论等四源（four-theories 档，R17/R18 轮深读）；AMAP LongHorizon-Harness（mea-loop 长任务审计）；京东海博知识管理文章＋OKF 核验（knowledge-lifecycle 档）；行者明灵文章（lazy-generation 联合来源）；Anthropic 官方文档（context-engineering 分层）；清华 RSI 404 篇综述＋D2I-ai＋字节三论文（rsi-evidence 档）；Palantir 映射（R11 轮档）；HarnessEval（R15 吸收轮）；better-harness（R14 吸收轮）。另：用户级 `~/.zcode/AGENTS.md` §5 验证门禁七条源自 **agentpay 项目** 69 轮回归实践（外部项目经验迁移，非仓内调研）。轮档全集＝skills/swarm-yuan/docs/research/ 103 份（R1-R142）。

## 维护说明

- 新增调研组件：在对应分节加行，锚点写 spec 或官方 URL。吸收落地后在「仓内现状」列更新并链接落点。
- 版本核对：upstream/ 树 `git fetch` 后 `describe`。无本地树组件查官方 releases/npm/官网，版本号须来自页面原文。
- `docs/absorption-domain-README.md` 的组件指引已指向本台账。`2026-10-18-latest-coding-tools-matrix.md` 已由本台账接替，该文档保留为历史快照。
