---
name: cron-job-management
description: "Review, consolidate, and repair Hermes cron jobs."
version: 1.0.0
metadata:
  hermes:
    tags: [devops, cron, maintenance, drift, jobs]
    related_skills: [harness-entropy-management, hermes-gateway-operations]
---

# Cron Job 复盘与整合

> 复盘 cron job 库的核心纪律：**冗余 job 是 token 黑洞**，**unpinned agent job 会被模型漂移保护静默跳过**。

## 复盘检查清单

1. `cronjob action=list` 拉全量 → 按「功能域」分组（而非按名字）
2. 找功能重叠：同一件事有多个触发器（如每分钟 watchdog + 定时点 wrapper）
3. 找错误根因：`last_status=error` 的 job 必须看 `output/<job_id>/` 目录最新 .md 文件的 Error 段
4. 找一次性 vs 持续性错误：网络断连是一次性（直接 resume），脚本 bug/配置漂移是持续性（必须修）
5. 检查 deliver 渠道是否仍然有效（如 weixin 限流期要改 local）

## 冗余识别模式

| 模式 | 例子 | 动作 |
|------|------|------|
| 定时点触发器 + 每分钟 watchdog | ccswitch 14:00禁用 + 每分钟watchdog | 删定时点，watchdog 幂等覆盖 |
| 高频 LLM 轮询 + 低频 drift 检查 | triage-noise-filter(2min) + antiloop-drift(weekly) | 删高频，保留低频 |
| 周低频任务可并入日任务 | 知识整理(周日) 并入 每日统计 | 合并 prompt，删周 job |

## 模型漂移保护 (#44585)

全局 provider/model 变更后，**unpinned** 的 agent cron job 会被跳过并报：
```
RuntimeError: Skipped to prevent unintended spend: global inference config drifted since this job was created
```

**修复**：直接编辑 `~/.hermes/profiles/<profile>/cron/jobs.json`，给 job 加：
```json
{
  "model": "aim",
  "provider": "custom:cc-switch",
  "base_url": "http://127.0.0.1:15721"
}
```
`cronjob action=update` **不暴露 pin 参数**，必须改文件。改前备份（`.bak-MMDD`）。

**no_agent 脚本 job 不受影响**（不经过 LLM）。

## Token 优化：no_agent 化判断标准

cron token 黑洞的头号来源：**脚本输出已结构化，LLM 只负责转述**。识别信号：
- 脚本 stdout 是固定格式统计数字/表格（如 `正向: N条, 反向: M条`）
- LLM prompt 只是「运行脚本，读输出，简要总结」——没有真正的分析/判断/生成
- 输出要么为空（无需同步）要么两行数字（用户自己能看懂）

**动作**：`jobs.json` 里把 `no_agent` 改 `true`、清空 `prompt`。空输出自动静默（no_agent 语义：stdout 空=不投递），有输出才投递。

**反例（不能 no_agent 化）**：需要 LLM 读全文做精选/摘要/判断的（如每日情报从 8 篇正文选 3-5 篇写替读摘要）。

**实测验证**（改完必须跑）：
```bash
cronjob action=run job_id=<id>
# 等 delegation 完成后看结果块：
#   API calls: 0  → no_agent 化成功
#   API calls: N  → 还在走 LLM，检查 no_agent 字段是否真的写进去了
```

2026-08-20 实测：孩子记忆双写 + ops-eval 周报 no_agent 化后 API calls=0，每天省 3 次 LLM 调用。

## deliver 渠道修复

- `deliver=weixin` 报 "platform 'weixin' not configured/enabled" → 改 `deliver=local`（本地静默）
- `deliver=origin` 在 TUI 会话无投递渠道 → 改 `deliver=local` 或 `deliver=weixin`
- 邮箱检查类 no_agent job → `deliver=local`（有未读才输出，本地留档）

## jobs.json 直接编辑模式

```python
import json, os, shutil, datetime
p = os.path.expanduser('~/.hermes/profiles/orchestrator/cron/jobs.json')
shutil.copy(p, p + '.bak-' + datetime.datetime.now().strftime('%m%d'))
d = json.load(open(p, encoding='utf-8'))
for job in d['jobs']:
    if job['id'] == '<job_id>':
        job['model'] = 'aim'
        job['provider'] = 'custom:cc-switch'
        job['base_url'] = 'http://127.0.0.1:15721'
d['updated_at'] = datetime.datetime.now().isoformat()
json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
```

## inventory_watchdog.py 解析器 pitfall

`~/.hermes/profiles/orchestrator/scripts/inventory_watchdog.py` 的 `_load_boards()` 解析 `shared/profiles.yaml` 时：
- 期望 list 条目缩进是 **4 空格**（`    - xxx`）
- 实际 profiles.yaml 是 **6 空格**（`      - xxx`）
- 导致所有 profile 被误判 UNSCOPED

**修复**（2026-08-20 已应用）：
```python
# 错误
if key and line.startswith("    - "):
    boards[prof].add(line[4:].strip())

# 正确
if key and _re.match(r"^\s{6}- ", line):
    boards[prof].add(line.strip()[2:].strip())
```

改前备份：`cp inventory_watchdog.py inventory_watchdog.py.bak-MMDD`

## skill-fence.py 修复 drift

26 个 profile 的共享 skill 目录是真目录副本而非 symlink 时：

```bash
# dry-run 预览
$HOME/.hermes/hermes-agent/venv/bin/python $HOME/.hermes/shared/skill-fence.py

# 正式执行（归档非 board 真实目录到 skills-archive/）
$HOME/.hermes/hermes-agent/venv/bin/python $HOME/.hermes/shared/skill-fence.py apply
```

**注意**：`--dry-run` 是 positional argument 的 choices，直接传 `apply` 或留空（默认 dry-run），不要传 `--dry-run` flag。

## 复盘后机械验证

```bash
# 确认 watchdog 干净
python3 ~/.hermes/profiles/orchestrator/scripts/inventory_watchdog.py; echo "exit=$?"

# 确认所有 job scheduled
cronjob action=list | python3 -c "
import sys, json
d = json.load(sys.stdin)
for j in d['jobs']:
    print(j['job_id'], j['name'], j['state'], j['last_status'])
"
```
