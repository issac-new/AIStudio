# AIStudio 九段架构执行校正

日期：2026-10-26
分支：`fix/core-coding-chain`（接续既有未提交成果）
状态：实施中

## 变更

用户给出的九段架构是本批验收依据：驾驶舱；Matrix 与内嵌聊天；本机 gateway 统一承接 agent 消息和远端 bot 调用；看板挂载归属于本机人类员工的 agent teams；Ycode；swarm-yuan；Hermes 经 ACP 调 Ycode 并使用项目技能；Ycode 以 kanban 任务 workspace 为项目根且取得任务上下文；关键决策由人作出，AI 提供辅助。

本批接续 `2026-10-26-core-coding-chain-alignment.md` 和 `2026-10-26-a2a-board-harness-alignment.md` 的未提交成果。既有结果先复验，不重复建设。新增工作集中在前两批未覆盖的授权、人工门、任务上下文、技能实证和推演硬门。

### 九段追踪

| # | 目标 | 当前判断 | 本批收口判据 |
|---|---|---|---|
| 1 | 每个用户本机驾驶舱 | 产品已存在，概览授权口径不一致 | 双账户只见各自任务与身份，现有导航不重构 |
| 2 | Matrix＋内嵌聊天 | matrix-js-sdk 主链存在；Element 是参考实现 | 人类 SDK 直连保留；agent 消息不得绕 gateway |
| 3 | 本机 gateway 统一 agent 入口 | peer/Matrix 主链存在，仍有旁路 | ChatBridge、Harness REST、列自动化不再另起 agent 执行链 |
| 4 | 看板团队及人类归属 | 板级围栏和装配已有成果 | 概览、身份、技能供给与执行围栏使用同一授权口径 |
| 5 | Ycode | 分叉引擎和 ACP 桥已存在 | 编码主链使用分叉引擎，身份和模型可反查 |
| 6 | swarm-yuan | 生成器存在，另一分支正修核心可信性 | 本批只消费其公开流程，不与其争改生成器 |
| 7 | ACP→Ycode→XXX-dev | provider/cwd 已有接续改动，技能实证不足 | 准备、激活、重新发现、真实 Skill 调用均留证据 |
| 8 | 任务 workspace＋上下文 | cwd 跟随已有接续改动，上下文仍靠手工摘抄 | taskId 由程序生成完整上下文，cwd 与任务根一致 |
| 9 | 人主导关键决策 | 审批实物存在，但身份与执行门不完整 | 认证主体、授权 grant、G5/T2/T3 执行检查形成同一契约 |

### 范围外

- 不重构驾驶舱 IA，不处理另一会话的页签与设置裁决。
- 不改写历史设计和 run 档案，不批量润色全部 specs。
- 不覆盖真实 `~/.hermes` profiles，不重启宿主 gateway，不启动完整 26 步推演。
- 不把单机双 gateway 或 mock 结果称为真实多机、真实人工或真实模型成功证据。

## 决策记录

| # | 决策 | 理由 | 类型 |
|---|---|---|---|
| D1 | 复用 `core-chain` 工作树和既有两批成果 | 同一用户目标已有实施，另起分支会重复和冲突 | Mechanical |
| D2 | 人类 Matrix SDK 直连不属于 agent 旁路 | 第 3 项约束的是 agent 执行入口，不是禁止人类使用聊天客户端 | UserChallenge（已由本批方案批准） |
| D3 | Ycode 是编码主链，Claude/Codex 只作显式对照 | 静默换引擎会使第 7 项验收失效 | UserChallenge（已由本批方案批准） |
| D4 | 后台 ACP 自动携带完整上下文；IDE 仍由用户点击后才发送 | 两条会话通道服务对象不同，不能互相替代 | Mechanical |
| D5 | 技能准备先于正式编码，激活和真实 Skill 调用是硬证据 | 骨架脚本成功不代表项目技能可用 | Mechanical |
| D6 | 已批准任务内的普通编码可自动执行，关键决策需要认证 grant | 人工主导不等于每个文件写入都人工确认 | Taste（已由本批方案批准） |
| D7 | 模拟审批保留但标 proxy，不计真人净额 | 推演可代演流程，不能伪造人类决策证据 | Mechanical |
| D8 | 现行正本和索引更新，历史正文不改写 | 既要单一事实源，也要保留决策史 | Mechanical |
| D9 | 主会话独立复跑既有和新加测试 | 文档中的通过记录不是本轮证据 | Mechanical |
| D10 | 完整推演、真人会签和真实多机另列未验证项 | 未获得对应环境和操作授权，不能以推断代替实测 | Mechanical |

## 设计文档影响

- DESIGN_SYNC: touched
  - docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md —— 随实施补九段链路的真实边界、证据状态和缺口；当前提交先承接既有编码链修订。

## 验证

### 必做负例

1. A 账户不得读取或调用 B 账户的 overview、身份聊天、技能和看板团队。
2. ChatBridge、Harness REST、列自动化不得绕过 gateway 另起 agent 执行。
3. ACP 的 cwd 必须等于任务根；缺上下文、错误模型、未批准权限和路径逃逸均失败。
4. draft 技能、严格验证失败、未真实调用 Skill 均不得进入正式实现或 G3 通过态。
5. 伪造 approver、匿名批准、任务变化后的旧 grant 不得通过会签、T2/T3 或 G5。
6. G3 缺日志、非零退出、错误 cwd、缺技能证据、测试失败时不得写 `g3_code_pass`。

### 验证层

- 目标 Vitest、Python 拼合树 pytest、shell 语法与行为夹具。
- `typecheck:harness`、clean/inject 重放、`build:full`、全量 `npm test`。
- 隔离双账户浏览器、Matrix＋双 gateway/peer、脱敏 Ycode ACP 专项。
- 真实模型提供方失败时如实记录；完整 26 步、真实第二名会签人、真实多机另列未验证。

本文件只记录已批准的决策与验收口径。实际命令结果在实施后逐项补入，不预先写通过结论。
