---
name: hermes-profile-config-regression-recovery
version: 1.0.0
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

## 配置「生成源 vs 生成产物」：反复洗回的根因（多次实测）

全舰队 47 个 profile 的 `config.yaml` 是 **`~/.hermes/shared/profiles.yaml` 经 `~/.hermes/bin/generate-configs.py`（或 `generate_harness_configs.py`）生成的产物**。这是双层结构：

- **生成源** = `~/.hermes/shared/profiles.yaml`（`shared_config` 顶层模板块，含 `display:`/`model:`/`toolsets:` 等全舰队共享段）+ root `~/.hermes/config.yaml`
- **生成产物** = `~/.hermes/profiles/<name>/config.yaml`（生成器每次跑就整体重写回源里的值）

**铁律：任何全舰队生效的字段修复，必须改「生成源」，不能只改「生成产物」。** 只改产物 = 生成器下次一跑就洗回原值。这是「说生效了但事实上没生效」的最常见根因——改了产物、当时看着对了，几小时后某次生成/批量扫描又整体重写回旧值。fallback api_mode 的「落三层」教训就是这条的特例（见下节）。

**定位生成源的判据**：某字段在多个/全部 profile config 里同值，且 `grep` 在 `~/.hermes/shared/profiles.yaml`（或 root config）找到同一键——它就是源；改这里才持久。[已移除] 等 profile 若无单独 override，就吃 `shared_config` 共享段的值。

**洗回的指纹**：多个 profile config 与 `profiles.yaml` **同一秒 mtime 被改**（`stat -f '%Sm'`），或 `profiles.yaml` 与产物同步变化——这是「生成管线跑了一遍」的信号，不是有人手动改。找触发者看同刻活跃的 cron/脚本日志（`onboard-worker.log`、`*_drift_audit`、批量生成/迁移脚本）。

**验证修复真落地**（不是只看文件改对）：①`grep -rl '<坏值>' ~/.hermes/profiles/*/config.yaml ~/.hermes/shared/profiles.yaml ~/.hermes/config.yaml` 应为 0 ②重跑 `generate-configs.py` 后再 grep，仍为 0（源已清，生成器不会写回）③对**运行中的 agent**，personality 等配置在 agent 构造时定格进 `ephemeral_system_prompt`（`chat_completion_helpers.py` 拼接 `agent._cached_system_prompt + ephemeral_system_prompt`），文件改对 ≠ 活进程用上——必须重启 agent/网关进程才刷新（重启时序见 hermes-gateway-operations）。

## 回归签名（实测：context_length、clearances、fallback api_mode）
- 被重建的 config 明显变短（~198-296 行 vs 完好 ~663 行）
- 自定义顶层字段消失但标准字段全在 → YAML 合法、启动无报错，**纯静默丢失**
- 丢失集合常与"某次批量修复的第 1 批文件"精确吻合 → 定位根因：批量工具整体重写了那批文件

## 恢复流程（2026-08-17 验证，一次恢复 19 个）
1. `session_search` 找回历史批准值表（搜「clearances 批量 修复」）；权威值表见 `references/team-clearance-value-table.md`
2. 备份到 `~/.hermes/backup/config-<字段>-restore-<日期>/`
3. 文件末尾**追加** col-0 顶层块（勿用 yaml.dump 整文件重写——会重排键序、丢注释）
4. 复验：`yaml.safe_load` 逐个断言 `keys_after[:-1] == keys_before` + 值匹配 + 全量计数

## fallback 条目 api_mode（2026-09-17 第三次实测：源级缺失导致全量洗回）
- 每条指向 cc-switch 的 `fallback_providers` 条目必须显式带 `api_mode: anthropic_messages`——缺失时 fallback 重检测可把会话 wire 改写（如 anthropic_messages→chat_completions）并钉死进 `sessions.model_config`，此后该会话永远打错路由（400 modelCode 不存在）。这是 provider-route-diagnostics「会话钉死」问题的上游根因
- 修复必须落三层（=「生成源 vs 生成产物」铁律的特例）：①源 `~/.hermes/shared/profiles.yaml` ②模板 `profiles/_shared/config.yaml` ③全部 live `profiles/<name>/config.yaml`。只修落地层 = 下次 regen 洗回（实测：修过 41 个落地 config 但源文件没修，数日内全部洗回）
- 审计探针：yaml 扫三层，断言每条 cc-switch fallback 条目含 api_mode；会话侧对账用 `~/.hermes/scripts/session_wire_watchdog.py`（漂移 exit 1，`--fix` 原地对齐+备份）
- yaml 重写后必须 `safe_load` 回读验证

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
