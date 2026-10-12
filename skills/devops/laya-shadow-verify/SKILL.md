---
name: laya-shadow-verify
description: 验证 Laya 影子分类数据是否在真实积累。
tags: [devops, laya, shadow, verify, orchestrator]
metadata:
  hermes:
    tags: [devops, laya, shadow, verify, orchestrator]
---

# Laya 影子数据验证（laya-shadow-verify）

> 用途：确认 Gateway 消息预分类影子模式确实在积累数据，而非仅凭 LaunchAgent `state = running` 就下结论。
> 每次切换决策、对外汇报成本、或启动 fine-tune 前必须先跑本验证。

## When to Use

- 声称影子数据已积累、准备基于它做切换/汇报/fine-tune 时
- 怀疑 watcher 没有正确消费 Gateway 消息时
- 排查 shadow JSONL 为什么不增长时
- 任何需要确认 Laya 预分类正在运行而非静默失败的场景

## 验证脚本

```bash
python3 - <<'PY'
import json, pathlib, subprocess, datetime, re, sys

OK = True
def check(name: str, ok: bool, detail: str = ""):
    global OK
    status = "✓" if ok else "✗"
    print(f"{status} {name}: {detail}")
    if not ok:
        OK = False

# 1) 服务健康
r = subprocess.run(["curl","-s","-m","5","http://127.0.0.1:8000/health"],
                   capture_output=True, text=True)
if r.returncode == 0:
    h = json.loads(r.stdout)
    loaded = h.get("loaded", [])
    check("laya-serve health", True, f"status={h.get('status')} loaded={loaded}")
    check("3 checkpoint 加载", len(loaded) >= 3,
          f"期望 >=3, 实际 {len(loaded)}: {loaded}")
else:
    check("laya-serve health", False, f"curl exit={r.returncode}: {r.stderr[:120]}")

# 2) watcher LaunchAgent
r = subprocess.run(["launchctl","print",f"gui/{__import__('os').getuid()}/ai.hermes.laya-gateway-watcher"],
                   capture_output=True, text=True)
state = "running" if "state = running" in r.stdout else "not running"
pid = re.search(r"pid = (\d+)", r.stdout)
check("watcher LaunchAgent", state == "running",
      f"state={state} pid={pid.group(1) if pid else 'n/a'}")

# 3) 错误日志无近期启动失败
log = pathlib.Path("/Users/YOURNAME/.hermes/logs/laya-gateway-watcher.log")
err = pathlib.Path("/Users/YOURNAME/.hermes/logs/laya-serve.error.log")
if log.exists():
    tail = "".join(log.read_text(errors="replace").splitlines()[-20:])
    has_error = "Traceback" in tail or "TypeError" in tail or "SyntaxError" in tail
    check("watcher 近期无 TypeError", not has_error,
          f"{'有 TypeError 需修复' if has_error else '无错误'}; 最新: {tail.splitlines()[-1][:80]}")
else:
    check("watcher 近期无 TypeError", False, "日志文件不存在")

# 4) shadow 日志在增长
shadow = pathlib.Path("/Users/YOURNAME/.hermes/logs/laya-shadow.jsonl")
if shadow.exists():
    rows = sum(1 for _ in shadow.open())
    mtime = datetime.datetime.fromtimestamp(shadow.stat().st_mtime)
    check("shadow 日志存在", True, f"{rows} 行, 最后写入 {mtime:%Y-%m-%d %H:%M}")
    check("shadow 昨日有写入", mtime.date() >= (datetime.date.today() - datetime.timedelta(days=1)),
          f"最后写入 {mtime:%Y-%m-%d %H:%M}")
else:
    check("shadow 日志存在", False, "文件不存在")
    rows = 0

print(f"\nPython 版本: {sys.version}")
check("Python >= 3.10", sys.version_info >= (3, 10),
      f"当前 {sys.version_info.major}.{sys.version_info.minor}; 旧版本不支持 PEP 604")

print(f"\n总体: {'✓ 可称为正在积累' if OK else '✗ 存在断层, 不得称为积累'}")
PY
```

