> **何时读我**：设计审计/状态韧性/增量自成长机制时。DeepSeek Harness rc.8 产品层——配对决策审计/状态韧性/增量自成长/工程纪律。

# dsh 工程机制方法论（DeepSeek Harness 产品层）

> 来源：[DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) @ `141eb6fe`（2026-08-19，tag `dsh-v0.1.0-rc.8`，developer preview；版本核至 `dsh-v0.2.1-alpha.1`，见 §七-§十三）。调研证据到包/文件级。
> 与 `cordis-composability-methodology.md` 的分工：那份是 Cordis **框架层**（时空可组合性：可逆效应 + 响应式依赖，论文级）；本文是 dsh **产品层**工程机制（决策审计/状态韧性/增量感知/工程纪律，源码级）。理念层以 2026-08-13 论文草稿为准。
> 纪律：只引用方法论模式与设计视角，不调任何上游 CLI/运行时；不复制源码（上游克隆在 `swarm-yuan/research/dsh/`，gitignored）。守决策 26/27：不新增 `check_*`，门禁总数保持 56（决策 26.2）。
> 适用场景：目标技能与生成器自身的 hook/门禁审计、状态机与日志韧性、自成长链（项目变化感知→清单更新）、复盘与决策治理设计。

---

## 一、决策审计（簇 A）

### 1.1 配对审计事件

dsh `hook-protocol/src/events.ts`：每次门禁触发写 `invoked` + 配对 `result` 两行，稳定 `handlerId`（配置派生，非随机 UUID）关联，决策派生规则统一 `output.decision ?? (continue===false?'stop':'pass')`——**解析失败也落一行 pass，不丢记录**；stderr 摘要截断 500 字符；全部 log-only 不进模型上下文。

bash 映射（本 hook 是同步单次进程，无异步生命周期，配对折叠为单行自包含记录）：`.swarm-yuan/gate-audit.jsonl` 每决策点一行 `{ts,handler,tool,decision,reason,target,gates}`，pass 也落行（豁免/非白名单），`--report` 输出拦截率。**关键纪律：审计总体 = "门禁红期间的决策点"，不是全量工具调用日志**（休眠不写，体积纪律）。

### 1.2 按秩折叠的最严合并

dsh `hook-protocol/src/merge.ts`：多规则命中同一拦截点，串行执行后按 `deny > ask > allow` 定秩折叠；**只有获胜秩的理由浮出水面**（deny 赢了不混入 warn 理由）；空输出折叠为中性 `none`。决策与注册顺序无关，审计可复现。

bash 映射：目标技能的 `hooks.json` 在同一 matcher 挂多个 hook（如 PreToolUse: precheck --scope / integrity-guard / fail-gate-hook）时，**文档约定**：各 hook 独立决策，宿主（Claude Code）任一 deny 即拦截；本仓 hook 的输出文案不应互相引用对方判定（各说各的理由，宿主取最严）。多 hook 合并语义属宿主实现侧，本仓不做聚合逻辑。

### 1.3 Total-function 输出解析 + 事件鉴别器

dsh `hook-protocol/src/codec.ts`：exit 2+stderr 与 exit 0 结构化 JSON 是**两个语义通道**；`hookSpecificOutput.permissionDecision` 覆盖顶层 legacy 字段；JSON 块的 `hookEventName` 与当前触发事件不符时**只丢弃事件作用域字段、保留顶层字段**。解析器是 total function：JSON 畸形当纯 stdout，执行器故障变非阻塞输出，**永不向 agent 循环抛异常**。

bash 映射：本仓 hook 生产 JSON 时的纪律——① `hookEventName` 必须与触发事件逐字一致（写错事件名，宿主侧会丢弃整个 `hookSpecificOutput` 作用域字段）；② 解析 stdin 失败一律放行（fail-open 已有）；③ deny JSON 走 `hookSpecificOutput` 通道，不依赖 stderr 文本通道。

### 1.4 审计追加失败 → 整体拒绝

