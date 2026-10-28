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
- **用户弃用的通道禁回流进方案**：MiniMax 已被用户裁决弃用（质量原因）——任何优化/failover/降级建议禁再包含 MiniMax。审计遇到已删 provider 的残留流量（突发归属到已消失的 provider ID）归档说明即可，无需处置动作，勿据此开「清理残留」类工单。

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

### zcode/codex 侧结构性放大（30d 全量审计实测）

- **上下文重传是 zcode 最大消耗**：30d 上行 37B token 中 cache_read 占 97.6%，单发 input P50=239k/P90=533k/max=1.74M。治理只剩一路：goal 会话按里程碑拆分（跨天常驻会话每发都全量重传）。**调低压缩阈值已被用户否决**（质量优先）——优化方案禁再含改 codex `model_auto_compact_token_limit` 或任何压缩阈值类条目。
- **goal 常驻会话 token_budget 全空且无填写入口**：zcode `session_target` 表 goal 会话 budget 全空（全史 88 个、30d 49 个，无一填写），最高单会话 2.84 亿 token。该字段无任何入口——桌面端无设置面、无 CLI goal 子命令——「必填 budget」无法在机制层直接落地，只能走派工纪律层（任务书声明预算）或看门狗拦截（已落地，见下节）。**推荐「设字段 X」前必须先验证入口存在**，否则产出不可执行建议。
- **429 失败行 input_tokens=0（实测确认）**：限流被拒发生在计费前，token 浪费≈0，代价只是重试延迟与 failover 抖动——429 治理优先级低于上下文治理，勿把「失败率高」误判为「烧钱多」。
- **0 点池重置并发尖峰**：套餐池 0 点重置后跨天常驻会话同时恢复吞吐，SGLM 429 集中 00 时（单小时 1,493 发）。错峰手法=常驻会话恢复加随机延迟。

### goal 会话预算门禁（已落地）与阈值推导规则

- 机制面：`~/.zcode/scripts/model-peak-guard.sh` 的 `goal-budget`/`goal-resume` 子命令（SIGSTOP/SIGCONT 挂起/恢复，复用 disk-guard 机制）+ launchd `com.zcode.goal-budget-guard` 每 5 分钟巡检 + SessionStart hook 注入 80% 预警。挂起只对 goal 会话动手（用户裁决：无人值守 goal 可自动刹车，禁打断交互会话——交互会话维持 800M/24h 只提醒不拦截；破线大户也确有不来自 goal 的）；恢复只走手动 `goal-resume`，不自动恢复。
- **阈值推导规则（从账本历史推，不拍脑袋）**：按结局分 cohort——「完成组」生命周期 token 取 max×~1.2 做生命周期硬顶（盖住全部完成案例+余量，超线即打转）；「失控组」（日耗远超完成组且无一完成）的日耗下沿做日率软顶，两次触发才挂起（放行单日冲刺）。当前值：硬顶 1200M（完成组 max 988M）/ 日率 900M；上线后定期复调，完成组分布右移即上调。
- 踩坑：①会话→进程映射禁用 lsof 文件映射（rollout 文件名与 session id 是两套命名、请求间歇关句柄），用 cwd 映射且「目录下恰 1 个 zcode-cli 进程」才动手，共享目录多进程只通知不挂起；②hook stdin 只能读一次，多个 check 函数须由 cmd_check 统一读后传参；③门禁测试顺序=先 DRY_RUN 全真跑候选发现（验证守卫拒绝路径与超限识别）→ 再用牺牲进程（如 `sleep`）实测 STOP→挂起态/CONT→恢复态/死进程记录清理 → 禁写生产 zcode db 造假会话来测。


诊断前先核对当前代码是否已含对策（免费通道 direct 层、总量闸）——机制写入 skill ≠ 已落地，
引用前 grep 代码确认。总量闸现状：进程级 `_hermes_cap`（默认 6 发，env `RADAR_BILLING_CAP`
可覆盖；预算耗尽后返回带 `billing cap` 标记的失败，不发起计费调用）已同时落在
`~/.hermes/scripts/` 与 life-workbench `scripts/` 两个副本的 `ask_llm_json`。副本会随重构
切换权威侧——验证时先重跑运行时引用链 grep 确认当案权威副本，再查该副本是否含闸，
勿信本 skill 记的副本路径。

## Pitfalls

- **开机制级药方前先盘现存看门狗**：本机已有多层守卫（如 zcode 侧 model-peak-guard.sh 的 800M/24h 判定），不查就把「已存在但只提醒不拦截」的机制当成空白新建，或把用户已否决的手法再提一遍——先 grep 守卫脚本与 hooks 配置确认现有判定/阈值/拦截行为，再决定新建还是升级现有判定。
- **机制写入 skill ≠ 已落地，且落地副本可能不是运行时副本**（2026-10-03 实锤）：radar_llm.py 的 billing cap 10-02 加在了 `~/.hermes/scripts/` 副本，而夜 loop 运行时 import 的是 `$R=life-workbench/scripts/` 的 v3 副本（路由都不一样：09-07 免费窗版 vs 09-20 无条件 zcode 版）——闸从未生效过。多副本脚本必须先 `grep -n` 运行时引用链（loop 脚本的 `$R` 等变量指向）确认权威副本，再把改动打到权威侧，最后反向同步其余副本消除双事实源。
- **sqlite3 CLI 不认 `1e6.0` 科学计数**（python sqlite3 认）：CLI 里 `SUM(x)/1e6.0` 报 `near ".0": syntax error`，且在 `$( )` 捕获+`2>/dev/null` 下静默返回空串，直接掉进「读不到就静默」分支——bash 里写 SQL 一律用 `/1000000` 整数除法。
- 修复路由类问题禁改 `is_current`：auto-failover 会自动改写并在应用退出时把内存态写回
  覆盖磁盘改动——正确做法是调 failover 队列优先级。proxy_config 熔断参数可 DB 直写（应用
  重启才重载），写后挂漂移检测（llm-waste-watchdog.py S5）防退出写回覆盖。
- 「跳过 direct 直达计费层」出现时，先核对跑的是哪份代码副本（旧副本/worktree 残留）
  再改逻辑——日志文案本身能区分版本（不同回退提示文案 = 不同版本跑的）。
