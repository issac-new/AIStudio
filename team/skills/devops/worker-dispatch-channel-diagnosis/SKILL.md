---
name: worker-dispatch-channel-diagnosis
description: "dispatcher worker 必死而单发成功时用：授权/spawn/wire 三段链诊断。"
version: 1.3.0
tags: [kanban, dispatcher, worker, wire-format, empty-stream, humangate, skill-preload]
---

# Worker 派发通道诊断（授权 → spawn → wire 三段链）

> 适用症状：卡 blocked/gave_up 反复循环，或 worker 全灭但 `hermes -p <assignee> -z "回复ok"` 能通。
> 三段各自独立故障，按序排查；跳段直接修任务定义/换 provider 是最常见误诊。
> 崩溃文本总表的权威源在 default 的 `orchestrator-worker-failure-triage`（读无边界）。

## 第一段：卡为何不被派（HumanGate 授权门）

事件流每 60s 一条 `needs_decision {"tier":"T2"|"T3", "reason":...}` = 授权门拦卡，不是 dispatcher 故障。
reason 是逐级判定链的出口，直接指缺什么：

| reason | 缺的字段 | 修法 |
|---|---|---|
| `missing_grant` | 无匹配 grant 或结构不被读 | 检查 store 文件结构（见下） |
| `board_mismatch` | grant.board ≠ 板 slug（归一小写） | 改 grant.board |
| `tier_mismatch` | grant.tier ≠ 卡 body 标记 tier | body 首两行 `tier=T1/T2/T3` 决定档，grant 必须同档 |
| `choice_required` / `invalid_actor` / `invalid_time` | T2 必填 choice / actor 非空 / 时间戳非有限数 | 补齐对应字段 |
| `revision_mismatch` | taskRevision 与当前卡内容不符 | 重算 canonical sha256 后重写 |

**Store 文件**：`~/.hermes/approvals/human-gate.json`（或 `HUMAN_GATE_STORE` 覆盖）。顶层是**数组**，每行 `{"scope":"task", "board":..., "grant":{...}}`——缺 `scope:"task"` 时 reader 读出 0 条（最常见静默失败）。grant 必填：`taskId, board, tier, decision="approved", choice, actor, issuedAt, decidedAt, expiresAt（毫秒）, taskRevision`。

**taskRevision 计算**（与 runtime `serialize_task_revision` 逐字一致）：对 `{id, board, title, body, assignee, status, updated_at, workspace_kind, workspace_path, branch_name}` 做 `json.dumps(payload, ensure_ascii=False, separators=(",",":"), allow_nan=False)` 后 sha256。板库 tasks 表无 `updated_at` 列时该值取 `None`（dispatcher 的 `_decision_row_value` 对缺列返回 None，照抄即可）。改卡任何字段都会使 revision 失效需重算。

验证：用 runtime 自身读回——`HERMES_HOME=<home> python3 -c "from tools.kanban_tools import authorize_task_execution; ..."` 打印 (allowed, reason)，别只看文件写成功。

## 第二段：worker spawn 落点验证

卡转 running 不等于 worker 活了；`spawned` 事件有 pid 后还要：
- `ps -p <pid>` 存活 + `hermes kanban --board <slug> log <tid>` 有实质工具调用
- 秒死回 blocked 时读 task_events 首位 `crashed`/`worker_result` 的 `last_output` 文素——它是下一段的输入
- `Kanban owner refused: Gateway connection failed` = worker 客户端连不上 owner gateway（8650），先 `curl :8650/health` 再查 gateway 进程树
- 秒死且 `worker_result.last_output` 为空时读 assignee profile 的 `logs/managed-worker.log` 尾部拿真实异常。`ValueError('kanban_skills_unavailable')` 是独立故障段——**review 态技能预载死循环**：卡进 review 后重派的 worker 被强制注入 `sdlc-review`（review 通道硬编码注入，见 `gateway/session_kanban.py` 的 review-lane 规则），子进程在 assignee home 解析该技能；技能被生命周期治理归档进 `.archive/` 或不在 assignee 技能板时 `missing and not loaded` 必死循环，与卡内容/线路无关。重放定实锤：`HERMES_HOME=<assignee home> python3 -c "from agent.skill_commands import build_preloaded_skills_prompt as f; print(f(['sdlc-review'],'probe'))"`，missing 非空即中。修法：技能从 archive 恢复进中央库某类别（assignee 的 skills_enabled 须含该类别；worker profile 多为整类别 symlink，恢复即全 fleet 可见），重放 loaded 后 unblock 重派一次即收口。预防：归档技能前 grep `gateway/session_kanban.py` 与 `hermes_cli/kanban_db*.py` 的硬依赖技能名。

## 第三段：EmptyStream 单发成功/派发必死 = 跨 home wire 格式错配

