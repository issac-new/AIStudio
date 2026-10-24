---
name: orchestrator-cli-reference
description: "Use when orchestrator needs kanban/markings/routing cmds."
version: "1.2"
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
inherited = set(json.loads(sys.argv[1]))  # 传入的继承的 markings
missing = inherited - clearances
if missing:
    print(f'BLOCK: clearance 不足: {missing}')
    sys.exit(1)
else:
    print('PASS')
" '[\\\"TLP:AMBER\\\", \\\"PII\\\"]'

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

## 板级 watcher(daemon)在不在岗——ready 卡零拾取的诊断与根治

dispatcher 以**板**为单位常驻：每块板要有一个 `kanban --board <slug> watch` 进程在跑，该板的 ready 卡才会被认领执行。**卡建在分库 + ready + assignee 在位 + 无 runs，但仍零拾取 → 先查板级 watcher 是否缺席**——它与前 5 项排除项（根库陷阱/triage 死锁/respawn guard/幽灵 assignee）正交，卡本身完全健康，只是没有常驻 watcher 去认领。事件流里 `out_of_scope` 刷屏（每 tick 一条、无 claim/spawn）是这个缺口的特征信号。

```bash
# 判别：本机跑着哪些板的 watcher + 目标板在不在
ps -eo args | grep -oE "kanban --board [a-z-]+ watch" | sort -u
ps -eo args | grep -E "kanban --board <slug> watch" | grep -v grep || echo "watcher 缺席"

# 卡侧证据（分库命中 + ready + runs=0 + 无 gate，齐了就指向 watcher）
sqlite3 ~/.hermes/kanban/boards/<slug>/kanban.db \
  "SELECT id,status,assignee FROM tasks WHERE id='<tid>';"
sqlite3 ~/.hermes/kanban/boards/<slug>/kanban.db \
  "SELECT count(*) FROM task_runs WHERE task_id='<tid>';"
sqlite3 ~/.hermes/kanban/boards/<slug>/kanban.db \
  "SELECT kind, count(*) FROM task_events WHERE task_id='<tid>' GROUP BY kind;"

# 根治：补起该板 watcher（后台常驻，拾取下一 tick 自动发生，无需改卡）
hermes kanban --board <slug> watch --interval 0.5 &
```

**判级**：能补 watcher 是基础设施修复（推荐根治）；逐张 `unblock` 无效——watcher 缺席时 unblock 后仍没人认领。watcher 缺席的常见原因：板新建后没拉 watcher、机器重启后 launchd/裸进程没自动带起。本机实测：36 块板全有 watcher，唯独某板缺席，补起后该板积压卡下一 tick 被认领。详细分诊见 `kanban-task-pickup-diagnosis`（default profile，跨 profile patch 走 `hermes -p default` 或直接编辑源文件）。

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
  "SELECT id FROM tasks WHERE parents LIKE '%$PARENT_TASK_ID%';>" > /tmp/child_ids.txt

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

## 报告产物与任务树核对
```bash
# 先定位报告，不凭记忆拼路径
search_files --target files --path <workspace> --pattern '*report*'
search_files --target files --path <workspace> --pattern '*.md'

# 亲读 Markdown/JSON；报告存在不等于复核完成
# macOS 直接打开（用户说"打开"时必须执行，而不是只贴摘要）
open -a "Visual Studio Code" <absolute-report.md>
open -a "Visual Studio Code" <absolute-report.json>

# 收口前检查整棵任务树；Checker 仍 running/ready/blocked 时不能宣称最终完成
sqlite3 ~/.hermes/kanban/boards/<board>/kanban.db \
  "SELECT id,status,title,assignee,completed_at FROM tasks WHERE id IN ('<recon>','<audit>','<checker>','<root>');"
```

交付报告时分开标注 `confirmed`、`confirmed-design-risk`、`candidate-trust-boundary`、`positive control` 和 `not tested`；shell sink 的静态存在不自动等于可利用漏洞，必须有不可信输入可达和影响证据。用户要求"打开"时同时返回已执行的查看命令与绝对路径。

## CLI 创建卡（kanban_create 工具层 raci 注入 bug 时的绕道）
```bash
# kanban_create 工具层有 raci 注入 bug → 用 CLI 绕道；长 body 用 --body-file（支持内嵌换行/横杠行）
# 语法:create 用 --workspace "dir:<abs_path>"（直接带值形式，等号/空格分隔符解析不一致）
hermes kanban --board swarm create "<标题>" \
  --assignee worker-researcher \
  --priority 6 \
  --workspace "dir:<abs_workspace>" \
  --body-file <abs_body.md> --json

# 派卡必验三件套：卡落库 + workspace_kind 非 scratch + 路由标记在位
sqlite3 file:$HOME/.hermes/kanban/boards/<slug>/kanban.db \
  "SELECT id,status,assignee,workspace_kind,workspace_path FROM tasks WHERE id='<task_id>';"
grep -c '^routed:heavy' <abs_body.md>
```

## 收卡与板旗（kanban complete 陷阱）
```bash
# --board 是 kanban 子命令级旗标，必须放在子命令前；complete 子命令自身没有 --board
hermes kanban --board swarm show t_xxx        # ✓
hermes kanban complete --force t_xxx ...      # ✗ 查 default 板 → 误报 unknown id or terminal state
hermes kanban --board swarm complete --force t_xxx --summary "..." --metadata '{"k":"v"}'  # ✓

# kanban_comment / kanban_complete 等写工具报 no such function: kanban_write_sanctioned
#   → 整个写族退化，一律用 CLI：
hermes kanban --board swarm comment t_xxx "<文本>" --author orchestrator   # ✓
hermes kanban --board swarm show t_xxx                                      # ✓ 读工具仍可用

# CLI comment 参数是位置参数（task_id + 文本），不是 --body；SQLite 表名是 task_comments（无 s）
sqlite3 file:$HOME/.hermes/kanban/boards/<slug>/kanban.db \
  "SELECT count(*) FROM task_comments WHERE task_id='<task_id>';"

# blocked 卡重开与归档同样走 CLI，--board 同样置于子命令前（kanban_* 工具层无 unblock/archive 动作）
hermes kanban --board data unblock t_xxx    # blocked → ready（父门控自动判定）/ todo
hermes kanban --board data archive t_xxx    # 归档（同族合一处置、终态收档用）；归档前先 kanban_comment 留处置依据

# 自持卡收尾：kanban_complete 工具对 claim_lock=本会话自身 gateway 的卡也拒（报 live worker claim，
# 工具参数无 expected_run_id）→ 直接走 CLI --force 收；收前可查 claim 归属判定是否 self-claim
sqlite3 ~/.hermes/kanban/boards/<slug>/kanban.db "SELECT id,status,claim_lock FROM task_runs WHERE task_id='t_xxx' ORDER BY id DESC LIMIT 1;"

# 板库定位：正库 = boards/<slug>/kanban.db；同目录 board.db / <slug>.db 可能是空文件红鲱鱼；收完 sqlite 验终态 done
```

---

> **注意**：此 skill 仅含命令速查。路由规则、认知自检、Hack 看板路由等业务逻辑见 orchestrator SOUL.md。