dsh `user-approval`：审批审计写不进去时**宁可拒绝也不返回未记录的决策**。

本仓取舍：**不采用**。我们的 deny 是安全侧动作，fail-open 纪律优先——审计写失败不阻塞主流程（`|| true`）。dsh 的审批是"用户授权"（记录缺失=授权无凭据必须拒绝），我们的 deny 是"门禁拦截"（拦截失效=安全退化）。原则留存：涉及"授权"语义的日志（decisions.jsonl 的 UserChallenge 决策）应向 dsh 看齐——授权留痕失败时提示用户重试，不静默继续。

## 二、状态韧性（簇 B）

### 2.1 整快照事件溯源 + CAS revision

dsh `packages/goal`：每次状态迁移追加**完整事后快照**事件（含单调 revision），fold = last-wins；变更携 `{id, revision}` CAS，stale 修订直接拒绝；独立伴生校验器在事件**入日志前**校验形状/revision 连续性/合法迁移表/时间戳单调性，第一条损坏事件即停游标。

bash 映射（候选，见 §五）：`state-machine.sh` 的 `state.yaml` 迁移为 `state.jsonl` 整快照追加 + revision CAS。**触发条件**：真实出现并发写 state.yaml 损坏/竞态事故再自动化；当前单 AI 会话串行写，YAML 覆写够用。

### 2.2 持久态与进程本地"激活权"分离

dsh `goal`：durable phase 与"本进程是否有权自动继续"（armed/disarmed）是两个维度；激活权**永不写盘**——重启/fork/恢复后一律 disarmed，必须显式 resume 重新授权。驱动侧：推进前先 flush → await 之后复核 revision 未变且无竞争输入 → CAS 预订下一轮（stale 预订不消耗序号）；flush 失败降级 disarm，不自动重试。

bash 映射：`state.json`/yaml 存阶段（durable），锁/PID 文件存"本轮执行权"（不持久化）；脚本崩溃后锁可清但**阶段不自动推进**——恢复时必须由 AI/用户显式确认当前阶段。这条已在 swarm-yuan 的 draft 状态门（`--mark-active` 人工翻转）精神内，文档化即可。

### 2.3 观测失败降级为合法前缀

dsh `tool-workflow`：观测记录写入失败时，**要么无记录、要么是合法的连续前缀，绝不改变主流程结果或清理路径**（首次 append 失败即禁用该 run 后续记录并告警一次）。

bash 映射：`trace-log.sh` 的语义是"永不 fail 阻塞主流程"且更精确——写 trace.jsonl 失败时打一条 stderr 告警（每进程一次），**之后不再重试写**（避免每节点都刷告警），主流程零影响。决策日志（decisions.jsonl）同理但语义更重（见 §1.4 授权取舍）。

### 2.4 回放规则不可变

dsh `todo`：日志 invariant **故意不跟随**当前校验策略——策略收紧后旧日志必须仍能 replay。

bash 映射：**日志格式版本化第一原则**——`.swarm-yuan/*.jsonl`（trace/decisions/gate-audit/gate-deny）的**读取/回放逻辑**必须兼容所有历史格式版本；新增字段只加不删不改义；`--upgrade` 升级生成器后旧日志仍须可回放。校验规则（如决策五要素必填）只约束新写入，不回溯旧记录。

## 三、增量自成长（簇 C）

### 3.1 catalog/body 生命周期分离 + digest 驱动整体替换

dsh `skill` 包：catalog（name+description 索引）与 body（正文按需重读）生命周期分离；每次 pre-step 对已渲染条目算 digest，变了就追加**完整替换目录**而非 diff——"上次发布的清单"自己就是对比基线。

bash 映射：目标技能 `reference-manual.md` 的组件清单段是 catalog，组件详情/签名是 body；自成长更新时**整体重写清单段**（不做行级 diff 合并），段头注释记录生成时间戳与源指纹 digest 作对比基线。

### 3.2 工具结果驱动的局部重探查

