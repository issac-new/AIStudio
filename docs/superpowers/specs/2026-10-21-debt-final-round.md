# 挂账清偿收：obssignels OTel 聚合 + 红队沙箱攻防接线

日期：2026-10-21　分支：`feat/debt-final-1021`　前置：`feat/debt-clearing-1021`（main 9cab4d88）

## 1. 结论

上轮如实声明的最后两条挂账本轮清偿：F）obssignels 观测聚合消费 OTel 格式（转换复用 trace-sampler 单一事实源）；G）红队沙箱攻防接线（执行型载荷在 exec-sandbox 内真跑验活性，对照规则层出四分类事实，REST 挂 `/api/hermes/eval/redteam/exec-runs`）。

## 2. 变更

### 2.1 批次 F：obssignels 消费 OTel

- `collect.ts` 行级：OTel 行经 `isOTelSpanRow`/`otelRowToLegacy`（trace-sampler 单一事实源）转 legacy 投影后进既有聚合管道——OTel 会话的 llmCalls/tokens/TTFT 不再是观测盲区。
- `skippedOtelFiles` 语义收窄为「整文件全跳」（转换后行仍可能全超窗）；notes 文案同步。hash/窗口口径不变（按转换后行时间戳）。

### 2.2 批次 G：红队沙箱攻防

- 新增 `custom/server/redteam/exec-probe.ts`：
  - `EXEC_PAYLOADS` 四条确定性执行型载荷（rm -rf / 裸形态、curl|sh 管道直执、cat /etc/passwd 敏感读、touch 写探针）——破坏面被沙箱限制（禁网/只写 scratch/超时）。
  - 每条载荷双面事实：S0 检测器判定 + `runSandboxed` 真跑验活性；四分类 `escaped-detector-and-executable / detector-intercepted / payload-dead / sandbox-error`。
  - 判定口径=「任一规则命中」（检测器看见没有），不是 threshold 送审线——单条 weight-2 规则（如 tool-pipe-exec）在默认阈值 3 下不构成拦截，攻防面问的是规则层有没有眼睛；报告 notes 明示执行闸/审批层是第二道防线，本面不替代其判定。
  - 沙箱不可用一律 fail-closed：零执行零结果，只报 unavailable。
- `redteam/routes.ts` 增 `POST /redteam/exec-runs`（每次真执行为 spawn 级代价，无状态不落库；不可用回 503）。

## 3. 决策记录

1. OTel 转换放采集行级而非「文件级整体转换再聚合」——与 eval 域采样同一函数同一口径，行级混档（legacy+OTel 同文件）自然兼容。
2. 攻防判定用规则命中而非 threshold——避免「单高危命中 2 分<3 不算拦截」把事实淹掉；threshold 语义留给文本红队 run。
3. 裸 `rm -rf /` 如实归 escaped（注入规则层对无语境裸命令确实无眼睛）——不为此给 S0 加命令白名单规则（那是执行闸/审批层的职责，规则层定位是注入检测）；报告注明第二道防线，盲区暴露本身是有价值的红队产出。
4. exec-runs 不落库——每次真执行代价高且结果即时，无回归对比语义；文本红队 run 的落账不变。
5. 载荷族固定四条不做成变异引擎——执行型攻击的活性验证要确定性可复现；变异扩展留后续。

## 4. 验证

- F：collect.test 重写 OTel 用例（行级转换入聚 + 端到端聚合计数）11/11。
- G：exec-probe.test 分类纯函数四例 + fail-closed + 真沙箱跑（写探针真落盘、pipe-exec 命中、裸 rm 如实 escaped）6/6；HTTP 端点禁用 503/可用 200（eval-baidu-http 8/8）。
- 全量 `npm test` + `typecheck:harness`；合入后 8647 换装并探活。
