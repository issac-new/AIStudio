# 统一失败根因分类器（六类 taxonomy）

> 来源：MTSC2026《AI Native 测试工程实践》（极智嘉）方法论吸收轮，方案 B。文章核心：「调试阶段预设六类根因约束，每类对应明确处理策略，避免无效重试」——SCRIPT 修一次即止 / FLOW 回流用例设计 / 环境类数据清理+环境重置 / 设备类查实体 / SERVICE 分类记录触发上报 / TIMEOUT 立即跳过不死磕。本仓现状：failure-detector 三态（SPINNING/EXPLORING/MIXED）+ runaway 六信号 + issues.log + gate-deny.jsonl + gap_register 五套机制并存，但**分类面互不共享**——「这次失败属于哪类、该走什么策略、回流到哪」没有统一答案。

## 变更

1. **taxonomy 正本 `skills/swarm-yuan/references/failure-taxonomy.md`（新）**：六类根因单一事实源——
   - `SCRIPT`（测试/脚本自身代码错）→ 修一次即止不重跑；回流：脚本/测试文件
   - `ENV`（环境/数据态异常：端口占用/服务未起/未注入/依赖缺）→ 环境重置（inject/起服/清缓存）后再试一次；回流：recipes 环境配方
   - `PRODUCT`（产品真实缺陷嫌疑：稳定复现的 5xx/状态不符）→ 记 defect 不修测试迁就；回流：issues/defect 台账
   - `TIMEOUT`（超时类）→ 放大预算或标记跳过，禁死磕重试；回流：预算配置
   - `FLOW`（断言失败但环境正常=用例设计嫌疑）→ 回流 spec §19.2 重推前置/断言
   - `UNKNOWN`（机械不可判）→ AI 复核归类（PRODUCT/FLAKY 的判据：跨次重跑同命令结果不同=FLAKY 判据化重跑一次，对齐 simharness run-gates.sh worker RPC 抖动惯例）
   - 附五套台账映射表：error-history.jsonl（唯一落 category 字段的机械台账）/ issues.log / gate-deny.jsonl / gap_register / decisions.jsonl 各自承载边界——**不强行统一台账协议**（破坏性大手术），category 枚举成为跨台账共享词汇。
2. **failure-detector.sh 扩展**：新增 `_classify_failure`（纯 bash 规则表，bash 3.2 兼容，优先级 ENV>TIMEOUT>PRODUCT>SCRIPT>FLOW>UNKNOWN——环境错性价比最高先排除）；error-history.jsonl 行新增 `category`+`category_source:"rule"` 字段（向后兼容，旧记录无字段不破坏）；L1/L2+ 提示块附一行分类与处理策略。
3. **守门 `skills/swarm-yuan/tests/test-failure-detector.sh` 扩展**：分类断言态（六类各喂典型签名断言 category；hook 规则关键词与 taxonomy md 一致性锁——防规则表两处漂移）。
4. 部署面：assets 源改后经生成器 upgrade 通道刷新 ~/.zcode/skills/aistudio-dev/scripts/ 副本（不在本批内跑，收口后主检出操作）。

## 决策记录

1. **机械初判只给五类+UNKNOWN，PRODUCT/FLAKY 留 AI 复核**：PRODUCT 需「重试稳定复现」证据、FLAKY 需跨次比较，静态签名判不了；机械越权判会制造错误分类信任（文章坑 1 同型：AI 信任错误知识放大错误）。`category_source:"rule"` 字段显式标注初判来源，AI 复核可改。
2. **优先级 ENV 最高**：环境错会伪装成一切下游错误（ECONNREFUSED 下游是 TIMEOUT、import 缺依赖像 SCRIPT）；环境修复是幂等快操作，先排除性价比最高。
3. **不动 issues.log/gate-deny 协议**：issues.log 是 append-only 事件流且 mx-compensation-ledger.sh 按首词「延后」判处置（simharness 消费链），改协议=破坏现有消费者；互通靠术语统一而非字段统一。
4. **规则表两处同步用测试锁**：hook 内 bash 规则是 taxonomy md 的执行投影，单靠纪律必漂移（模板↔产物双向同步教训）；测试断言 hook 规则关键词在 md 中存在。
5. **分类提示不新增独立输出块**：附在现有 L1/L2+ 梃示块尾部一行——failure-detector 输出密度已高（SPINNING brief/L 块/模式分析），再加独立块稀释注意力。
6. **DESIGN_SYNC: none**——技能面方法论+hook 增强，不触及整合正本/数字总账；技能 README/CHANGELOG 若锁文档数字，随批核对。

## 验证

- `bash skills/swarm-yuan/tests/test-failure-detector.sh`（存量态 1-15 全过 + 新增分类态全过）
- 六类典型签名样例各断言 category 命中（ENV/TIMEOUT/PRODUCT/SCRIPT/FLOW/UNKNOWN）
- 一致性锁：hook 规则关键词 ⊆ taxonomy md 规则表

## 设计文档影响

DESIGN_SYNC: none——技能内部方法论新增与 hook 字段扩展；技能自身文档（SKILL.md 引用索引/CHANGELOG）随批更新。