dsh `agent-instructions`：不靠 inotify，观察 read/write/edit 工具的 durable result——touch 到某 scope 才做该 scope 重探查；`{path, version, sha1 digest}` 缓存跳过未变文件。

bash 映射（部分落地）：`project-fingerprint.sh` 增路径级 digest 缓存——结构指纹感知到变化后，AI 重探查**只针对 git diff 涉及的目录/维度**，SHA 未变的路径直接复用旧清单条目。增量且幂等。

### 3.3 fail-closed 解析 + last-good 保留

dsh `skill-filesystem`：frontmatter 解析失败**整个条目带警告剔除**（坏数据不出现在禁用面）；发现过程 I/O 失败时快照标 `complete: false`、不缓存、消费者继续用 last-good。

bash 映射（红线已入骨架 SKILL.md 自成长段，已自动化）：清单更新**先完整生成到临时文件再原子替换**（`mv` 同目录原子性），探查中途失败绝不覆盖上一份好清单；探查输出本身畸形（条目数骤降 >50%）视为失败，保留 last-good 并告警。

## 四、工程纪律（簇 D）

### 4.1 defensive-patterns 六条（dsh `docs/defensive-patterns.md`，每条都是真实缺陷类）

| dsh 规则 | swarm-yuan 落点 |
|---------|----------------|
| 正交结果独立报告（绝不在一个 flag 的分支里嵌套另一个的报告——进程超时 AND exit 0 要分开报） | 门禁输出设计：fail 行一条一个原因，不嵌套；`--report` 聚合维度独立成段 |
| 回调异常收容在调度器内（一个坏 listener 不破坏核心生命周期） | hooks fail-open 的理论表述：任一 hook 崩不影响其他 hook 与主流程 |
| 不把不可信输出交给 ambient 环境或可预测路径（env 清洗 drop `*KEY*`/`*SECRET*`/`*TOKEN*`，0700 私有目录 + 随机名 + `wx` 独占创建） | hook/脚本写临时文件：`mktemp`（已做）；涉及凭据的 conf 加载不 export 到子进程环境 |
| dispose 必须到达 quiescence（kill 后 await 子进程真正退出；先关 listener 注册表再 kill） | 生成流程中断清理：worktree 收口前先确认无在途写；`--upgrade` 备份完成才覆盖 |
| 异步状态不是同步状态（`whenIdle` 不是单条消息的完成信号；等的迁移若永不会发生要显式处理"没得等"分支） | PostToolUse hook 语义：precheck 的 exit_code 是这次运行的结果，不是"门禁整体健康度"——flag 捕获模型本就如此设计，文档化 |
| unlink 链接形路径（lstat 判 symlink → unlink 只删链接不跟随） | 清理脚本删文件前 `[[ -L ]]` 判定（bash：`rm` 默认不跟随符号链接删目标，但 `rm -r` 会——清理逻辑避免 `rm -rf` 用户路径） |

### 4.2 解释性空实现契约（dsh `runtime-diagnostics/invariants`）

每包必须发布 `./invariant` 伴生模块；没有可检查关系的包必须写**以 `No runtime invariant:` 开头的注释解释为什么**；自动脚本 `verify-package-invariants` 拒绝无解释的空实现。断言只针对**可观察的事件关系/可变数据关系**，绝不断言服务/方法存在性（那是类型系统的事）。

bash 映射：swarm-yuan 已有同构——门禁 `skip_if_unconfigured` 必须带原因（SKIP 披露而非静默），「自动只在信号可信处」原则同源于"只断言可观察关系"。强化点：self-check.sh 的每类检查若整类不适用，须输出 `No <check>: <原因>` 而非静默跳过。

### 4.3 Agent Notes 生命周期

dsh `.agents/notes/{proposed,implemented,rejected,archived}/<date>-<slug>.md`：决策笔记四态生命周期。关键增量是 **proposed/rejected 的未采纳决策留痕**——ISO/IEC 42001 审计视角下，被拒绝的方案同样是治理证据。

