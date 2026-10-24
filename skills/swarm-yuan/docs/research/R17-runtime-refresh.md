# R17：运行时补核调研（三件套深审 + 外围九项，2026-09-05）

- 调研角色：R17 运行时升级分析员（swarm-yuan 项目深度调研团队）
- 调研日期：2026-09-05
- 触发：user message「更新 research 目录下运行时到最新稳定版本，（包括 claude code/codex/dsh）比较和上一版功能差异，然后整合吸收其功能理念，优化 swarm yuan skill」
- 上轮基线：2026-09-01 R16 全量重核（claude-code v2.1.252 / codex v0.152.0 / dsh 0.1.1-rc.2 / 16 行全景）
- 数据来源：npm registry dist-tags（2026-09-05 实测）、16 克隆 git fetch + tag checkout + diff、anthropics/claude-code CHANGELOG（raw 抓取）；四路子代理源码级调研（claude-code 253-261 / codex 152-153.4 / dsh 0.1.2-rc.1 / 外围九项快审）
- 登记口径：本轮为**补核轮**（距 R16 四天，用户点名三件套），不新增 references 文档、不进 FACT_RUNTIMES 13/5、不新增 check_* 门禁（守 55 预算，决策 26/26.2）
- **同日复核（2026-09-05 R17 收口后数小时）**：用户再次发起同口径请求，重新侦察 16 克隆 + npm dist-tags——三件套零新稳定版（codex npm 通道追平 0.153.4；dsh 0.1.3-alpha.1 仍在 alpha 线）；外围 4 行 patch 线移动（comet rc.5 / claude-mem v13.24.1 / ocr v1.11.5 / graphify v0.9.54）全部对账通过，克隆已 checkout、基线行已更新（见 upstream-baseline 同日复核注）。patch 级不开新调研轮（R13 重核节奏）、不新增吸收、不发版。

---

## 第一部分：点名三件套（claude-code / codex / dsh）

## 一、版本全景

| 运行时 | 上轮基线（R16） | 最新稳定（2026-09-05） | 跨度 | 备注 |
|---|---|---|---|---|
| claude-code | v2.1.252 | **v2.1.261**（npm latest，2026-09-04） | npm 9 版 | latest/stable 分裂持续（stable 仍 2.1.236，落后 25 patch）；253-256 无 changelog 条目（255 macOS 12 启动回归 258 修复） |
| codex-cli | v0.152.0 | **rust-v0.153.4**（git tag 2026-09-04；npm latest 0.153.3 慢一 patch） | 1 stable 线 + 4 patch（106 commits） | 0.153.1-4 共 7 commits 为 GPT-6-Astra 模型目录热修；docs/skills.md 连续第二轮零 diff；v0.154.0-alpha.3 在 alpha 通道 |
| dsh | dsh-v0.1.1-rc.2 | **dsh-v0.1.2-rc.1**（a66e47020，2026-09-03） | 1735 commits / 7633 文件 / 8 breaking | **R16 预告的 0.1.2 调研本轮兑现**（R12 先例：rc 档才做产品层吸收）；0.1.3-alpha.1 已出现 |

research/ 本地克隆已全部 checkout 到最新稳定 tag（gitignored 不入 git）。

## 二、Claude Code v2.1.252 → v2.1.261（CHANGELOG 全读）

**功能性新增**（纯修复版 253-254/256/258 不列）：

| 主题 | 版本 | 内容 |
|---|---|---|
| `--permission-prompts none` 无头执法档 | 259 | 一切本会弹审批的操作自动拒绝；同版 managed settings 解析失败拒启（fail-closed）+ `managedMcpServers` 组织级 MCP 分发 |
| **宿主 deny 语义漂移** | 259→260 | 259 将 Read deny 规则应用至 Bash 参数，260 即回退（误伤 `npm run build`）；260 起 strict sandbox 下 `!` bash-mode 命令改跑沙箱外 |
| `/skill-doctor` 技能成本审计 | 261 | 报告哪些已加载技能未使用、各占多少上下文 |
| 提示词外置 + 输出预算 | 261 | `--append-subagent-system-prompt-file`（"prompts too large to pass on the command line"）；`bashOutputMaxChars`/`taskOutputMaxChars`（inline 上限提至 128K） |
| 子代理模型强制 + 越界读取管控 | 257 | `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`（无视 per-spawn 与 agent 定义覆盖）；首次越界读取一次性提示 + `permissions.blockReadsOutsideWorkingDirectories` |
| Workflow schema 前置校验 | 260 | `agent({schema})` 拒绝永不可满足的 JSON Schema，retry 错误带最后校验失败 |
| Containment Escape 规则 | 257 | auto mode 不再自动批准元凭据抓取/出口规避类操作；项目级 `defaultMode:"bypassPermissions"` 被忽略 |
| 子代理后台命令限时移除 | 260 | 移除 1 小时限制（门禁长跑可行） |
| plugin validate --json | 259 | 机器可读验证报告 |

