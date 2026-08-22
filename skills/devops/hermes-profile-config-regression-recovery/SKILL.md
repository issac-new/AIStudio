---
name: hermes-profile-config-regression-recovery
description: Use when profile config 自定义字段被批量操作静默洗掉后需恢复或审计.
triggers:
  - "hermes update 之后复查 profile config"
  - "clearances 丢失 回归"
  - "批量修改 config 后字段消失"
  - "27 profile 配置审计"
---

# Hermes Profile Config 回归恢复与审计探针

## 触发条件
- `hermes update` 之后、任何批量 config 修改之后（正则/yaml.dump 整文件重写）
- markings 校验静默失效、跨 board 路由误报 capability 不足
- 定期多 profile 审计轮

## 回归签名（两次实测：2026-08-16 context_length、2026-08-17 clearances）
- 被重建的 config 明显变短（~198-296 行 vs 完好 ~663 行）
- 自定义顶层字段消失但标准字段全在 → YAML 合法、启动无报错，**纯静默丢失**
- 丢失集合常与"某次批量修复的第 1 批文件"精确吻合 → 定位根因：批量工具整体重写了那批文件

## 恢复流程（2026-08-17 验证，一次恢复 19 个）
1. `session_search` 找回历史批准值表（搜「clearances 批量 修复」）；权威值表见 `references/team-clearance-value-table.md`
2. 备份到 `~/.hermes/backup/config-<字段>-restore-<日期>/`
3. 文件末尾**追加** col-0 顶层块（勿用 yaml.dump 整文件重写——会重排键序、丢注释）
4. 复验：`yaml.safe_load` 逐个断言 `keys_after[:-1] == keys_before` + 值匹配 + 全量计数

## 预防探针（每轮审计必跑）
- 自定义字段存活检查：`scripts/clearances_audit.py`（可直接运行）
- 批量修改三纪律：先备份 / 改后机械复验 / 记录丢失集与历史批次的吻合关系

## 陷阱
- **os.walk 符号链接**：profile 的 `skills/<category>` 多为指向 `~/.hermes/skills`（default profile）的符号链接，`os.walk` 默认不跟进 → 索引只剩 ~87 个，技能引用对账大量误报"不存在"。必须 `followlinks=True` 且并入 `~/.hermes/skills` 与 `~/.hermes/hermes-agent/skills` 两处
- **插件 enabled≠installed**：config `plugins.enabled` 含 acp-client 但 `plugins/acp-client/` 目录缺失 = 运行时 `acp_send` 不可用。对账后从有实体的兄弟 profile `copytree`
- **跨 profile 路径依赖**：SOUL 硬编码 `~/.hermes/profiles/<他profile>/skills/.../xx.py` 是脆弱依赖。合理例外：[已移除] 教师→[已移除]-orchestrator/references 共享档案、orchestrator 诊断命令。修法=改指本 profile 符号链接技能路径
- **terminal 系统 python3 无 yaml**：探针走 execute_code（hermes venv）或落盘 .py 再跑
- **"缺 block 合理"误判**：侦察/总是有产出的角色也需要 kanban_block（授权缺失/信息不足/工具被阻时的退出路径），complete+block 必须双全
- **protocol_violation 卡 blocked 的恢复**：worker 干完活但没调 terminal call → 调度器记违规并 block。恢复模式=先机械验证产物真实存在（文件+cron+DB）→ kanban_comment 留审计痕 → kanban_complete（metadata 带 followup）——不是重跑任务

## Related Skills
- iterative-team-capability-audit（default profile）——多轮审计轮次框架，本技能是其结构轮的深度扩展