bash 映射：decisions.jsonl 增 `outcome` 字段（implemented/rejected/superseded），文档化不加机器执法——见 `references/decision-governance.md`。

### 4.4 postmortem 编号制

dsh `docs/postmortem/NNNN-<slug>.md` 四篇编号事后分析。swarm-yuan 的复盘有调研报告编号（docs/research/），事后分析目前口头化在 commit message 与 memory；如需对外交付事故复盘，可采用 NNNN 编号 + 固定骨架（现象/时间线/根因/教训/行动项）。当前不强制。

## 五、候选方案与触发条件

| 候选 | 内容 | 触发条件 |
|------|------|---------|
| state.jsonl 事件溯源化 | state-machine.sh 的 state.yaml → 整快照 JSONL 追加 + revision CAS + 追加前校验器（§2.1/2.2 自动化） | 真实出现并发写损坏/竞态事故；或多 AI 并行操作同一项目状态成为常态 |
| gate-audit 拦截率阈值告警 | `--report` 输出拦截率异常（如 7 天内 deny 率 >80% = 门禁可能过严/误伤）时 warn | gate-audit.jsonl 积累 ≥2 周真实数据后再定阈值（当前无数据无真相） |
| hook 输出 schema 自动校验 | self-check 增断言：本仓 hook 输出的 deny JSON 的 hookEventName 与注册事件逐字一致（§1.3 自动化） | 出现一次因事件名写错导致宿主丢决策的真实事故 |
| 二版本模式（规范形 vs 派生投影） | 报告/账本类产物：落盘存 canonical 结构，渲染视图为派生缓存，派生层坏了从 canonical 重算（§七 0.1.1 印证） | 出现一次"渲染层损坏导致账本不可信"的真实事故（当前账本本身就是 canonical，无独立渲染层） |

## 六、与 cordis 框架层的关系

cordis 框架层（`cordis-composability-methodology.md`，2026-08-14）涵盖可逆效应/响应式依赖，落地 `--inject-frameworks` 快照+ledger+`--rollback-frameworks` 与 precheck.patch.conf 分层 patch。本文产品层机制与框架层同根（都是"动态组合系统的可信度工程"），但回答的问题不同：框架层回答"组件加装/拆除是否可控"，产品层回答"决策是否可审计、状态是否可恢复、感知是否可持续"。两者在 swarm-yuan 的交点：自成长链+ fail-gate 审计。

## 七、0.1.1-rc.2 能力

0.1.1-rc.2（相对 rc.8）无 breaking 变更，goal/decision 审计核心不变。条目：

- **凭据 seam 划界**：凭据注入按"键空间按所有者划界 / flow 拥有写入"划界（本仓若引入凭据注入，按此划界）。
- **二版本模式**：历史存 canonical、传输派生投影（见 §五）。
- **坏态整 log 重建**：与 §2.1/2.2 同语义。
- **发布纪律"合而复撤"**：回退优先于带病修复（同 §4.1）。

## 八、dsh-v0.1.2-rc.1 能力

- **两种格式迁移路径分开对待**：缓存格式演代用"声明兼容（按域声明旧版可读、写恒盖当前版）+ 坏记录备份跳过、域照常打开 + 真实盘面归档夹具回归"；权威格式删后端用"显式切断 + 旧构建导出口"。本仓 inventory-update 原子替换 + last-good 红线属前者；自动化触发条件不变（§五：state/账本出 v2 时）。
- **删后端纪律三段式**：不迁（拒绝为无消费者的格式养平行迁移协议）/ 出口（需要内容者用旧构建导出后再升级）/ 守门（派生投影降格为可弃、测试改锚权威源）。"无真实部署的第二权威格式，删优于养"——与决策 26 复杂度负向预算同类。
- 其他能力：失败词表 `<domain>/<reason>` 单点声明（同 gate ID 前缀设计）；Agent Teams 孵化围栏；绞杀者模式 api 拆分。

## 九、dsh-v0.1.5 能力

