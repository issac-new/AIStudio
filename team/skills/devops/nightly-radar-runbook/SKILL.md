---
name: nightly-radar-runbook
description: Nightly Radar 韧性管道运维手册——幂等状态判定铁律、cron 脚本工程规则、中断恢复步骤。
version: 1.3.0
metadata:
  hermes:
    tags: [ops, cron, idempotency, resilience]
---

# nightly-radar-runbook — Nightly Radar 管道运维手册

管道：`life-workbench/scripts/nightly_radar.py`（统一入口串行主链第 1 步）+ `nightly_radar_supervisor.sh`（补跑）。
调度：统一夜间入口 `3e1690d29660`（orchestrator，每日 02:02，no_agent，NIGHT_DATE 锚定）+ T+1 独立节点（渲染/巡检/watchdog）。旧 23:00 wrapper/supervisor 三件套已退役，定义存档 retired_jobs.json。

## LLM 调用层通道路由（v3：恒 zcode，不判窗）

`radar_llm.py ask_llm_json`（全管线唯一 LLM 咽喉：主雷达研判段/8域报告/[已移除]报告）通道顺序：
- 主通道**恒走** acp-client 插件 `provider="zcode"`（GLM-5.3-Flash）——**不再判免费窗**
  （用户裁决：免费/计费时段一律 zcode）。日志出现 `ok via=zcode` 即主通道生效。
- zcode 一次失败 → 本进程禁用 zcode，剩余尝试回退 anthropic-direct（官方套餐凭据）。
- direct 也挂 → `hermes -z`（cc-switch 计费）仅作最后兜底并显式告警。
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
- **zcode_preflight 探针步（STEPS 首位，先于 radar_fetch）**：v3 下主通道恒 zcode，探针
  **无条件真探**——旧「窗 closed = 跳过探针」语义已废：不真探则通道坏掉要到第一步
  报告才炸。通道坏 → 步骤 failed + 微信摘要 🔴 告警 + 自动跑 verify_zcode_channel.py
  留诊断。结果落盘 `cache/radar/zcode_preflight_<date>.json`。建设期纪律：计费回退是
  兜底不是终点——🔴 告警行勿删勿降级，通道修复前每晚都会提醒。

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
8. 版本号/日期等「业务日」换算处必须用同一换算函数：统一入口 02:02 触发下全链命名读
   `NIGHT_DATE` 日期锚（=业务夜，非执行日）——新脚本（如心跳/巡检）引用产物文件前
   先实测核对命名规则，勿自算日期，勿凭直觉假设「TODAY=昨天就对」。
9. hermes CLI 输出多行时，首行可能是良性环境提示（update 后 fleet 重启义务未清偿），
   真实失败原因在最后一行——排障读末行不看首行，勿把首行提示当错误根因去修。
   清偿重启义务 = 跑一次 `hermes update`（会重启 gateway 杀在跑会话，择机执行）；
   该提示本身不影响 send 功能。
10. 直改 jobs.json 的 `schedule.expr` 后，持久 `next_run_at` 不会立即刷新（`hermes cron
    tick` 也不重写它）——**无需手工 resync**：scheduler 触发判定检测到 expr 与
    next_run_at 失配时自动 re-anchor 重算而不误触发（`cron/jobs.py` 的
    `_reanchor_stale_cron`）。验证直改看 expr 本身即可，不要手改 next_run_at 去追 expr。
11. 迁移触发时刻跨日界（如挪到深夜 02:02）：只改 cron 表达式不够——主链经日期锚定标后，
    任何**自算日期**的下游脚本会与产物日期分裂（`date +%F` 午夜后拿到新一天、
    `HOUR<9 → 昨天` 类启发式去查前一晚产物 → 心跳/对账全线误报缺失）。迁移前 grep
    全部消费方脚本的 `date +%F` / `datetime.now()` / 小时启发式，统一改读管道日期锚。

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

## 摩擦扫描 gap_id 回显修复（2026-09-09）