**破坏性/语义震荡**：deny 规则应用面 259→260 一进一退（宿主 deny 层不保证稳定）；`!` 出沙箱（Claude 侧沙箱 deny 面收窄）；`keybindingFlavor` 失效（无碍）。

## 三、Codex v0.152.0 → v0.153.4（源码级调研浓缩）

1. **Guardian 条件性兜底**（0.153.0，#42147/#42256）：Full Access 与 User approval 模式跳过 Guardian 评分/评审（含活动中途切换）；computer-use 评分尊重模型要求（0.153.1，#42424）。Guardian 区间 1387 增/798 删（`codex-rs/core/src/guardian/`、`codex-rs/ext/guardian-v2`）。
2. **回合中结构化问答**（0.153.0，#42178）：`send_user_message_async` → `request_user_input_async`，带建议答案、回合继续执行、schema 入 app-server 协议、按模型可用性限定。
3. **hooks 内置白名单三层信任**（0.153.0，#42110）：`builtin: true` 直接 Trusted 且无视 per-hook enabled（`codex-rs/hooks/src/engine/discovery.rs`）；本仓用户级 PreToolUse 三能力接线零变化（对账通过）。
4. **实验性 context management**（0.153.0，#42385）：`features.context_management.experimental_mode`——token 预算上下文 + history notes + `new_context` 工具；仅 ChatGPT Plus/Pro/Pro Lite 且 Codex 后端。
5. 其余：插件远程 marketplace（#42150/#42149）、network requirements `header_injections`（#42173）、权限变换感知 executor 路径（`sandboxing/policy_transforms.rs` +416 行）。
6. **破坏性**：无 v0.150 级破坏项（仅 `disable_paste_burst` 移入 `[tui]`，旧键 legacy fallback）。

## 四、dsh 0.1.1-rc.2 → 0.1.2-rc.1（R16 预告调研的兑现）

1735 commits、7633 文件（+38.1 万/-16.1 万行）、8 个 breaking 提交。机制级变化（详证据在 `references/dsh-engineering-methodology.md` §八）：

| # | 主题 | 簇归属 | 一句话 |
|---|---|---|---|
| 1 | 跨版本读兼容三件套 | B 补强 | `compatibleVersions` 按域声明旧版可读 + 坏记录 `backup-and-skip`（改名 `.bak.<分钟>` 跳过、域照常打开）+ 真实构建盘面归档夹具回归——修"毒化树"事故（note 2026-09-02） |
| 2 | 删 SQLite 后端迁移纪律 | D 新样本 | 不迁（拒绝为无消费者的格式养平行事务协议）+ 旧构建导出出口契约 + per-record 归档原子替换（`KvUnit.backupRecord`）+ FTS5 降格"可弃派生投影"——**权威格式删后端用"显式切断+旧构建出口"，缓存格式演代用"声明兼容+备份跳过+归档夹具"** |
| 3 | `<domain>/<reason>` 失败词表 | A 补强 | `RemoteError<Code>` 单一失败类，code 前缀自带所有者，details 映射单点声明；17 个 gateway 装配失败不再折成 internal（note 2026-08-28） |
| 4 | SessionSeq/LogOffset 类型品牌 | D 延伸 | 事件身份≠日志位移，运行时校验构造器，v0 盘面字节兼容 |
| 5 | Agent Teams 孵化围栏 | D | experimental 私包 + 发布集机械排除 + release 禁依赖 experimental + **晋升需具名 owner 接盘**（note 2026-08-18）——可吸收的是围栏而非 Team 功能 |
| 6 | api 拆分绞杀者样本 | D | 逐路由迁 controller、迁完即 `refactor(apiproxy)!: remove Xxx RPCs`，最后整包删除（4f00a8b82），无大爆炸切换 |
| 7 | 压缩级别评测纪律 | D | 501 session/1615 万事件语料，5 轮弃最高最低取 3 均值：level-19 省 12.1% 空间但写 +67%/fork +130%，弃用（note 2026-08-25） |
| 8 | 投影所有权统一 | B 补强 | `SessionObservation` 统一读切面，Client 消费成品投影、不重建镜像（note 2026-08-25） |