- **动态系统提示不破 KV Cache**：模型显式声明支持即可运行中改系统提示且保持 KV 命中（缓存友好编排的上游样本：claude 265 前缀保持、267 工具动态更新、dsh 系统提示更新）。系统提示是「可变但保持命中的受控更新」（非不可变前缀）——技能动态注入（运行中更新规则/frontmatter）的可行性上游样本；本仓落地触发条件不变（§五：真实需要动态注入的场景出现）。
- **消息归属与顺序是编排不变量**：子代理支持消息排队/编辑/删除/Steer/停止；Agent Team `send_message` 统一 steer 语义，跨 Agent 与冷恢复投递保留发送者归属与顺序——**谁发的、按什么顺序发，跨代理/冷恢复不丢**（与 265 前缀保持、KV cache 保持同类不变量）。
- **暂停即终止 + 用户独占恢复权**：Web 暂停目标立即终止当前模型轮次且模型不能自行恢复，恢复必须由用户触发——**用户控制权 fail-closed**（与 gsd「复核阻塞须确定性证据」的用户主权同类）。
- 其他能力：DeepSeek-V41-Flash 默认模型；Web 通用文件上传混排（模型按路径按需读取）；Sidebar 多标签产物预览；代理环境变量遵循；流式工具调用续传分片修复。
- **0.1.5-rc.2（2026-09-11）**：web feedback + file refinements。
- **0.1.6 alpha 线（dsh-v0.1.6-alpha.1，2026-09-16）**：pkg/运行时解析重构——runtime host 迁入 asar、内置 loader 升 0.1.6、addon 管理原生缓存、ESM default resolver 对齐、boot 解析边界加固。生态侧：comet 0.4.1 #406 已把 dsh 注册为受支持 hook 平台（`docs/upstream-baseline.md` comet 行）。

## 十一、v0.1.7-rc.2+155 能力（无稳定 tag）

- **插件束（bundle）兼容性治理**：束自带行集合，行开关随束联动（单切被拒、有 typed refusal）；**DSH 对等兼容性强制 + 精确豁免**——插件生态的版本协商是安装时门禁 + 类型化拒绝（非文档约定）。对本仓：三层整合的深度/CLI 层版本协商可引用此模式（拒绝要带机器可读的原因与豁免清单）。
- **遥测双通道**：OTLP 字节有界会话日志上传 + 桌面端 OTel 产品分析——「有界」是关键词（上传量与隐私面先画边界再开通道）。
- **动态工具更新按路由投影**：LLM 侧动态工具更新（toolset 变更）按路由投影到各消费面——工具面变更的传播纪律。
- **会话归档三态化**：显式三向菜单（全部/仅归档/未归档）替代隐式过滤——列表状态机的「显式优于隐式」。

## 十二、v0.2.0-rc.1 能力（无稳定 tag）

- **版本锚**：0.1.7 无 stable 版本，0.2.0-rc.1 发布提交（`4878cdab`）即版本锚——stable 缺位时以 tip 发布提交为事实版本锚；大版本切换用 rc 探路。
- **遥测 HTTP 传输隔离**（`2974008`）+ 桌面 OTel 超时治理（`#5316`）——§十一「遥测双通道」的传输实现：传输实例独立、超时显式，遥测故障不外溢主链路。
- **Windows 几何净空纪律**（`#5268/#5359`）：对话框/浮层/全屏/dockkit 浮头统一避让标题栏——桌面几何约束用统一净空常量。
- **设置面组合缓存**（`f2af035`/`3e6c104`）：未覆写项复用组合、未用组合跳过——渲染经济学与 §十一「动态工具按路由投影」同属按需物化纪律。
- **任务管理器详情关闭竞态修复**（`#5339`）：详情面板关闭与数据到达的竞态显式处理。
- **agent-preset 经验技能与 creator mode 共享**（`8931fa2`）：预设面经验物跨模式复用——技能资产的单一事实源纪律。
- **0.2 预览声明强制确认**（`#5356`）：预览版说明需显式确认——版本面文案与用户知情的门禁化。

