---
name: orchestrator-cli-reference
description: "Use when orchestrator needs kanban/markings/routing cmds."
version: "1.0"
trigger: "orchestrator 需要命令速查"
---

# Orchestrator CLI Reference — 命令速查手册

> 从 orchestrator SOUL 提取，作为独立 skill 按需加载，避免 SOUL 臃肿。

---

## 路由判定 & 留痕
```bash
# 中等复杂度留痕（工具调用3-5次或写1-2文件后执行）
# 在 agent 回复前先调用 kanban_create + kanban_complete

# 重型任务路由（工具调用≥6或写≥3或研究/编码/安全/部署）
# 先 kanban_create(triage=True) 再执行

# 查看当前看板任务
sqlite3 ~/.hermes/kanban/boards/swarm/kanban.db "SELECT id,title,status,assignee FROM tasks WHERE status IN ('running','ready','todo','blocked') LIMIT 20;"
sqlite3 ~/.hermes/kanban/boards/hack/kanban.db "SELECT id,title,status,assignee FROM tasks WHERE status IN ('running','ready','todo','blocked') LIMIT 20;"
```

## Worker 分配
```bash
# 查看可用 profile 列表（确认 assignee 名称正确）
ls -d ~/.hermes/profiles/*/ | xargs -I{} basename {}

# 验证 assignee 存在（避免 dispatcher 静默丢弃）
test -d ~/.hermes/profiles/worker-coder && echo "✓ worker-coder" || echo "✗ missing"

# 查看某 profile 的 model 和 toolsets
python3 -c "import yaml; c=yaml.safe_load(open('$HOME/.hermes/profiles/worker-coder/config.yaml')); print(c.get('model'), c.get('toolsets'))"

# 查看某 profile 的 clearances（markings 校验用）
python3 -c "import yaml; c=yaml.safe_load(open('$HOME/.hermes/profiles/worker-coder/config.yaml')); print(c.get('clearances', ['TLP:GREEN', 'TLP:CLEAR']))"
```

## Markings 机械校验（跨 board 路由时）
```bash
# 计算继承的 markings（从 parent tasks）
sqlite3 ~/.hermes/kanban/boards/<board>/kanban.db \
  "SELECT metadata FROM tasks WHERE id IN ('<parent_id1>', '<parent_id2>')"

# 校验目标 assignee 的 clearances
python3 -c "
import yaml, json, sys
assignee = '<target_assignee>'
c = yaml.safe_load(open(f'$HOME/.hermes/profiles/{assignee}/config.yaml'))
clearances = set(c.get('clearances', ['TLP:GREEN', 'TLP:CLEAR']))
inherited = set(json.loads(sys.argv[1]))  # 传入继承的 markings
missing = inherited - clearances
if missing:
    print(f'BLOCK: clearance 不足: {missing}')
    sys.exit(1)
else:
    print('PASS')
" '[\"TLP:AMBER\", \"PII\"]'

# 查看共享 ontology
cat ~/.hermes/profiles/_shared/02-org-orchestration/ontology.md | head -50

# 验证所有 SOUL.md 引用了 ontology
grep -rl "ontology.md" ~/.hermes/profiles/*/SOUL.md | wc -l

# 验证所有 worker SOUL.md 含前线侦察步骤
grep -rl "前线侦察" ~/.hermes/profiles/*/SOUL.md | wc -l
```

## Gateway & 调度诊断
```bash
# 查看当前 active profile
cat ~/.hermes/active_profile

# 查看看板 current 指针
cat ~/.hermes/kanban/current

# 检查 dispatcher 锁
cat ~/.hermes/kanban/.dispatcher.lock 2>/dev/null; echo "---"; ls -la ~/.hermes/kanban/.dispatcher.lock

# 查看 kanban 调度配置
python3 -c "import yaml; c=yaml.safe_load(open('$HOME/.hermes/config.yaml')); print(yaml.dump(c.get('kanban',{}), default_flow_style=False))"

# 最近 kanban worker 日志
ls -lt ~/.hermes/kanban/logs/t_*.log | head -5
tail -50 ~/.hermes/kanban/logs/$(ls -t ~/.hermes/kanban/logs/ | head -1)
```

## ACP 委托编码
```bash
# 查看可用 ACP agents
acp_agents

# 委托 Claude Code 编码（在 agent 回复中调用）
# acp_send(provider="claude", agent="bypassPermissions", prompt="...")

# 检查 Claude Code 代理可用性
ls ~/.claude.json ~/.claude/settings.json 2>/dev/null
```