inspector（目录名回答"代码在哪跑"的 client/host/worker/shared 镜像布局）登记不展开。

## 五、外围九项快审（R16 基线 → 2026-09-05）

| 项目 | 跨度 | 定性 | 结论 |
|---|---|---|---|
| openspec | v1.11.0→v1.12.0 | CLI 人体工学延续（validate findings-only 批量/delta 冲突降级 informational/explore 引导先读代码/SourceCraft 适配/fast-uri 安全补丁） | 对账通过，升基线 |
| claude-mem | v13.21.2→v13.24.0 | #3838 熔断器事件形状修正（rate_limit_event 与 SDK 真实消息形状不匹配）+ Cursor/Grok Bot 多宿主分发 | 升基线 + 补核（判据须绑定上游真实事件形状——对账通过） |
| ocr | v1.11.1→v1.11.4 | 纯修复（规则路由 ObjC++/.cxx/JS 模块、SIGTERM 优雅退出、opt-in 原始流量捕获 #1109） | 对账通过，升基线 |
| ruflo | v3.38.20→v3.38.21 | 单 patch（memory bridge registry 种子/meta-proxy 陈旧 owner 修复） | 对账通过，升基线 |
| codex-security | v0.1.24→v0.1.25 | patch 号下功能增量：跨扫描发现关系保留（findings 生命周期跨扫描延续）+ sealed 扫描目录去重 + 去重评审加固 | 升基线 + methodology §十二注记（工程设施对账通过） |
| comet | 0.4.0-rc.1→rc.4 | 11 commits 全为稳定性修复（Archive 续跑死循环/native 内存/workflow 恢复），正式版未出 | **维持观望 drifted**（裁决不变） |
| GitNexus | v1.6.11-rc.23→v1.6.11 stable | stable tag 已出，收敛段 41 commits 含 Zig 语言支持/Spring 路由摄取/auto-sync 定时远程分析；npm 仍停滞 | license-risk 不变，登记不追（选型方针决策 18 照旧） |
| better-harness | v0.6.6→v0.7.0-alpha1 | 任务证据上传端到端 + 组织级 harness dashboard + 原生 run streams 替换 ag-ui | 观望，维持 v0.6.6 不入表 |
| gstack | e76f65a→e76f65a | HEAD/VERSION 零增量 | 对账通过 |
| gsd-core/graphify/superpowers/ECC | 无新 tag | 零增量 | 对账通过 |
| impeccable（非 research 克隆，GitHub 实测） | v4.1.1→v4.1.3/v4.2.0 | Comps 可执行契约阶段门 + **录制回放钉行为**（830 命令 + 16058 函数调用逐字节比对）+ 统一规则引擎 + 无 Node 依赖单二进制 | 候选级维持不升基线（R16 裁决沿用）；候选登记 review-methodology R17 段 |

## 六、吸收三问评审

