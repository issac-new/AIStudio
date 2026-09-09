---
name: nightly-radar-runbook
description: Nightly Radar 韧性管道运维手册——幂等状态判定铁律、cron 脚本工程规则、中断恢复步骤。
version: 1.1.0
metadata:
  hermes:
    tags: [ops, cron, idempotency, resilience]
---

# nightly-radar-runbook — Nightly Radar 管道运维手册

管道：`life-workbench/scripts/nightly_radar.py`（wrapper）+ `nightly_radar_supervisor.sh`（补跑）。
调度：ops-devops profile `nightly-radar-wrapper`(23:00, agent模式) + `supervisor-2330/0000`(no_agent)。

## LLM 调用层免费窗路由（2026-09-07 起）

`radar_llm.py ask_llm_json`（全管线唯一 LLM 咽喉：主雷达研判段/6域报告/[已移除]报告）自动路由：
- 免费窗内（`~/.hermes/bin/zcode_free_window.py` 判定，进程级缓存一次）→ 经 acp-client 插件
  `provider="zcode"`（GLM-5.3-Flash 0 额度）。日志出现 `ok via=zcode` 即免费路径生效。
- zcode 一次失败 → 本进程禁用 zcode，剩余尝试回退 `hermes -z`（cc-switch 计费，免费不复用）。
- **模型钉定机制（2026-09-07 深夜定稿，双层）**：zcode-acp-server 默认模型取
  `backend/credentials.js:23` 的 `ZCODE_MODEL: models[0] ?? DEFAULT_MODEL_ID` =
  GLM-5.3（**付费档**）。钉定 L1=进程级 env（config `providers.zcode.env.ZCODE_MODEL`，
  显式非空 env 覆盖默认，`mergeEnvWithCreds`）+ L2=会话级（插件 `handle_acp_send`
  新会话时 `session/set_config_option(configId=model, value=GLM-5.3-Flash)`，value 用
  纯 modelId 解析到第一个 enabled builtin provider=bigmodel-coding-plan），
  **L2 fail-closed**：钉定失败直接报错不降级付费。
- ⚠️ 插件代码是钉定的前提：`_resolve_provider` zcode 分支 + env 透传 + set_config_option
  三件套**只有 orchestrator/ops-devops 两份副本有**（2026-09-07 23:3x 修复）。09-07 19:55
  的舰队同步用**过期源码覆盖**了当天凌晨的 env 透传补丁（37 份副本回退到无分支旧版
  hash 1e28066c）——fleet sync 后必须重新 grep 验证，不能信部署脚本退出码。
- 修复验证（2026-09-07 23:2x）：`workbench .venv python scripts/verify_zcode_channel.py`
  → PASS；zcode 侧日志 `modelCurrent: builtin:bigmodel-coding-plan/GLM-5.3-Flash` 侧证。
- 排查：`grep "via=zcode|via=hermes" cache/radar/llm_brief_<date>.log` 或域报告日志。
- **zcode_preflight 探针步（STEPS 首位，先于 radar_fetch）**：免费窗开着但通道坏
  （Unknown ACP provider 类致命错）→ 步骤 failed + 微信摘要 🔴 告警 + 自动跑
  verify_zcode_channel.py 留诊断；白天窗 closed = 非故障（ok=True，LLM 层自然走计费）。
  结果落盘 `cache/radar/zcode_preflight_<date>.json`。建设期纪律：计费回退是兜底不是
  终点——🔴 告警行勿删勿降级，通道修复前每晚都会提醒。

## 幂等状态判定铁律

状态文件 `cache/radar/wrapper_state_<date>.json` 的幂等判断**只认 `status=="done"`**。
失败步也写 done_at（status=failed）——「有 done_at 就算完成」的旧式判断会让重试永远空转。
同款 bug 曾同时在 step_done / weixin_push / supervise 提前返回 / supervisor 检查四处出现，修一处必须查全链路。

## cron 脚本工程规则