签名：`EmptyStreamError`、HTTP 200、0 字节、`latency_ms` 100-300 且 `duration_ms` 空（未到上游）；代理日志同窗口 `is_streaming=0` 全灭、`=1` 全活。**单发成功是判别性证据**——单发不走 dispatcher，api_mode 从本 profile config 正确解析。

根因：dispatcher 用 gateway 启动 home 的 config 构建 policy（provider slug 随 policy 走），managed worker 子进程在 assignee profile home 里解析该外来 slug——查无此名 → `_resolve_api_mode` 阶梯全部 miss → 落 `chat_completions` 兜底 → Responses 线路由被打到 `/chat/completions` 端点 → 代理返回 HTTP 200 包 ~50B `{"code":500,"msg":"404 NOT_FOUND"}` → 客户端期望 SSE 得空流 → retry 耗尽 gave_up。

定位三步：
1. **会话档案对比**：assignee profile 的 `state.db` → `SELECT model_config FROM sessions ORDER BY started_at DESC` 取 `gateway_runtime.api_mode`——手工成功会话有值（如 `codex_responses`）、dispatcher 失败会话整块缺失 = 实锤。
2. **mitm 透明反代抓真实请求**：起 `:15799→真实代理` 的反代（全量落盘 req/resp body 到 flow.log），把 profile config 的 `custom_providers[].base_url` 指过去，放一张卡——真实 path 打错端点/响应体是 JSON 错误体一眼定性。诊断完把 base_url 改回。
3. **合成探针无复现时立即停**：payload 大小、内容关键词、tools schema、prompt_cache_key 都不是变量——别在这些维度烧轮次；`hermes_gwk_<sha>` 前缀 session_id 是 prompt-cache-scope 派生，不是独立故障面。

修复与生效：api_mode 解析兜底按 base_url 理解匹配 custom_providers 声明（同 `get_custom_provider_api_mode` 规则，读当前 home config），命中则用声明值——补丁落 `agent/agent_init.py`。**源码改完必须重启 gateway 才加载**：lifecycle guard 拦死进程内一切重启路径（terminal 直引脚本、cron `--script` 含 launchd 动作、nohup/后台包装全拒），唯一出口=用户在外部 Terminal 跑 `hermes gateway restart`——先把重启脚本备好交给用户，勿反复尝试进程内绕路。补丁导出入 `~/.hermes/patches/` 并登记 `apply-source-patches.sh` SPECS，`git apply --reverse --check` 通过才算在位（update 安全）。

## 通用坑

- `hermes kanban unblock/comment` 等 CLI 必须带 `HERMES_KANBAN_BOARD=<slug>` 环境变量（或 `--board`），否则落 default/根库报 unknown id——与卡实际所在库对不上是「卡丢了」假象的头号来源。kanban 工具族（kanban_create 等）同理：不显式传 board 会落遗留根库，且 dispatcher 会把留痕卡当真任务派生 worker 重复烧预算；发现幽灵 worker 先 reclaim 释放 claim 锁再 complete 收口，勿等其自然退出。**显式传 board 也非保险**——同参数同会话内可一次落正板一次落遗留库（gateway 侧路由不稳定，复现过三次）；建卡后立即双库验证（目标板 + 根库各查一次 id），落错库且已被拾取 running 时在位跑完不迁移——迁移=杀在跑 worker，遗留库 dispatcher 的派工/收口链完好，只损失板内可见性。
- 测试环境性预存失败先做基线对照：stash 补丁后重跑同套测试，同败=环境问题（如 home_io_guard 对真实 home I/O 报 TEST BUG），与补丁无关；勿把预存失败当回归。`scripts/run_tests.sh` 需 bash（非 sh）+ `UV_INDEX_URL=https://pypi.org/simple`（镜像缺 upload date 会让 uv lock 拒绝）。
- 修后验活别只盯一个代理面：worker home 若能解析 provider（如 custom:cc-switch → anthropic_messages 线），流量走 claude 面，hermes 面 app_type 零记录——卡 running 而 hermes 面 5min 无流量不是故障信号。验活以 assignee profile 的 agent.log `API call #N: ... in=... out=...` 行或全 app_type 代理日志为准。
- 补丁生效后 worker 仍偶发死 ≠ 线路复发：`Truncated tool call arguments detected (finish_reason='tool_calls')` 是上游偶发截断，与 wire 错配空流签名不同（有实质轮次后才死，非 0 轮秒死）。根 home config.yaml `kanban.failure_limit` 过低（2）时两三次瞬时失败即 gave_up；放宽（≥6）再重置失败计数重派，勿回头重修线路。
- gave_up 卡修完不会自动 retry——重置 `consecutive_failures` 后 promote（见 kanban-worker-crash-triage-orch 的重入队节）。