| # | 候选 | ①落到运行时条件？ | ②替换/叠加？ | ③六个月后谁引用？ | 裁定 |
|---|---|---|---|---|---|
| 1 | claude-code `--permission-prompts none` 无头执法档 | 是——无人值守会话真实存在（CI/`--permission-prompts none`），prompt 档语义坍缩为 deny | 叠加（R13 三值化环境边界注记） | adaptive-gating/双宿主无头对偶引用 | 落地（capabilities R17 段） |
| 2 | **宿主治理层条件性教义**（Claude deny 回退 + Codex Guardian 条件跳过） | 是——双宿主同向实证 | 叠加（R13"fail-open 须下层兜底"升级为"宿主治理层整体视为条件性"） | 门禁执法确定性论证引用 | 落地（capabilities/codex-methodology R17 段 + upstream-baseline §3.5 评估） |
| 3 | `/skill-doctor` 技能成本审计 | 是——宿主命令真实存在 | 叠加 | 门禁预算/特征卡裁剪证据源 | 落地（登记） |
| 4 | 提示词外置 + 输出预算设置 | 是——外置第四次官方验证 | 叠加（WP-P5 同构） | 上下文外置谱系引用 | 落地（登记） |
| 5 | `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` / Workflow schema 前置校验 | 是 | 叠加 | adaptive-gating 候选补全/证据态印证 | 落地（登记） |
| 6 | Codex `request_user_input_async` | 条件未熟——本仓交互面走宿主审批通道已够 | 候选（Interrupt 守护点正式参照） | 人机协作点轮 | 候选登记 |
| 7 | Codex context_management experimental | 条件未熟——ChatGPT 后端限定 | 候选 | 上下文预算轮 | 候选登记 |
| 8 | dsh 跨版本读兼容三件套 | 条件未熟——本仓无第二次盘面演代（触发条件挂 §五候选） | 叠加（簇 B 补核） | storage schema 演代轮 | 落地（方法论补核段） |
| 9 | dsh 删后端迁移纪律 | 条件未熟——"删优于养"的删除面操作纪律留存 | 叠加（簇 D 补核，与决策 26 负向预算同族） | 删减决策轮 | 落地（方法论补核段） |
| 10 | dsh 失败词表/孵化围栏/绞杀者样本 | 条件未熟——本仓 gate ID 体系已同构满足 | 叠加（簇 A/D 补核） | 多包失败面/实验代码治理轮 | 落地（方法论补核段） |
| 11 | claude-mem #3838 事件形状修正 | 是——判据纪律对账 | 叠加（memory-persistence R17 段） | 熔断器/判据设计引用 | 落地（补核） |
| 12 | impeccable 录制回放钉行为 + Comps 可执行契约 | 条件未熟——cli-ab 已同构 | 候选（review-methodology R17 段） | 行为钉死/视觉验收轮 | 候选登记 |
| 13 | codex-security 跨扫描发现关系 | 是——工程设施对账 | 叠加 | findings 生命周期引用 | 落地（§十二注记） |
| 14 | openspec/ocr/ruflo/gstack/gsd-core/graphify/superpowers/ECC | 无新机制/零增量 | 对账结论 | — | 对账通过 |

## 七、落地载体清单

1. `references/claude-code-capabilities.md`：头部口径更新（核至 v2.1.261）+ 新增「版本注记：v2.1.261（2026-09-05 核）」段。
2. `references/codex-methodology.md`：头部版本核至 + 新增「版本注记：v0.153（2026-09-05 核）」段。
3. `references/dsh-engineering-methodology.md`：头部版本核至 + §七标题改"基线 rc.8 → 0.1.1-rc.2" + §7.5 兑现指针 + 新增「§八、0.1.2 版本注记」（8.1 跨版本读兼容 / 8.2 删后端迁移纪律 / 8.3 失败词表 / 8.4 孵化围栏）。
4. `references/memory-persistence.md`：新增「v13.22-13.24 补核（2026-09-05 R17）」小节。
5. `references/codex-security-methodology.md`：§十二版本注记 + FACT_REFERENCES 数字裂缝修正（34→41）。
6. `references/subagent-orchestration.md`：comet rc.2-4 重核行。
7. `references/review-methodology.md`：新增「R17 补核」小节（ocr/ruflo 对账 + impeccable v4.2.0 候选两条）。
8. `references/code-graph-tools.md`：graphify 许可证事实同步（MIT→Apache-2.0）+ graphify 基线注记与 R16 裁决对齐 + GitNexus v1.6.11 stable 登记。
9. `docs/upstream-baseline.md`：R17 口径注 + 16 行全部重核更新（11 升基线 + comet drifted 维持 + 5 零增量注记）+ §二关键结论 + §3.5 CLI 专题 + §四 comet R17 复核。
10. research/ 克隆：codex→rust-v0.153.4、dsh→dsh-v0.1.2-rc.1、openspec→v1.12.0、claude-mem→v13.24.0、ocr→v1.11.4、ruflo→v3.38.21、codex-security→npm-v0.1.25、comet→0.4.0-rc.4（跟踪用）、gitnexus→v1.6.11；better-harness 维持 v0.6.6（0.7.0-alpha1 观望）。
11. 本报告即 §13 历史档案 A15（`docs/design-evolution.md`）。

## 八、验证清单

- [x] 三件套 changelog/源码级差异全读（四路子代理，证据到文件/commit 级）
- [x] 16 克隆全部 git fetch + 状态核实；移动项全部 checkout 到目标 tag
- [x] 吸收三问 14 项评审：9 落地（方法论层）+ 3 候选登记 + 对账结论若干；不新增 references 文档、不新增门禁（55 守恒）、FACT_RUNTIMES 13/5 不变
- [x] 规范层数字裂缝：codex-security-methodology FACT_REFERENCES 34→41 修正；code-graph-tools graphify 许可证事实同步
- [x] `bash scripts/self-check.sh --check-only` 无新 drift（见 A15 验证段）