## 十三、v0.2.1-alpha.1 能力

> tag `dsh-v0.2.1-alpha.1`（2026-10-03 发布，v0.2.0 仅 rc.1/rc.2 无正式版）。

- **Claude Code Mods 兼容桥**（`packages/experimental/claude-code-mods/`，v0.2.1 起提供）：`defineMod({name, version, root, register})` **直接包装 mod 的 `register(on)` 函数**、转为普通 Cordis 插件挂载——不解析 plugin.json/hooks.json 等清单；生命周期映射 `session.start`←`agent/created`（首轮前等待）、`prompt.submit`←`agent/pre-step`、`tool.call` 包裹 `tools/execute` 瀑布、`session.end`←`agent/disposed`；**不可触发事件点名警告**（`tool.check`/`ui.*`/`telemetry.*` 可注册但永不触发，加载时告知而非静默）；**权限时序差异**：DSH 的 `tool.call` 在 harness 权限判定**之后**运行（Claude Code 在之前），改写参数/换工具的钩子被跳过——「同一事件名跨运行时语义不同」的桥接陷阱；`$` 命名空间按需组合 harness 服务，未组合的以 `no implementation for <namespace>.<method>` 显式拒绝。官方定位：验证「Claude Code Mods API ⊂ DSH 插件能力」的 alpha 演示，非完整兼容（官方 mods/diff 等 4 个真实 mod 评估为不可运行）。对本仓：**子集验证式桥接**——不仿全集，先证包含关系，差异面（权限时序/不可触发事件）显式记录。
- **`dsh-hooks-claude-code` / `dsh-hooks-codex` 桥包**（v0.1.2-rc.1 起存在）：CC 30 个 hook 事件支持 7 个（SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/Stop/SubagentStart/SubagentStop → `agent/created`/`agent/pre-step`/`tools/pre|post-execute`/`agent/turn-stopping`/`subagent/start|end`），决策折叠 `deny > ask > allow`、串行执行、Stop 阻塞经 `steer()` 强制续轮；codex 桥 10 事件支持 5 个、payload 保持 Codex 方言。设计立场「兼容适配器而非强力工具」——与本技能 Claude Code 与 Codex 两类宿主 hooks（Claude deny/Codex exit 2）同类设计：宿主差异显式化优于假装兼容。
- **0.1.3-0.2.1 能力面**：`SessionHandle` 生命周期 + 会话锁（一进程一持有者）；插件管理页热启停 + 依赖运行时解析 + 运行时卸载；桌面端捆绑 `dsh` 命令免装 Node/pnpm；**运行时自检收敛进类型系统与装载模型**——无运行时 invariant 插件、无 `runtime-diagnostics` 包、子路径插件无独立 `package.json`，invariant 是构建期保证（解释性空实现契约 §4.2 的延伸，「删优于养」同 §八）。
- **社区 RFC workspace-scoped configuration**（discussion #941，2026-08-14 开启、尚无官方回应）：workspace 运行时注册表/引用计数 Lease/作用域链设计——待其落地再评。产品面另有：「让 Agent 创建插件」入口、开发者工具组合包、`--public-url` 反代。