## 系统健康检查
```bash
# Gateway 健康检查（orchestrator 端口 8650）
curl -sS http://127.0.0.1:8650/health 2>/dev/null | head -5

# 查看运行中的 gateway 进程
ps aux | grep -E 'hermes.*gateway|hermes.*agent' | grep -v grep | head -10

# 查看 9 板任务总数
for b in swarm hack product ops [已移除] platform [已移除] aiteam pay data; do
  cnt=$(sqlite3 ~/.hermes/kanban/boards/$b/kanban.db "SELECT count(*) FROM tasks;" 2>/dev/null)
  echo "$b: $cnt tasks"
done
```

## 能力图与并行波次（Graph Engineering 机制，派卡前用）
```bash
# 谁会 X？——assignee 不确定时先查能力图，别靠记忆派卡
python3 ~/.hermes/bin/capability-graph-gen.py --who-can coding

# 某 agent 掉线/超配额，找替代者
python3 ~/.hermes/bin/capability-graph-gen.py --substitute-for worker-coder

# 单节点详情（toolsets/skills/capabilities/reliability）
python3 ~/.hermes/bin/capability-graph-gen.py --show worker-coder

# 重型分解后：把就绪任务按依赖切成可全并行波次，写进 kanban_comment 指导并行派卡
python3 ~/.hermes/bin/parallel-wave-scan.py            # 全部板
python3 ~/.hermes/bin/parallel-wave-scan.py --board swarm

# 数据刷新（profiles.yaml/板库变更后重生成；手工策展区 capabilities/substitutes 不覆盖）
python3 ~/.hermes/bin/capability-graph-gen.py --generate
```

## 故障定位与恢复边界（失败卡处置前先诊断）
```bash
# 扫全部板失败任务链：定位第一个无效状态 + 可信区 + 建议恢复动作（重放/重派/升级人工）
python3 ~/.hermes/bin/failure-boundary-scan.py             # 最近 10 条
python3 ~/.hermes/bin/failure-boundary-scan.py --limit 20
python3 ~/.hermes/bin/failure-boundary-scan.py --task t_xxx  # 单任务深查
# 纪律：重派失败卡前先跑一次——连续失败≥3次是熔断域，禁自动重试；有完成产物必须引用，不整体重跑
```

## 重型任务合并报告自动化（drift_compare.py 集成）
```bash
# 1. 获取父任务 ID 及其所有子任务
PARENT_TASK_ID=<parent_task_id>
sqlite3 ~/.hermes/kanban/boards/hack/kanban.db \
  "SELECT id FROM tasks WHERE parents LIKE '%$PARENT_TASK_ID%';" > /tmp/child_ids.txt

# 2. 识别 recon 子任务（baseline）和 exploit/auditor 子任务（snapshot）
#    约定：recon 阶段 assignee=hack-recon，exploit 阶段 assignee=hack-exploit
RECON_CHILD=$(sqlite3 ~/.hermes/kanban/boards/hack/kanban.db \
  "SELECT id FROM tasks WHERE assignee='hack-recon' AND parents LIKE '%$PARENT_TASK_ID%' LIMIT 1;")
EXPLOIT_CHILD=$(sqlite3 ~/.hermes/kanban/boards/hack/kanban.db \
  "SELECT id FROM tasks WHERE assignee='hack-exploit' AND parents LIKE '%$PARENT_TASK_ID%' LIMIT 1;")

# 3. 定位子任务 workspace 路径
RECON_WS=$(sqlite3 ~/.hermes/kanban/boards/hack/kanban.db \
  "SELECT workspace_path FROM tasks WHERE id='$RECON_CHILD';")
EXPLOIT_WS=$(sqlite3 ~/.hermes/kanban/boards/hack/kanban.db \
  "SELECT workspace_path FROM tasks WHERE id='$EXPLOIT_CHILD';")

# 4. 自动跑 drift_compare 生成漂移对比章节
python3 _shared/scripts/drift_compare.py \
    --baseline "$RECON_WS/evidence/coverage.json" \
    --snapshot "$EXPLOIT_WS/findings.jsonl" \
    --output "$PARENT_WS/drift_comparison.md"

# 5. 将 drift_comparison.md 嵌入合并报告
cat "$PARENT_WS/drift_comparison.md" >> "$PARENT_WS/merged_report.md"
```

> 脚本位置：`_shared/scripts/drift_compare.py`（语法自检 OK）
> 模板参考：`_shared/05-eng-execution/drift-comparison-template.md`

---

> **注意**：此 skill 仅含命令速查。路由规则、认知自检、Hack 看板路由等业务逻辑见 orchestrator SOUL.md。