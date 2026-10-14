---
name: kanban-quota-stall-recovery
description: "Use when kanban worker 卡卡在 provider 配额墙需打捞产出收口时."
version: "1.0.0"
metadata:
  hermes:
    tags: [kanban, dispatcher, provider, quota, orchestrator]
---

# Kanban 配额墙停摆救工收口（orchestrator 侧）

> worker 死于 provider 配额墙 ≠ 工作白做。本 skill 管 orchestrator 的收口决策：
> 何时等 worker 重试、何时打捞 run log 产出自行收口、如何避免把停车位当停摆修。
> 三分类/熔断风暴等底层细节见 default 侧 orchestrator-worker-failure-triage，
> 调度健康全景见 orchestrator-scheduling-audit（均跨 profile 只读）。

## 第一步：读错误文本定墙型（决定全部后续动作）

| 错误文本特征 | 墙型 | 会话内能否自愈 |
|---|---|---|
| `HTTP 403: You've reached your 5-hour usage limit` | 5 小时窗 | 能（等窗） |
| `HTTP 429: [1310] 您已达到每周/每月使用上限，限额将在 <日期> 重置` | 周/月墙 | 不能（数天外） |
| `HTTP 403: 用户额度不足, 剩余额度: ￥0` | 账户欠费 | 不能（需人工充值） |
| fallback_providers 残留失效模型的 403 | 配置残留 | 能（清残留即愈） |

先看文本里的重置时间戳，再选策略；禁不看时间戳就循环 unblock。

## 第二步：分清停车位与真停摆

上游 429 后 dispatcher 有 rate_limit_cooldown（默认 300s，env
`HERMES_KANBAN_RATE_LIMIT_COOLDOWN_SECONDS` 可调），`hermes kanban dispatch --dry-run --json`
出现 `respawn_guarded.reason=rate_limit_cooldown` = **正常冷却停车位**——防每 tick
烧重试，不是调度故障。配额墙期内冷却→重试→再 429 是死循环，只烧计数，停止重派。

另两个易混读数（详见 orchestrator-scheduling-audit 读数判读）：
- gateway 日志 `stuck: ready non-empty … 0 spawned` 无抑制后缀 ≠ 停摆（ready 口径宽于 spawn 门）。
- 短窗多条 `holding singleton dispatcher lock` = gateway 在反复重启，先查重启根因。

## 第三步：按墙型收口

**周/月墙（重置在数天外）——打捞收口序列**：
1. `hermes kanban log <task_id>` 读完整 run 日志——worker 死前常已产出完整侦察/根因链/实现。
2. orchestrator 独立核实证据：磁盘文件在位、干净 tmp 复跑 CLI 记 rc（勿在 worker 工作区复跑，
   防 .md 代码块/残留误导；grep 命中文档不算 CLI 存在证据）。
3. 核实过关 → `hermes kanban --board <slug> comment <id> "<收口结论+证据>" --author orchestrator`
   存档 → 关联台账 gap_register 收口（update status=done + resolved_fix）。
4. 卡本体留 ready 等冷却自然过期，或 archive；勿留着让人误以为还在等 worker。
5. 若工作未完成且时限紧：改派不受该墙限的 profile（先 `hermes -p <p> --cli chat -q "回复ok"` 冒烟）。

**5 小时窗/可自愈型**：等窗过 + worker 同款命令实弹冒烟 EXIT_RC=0 再 unblock（批量序列见
default 侧 failure-triage「自愈型 crash 波」节）。

## CLI 参数形状陷阱（kanban create / gap_register）

- `hermes kanban create`：title 是**位置参数**，`--title` 旗标不存在；`--board` 是 kanban 级旗标
  必须置于 create 前。报 unrecognized arguments 先查参数位置，勿换写法盲试。
  拿不准 active board 就 `hermes kanban boards switch <slug>` 后裸 create。
- `gap_register.py update` 合法字段：domain|description|evidence|severity|proposed_fix|status|
  kanban_task_id|created_date|resolved_date|resolved_fix|reopened_date|reopen_reason|
  needs_adjudication。收口用 **resolved_fix**（无 resolution 字段）。值含 `<`/反引号/圆括号必须
  整体单引号——双引号内反引号被 shell 当命令替换直接炸。
- update 成功回执 ≠ 库内终态：`gap_register.py list | grep <id>` 回读确认 status 真翻 done。
- 台账欠账先查真库再登记：卡面口头编号（如 kanban_comment 里写的 gap-xxx）可能从未落库，
  收口前 `list` 核对，缺则补 add 防双记账。

## 红线
- 429 重置时间戳决定策略：数天外打捞收口，小时内等窗重派；周/月墙期内禁循环重派。
- rate_limit_cooldown 扣卡是正常停车位，勿当停摆修、勿清状态硬闯。
- 收口证据必须 orchestrator 亲自磁盘核实 + 干净 tmp 复跑，勿沿用 worker 自述（文档写了 ≠ 代码落了）。
- 打捞的产出进看板 comment 与台账，不随 worker 死亡丢失；后续会话可从 comment 直接续作。