- **v0.2.1-alpha.2 记档（669 提交）**：**保留式 Git worktree**（experimental：`/worktree` 类入口进**保留** worktree 而非一次性目录——工作面与产物面可长期共存，与「一次性 sandbox」相对的**可回归工作面**形态）；**插件官方 bundle 按需安装**+生命周期校验（optional bundle 可声明进 agent preset **组合分发**——插件面即 preset 组合分发（preset=一组 bundle 的声明式组合），与宿主运行时解析+热启停同一装载模型）；**DeepSeek Flash 翻译 opt-in+机器译文持久化**（译文持久化——翻译是**会话资产**，reasoning 面可母语留存）；voice-input 麦克风菜单选源（输入设备一等配置）；文本/代码/终端三面字体独立配置；session header 迁移状态前置可见（fork/迁移类操作的状态显式化）；本地 macOS 打包免配置 DMG（分发面自持）。alpha 通道沿用（dsh 无 stable 线）。来源：`docs/research/R105-runtime-refresh.md`。
- **v0.2.1-alpha.3 记档（56 提交）**：**失败预览按源重置**（a2141868de：插件预览失败按来源精确复位，非一刀切清场——恢复动作的作用域要与故障作用域对齐）；**CUA 校验错误可读化+坐标指引**（b01b889632/8ed497a02d：Zod 校验错误不再原样直出，改为可读错误+坐标口径说明——自动化报错的第一读者是下一个动作的决策者）；**陈旧坐标失效**（aeada33774：窗口列表刷新即失效旧截图坐标——环境已变，旧观测必须作废，防「拿旧图点新窗」）；**有界剪贴板等待**（0f83b644c8：等待带上限与可执行失败信息——无限等待是静默挂起的温床）；内置特性徽标预览（7fcaf07051：内置面与插件面同场可见，功能来源可辨认）；CUA 平台能力投影全覆盖测试（5da34fb5ae）+unread paste 恢复路径先测后修（7bfefd3118）。alpha 通道沿用。来源：`docs/research/R112-runtime-refresh.md`。
- **v0.2.1-alpha.4 记档（89 提交）**：**宿主版本边界三连**（a7a40f93d9 client-modules 先比对 host release 再解析图 / f52abc04fa 另一宿主版本的插件更新不应用 / 7c9e54b3ef 宿主版本变更提示重载——**由不同宿主版本算出的状态不消费**：解析、应用、提示三面都在版本比对之后，与「陈旧坐标失效」纪律同族（v0.2.1-alpha.3 段）但把「环境已变」的判定点前移到消费入口）；**包源码 module-scope await 静态拒绝**（b77cc1c0f2 gates——危险形态在装载前拒止而非运行后报错，静态门禁先于运行动态门禁）；**缺失退出码如实呈现**（e8488f6b41 终端呈现保全缺失退出码、不把未知清成 0 / 00f897b048 命令退出中性内联胶囊、95e76236bf 徽标与长描述隔离 / e480bda8d2 subagent-codex 把 payload 叫「所选答案」——**结果词表诚实化**：不可判定态如实呈现缺失，命名随语义走）；**reasoning 档位从 pi-ai schema 读**（b542292bf9 模型能力元数据单一事实源+61059baf61 编辑随模型持久+7d654c9d8a 误导性「已关 reasoning」提示删除——硬编码能力面退位给 schema，误导性提示宁删勿留）；**插件市场来源可追溯三连**（ab3bb74550 来源仓随插件携带 / ed92c867ed Discover 安装面点名插件与版本 / 434dc116f0 引用索引生成器——安装面带出处，来源与版本随产物走）；**环境身份从可观测证据确认**（c97f840c89 从监听 socket 确认 user manager / 055c7d7a74 每次缓存 Linux scope 启动前再确认 / 39874e62ba 探测按 provider 生命周期一次化并记成本——探测有界且以证据为准）；**失败保留恢复路径**（c7ab529c34/dcc8df8320 安装器对话框保留恢复路径与已报恢复态+重试点名 / 14819e2eb4 Windows 安装器目录锁重试并报失败 / 06e5024577 失败详情有界）；webworker 预览从随包 profile 启动+懒块按需取（93d2ad2d25，按需物化）。alpha 通道沿用。来源：`docs/research/R115-runtime-refresh.md`。
- **v0.2.1-alpha.5→rc.2 记档（alpha.5 36 提交 + rc 线 13 提交；rc 出线=预登记触发点「dsh-v0.2.x stable/rc tag」兑现，基线升 rc.2——rc 作基线沿历史先例）**：**调试产物发布早拒**（reject debug publications early——调试发布在发布链早期拒绝而非事后清理，发布面 fail-closed）；**Windows 打包默认签名**（安全默认从 opt-in 翻为默认值——签名是分发件的出厂态不是可选项）；Windows 打包 runner 用 Task Scheduler 监督+发布到管理面未版本化的 COS 桶（发布基建的监督与目标面容错）；**PTC 指令组合非散文替换**（compose PTC instructions without prose replacement——指令以组合件拼接，不改写用户散文原文；组合优于改写，与「装饰与提交面分离」同根）；**未校验通知元数据保留**（保留未校验的通知元数据不吞字段——未知字段是上游演进的信号，宽容输入+显式标注优于静默丢弃）；**终端发现按会话共享**（share terminal discovery per session——资源发现的缓存作用域=会话，跨会话复用是陈旧观测温床）；**时钟钉定回归扫 Host clock distance**（pinned-clock fixture 在多个 Host 时钟距离下扫——时间敏感测试要覆盖「钉定时刻与真实时钟的差距」维度，防只在零距离下绿）；通知族（通用通知字段+多层叠放+空标题/过期队首处理+高度平滑过渡）；provider-aware 模型标签与菜单定位族（UI 面）；rc 线实质件=DeepSeek Search/Fetch API 走设置开关（#6103——新能力面 opt-in 进配置面）+DeepSeek Flash 显示名 1017 徽标先上后撤（临时徽标的上撤轨迹留痕——临时态也要可追溯）；其余为 vendor 升级批（cordis 4.0.5 族）。来源：`docs/research/R117-runtime-refresh.md`。
- **v0.2.1-rc.3 记档（2026-10-23）**：机制面零变化（hooks/Mods/sandbox/权限 30 包仅版本号刷新）；API-key 路线跟随官方 /models 列表——拉取失败保留上次好列表或内置目录（降级保真）、本 build 不能服务的已列模型在网络 I/O 前拒绝、凭证失败归因到模型请求面（回合保留 prompt 与失败尝试）（c48f8523f2 #6944）。来源：`docs/research/R140-runtime-refresh.md`。

