# Harness 未做项收口轮（W4：幂等替换/输入冻结/关联注入/eval 通道/活体走查）

> 日期: 2026-11-04
> 状态: 已实施
> 关联: 前轮=2026-11-04-harness-w1/w2/w3 三 spec（本批清偿其「未做」节全部五项）；调研源=vivo《面向技术产品经理的 Agent Harness 设计》

## 任务卡审查七项

### 业务完成条件
①幂等命中可 ok:true 替换回放（瀑布 replace 判决落地，不再以拒绝形态回放）；②run 开启时输入快照（input_manifest）落 run metadata，taskmodel available.inputVersions 据实为 true；③工具审计行 traceId 有生产者（sessionId 兜底=OTel 既定语义）＋promptVersion 经 run-manifest 写入路径注入 ambient；④六类故障样本注册进 eval seed 通道（可执行化）；⑤三新端点活体走查（起服真实 HTTP 请求）。

### 输入与来源
输入=本仓 git HEAD 813219c3a＋前轮三 spec 的未做清单；无外部数据；eval 真实判定模型为外部依赖（本机未配则如实报）。

### 工作流边界
P1/P2 触 patches/（§1.0 串行硬约束——本批单 worktree 串行推进）；P1 改 patch 565 须同步瀑布守门测试期望；P2 改 kanban_db.py 须 runtime/ 镜像与补丁双同步（shasum 对账）；活体走查依赖端口 8647 可起（失败如实报，不造假）。

### 工具与副作用
patch 565 再生（git diff --relative 双前缀核验）；新补丁 750（agent 树）；无外部写副作用；走查只读端点。

### 结果与证据
证据=vitest/pytest 目标域全绿＋补丁 clean→inject 重放幂等二连＋shasum 对账＋活体 curl 输出（HTTP 200 + JSON 字段）。

### 异常与恢复
瀑布 replace 判决对旧钩子零影响（未识别形状按放行原路径）；input_manifest 写失败不阻断 run 开启（fail-soft 观测面）；eval 无判定服务=样本注册完成＋执行外部依赖如实声明；回滚=git revert（补丁可再生）。

### 验收反例
①replace 判决缺 post 钩子配对（审计丢 post 行）；②旧版 preExecute 返回形状被误判为 replace（兼容性破坏）；③input_manifest 落档但 taskmodel 仍报 inputVersions:false（读写脱节）；④traceId 兜底破坏既有显式 traceId（应只兜底不覆盖）；⑤活体走查用 mock 冒充真实 HTTP。

## 变更

清偿前轮五项未做（前轮零 patch 边界放开，本批走补丁正道）：

1. **P1 幂等 ok:true 替换回放**：patch 565 瀑布接口增第三种判决 `{replace: AgentToolResult}`——preExecute 返回 replace 即跳过真实执行、以给定结果走 post 钩子链后返回（审计配对完整）；contractGuard 的幂等回放从「拒绝+回放缓存信封」升级为「ok:true 替换结果」（content/data 携带 replayed:true 与首次结果）。
2. **P2 输入冻结（run 级）**：新补丁 750-agent-run-input-manifest——`kanban_db.py` 开 run（claim/start_run 路径）时把任务输入面快照（body sha256＋attachments 行清单＋各档字节数）写进 `task_runs.metadata.input_manifest`；runtime/ 镜像同步（shasum 对账）；taskmodel 读侧：run metadata 带 input_manifest 时 inputRefs 从 manifest 派生且 `available.inputVersions=true`。
3. **P3 关联字段生产注入**：①auditHook `traceId` 兜底=sessionId（OTel formatter 既定语义 traceId=session_id，只兜底不覆盖显式值）；②run-manifest 记录 chat run 时置 ambient 关联（traceId/runId/promptVersion=promptHash），run 收尾清槽——工具审计行从此带 promptVersion 生产者。
4. **P4 故障样本 eval 通道化**：六类样本注册为 eval seed 集（fault-seed.ts，接既有 seed 注册面），从「测试夹具」升为「eval studio 可执行任务」；真实模型执行依赖判定服务（本机未配则不跑，如实声明）。
5. **P5 活体走查**：起 serve（8647）对三新端点真实 HTTP 请求（execution-join/taskmodel/tool-contracts 扩展位），复用仓内走查脚本鉴权模式（admin+HERMES_WEB_UI_DEV_BOOTSTRAP 显式开发门）；产物=响应 JSON 留档（/tmp/w4-walk/result.txt）。**走查实锤一真缺陷并根治**：快道 boardDbPath 漏 default 板主库第三态 `<home>/kanban.db`（kanban-overview 早有正解三态）——正路 taskmodel 404 即此因，修后 200。部署层差距如实记：宿主 ~/.hermes 运行时未含补丁 750（runs 认领走旧 runtime，inputVersions=false 是真实读数），部署+网关重启归后续运维面。
6. **推演方案与程序同步**（用户同批指令）：§5.11 扩至十四组——组 14「Harness 契约面」六探针（execution-join 四源 fail-soft 正例＋三负例 400/404/400＋tool-contracts 版本锚 2026-11-04.1＋taskmodel 条件正例，全只读纪律——fault-seed 建集是写操作不探，由单测与活体把守）；探测脚本/守门测试（十四组断言＋组14 三负例必须真跑）/方案表行与计数/G4 判据行/审计器文案/README 五面同步；capability-probes 夹具补挂 harness 整路由＋四 env 隔离（审计/批单/清单/govbus 入临时目录）。**端点增强**：/tool-contracts 补 version 行（run manifest 的 toolContractVersion 可与端点自报对账）。

## 决策记录

| 决策 | 选择 | 备选 | 理由 | 类型 | 用户裁定 | decisions.jsonl 行号 |
|------|------|------|------|------|---------|---------------------|
| replace 判决是否过 post 钩子 | 过（完整审计配对） | 直返 | pre 行已落账，跳过 post 会让该调用永无结局行——配对契约破坏 | Mechanical | approved | 75 |
| input_manifest 落点 | task_runs.metadata（既有 JSON 列） | 新表/新列 | 零 schema 迁移；读侧 deriveTaskModel 已读 metadata；快照体积小（哈希+清单） | Mechanical | approved | — |
| traceId 生产者 | sessionId 兜底（OTel 同语义） | 新造分布式 trace | traceId=session_id 是仓内 otel_formatter.py:119 既定口径，兜底即统一而非新造 | Mechanical | approved | — |
| eval 真实模型执行 | 样本通道化；服务未配不跑 | 强跑 | 真实判定要判定服务与预算，外部依赖如实声明优于造数 | Mechanical | approved | — |

## 验证

- `npx vitest run custom/server/toolcontract custom/server/toolpipeline custom/server/taskmodel custom/server/eval custom/__tests__`＋瀑布守门更新
- `python3.14 -m pytest runtime/tests/hermes_cli/test_kanban_input_manifest.py`（拼合树）
- 补丁重放：clean→inject 二连幂等；runtime↔vendor shasum 一致
- `npm run typecheck:harness`；全量 `npm test`
- 活体：`npm run serve` + curl 三端点输出留档

## 设计文档影响

- DESIGN_SYNC: touched
  - docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md —— §8.4「任务模型读投影」行更新（inputRefs 版本面自 manifest 可得，run 级输入冻结已落）＋「执行记录关联面」行补 traceId 生产者说明。
