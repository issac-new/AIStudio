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
> **长 agent job 会被 gateway 重启杀掉且不会自动重跑**——这是日报类 job 静默丢产的头号结构性原因，不是偶发 bug（见下「长任务中断」节）。

## 复盘检查清单

1. `cronjob action=list` 拉全量 → 按「功能域」分组（而非按名字）
2. 找错误根因：`last_status=error` 的 job 必须看 `output/<job_id>/` 目录最新 .md 文件的 Error 段，**并区分错误类型**（见下）
3. 找一次性 vs 持续性错误：网络断连是一次性（直接 resume），脚本 bug/配置漂移是持续性（必须修）
4. **重点排查 `Gateway shutdown (post-interrupt) killed the job's tool subprocess`**——这是长任务被 gateway 重启杀掉的信号，根因与修法见下「长任务中断」节
5. 检查 deliver 渠道是否仍然有效（如 weixin 限流期要改 local）

## 长任务中断（Gateway shutdown / interrupted）——日报类 job 静默丢产根因

**这是 2026-09-04 定位的一个结构性坑，日报 job 连续 2 天 error 的根因。** 不要当偶发网络故障忽略。

### 机制（file:line 锚点，已核实）

- cron job 由 **gateway 进程**承载调度执行。gateway 重启/被 `--replace` 替换（SwarmStudio 拉起新会话、重启服务）时，正在跑的 cron 子进程被一起杀掉。
- 恢复机制 `cron/executions.py:271 recover_interrupted_executions()` **只把被打断的执行标成 `unknown`，docstring 明确 `without scheduling retries`——不自动重跑**（file:line 已读）。
- 结果：长任务在 gateway 重启时段被撞上 → 静默丢一天，**只能等下一次 24h 后的 cron 触发**，没有任何自动补跑。

### 触发信号
- job `last_error = Gateway shutdown (post-interrupt) killed the job's tool subprocess`
- gateway error log 里同刻 `Shutdown context: signal=SIGTERM ... --replace`，且 `cron.scheduler_provider: Marked N interrupted cron execution(s)`
- 本机白天高负载（loadavg 冲高）时 gateway 会反复重启（`shutdown_watchdog: event loop missed 3 consecutive liveness probes`），长任务窗口撞上概率大增

### 根治（不是祈祷 gateway 别重启，是让任务韧性）
对**运行 > 几分钟 / 有多步 / 有 LLM 分析**的 agent job，必须做到：
1. **任务切小 + 幂等分步**：抓数 / 分析 / 生成 / 推送 拆成独立步骤，每步产物落盘（如 `cache/<step>_<date>.json`）。任一步先检查「产物已存在且新鲜（当天）则跳过」。任何一步被杀，重跑从断点续，不重来。
2. **外层套幂等 wrapper**：串各步 + 每步超时上限（一步失败不拖垮整体）+ **同夜自动补跑**（检测「今日未成功产出」则循环重试，直到产出或达上限）。**不要依赖 cron 内置 retry——它没有**。
3. 单步别太重：本机负载敏感（实测 loadavg 冲 139 时 gateway 会崩），单步设超时（如 ≤120s/源），避免再触发高负载。

### 判别：短脚本 no_agent job 不受影响
几分钟内跑完、单步的 `no_agent` 脚本 job 基本不会撞上（窗口太小）。**需要 LLM 逐篇分析/多轮的长 agent job 才是高危**。

---

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
/Users/YOURNAME/.hermes/hermes-agent/venv/bin/python /Users/YOURNAME/.hermes/shared/skill-fence.py

# 正式执行（归档非 board 真实目录到 skills-archive/）
/Users/YOURNAME/.hermes/hermes-agent/venv/bin/python /Users/YOURNAME/.hermes/shared/skill-fence.py apply
```

**注意**：`--dry-run` 是 positional argument 的 choices，直接传 `apply` 或留空（默认 dry-run），不要传 `--dry-run` flag。

## 2026-09-05 夜间日报全挂排障实录（Script not found + 三连坑）

**根因**：脚本搬进 life-workbench/scripts/ 但 cron job 仍指 profile scripts/ → 全部 "Script not found"。修复模式与三个引擎硬约束：

1. **symlink 会被拦**：`cron/scheduler.py:4583-4604` 对 script 路径 `.resolve()` 后强制必须落在 `HERMES_HOME/scripts/` 内（防 symlink escape）。搬移脚本用**真 shim**（一行 `exec bash <真实路径>/xxx.sh "$@"`），不放 symlink。
2. **cron 不传参**：`argv=[bash, path]` 无参数位 → `domain_nightly.sh <domain>` 这类带参入口必须每域一个独立 shim 文件硬编码参数。
3. **kanban CLI 语法随 9.4 update 漂移**：`--workspace <裸路径>` 已改为 `--workspace dir:<path>`（旧值直接被拒）→ `domain_closure.py` dispatch 全灭（报错被吞成空 stdout）。域闭环脚本引用 CLI 时须跟版本回归。

**weixin 投递失败判别**（logs 在 `~/.hermes/profiles/orchestrator/logs/agent.log`，非 ~/.hermes/logs/）：
- `cooldown active for 30.0s` = adapter 本地熔断（threshold=1，一次真实 429 即断 30s，`weixin.py:1247-1263`）
- 直连探针 `ilink/bot/sendmessage` 返回 `errcode:-14 session timeout` = **iLink 会话过期**，需用户在微信里给 bot 发任意一条消息刷新 context token，之后投递自然恢复。勿密集重试（每夜配额有限，轰炸会触发真实 429 加长熔断）。
- 邮件通道兜底对账法：`grep 'email sent' cache/radar/*.log` 提取字节数与 `reports/*.pdf` 文件大小逐一匹配，0 missing = 全送达。

**补跑顺序纪律**：先修 script 解析（shim），再 cronjob action=run 补跑（等 async 结果块），最后 gap dispatch 重放 + 邮件对账。补跑会整链重放（含建卡/邮件），勿先手动跑脚本再 run job（会双投递）。

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
