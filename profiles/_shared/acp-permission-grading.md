# ACP 权限分级协议（DSH RC8 融合 P2-9）

> 来源：DeepSeek Harness rc.8 `subagent-claude-code/src/run.ts:43-55` + `subagent-codex/src/run.ts:61-68`
> 融合日期：2026-08-21
> 原则：零代码等效——全部走 prompt/规则层，不改 ACP 协议、不改 Python 源码
> 核心痛点解决：当前 `approval_policy=never` 一刀切，无法按 worker 角色差异化授权

---

## 1. 核心概念

### DSH 权限模式（5 级）

| 模式 | 行为 | 适用场景 |
|---|---|---|
| `dontAsk` | 未授权操作直接拒绝，不提示（默认） | 只读分析类 worker |
| `acceptEdits` | 接受文件编辑，其余提示仍被无人值守回调拒绝 | 代码编辑类 worker |
| `auto` | 由 Claude Code 原生分类器允许或拒绝 | 通用任务 |
| `plan` | 原生计划模式，拒绝执行批准，返回完整计划作为最终答案 | 规划类任务 |
| `bypassPermissions` | 显式设置 SDK 危险确认并绕过权限检查 | 高危操作（需 Guardian 二审） |

### Hermes 等价物

Hermes 当前 `approval_policy=never` 是全局一刀切配置。本协议在不改配置的前提下，通过 **SOUL.md 规则层** 实现按 profile 角色的差异化授权。

---

## 2. Profile 权限分级映射

| Profile 组 | 推荐权限模式 | 说明 | 风险等级 |
|---|---|---|---|
| **orchestrator** | `dontAsk` | 路由调度不直接执行代码 | 低 |
| **worker-coder** | `acceptEdits` | 代码编辑需要文件修改权限 | 中 |
| **worker-researcher** | `dontAsk` | 调研分析以只读为主 | 低 |
| **worker-tester** | `acceptEdits` | 测试可能需要写入测试文件 | 中 |
| **hack-*** | `bypassPermissions` | 安全测试需要高危操作 | **高**（必须 Guardian 二审） |
| **ops-*** | `acceptEdits` | 运维操作需要系统修改 | 中 |
| **[已移除]-*** | `dontAsk` | 教学内容生成以只读为主 | 低 |
| **product-*** | `dontAsk` | 产品文档以只读为主 | 低 |
| **platform-*** | `acceptEdits` | 平台治理需要配置修改 | 中 |
| **[已移除]-*** | `acceptEdits` | [已移除] 工具链需要脚本执行 | 中 |

---

## 3. 权限使用规则

### 3.1 默认权限（未显式声明时）

- 所有 profile 默认 `dontAsk`
- 需要更高权限时，必须在 SOUL.md 中显式声明

### 3.2 权限升级路径

```
dontAsk → acceptEdits → auto → plan → bypassPermissions
  ↑         ↑           ↑      ↑         ↑
  默认    代码编辑    通用    规划    高危（Guardian）
```

### 3.3 权限与 Guardian 的关系

| 权限模式 | Guardian 触发 | 说明 |
|---|---|---|
| `dontAsk` | 不触发 | 只读操作，无风险 |
| `acceptEdits` | 命中 banned-prefix 时触发 | 文件编辑+高危命令组合 |
| `auto` | 命中 banned-prefix 时触发 | 分类器放行后仍需二审 |
| `plan` | 不触发 | 只产出计划，不执行 |
| `bypassPermissions` | **每次执行前必须触发** | 最高风险，强制 Guardian |

---

## 4. SOUL.md 声明格式

各 profile 在 SOUL.md 的"核心能力域"或"标准作业循环"章节追加：

```markdown
## ACP 权限声明

本 profile 的 ACP 委托编码权限模式：`acceptEdits`

- 允许：文件编辑、代码修改、文档生成
- 禁止：高危命令（见 `_shared/banned-command-prefixes.md`）、凭据读取、外发数据
- 高危命令处理：命中 banned-prefix 时自动触发 Guardian 二审（见 `_shared/skills/codex-guardian-review/SKILL.md`）
```

---

## 5. 实施检查清单

- [ ] 各 profile SOUL.md 包含 ACP 权限声明段
- [ ] `bypassPermissions` profile（hack-*）的 SOUL.md 明确标注 Guardian 触发规则
- [ ] orchestrator SOUL.md 包含权限分级路由规则（按任务类型分配对应权限的 profile）
- [ ] `_shared/banned-command-prefixes.md` 作为所有权限模式的共同底线

---

## 6. 反模式

- ❌ **所有 profile 统一用 bypassPermissions**（权限通胀，失去分级意义）
- ❌ **hack-* 用 bypassPermissions 但不触发 Guardian**（最高风险操作无审批）
- ❌ **orchestrator 用 acceptEdits**（路由调度不需要文件编辑权限）
- ❌ **权限声明与实际操作不符**（声明 dontAsk 但实际执行文件编辑）

---

## 7. 与现有机制的关系

| 机制 | 关系 | 说明 |
|---|---|---|
| `approval_policy=never` | 底层配置 | 全局配置不改，本协议在规则层差异化 |
| `banned-command-prefixes.md` | 共同底线 | 所有权限模式的共同黑名单 |
| `codex-guardian-review` | 高危审批 | bypassPermissions 和命中 banned-prefix 时触发 |
| `mandatory-acp.md` | 委托规范 | ACP 委托编码的通用规范 |

---

## SOUL 内单行引用

```
ACP 权限分级（详见 _shared/acp-permission-grading.md）：orchestrator/researcher/[已移除]/product=dontAsk，coder/tester/ops/[已移除]/platform=acceptEdits，hack=bypassPermissions+Guardian 强制二审。
```