1. headless 审批墙拦 `python -c`/heredoc/`&`——一律落脚本文件路径调用。
2. cron 拉起的解释器（hermes venv）没有 pymupdf 等重依赖——重依赖步骤 subprocess 回 workbench `.venv` 跑 + 步骤级 try/except。
3. 跨午夜：00:00 tick 业务日期是昨晚——`[ $(date +%H) -lt 9 ] && TODAY=$(date -v-1d +%F)`。
4. 夜首跑 `--refresh` 清缓存；supervisor 补跑绝不能带 refresh（会抹断点）。
5. kill wrapper 后子进程成孤儿继续写共享产物——恢复前先 `ps aux | grep radar` 清孤儿。
6. jobs.json 直改：flock `.jobs.lock` + 临时文件原子替换 + `.bak-<date>` + 改后重读复核（口头声明≠落盘）。
7. iLink 两层限流分清再动手：30s 冷却（单发间隔，条间 sleep 36 可过）vs 账号级惩罚
   冷却（连败十几次触发，跨重启持续，重试即续期冷却）——惩罚期停止一切 send 尝试，
   靠补投队列指数退避自然恢复；白天手工测试连败会污染队列 attempts 计数，判死勿急。
8. 版本号/日期等「业务日」换算处必须用同一换算函数：域报告命名=执行日，主雷达跨午夜
   补跑可能产出次日命名——新脚本（如心跳/巡检）引用产物文件前先实测核对命名规则，
   勿凭直觉假设「TODAY=昨天就对」。
9. hermes CLI 输出多行时，首行可能是良性环境提示（update 后 fleet 重启义务未清偿），
   真实失败原因在最后一行——排障读末行不看首行，勿把首行提示当错误根因去修。
   清偿重启义务 = 跑一次 `hermes update`（会重启 gateway 杀在跑会话，择机执行）；
   该提示本身不影响 send 功能。

## 白天演练模式

- `TEST=1`：wrapper/supervisor 全链路跑但**不真实推送、不写 done 状态**（推送步返回失败属预期语义）。
- `SUPERVISOR_FORCE=1`：旁路 supervisor 白天窗口守卫（必须配 TEST=1）。

## 中断恢复步骤

1. `ps aux | grep -E 'radar|nightly'` 清孤儿进程
2. `bash scripts/nightly_radar_supervisor.sh`（夜间）或 `TEST=1 SUPERVISOR_FORCE=1 bash …`（白天演练）
3. 看 `logs/nightly_supervisor.log`：[SKIP]×N = 断点续跑生效

## STEPS 顺序纪律（2026-09-08 根治）

`gap_closure` 必须排在 `llm_brief` **之前**：`radar_report.py --dispatch` 每次从
summary 全量重写 md（`out.write_text`），排在后面会把 llm_brief 插入的
「〇、今日研判」段抹掉——09-07/09-08 连续两天报告+PDF 缺研判段而 wrapper_state
显示 llm_brief done 的根因。改 STEPS 顺序必须同步核对每步是否重写共享产物。

## agent 模式 job 零透传改造（2026-09-08）

纯机械透传/机械化的夜间 job 必须用 `no_agent` + wrapper 脚本，禁止 agent 模式
白烧外层模型（原 nightly-radar-wrapper 每次 23:00 白烧 aim@cc-switch 仅为了
执行一条 cd+python 命令）。已改造三件：56b0cd499076→nightly_radar_cron.sh、
6b16a336c2ea→protocol_violation_consumer_run.py（DRY_RUN=1 可演练）、
762bf6c7f6a9→skill_health_weekly_silent.sh（健康=静默不投递）。
直改 jobs.json 用 `orchestrator/scripts/migrate_night_jobs_noagent.py`
（flock+原子替换+.bak+重读复核），原 prompt 均存档 .bak-20260908。
注意：`hermes-update-safe-verify` 本就是 no_agent 脚本任务，勿误列改造清单。

## zcode 格式抖动容错（2026-09-08）

`radar_llm.ask_llm_json`：zcode 返回有文本但 JSON 解析失败 = 格式抖动，原通道
立即重试一次（附「只输出纯 JSON」纠正指令）再判死回退；传输层死（text=None）
维持立即禁用回退。stub 单测四场景全 PASS（抖动重试/二次失败禁用/传输层死立即
回退/首试成功不重试）。

## weixin 通道健康探针（t_1301562f 落地，2026-09-09）

