# ACP 编码后端挂载通道设计（run12 前置头号件）

**主旨三句话**：①run11 用户指认方案 §2.4 步 18"hermes 经 ACP 调用编程工具（claude code/codex/zcode）完成编码"是设计意图而实跑为 hermes 直连 LLM 手写——IDE 工作台底层编码链零验证（issues.log acp-coding-backend-divergence）；②本设计给出三档落通道：L1 技能委托（可用引擎 CLI 即插）、L2 ACP 客户端 delegate 工具（协议级）、L3 zcode headless 自举（终态）；③验收锚=守门断言（DEV 派发词声明后端+agent 日志含委托回合+产物含后端指纹）。

## 现状事实（2026-10-09 核实）

- `hermes-agent-src/acp_adapter/`：**服务端面**（IDE 经 ACP 连 hermes：auth/session/tools/permissions/edit_approval…57KB server），无"hermes 作为客户端 spawn 外部编码 agent"的通道。
- 编码引擎可用性：宿主 `claude` CLI 在位（`~/.local/bin/claude`）；`zcode` 无独立 CLI（IDE 进程内引擎，headless 通道待产品侧开）。
- run11 编码实证：chen 回合 `API call #N model=aim provider=custom` 直调+write_file 直写——ACP 零参与。

## L1 技能委托（立即可落，零运行时改动）

**机制**：hermes 技能=内容件（无 runtime patch）。新增技能 `coding-delegate`：

```
skills/coding-delegate/SKILL.md
  触发：任务书含「编码后端=delegate」
  流程：①读契约（概设 §+任务书验收口径）②workspace 内调用：
       claude -p "<实现任务+契约+验收>" --allowedTools "Read,Write,Edit,Bash(npm test:*)" \
         --permission-mode acceptEdits 2>&1 | tee materials/delegate-log.txt
  ③委托者职责=拆解/契约/评审（diff 审查 delegate 产物）/集成（分支+testlog+结论行）
  ④委托日志 materials/delegate-log.txt 随任务归档=后端指纹
```

**harness 接线**（aipay-scenario devimpl 派发词，env 门控 `MX_ACP_BACKEND=1` 启用）：
任务书追加段：「编码后端=delegate——实现须经 coding-delegate 技能委托外部编码引擎执行（你在 workspace 调用其 CLI），你负责契约拆解/diff 评审/集成与 testlog；委托日志 tee 到 materials/delegate-log.txt 随分支提交（缺日志=未走后端，G3 承载面记单）。」

**守门断言**（tests）：①MX_ACP_BACKEND=1 时派发词含后端段 ②G3 真查扩 `materials/delegate-log.txt` 在分支 ③=0 时派发词无该段（保真对照）。

## L2 ACP 客户端 delegate 工具（协议级，hermes runtime patch）

`agent/tools/coding_delegate.py`：spawn `claude --acp-adapter` 或 zcode headless（就绪后），经 ACP 协议双向会话（prompt→tool_call 批准回流 hermes 审批流→产物 diff 返回）。补丁面≈564 族：工具注册+权限路由（edit_approval 复用）+会话生命周期。前置=引擎侧 ACP server 可用（claude 有；zcode 待开）。

## L3 zcode headless 自举（终态=产品主张闭环）

产品开 `zcode --headless --acp`：IDE 同引擎的 CLI 形态，承接 L2 客户端。此后"IDE 工作台取代外部工具由 ACP 调用"完整成立（方案 §2.4 步 25 同步验收）。

## 实施序

run12 前置落 L1（技能+派发词+守门，一次推演验证委托链）→ L2 随 hermes 升级轮评估 → L3 列产品 backlog（与 IDE headless 需求合并）。

**Why（记录）**：run11 收官复盘轮用户指令（2026-10-09）"修复 swarm studio 及 hermes agent teams 存在的流程及功能问题"——ACP 背离为头号功能缺口；L1 是当天可验证的最小真通道。
