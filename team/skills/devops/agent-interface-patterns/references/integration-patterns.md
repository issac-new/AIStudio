# integration-patterns — MCP/staging/配置写入/单一源/token 工程/shadow

> 来源：OpenDesign `apps/daemon/src/`（repo 快照 2026-10-10），锚点标注。对应 R3 报告可移植清单 P1-P5/P8。

## §1 MCP 薄代理分层（P1，最高优先级）

**模式**：MCP server 进程只做两件事——参数校验 + HTTP 转发给后台 daemon。业务逻辑、状态、存储全在 daemon；MCP 层无状态、每会话独立进程、空闲可退出。

**OD 实证**：`od mcp` 全量 22 个工具，每个工具调用校验后转发 daemon HTTP API（mcp.ts:2343-2384）；凭据类字段在 MCP 层显式拒绝（mcp.ts:2616-2623）；30min 空闲退出（mcp.ts:67-68）。

**裁决理由**：MCP 协议演化快（工具面常重排），薄代理让 MCP 层随时可重建而不背业务状态。 Hermes 若做产品型 MCP（把系统能力暴露给外部 agent），分层照此：校验+转发在 server，状态在 daemon/gateway。

**配套安全位**：凭据拒绝前置在 MCP 层（不是 daemon 深处）；不透明归因参数（pluginWorkflowId）仅分析用途、从不用于鉴权（mcp.ts:332-336, 359-360）。

## §2 技能实体拷贝 staging（P3）

**模式**：每 run 把选中技能目录**实体拷贝**（dereferenced，非 symlink）到项目工作区的隐藏目录，目录名带源路径 hash 后缀；prompt 同时给工作区相对路径与绝对源路径回退。

**OD 实证**：`<project-cwd>/.od-skills/<basename>-<source-path-hash>/`；daemon 不写 `.cursorrules`、不装技能进 agent home（agent-adapters.md §4）。

**裁决理由**：staged 树会被 agent 的文件工具编辑——symlink/原地引用会把污染写回源技能库。拷贝+hash 是现成隔离方案。Hermes 侧对应场景：给 kanban worker 派 skill、或 agent 在项目里启用 skill 时。

## §3 配置写入三档策略（P4）

**模式**：任何「替用户写第三方工具配置」的自动化，按确证程度分三档（mcp-agent-install.ts:6-22）：

| 档 | 条件 | 动作 |
|---|---|---|
| `cli` | 目标工具自带 `mcp add` 类命令 | shell 出去执行，继承它自己的合并/校验规则（claude/codex/kimi 等） |
| `json` | 配置文件路径与 schema 均已确证 | 深合并单条 entry，永不 clobber 文件其余部分（cursor/copilot/cline 等 10 种） |
| `manual` | 路径或格式无法权威确证（pi/hermes/vibe） | **拒绝写猜测路径，只打印可粘贴片段** |

**裁决理由**：第三档是精髓——把「写坏用户配置」这一整类风险结构化排除。规划函数纯函数化便于单测，executor 分离。Hermes 侧对应：多 profile 配置写入、跨工具集成脚本。

## §4 host 契约单一源（P5）

**模式**：产品代码消费的宿主契约（协议常量、标记、格式定义）在**单一文件**定义，所有消费路径 import 它；改一条路径前，点名全部路径并逐一回答「变更是否到达」。

**OD 实证**：deck-framework.ts 单一源（contracts/prompts/deck-framework.ts:573，协议常量钉在 L48），三条 prompt 路径都消费，daemon 侧退化为十行 re-export。

**反例（反模式实证）**：prompt 组合双实现（legacy vs OD Next）五对文件漂移；修复单侧变更的 #7568（2026-08-29）绿灯但另一侧 bug 仍活，#7651（2026-08-31）以近两倍体量补齐（docs/prompt-composition.md）。

**Hermes 侧对应**：_shared 契约文档（ontology、marking-rules、exit-protocol）同理——SOUL 引用块与源文档漂移就是这个模式的缺失面；行为变更须枚举所有消费路径。

## §5 工具描述 token 工程（P2）

**模式**：每个工具描述单职责短句；多个工具共享的公共语义（fallback 行为、默认值说明）上收到 server instructions 只写一次，各工具描述只写「project optional」级别的短引用。

**OD 实证**：active-context fallback 说明只在 instructions 一处，注释明说这是为每次会话省 ~150 token（mcp.ts:322-326）。

**Hermes 侧对应**：大量工具的 description 可做同样「公共语义上收+单职责」，直接降每会话 token 基线。零成本。

## §6 registry shadow 语义（P8）

**模式**：多 root 技能注册时，**first-root-wins**：用户 root 的同名 id 遮蔽内置，但不删内置副本；改名的旧 id 经硬编码别名表转发，防止已存项目引用静默丢技能体。

**OD 实证**：`SKILL_ROOTS = [USER_SKILLS_DIR, SKILLS_DIR]`（server.ts:1443；skills.ts:4-9, 269-277）；`SKILL_ID_ALIASES` 别名转发表（skills.ts:28-33）。

**Hermes 侧对应**：skill-library 用户自定义与内置冲突时，同款「首根胜出+别名续期」语义优于报错或静默覆盖。

## 附：agent 适配器数据规格（补充参考）

加一个 agent CLI = 加一个 `RuntimeAgentDef` 数据对象（约 30 个可选字段全是数据或纯 arg-builder，无 run()/cancel()/子类）+ registry 数组加一项；通用引擎（detection/launch/invocation/stream 解析）零 per-agent 代码（docs/agent-adapters.md §1；runtimes/defs/ 实测 27 个 def，8 种 streamFormat 含 acp-json-rpc 9 个）。OD 对 claude 用 `claude -p --input-format stream-json --output-format stream-json --verbose`（agent-adapters.md §5.1）；对 codex 默认 `codex app-server` stdio JSON-RPC（§5.3）。加 CLI 不写类是「数据规格而非类」的范式样本。
