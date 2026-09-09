---
name: recurring-target-asset-inventory
description: "Use when 对既有测绘/情报目标做周期性资产盘点或时效复验。三面并行+Checker。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, orchestration, security, kanban, inventory]
    related_skills: [scale-adaptive-routing, delegation-brief-format, orchestrator-kanban-tracing]
---

# Recurring Target Asset Inventory（既有目标周期性资产盘点编排）

> 来源：2026-08-27 行芯科技(Phlexing)测绘资产盘点实战（基线 2026-07-31 → 三面并行复验 + Checker 合并）。
> 定位：orchestrator 对**已有基线**的目标做第二次及以后的盘点/复验时的标准编排协议。首次测绘不适用（走目标域的完整 engagement 流程）。

## 触发条件 / When to Use

- 用户要求对某目标「盘点资产 / 时效复验 / 现状核验 / 资产清点」，且历史上已完成过测绘/调研
- 典型场景：安全测绘目标月度复验、供应商情报季度更新、竞品资产跟踪
- 信号词：盘点、复验、核验、清点、「此前的XX资产」

## 决策门（开工前两问）

1. **基线在哪、多旧了？** 基线日期距今 >2 周 → 所有资产必须带**复验时间戳**，禁止直接沿用旧结论。
2. **盘点 ≠ 重新测绘。** 复验以被动源/平台API/本地编目为主，不重复主动采集（成本+合规双重理由）。基线 engagement 的合规边界（如零目标流量、零凭据尝试）**原样继承**并写进每张子卡。

## 核心流程（5 步）

### 1. 基线定位（三路并行查）
- `session_search` 目标名+关键词 → 找到基线会话与产出文件
- workspace `find`/`ls` → 基线可能散在多处：主报告 md、专用目录（wayback 快照）、engagement 目录（终版报告+攻击计划）
- 对应看板 `kanban_list` 历史 → 该目标此前的任务图（判断哪些 profile 参与过，Checker 要避开它们）
- 产出：基线资产清单 + 基线日期 + 合规边界三条

### 2. 三面 MECE 分解（按域裁剪）
安全测绘域的标准切法（2026-08-27 实证）：

| 面 | assignee 类型 | 职责 | 复验方式 |
|---|---|---|---|
| 网络面 | recon 类 | 子域/证书/DNS | crt.sh、被动DNS、Wayback CDX、urlscan、RapidDNS（≥2 源交叉） |
| 本地数据面 | auditor 类 | 报告/快照/情报文件编目 | 磁盘实测 find+抽样打开，JSON 底账先行再出 md |
| 暴露面 | forensics 类 | 泄露库/凭据/员工账号 | 平台公开 API + 页面可达性证据，**严禁尝试凭据** |

其他域类比替换（如研究域：数据集面/方法面/结论面）。判断标准：三面互斥且并集=用户问的「资产」全貌。

### 3. 并行子卡 + Checker 卡
- 三张子卡同时 `kanban_create`（同 board、同共享 workspace 目录——先 mkdir）
- 第四张 Checker 卡 `parents=[三子卡]`，assignee 用**未参与任何产出**的 profile（Diamond 独立性）
- Checker 三问在正确性之外强制加**新鲜度**：「复验时间戳是否为当天？」

### 4. 卡片硬约束清单（逐张写入 body）
- 🔴 合规红线段：零目标基础设施流量 / 零凭据尝试（继承基线，逐字写明禁止项）
- 变化四态列：`new / unchanged / changed / gone`（盘点的核心价值是变化，不是存量）
- 每条资产强制：数据来源（URL/查询接口）+ 复验时间戳；关键结论 ≥2 独立来源
- 交付物含「边界声明」一节（未测试区域显式标注）
- 验收标准 `frozen: true` + `max_runtime_seconds`（重型卡纪律）
- 安全域 markings（如 TLP:AMBER）写入卡体

### 5. 产物文件优先监控（有界等待）
用户说「继续」= 要进度，不是要扩 scope（2026-08-14 scope-creep 教训）。监控要点：
- **以产物文件为准，不信 status**：worker 状态翻转（comment+complete）滞后于文件落盘；`ls *.md` 和 evidence 文件数增速才是真实进度
- 有界等待：约 20-30 次×5s 一轮的 for 循环，命中即 break，不要无限轮询也不要空手而归
- 可直接用 `scripts/monitor_deliverables.sh`（板名/任务ID/目录 参数化）
- 汇报格式：四卡状态表 + 每面真实产出证据（文件名+大小+时间）+ 下一步

## Pitfalls

1. **盘点报告 ≠ 三份拼盘**：Checker 合并的是「幸存内容」——去重、数字逐项加总核对，禁止三份报告矛盾数字并存。
2. **基线数字直接搬运 = 编造**：基线里「11个子域/107条专利」等必须复验后才进新报告，不复验的标 `stale(基线值)`。
3. **子产出缺文件时代写 = 越权**：Checker 发现缺件 `kanban_block(kind="dependency")` 退回，不代写补数据。
4. **共享 workspace 并发写**：三 worker 同目录时约定子目录（recon/ evidence/ 等）分隔，根目录只放各自最终 md，避免互相覆盖。
5. **不要在监控时顺手做事**：orchestrator 的角色是路由+监控；看见 worker 卡住先 steer/block，不亲自补位执行。

## 与其他 skill 的联动

- `scale-adaptive-routing`：先过路由门（本 skill 的场景几乎总是重型完整环路）
- `delegation-brief-format`：子卡 body 按其七要素模板写，本 skill 补充盘点域特有约束（四态列/红线继承/新鲜度）
- `orchestrator-kanban-tracing`：Gateway 来源消息时叠加留痕纪律；TUI 直连不建总控卡

## 与 Hermes 的集成映射

| 集成点 | 用法 |
|---|---|
| `kanban_create(parents=[...])` | Checker 卡挂三子卡依赖，自动解锁 |
| `kanban_create(workspace_kind="dir", workspace_path=共享目录)` | 三子卡+Checker 共用一个盘点目录 |
| `kanban_block(kind="dependency")` | Checker 退回缺件子任务的标准出口 |
| `terminal` sqlite3 查 board db | 监控时绕过 kanban_list 拿原始状态 |
| `scripts/monitor_deliverables.sh` | 有界等待循环的参数化实现 |
