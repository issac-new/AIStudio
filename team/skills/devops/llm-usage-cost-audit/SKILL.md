---
name: llm-usage-cost-audit
version: 1.0.0
description: "Use when 排查 LLM/token 消耗是否正常或优化通道成本:审计顺序+计费口径+浪费判定。"
---

# llm-usage-cost-audit — 集群 LLM 用量/成本审计与优化

排查「某模型/某天 token 消耗是否正常、钱花哪了、怎么省」类任务的审计方法与优化纪律。
数据面机制（DB 列含义、吞吐率公式、live DB 容差）见 `cc-switch-stats-analysis`；
免费通道路由纪律见 `free-window-nightly-pipeline` 与主库 nightly runbook——本 skill 只管
**审计顺序、计费口径、浪费判定、日志统计口径**。

## Always-on rules

- **先问计费模式，再判浪费**。cc-switch 显示的 $ 是名义计价，不是实际支出；包月按次计费的
  provider 吃满日配额是正确行为（不用反而浪费月费）。成本排名在两种口径下整体颠倒，
  未确认计费模式前不得输出「浪费 X 元」类结论。
- **先测结构，再开药方**。逐调用点量化（哪个环节、哪个通道、多少发、多少 token）后才允许
  提优化项；免费通道上的调研研判（zcode 类）≈ 0 成本，优化它们没有意义——只对着计费通道的白烧做。
- **aim 是动态别名**：客户端声明 `aim` = cc-switch 当前 active provider 的主模型。failover
  切换 current 后，aim 流量静默落到另一家 provider 上——用 `request_model`（客户端声明）
  对照 `model`+`provider_id`（实际承接）才能看出错配。
- **403/429 可能不落请求日志**：配额打穿/限流至少写 `provider_health` 连败计数；是否同时在
  请求日志留状态行因版本/通道而异（实测两源并存过）。查失败史两表都查，任一源有失败都不算「没失败」。
- **append 型日志统计必须按业务日锚定**：管道日志跨月追加且 via/attempt 行不带日期，
  统计通道分布/失败率以最近的产物落盘行（如 `pdf: .*<date>.pdf`）为锚归日。直接 grep
  文件尾会把上周旧失败算进今天的账，得出「通道全挂」类误判。

## Procedure（审计顺序）

1. **定窗聚合**：cc-switch.db 按 provider×model 聚合请求数/tokens/状态码（机制见
   cc-switch-stats-analysis）；与前三日日均对比定位异常日。
2. **计费模式确认**：先自查再问人——`providers.settings_config` JSON 里 `usage_script.codingPlanProvider` 非空、`templateType=token_plan`、或 `ANTHROPIC_BASE_URL` 带 `/coding` 路径，都指向按次包月套餐制（token 折算 $ 仅为名义值）；仍不确定再向用户确认。此步不做，后续全废。
3. **流量归属**：`request_model` × `provider_id` 交叉表 → 找「声明 A 落在 B」的错配流量；
   按小时分布 → 定位突发时段对应哪条管道/哪个 job。
4. **静默失败核对**：health 表连败计数 vs 请求日志失败行，差值 = 不落日志的 403/429。
5. **浪费结构定性**：把异常拆成（a）配额内正常使用（b）错配到贵通道（c）重试白烧（d）
   非 agent 客户端偷跑——四类的处置完全不同，混在一起必然开错药。
6. **机制级修复 + 次日复验**：修 failover 优先级/总量闸/重试策略，不手工改 current；
   修复验证 = 原口径重测归零或配额重置后自动恢复（可挂次日 cron 判定）。

## 计费通道白烧点（夜间管道实测归纳）

研判主力走免费通道时，计费消耗只来自三处，优化只做这三件：

1. **间歇故障后立即跳计费兜底**——turn.failed/429 类故障多为整点突发且可自愈，
   降级前先 sleep ~90s 重试，比立即跳计费层更可能留在免费通道。
2. **计费兜底无总量闸**——步骤重试×补跑×通道回退三层叠加，最坏单份报告 9 发计费；
   兜底必须有进程级+日级硬上限，超限降级为无 LLM 模式（而非无限烧）。
3. **格式抖动重试耗尽**——JSON 解析失败 3 发全废=整步重来；抖动重试走免费通道
   边际成本≈0，应放宽重试而非整步弃用。

诊断前先核对当前代码是否已含对策（免费通道 direct 层、总量闸）——机制写入 skill ≠ 已落地，
引用前 grep 代码确认。总量闸现状：进程级 `_hermes_cap`（默认 6 发，env `RADAR_BILLING_CAP`
可覆盖；预算耗尽后返回带 `billing cap` 标记的失败，不发起计费调用）已同时落在
`~/.hermes/scripts/` 与 life-workbench `scripts/` 两个副本的 `ask_llm_json`。副本会随重构
切换权威侧——验证时先重跑运行时引用链 grep 确认当案权威副本，再查该副本是否含闸，
勿信本 skill 记的副本路径。

## Pitfalls

- **机制写入 skill ≠ 已落地，且落地副本可能不是运行时副本**（2026-10-03 实锤）：radar_llm.py 的 billing cap 10-02 加在了 `~/.hermes/scripts/` 副本，而夜 loop 运行时 import 的是 `$R=life-workbench/scripts/` 的 v3 副本（路由都不一样：09-07 免费窗版 vs 09-20 无条件 zcode 版）——闸从未生效过。多副本脚本必须先 `grep -n` 运行时引用链（loop 脚本的 `$R` 等变量指向）确认权威副本，再把改动打到权威侧，最后反向同步其余副本消除双事实源。
- **sqlite3 CLI 不认 `1e6.0` 科学计数**（python sqlite3 认）：CLI 里 `SUM(x)/1e6.0` 报 `near ".0": syntax error`，且在 `$( )` 捕获+`2>/dev/null` 下静默返回空串，直接掉进「读不到就静默」分支——bash 里写 SQL 一律用 `/1000000` 整数除法。
- 修复路由类问题禁改 `is_current`：auto-failover 会自动改写并在应用退出时把内存态写回
  覆盖磁盘改动——正确做法是调 failover 队列优先级。proxy_config 熔断参数可 DB 直写（应用
  重启才重载），写后挂漂移检测（llm-waste-watchdog.py S5）防退出写回覆盖。
- 「跳过 direct 直达计费层」出现时，先核对跑的是哪份代码副本（旧副本/worktree 残留）
  再改逻辑——日志文案本身能区分版本（不同回退提示文案 = 不同版本跑的）。