## 守门规则

1. **三项同时成立才算积累**：服务健康 + watcher 无启动错误 + shadow 日志在收到新消息后确实增长。缺任一 = 影子模式未生效。
2. **LaunchAgent `state = running` 不是证据**：它只表示进程没退出，Python 脚本可能已在 `from laya_shadow import shadow_one` 处崩溃（实测 `TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'`）。
3. **样本量不足时不得下结论**：16 条样本（62.5% 可受理、70% 可比一致）只能写为试运行信号，不足以支持自动切换、对外汇报成本节省或 fine-tune 决策。
4. **影子数据是候选标注不是金标准**：训练前必须去重、脱敏、修正错误标签，按消息/会话分组切分 train/eval，不能按行机械切分造成漏洞。
5. **环境事实核查优先，不预设方案**：动手前先用 `system_profiler SPHardwareDataType | grep -E "Chip|Model Name"` 或 `uname -m` 核实硬件架构，再决定是否启用 MLX/Apple Silicon 优化路径。用户纠正过"你搞错了，接受事实进行采样"——把不存在的加速路径当前提，会连带推翻整个采样方案。
6. **`laya_shadow.py` 的两个 SQL 坑**（增量扫描 state.db 时必查）：
   - `--limit` 必须拼成 `... ORDER BY id LIMIT N`，**不能拼进 WHERE 子句**（`WHERE ... LIMIT 3` 语法错误，静默返回 0 条）。
   - 过滤条件用 `role='user' AND platform_message_id IS NOT NULL AND platform_message_id != ''`，**不要额外加 `observed=1`**——observed 字段在本库全为 0，加了会把 17 条候选误判成 0 条，且 dry-run 会打印假的"总用户消息: 0"。

## state.db 分层采样规范（跨 profile 全量盘点）

当需要对历史 state.db 做 Laya 影子分析时（不是单 profile 增量扫描，而是回溯分析）：

1. **盘点所有 profile，不只采 orchestrator**：`for db in ~/.hermes/profiles/*/state.db; do sqlite3 "$db" "SELECT count(*) FROM messages WHERE role='user' AND platform_message_id IS NOT NULL AND platform_message_id != ''"; done`。用户问"那 19.5 万条"时，漏掉其他 profile 会直接答错量级。
2. **去重规则必须事先声明**：优先 `platform_message_id`（跨 profile 同一微信消息可能落多个库）；缺失则用 `content` 的 SHA-256 + profile 组合键。去重数与候选数都要写进报告。
3. **分层随机抽样，固定种子**：按 profile / 平台 / 时间或消息 ID 分层，每层按比例分配，`random.seed(...)` 固定以保证可复跑。用户已明确"接受采样"时，**不要为了显得严谨而拒绝采样**——但要在报告里显式标注这是采样不是全量，并给出置信区间或分层覆盖说明。
4. **每条样本真实调用**：`curl -s -m 30 -X POST http://localhost:8000/v1/systemone`，有界并发（≤4），超时与失败逐条记录，不许用缓存或编造结果填充。
5. **脱敏 JSONL**：只存结构化字段（profile、db_row_id、platform_message_id 的 sha256、timestamp、content_sha256、intent、answer_confidence、routing evidence、success/error），**不写原始正文**。
6. **MLX / laya-mlx 不可用就明说**：`import mlx.core` 报 `ModuleNotFoundError` 时，报告里单列一节说明当前不可用，不要用"已部署 laya-mlx"这类未验证表述充数。用户裁决是 M1 Pro 上接受采样，不是假定 MLX 已生效。

## 成本报告纪律

报告 token 节省或金额时必须分开写：已观测（样本数/接受率/一致率/回退率）vs 待测量（每条旧 LLM 真实 input/output token、模型单价）vs 情景估算（明确消息量、替代比例、回退比例、时间窗，标注估算）。不得把情景估算写成已实现节省。