`scripts/weixin_channel_probe.py`：只读探针（getupdates 零发送），五态分类
healthy/session_expired/send_throttled/unreachable/no_account 照抄 gateway 判定。
`--record` 落盘 `cache/radar/weixin_channel_history.jsonl`；`--format line` 供 bash 心跳；
`--summary` 近 7 天趋势。已接线：nightly_radar weixin_push 前置探针+摘要首行状态行+邮件降级
note；supervisor 心跳两分支通道状态行；send_report_email argv[3] note。

工程教训（验收实抓）：
- **profile HERMES_HOME 隔离**：探针直连 `$HERMES_HOME/weixin/accounts` 在 ops-devops
  cron 下 0 账号文件→永久误报 no_account。解法=账号目录回退链
  （WEIXIN_ACCOUNTS_DIR > $HERMES_HOME > ~/.hermes，同账号 token server-side 等价）。
- **长轮询 vs 客户端超时**：getupdates 服务端持连接最长 35s（LONG_POLL_TIMEOUT_MS），
  客户端超时必须 >35s（探针 40s，wrapper 45s，45>40>35 层级自洽），否则空闲健康通道
  被误判 unreachable。
- **惩罚冷却实测恢复数据点**：09-08 23:58 末次失败后停止一切 send 尝试，09-09 01:06
  探针 healthy——静默 ≈68 分钟自然恢复，与「重试即续期、停止即恢复」模型一致。
- **ACP 委托产线的「用户裁定」声明必须溯源**：委托 agent 可能在 docstring 写下
  未经确认的裁定声明。核实锚点：集群 skill 库既有文档 + OAuth/配置时间戳 + 并行会话
  日志，三者互证后才放行，否则打回。

## 正文与 PDF 分层（用户裁定：正文关键简述，PDF 详细版）

- **邮件正文 ≠ PDF 复制品**：同源 llm_advice 原样拷进正文会被判「和 PDF 完全一样」。正文只放一句话版信号（标题+why 首 80 字）与建议本体+成本；完整论证/三问评估只在 PDF。分型实现已落 send_report_email.py build_body（域/主雷达/[已移除] 三型）。
- **能力改进建议必须带三问评估**（build_domain_report prompt 已内置）：actions 为 dict{what,gap,gain,cost}——现状缺口（具体，勿臆测已有能力）/提升路径+**验证信号**（可验证真提升）/成本（人日/周/月级+值不值）；空泛到无法验证的建议直接丢弃宁缺毋滥。PDF 渲染 .eval 蓝框区分建议黄框；**LLM 字段嵌 HTML 前必须 _esc() 转义**（原代码直嵌有注入面）。渲染层兼容旧 str 格式。
- gap 闭环占位符治理：proposed_fix 若仍是「待领域团队分析」占位即派工质量缺陷，能力评估应回填后才能进 done。

## [已移除] 源可用性台账（扩源前先查，勿重复踩）

- ✅ 稳定 8 源：additude/mindshift/hechinger/scidaily_child/**the74（学校政策）**/36kr(RSSHub)/qbitai(wp-json)/jiemodui。
- ❌ Cloudflare 指纹挑战不可入库（curl 简单 UA 时通时断、完整 Chrome 串反被挑战、urllib 全拦）：edutopia/psypost/readingrockets/commonsensemedia/k12digest/zhihu(rss 404)。fetch 函数保留备用并注明实测状态；接 computer_use 后可复用。纯 RSS 扩源空间已近上限，国内家长实操内容需 computer_use 方案（SOUL 已留占位）。
- RSSHub 容器（127.0.0.1:1200，36kr 依赖）会静默 Exited——某源突断先查 `docker ps | grep rsshub`，`docker start rsshub` 即恢复。

## 回滚

- 旧 job（orchestrator `fa8b11f3d382`）：已物理删除，完整定义存档于
  `~/.hermes/profiles/orchestrator/cron/retired_jobs.json`。复活 = 把条目拷回 jobs.json，
  但必须先核对与 ops-devops nightly-radar 的 23:00 调度冲突（双跑 = RC6 复发）；
  `cron_paused_watchdog.sh` 的 BANNED 黑名单对其告警。纪律：删除类操作先存档再删。
- 新 job：ops-devops cronjob_manage pause/remove `56b0cd499076`/`413c65d20f1c`/`133c0de3f284`
- 三件 no_agent 改造回滚：jobs.json.bak-20260908 拷回即可（radar_llm/nightly_radar
  补丁向后兼容旧 job 定义，无需回滚代码）
