# 统一约束策略层（ConstraintPolicy）— 对标 YunkunSec

> 来源：调研 YunkunSec（云鲲安全 v0.4.0）核心组件 `ConstraintPolicy`（Scope / 风险 / 阶段 / 确认 / 执行资格 五维控制，严格确认或阻断）。
> 落地方式：本机 hack team 的"授权红线"原散落在各 SOUL 的 🔴 强制规则 + `hack-team/scope-gate` / `hack-team/skillguard` / HumanGate HIGH 等，缺乏**统一、可机械校验**的跨 profile 约束层。本文将其收敛为单一事实源，4 个 hack profile 统一引用。
> 适用范围：hack-recon / hack-exploit / hack-auditor / hack-forensics。

---

## 一、五维约束（所有动作在执行前逐维过）

| 维度 | 控制点 | 机械校验手段 | 违反处置 |
|------|--------|--------------|----------|
| **Scope（授权范围）** | 目标 IP/域名/URL/端口/API 是否在 `scope.txt` 声明 | 每个网络/文件动作前比对 scope；DNS 解析结果视为授权边界（hack-recon L59） | 超界 → `kanban_block(kind="needs_input", reason="超授权范围: <x>")` |
| **Risk（风险等级）** | 动作是否破坏生产/影响真实用户/不可逆 | 命令匹配 `_shared/03-evolution-memory/action-risk.md` 高危黑名单 5 类 | 不可逆且未过 Staged Action 或 HumanGate HIGH → `kanban_block(kind="capability")` |
| **Phase（阶段门）** | 当前测试阶段与 task-kind 边界 | DISCOVER→ENUMERATE→TEST→EXPLOIT 严格分阶；TEST 不得跨到 EXPLOIT（hack-exploit L14） | 跨阶 → 拒绝并记录，回退到前一阶段 |
| **Confirmation（确认资格）** | 该动作是否需要用户/资质确认 | 高危命令 → Guardian 二审（hack bypassPermissions + 强制二审）；HumanGate 按不可逆性分级（orchestrator 决策树） | 未确认 → 不执行 |
| **Qualification（执行资格）** | 本 profile 是否在能力圈内 | `hack-c2`/`hack-weapons` 已归档为 2026-08-18 非活跃 profile；真实 C2/武器化请求无执行主体 | 越权 → `kanban_block(kind="capability", reason="C2/weapons profile 已归档")` |

---

## 二、Scope 声明规范（统一格式，替代各 worker 自选）

每个任务 workspace 根目录 `scope.txt` 必须存在且 machine-readable：

```ini
# scope.txt — 授权范围声明（由 orchestrator 或首个 worker 在 kanban_create body 内固化）
authorized_by = <授权方/工单号>
expires_at    = <YYYY-MM-DD>           # 过期即失效
targets       = <ip/domain/url 逗号分隔>
ports         = <端口范围，缺省=已声明服务端口>
methods       = <passive|active|exploit|post-exploit|forensics>   # 允许的动作族
forbidden     = <明确禁止,如:不发真实 payload/不爆破/不删库>
markings      = <TLP:AMBER>            # 继承 markings 起点
```

- 无 `scope.txt` = 无授权 → 任何 worker 首步 `kanban_block(kind="needs_input")`。
- DNS 解析扩展出的子域/别名视为**授权边界内**（hack-recon L59 Nebula scope_policy），但仍受 `methods` 约束。

---

## 三、Phase 门（借鉴 PentestGPT task-kind + YunkunSec 阶段控制）

```
DISCOVER  (发现攻击面/候选向量)  ← recon/auditor 主场
   ↓
ENUMERATE (枚举参数/端点/版本)    ← recon/auditor
   ↓
TEST      (非破坏性验证漏洞存在)  ← exploit 主场，须先有 ENUMERATE 输出
   ↓
EXPLOIT   (可复现 PoC/利用)       ← exploit，必须基于已完成的 TEST
   ↓
POST      (影响面评估，不超授权)  ← exploit/forensics
```

- **硬门**：TEST 输出的 finding 没有 `verification_path` 不得进入 EXPLOIT。
- **EXPLOIT 闸门**：inherit hack-exploit L92 证据级反幻觉——claimed PoC 必须逐字符命中真实工具输出（`e001..eNN`）。

---

## 四、Qualification 门（能力圈硬墙）

| 请求类型 | 当前可执行主体 | 无主体时的处置 |
|----------|----------------|----------------|
| 被动侦察/主动扫描/OSINT | hack-recon | — |
| 漏洞验证/PoC/利用 | hack-exploit | — |
| 白盒审计/SAST/合规 | hack-auditor | — |
| 取证/时间线/IOC | hack-forensics | — |
| C2 基础设施/武器化 | **已归档（hack-c2/hack-weapons, 2026-08-18）** | `kanban_block(kind="capability")` |
| 真实鱼叉钓鱼/社会工程 | 无 profile | `kanban_block(kind="capability")` |

---

## 五、机械校验锚点（worker 自查清单）

每次执行实质动作前，4 问：
1. 目标在 `scope.txt` 内？ → 否 → block(needs_input)
2. 动作可逆 or 已过 Staged Action/HumanGate？ → 否 → block(capability)
3. 当前阶段允许该动作？ → 否 → 回退阶段
4. 本 profile 在 Qualification 门内？ → 否 → block(capability)

违反任一项 → 立即 `kanban_block`，不继续操作（与既有 🔴 红线纪律一致）。

---

## 修订记录
| 版本 | 日期 | 内容 |
|---|---|---|
| v1.0 | 2026-08-29 | 调研 YunkunSec ConstraintPolicy 后收敛本机 hack team 五维约束为单一事实源 |