## v0.2.1-alpha.2→rc.2 架构面深读

> 2026-10-19 深读（ncwk 参照仓归位触发，990 提交全量深读）。工程面六条已在前节，本块为架构面机制位。

- **密码学身份锚定的授权撤销**（CUA 应用级同意）：持久授权身份=规范可执行路径+验证过的签名要求 SHA-256，换壳/更新可区分；不可验证/自签应用只给任务级授权且绑定进程实例；撤销授权级联终止持有句柄的 Agent 连接——**授权绑定的是密码学身份不是文件名**，撤销有级联半径。谁消费：电脑操作类工具的应用授权面参照。
- **权限生命周期与执行环境绑定**（persistent PTC）：保留态执行环境持有创建时的沙箱策略，文件策略变更即整体失效全部保留环境；一次性提权审批不带 state owner、用完即弃、不能访问常驻变量——**授权是否可持续是结构属性**：环境级授权随策略漂移自动作废，临时提权物理隔离于常驻态。
- **required 运行时上下文+快照对比重注入**（team:identity）：团队身份经 systemPrompt.context() required 注入，压缩后由主循环对比保留快照自动重注入，角色变化追加完整上下文快照——**关键身份不依赖对话历史完整性**，压缩/分叉后的身份漂移由主循环结构性修复。
- **状态压缩用日志回放验证等价**（contextBreakdown）：O(消息数) 投影状态压到常量级（7.13MB→110KB），用 836 个真实 Session 日志全量回放逐事件比对新旧定义等价——**有损状态机重构的可复制方法论**：等价性靠真实语料回放证明不靠审查自信。
- **渐进式技能加载复用既有执行面**（Office 技能）：紧凑 router+按需加载正文；渲染走普通 shell 的审批/沙箱/取消，不为单能力新造特权执行路径——**能力扩展复用既有安全边界**。
- **principal/peer 分离+方法级 RBAC**（@Remote 声明 resources）：授权身份与连接分离，wire 字段不可设置身份；每条 prompt 记录 source.principal 可溯源——**身份是内核指派不是对端声明**。来源：`docs/research/R123-runtime-refresh.md`。
