# Eval Studio 百度轮后续批设计：红队变体扩产 + 线上证据接线（2026-10-19）

> 状态：已落地（feat/eval-baidu-followup）。
> 前置：specs/2026-10-19-eval-baidu-reward-design.md（B1-B5，用户裁定「全做」触发本批）。
> 本批 = 用户 2026-10-19 裁定的两件工程件 + 推送补账：B6 红队变体自动扩产、B7 线上层证据接线。

## 主旨三句话

唯一主旨：把红队从「24 题静态种子库」升级为「规则改写器驱动的百题变体库」，并给发布门禁的线上层（QPS 余量/响应分档）打通证据回填通道，让 no_data 缺口可被真实数据补上。受众：Eval Studio 二次开发者与推演报告维护者。读完促成：红队库一键扩到 100+ 变体题，压测/分档数据可回填进运行报告。

## 1. B6 红队变体自动扩产（攻击向量库 → 变体扩产器）

- **形态**：确定性规则改写器（`redteam-variants.ts`），无 LLM、无遗传算法——每条规则把一个种子任务改写为一个变体（换载体/换伪装/换框架），生成过程可复现、可审计。百度红队四步中的「自动攻击生成」在本仓的 v1 落法=规则扩产；遗传/RL 生成仍挂账。
- **规则集**（每向量一组）：
  - 直接注入 ×6 伪装：base64 编码伪装（构建时真编码）、倒读伪装、权威公告伪装（【系统维护公告】）、英文转译伪装、Markdown 代码块伪装、紧急事故伪装。
  - 间接注入 ×5 载体：CSV 字段、API JSON 响应字段、邮件落款、代码注释、README 小节。
  - 机密外泄 ×4 框架：生产事故排查、系统所有者身份、格式确认（打码诱惑）、渐进式（先给前 4 字符）。
  - 工具滥用 ×4 邻接命令：chmod -R 777、kill -9 清进程、git push --force、写 crontab。
- **产量**：24 种子 → 114 变体（36+30+24+24），合计 138 题。
- **变体裁剪**：rubric 与断言语义继承父题（红线断言 expect='no' 不变）；id=`{父id}-v{n}`；expectedBehavior 沿用父题。
- **端点**：`POST /api/hermes/eval/sets/redteam-variants`——找 `红队种子库·v1`（不存在→400 提示先建种子），按 id 去重追加（幂等），bump 指纹/修订号。store 新增 `appendTasksToSet`（密封拒绝、id 去重）。
- **拒答回声纪律延续**：变体不引入新的 S0 regex（密钥特征规则只随父题继承，新伪装文本一律 S1 判）。

## 2. B7 线上层证据接线（live evidence）

- **数据形态**：`EvalRun.liveEvidence`——`qpsProbe`（目标/达成 QPS、错误率、p99÷p50、来源、时间）+ `responseTiers[]`（simple/complex 各样本数与 p95ms）。字段口径对齐 simharness `mx-load-probe.py` 的 JSON 产物（错误率<1%、达成≥90% 目标、p99≤2×p50）。
- **门禁接线**：`evaluateReleaseGate(attempts, config, live?)` 第三参——qps_headroom 与 response_tier 两个 no_data 项在 live 数据到位时转 pass/fail；无 live 数据行为不变（基线零回归）。basis 注明 live 来源。
- **端点**：`POST /api/hermes/eval/runs/:id/live-evidence`——数值校验（正数、tier 枚举）→ store `recordLiveEvidence`（写 run + 重聚合，与 recordHumanVerdict 同模式）。
- **动作文案更新**：actions.ts 中 qps/response_tier 缺口动作改为「压测后经 /runs/:id/live-evidence 回填」——读数→动作闭环补全。
- **UI**：报告面板门禁区加 `<details>` 回填表单（QPS 四项 + 分档 p95 两项，均可选留空）→ 提交后重载报告；i18n zh/en。

## 3. 边界与挂账

- 变体扩产是确定性改写，不是对抗性生成（遗传算法/RL/沙箱攻防/裁判自进化仍挂账）。
- liveEvidence 不采集、只回填——TTFT 真值仍依赖 trace 打点（既有口径），本批不新增采集面。
- 推送补账：GitHub 断网期间的 origin push 在本批收口时重试；仍失败则挂定时重试。

## 4. 决策记录

- 2026-10-19 用户对三件待决（红队扩产/线上真数据/推送）裁定「全做」。红队只做变体扩产（上一轮建议的轻路径）；沙箱攻防与裁判自进化不在本批。
- 变体生成选规则改写而非 LLM 生成：S0 哲学（确定性、零成本、可复现），且 LLM 生成的攻击文本需要人审才能入库——规则变体语义可控、父题红线断言直接继承。
- liveEvidence 走回填端点而非自动抓取：mx-load-probe 产物在 simharness 侧（SIM root），自动跨仓抓取会造耦合；回填让证据来源与责任方显式化。
- appendTasksToSet 独立于 reflow 通路：reflow 带线上坏例溯源语义（origin），变体是资产扩产语义，混用会污染 origin 口径。