首扫报告 `gap_id: null` 的双层根因，均已修：
1. **gid 截断**：`gap-{date}-friction-{name[:12]}` 截断后与 rule name 全等回查必 miss → 改为从 gap_register 按 `[会话摩擦:<name>]` 前缀反查真实 id（冷却期内不重登也能照实回显）。
2. **静默 NameError**：模块顶层无 `import yaml`（只在 register_gaps 函数内 import），main() 里新加的 yaml 调用抛 NameError 被 `except Exception: pass` 吞掉 → 函数内局部 import。教训：给「函数内 import」的模块加顶层调用时必须自带 import；宽 except + pass 会把编程错误伪装成数据缺失。
- 修复验证：重跑后 JSON 的 friction_topics[].gap_id 非空；`--no-register` 幂等不重复登记；备份 .bak-20260909b。

## gap 登记防重——字面防重拦不住同义改写，语义簇判定才拦得住

`domain_closure.py` 的 `_register_llm_advice` 原有三层防重（指纹前 24 字 / `what[:40]` 子串 /
`what[:25]` 子串）全是**字面子串**——同一缺口换措辞（PoC/POC/poc、最小/隔离/选型/封闭）
前缀即不同，多晚连续登记积压同族卡。

**根治：第四层「主题+动作双信号同族判定」**（`_INTENT_CLUSTERS` + `_same_intent_cluster()`，
插在原三层后、data/tech 域生效——product 已有 `_hits_built_capability` 兜底）：
- 同簇 = 主题实体相同 **且** 动作类型相同 → 拦；仅主题同、动作异 → 放行（防误杀）
- 豁免词优先：升级 / KEYS 签名 / 多语言接入 / 发版跟踪等动作不同即使主题同也放行

**新簇入表必须先跑历史语料回归**——全量回放近 N 晚同主题建议，验证「同族全拦、异族全放、
误杀 0」；参考脚本 `scripts/intent-cluster-regression.py`（逐条过 `_same_intent_cluster` +
期望对照，退出码非 0 即回归失败）。没跑回归的簇不入表，防新簇拦住异族误杀有效建议。

排查同族卡积压：`grep -n "同族防重命中" logs/nightly_*.log`（第四层命中会打日志）。
根因定性与三分法处置见 `devops/kanban-blocked-card-disposition`「同族重复登记」行。

## 正文与 PDF 分层（用户裁定：正文关键简述，PDF 详细版）

- **邮件正文 ≠ PDF 复制品**：同源 llm_advice 原样拷进正文会被判「和 PDF 完全一样」。正文只放一句话版信号（标题+why 首 80 字）与建议本体+成本；完整论证/三问评估只在 PDF。分型实现已落 send_report_email.py build_body（域/主雷达/[已移除] 三型）。
- **能力改进建议必须带三问评估**（build_domain_report prompt 已内置）：actions 为 dict{what,gap,gain,cost}——现状缺口（具体，勿臆测已有能力）/提升路径+**验证信号**（可验证真提升）/成本（人日/周/月级+值不值）；空泛到无法验证的建议直接丢弃宁缺毋滥。PDF 渲染 .eval 蓝框区分建议黄框；**LLM 字段嵌 HTML 前必须 _esc() 转义**（原代码直嵌有注入面）。渲染层兼容旧 str 格式。
- gap 闭环占位符治理：proposed_fix 若仍是「待领域团队分析」占位即派工质量缺陷，能力评估应回填后才能进 done。

## 信息源纳管准入清单（融合万事网联《生产监控机制和流程》V0.1 附录一，2026-09-11）

> 银行原型：新系统纳管前须交齐 14 项资料（SLA/拓扑/已知问题/值班表/阈值…）才准投产监控。
> 集群映射：新信息源接入雷达前逐项核对，缺项显式标注（宁缺勿静默）：

| # | 准入项 | 集群形态 | 缺失处置 |
|---|---|---|---|
| 1 | 可达性实证 | 连续 3 晚 fetch 成功记录（非单次手工 curl） | ❌ 不可入 |
| 2 | 反爬状态 | Cloudflare/403/指纹挑战实测结论 + 规避方案 | ❌ 不可入 |
| 3 | 抓取方式 | RSS/RSSHub/HTML fetch 函数名（脚本内可 grep） | ❌ 不可入 |
| 4 | 更新频率与周期 | 日更/周更——决定告警阈值与「突断」判定基线 | ⚠️ 必填 |
| 5 | 已知问题 | 编码/截断/时区等已知缺陷登记（源台账） | ⚠️ 必填 |
| 6 | 依赖声明 | RSSHub 容器/computer_use 等上游依赖 | ⚠️ 必填 |
| 7 | 质量信号 | 3 晚产出条目数、进报告率（防空源占位） | ⚠️ 必填 |
| 8 | 下线预案 | 源失效时的移除步骤+台账更新 | ⚠️ 必填 |

准入通过后登记进域源台账（如本文件 [已移除] 台账节），fetch 函数入库并在台账注明实测状态。

## [已移除] 源可用性台账（扩源前先查，勿重复踩）

- ✅ 稳定 8 源：additude/mindshift/hechinger/scidaily_child/**the74（学校政策）**/36kr(RSSHub)/qbitai(wp-json)/jiemodui。
- ❌ Cloudflare 指纹挑战不可入库（curl 简单 UA 时通时断、完整 Chrome 串反被挑战、urllib 全拦）：edutopia/psypost/readingrockets/commonsensemedia/k12digest/zhihu(rss 404)。fetch 函数保留备用并注明实测状态；接 computer_use 后可复用。纯 RSS 扩源空间已近上限，国内家长实操内容需 computer_use 方案（SOUL 已留占位）。
- RSSHub 容器（127.0.0.1:1200，36kr 依赖）会静默 Exited——某源突断先查 `docker ps | grep rsshub`，`docker start rsshub` 即恢复。

## zcode-ACP 断链与 anthropic-direct 免费回退（2026-09-17）

**根因链**（全部实测）：ZCode 桌面端自动更新 3.12.3（09-16 23:06）三连断：① 新 CLI 启动即要求 `Resources/glm/provider/zcode-builtin.json`（缺失→后端秒死，报 backend dead）→ 已修：symlink `glm/provider → ../config/provider`（app 自带文件在 config/）；② 新 CLI 删除 `workspace/updateProviderRegistry` 且 registry 启动为空 → ACP 通道上任何模型切换（L2 pin / env-pin）必然失败，报 `不存在 Model: [object Object]`；③ 旧 acp-server 0.21.0 的 `runtimeModel` 参数被新 CLI 拒 → 已升 0.42.1 并本地 patch 去掉该键（原文件 .bak-runtimeModel-20260917）。**教训：桌面端 app 自动更新是插件/桥接层的隐式上游，版本漂移不经过任何我方变更即断链。**

**anthropic-direct 免费回退（radar_llm.py 新增）**：`_ask_anthropic_direct` 直连 `open.bigmodel.cn/api/anthropic` + `~/.zcode/v2/config.json` 官方套餐凭据 + `glm-5.3-flash`（与 cc-switch MGLM 同源路由，09-04 用户裁决=官方免费通道）。通道顺序：zcode-ACP → direct（免费）→ hermes（计费）；各通道失败进程内禁用防烧重试。`RADAR_FREE_CHANNEL=direct` 环境开关可跳过 ACP。preflight 新语义：ACP 坏但 direct 好 → ok=True（不再每晚报 🔴）；两者都坏 → FATAL 且 note 带 direct 失败原因。三场景 mock 测试 + 端到端真发全 PASS。双份副本已同步（旧 ~/.hermes/scripts 版 09-07 已存档 .bak-20260917-pre-direct）。

## 回滚

- 旧 job（orchestrator `fa8b11f3d382`）：已物理删除，完整定义存档于
  `~/.hermes/profiles/orchestrator/cron/retired_jobs.json`。复活 = 把条目拷回 jobs.json，
  但必须先核对与 ops-devops nightly-radar 的 23:00 调度冲突（双跑 = RC6 复发）；
  `cron_paused_watchdog.sh` 的 BANNED 黑名单对其告警。纪律：删除类操作先存档再删。
- 新 job：ops-devops cronjob_manage pause/remove `56b0cd499076`/`413c65d20f1c`/`133c0de3f284`
- 三件 no_agent 改造回滚：jobs.json.bak-20260908 拷回即可（radar_llm/nightly_radar
  补丁向后兼容旧 job 定义，无需回滚代码）
