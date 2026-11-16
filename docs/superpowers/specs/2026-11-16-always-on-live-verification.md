# Always-on Agents 活体验证补漏批

日期：2026-11-16
状态：implemented
触发：用户「完成未做」——主批（`2026-11-16-always-on-agents-absorption.md`）遗留的「三个 watcher＋outbox 自动轮未做活体端到端」清偿。
挂靠：父 spec 同上；本批不新增能力面，只补验证与两处验证中抓出的缺陷修复。

## 变更

- **TS｜outbox matrix 通道活体测试** `custom/server/outbox/__tests__/outbox-matrix-channel.test.ts`：本地起假 Matrix homeserver（真 HTTP＋真 fetch），凭据链走真实解析（临时 HERMES_HOME→profiles/live-gw/.env→readGatewayMatrixEnv）；三例＝真 PUT m.room.message（鉴权头/txn/正文）终态 delivered、500→attempts=1 且 notBefore=+30s→到点重试成功（attempts=2）、OUTBOX_MATRIX_ROOM 缺席失败退避不静默丢。inbox 通道主批已覆盖。
- **补丁 792｜watcher 接线级集成测试**（vendor，真实存储＋桩 runner，admit_route_wake 打桩记录）：
  - `tests/gateway/test_followup_watcher_wiring.py` 5 例：到期空闲 claim→注入→fired；会话忙顺延不 claim；admit 拒绝回退 adapter.handle_message；注入异常 3 次重试后 failed；无 adapter 告警一次且保持 active。
  - `tests/gateway/test_deferred_watcher_wiring.py` 5 例：批准→settle＋「已批准」唤醒＋二轮零唤醒；拒绝→「拒绝/不要重试」；过期→一次告知；非法 choice 不误裁决；唤醒失败只记日志不抛。
- **补丁 792｜dreaming 活体 E2E** `tests/agent/test_memory_dreaming_live.py`（门控：`allow_real_home_io` 标记＋`hindsight_client` 可导入＝部署解释器 py312；其余环境自动 skip）：真实 ：8888 守护＋scratch bank（`hermes-live-dream-<ts>`，可整体删除）；种子 retain→等异步抽取→`run_dreaming(force=True)`→断言 dreamed/retained_chars/预算戳→dream 产物轮询可召回。
- **补丁 792｜缺陷修复两处（活体验证抓出）**：
  1. `agent/memory_dreaming.py`：reflect 工具返回 JSON 信封（`{"result":…}`/`{"error":…}`），原实现把转义 JSON 整串 retain 入库且空判失效——新增 `_unwrap_tool_text` 剥信封（error→空→reason=empty）。
  2. `gateway/run_deferred.py`：`_scan_one_store` 从 watcher 闭包提升为方法 `_deferred_scan_one`（可测性重构，行为不变）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | matrix 通道用本地假 homeserver 而非真 synapse | 验证目标=派发链真发送行为（鉴权/txn/退避），非 homeserver 本身；真 synapse 写入即生产房间污染 | 打桩 fetch（否决：绕过了真实 fetch 与 URL/头构造面） | 是 |
| D2 | watcher 测试用「mixin 挂桩 runner」而非起真网关 | 被测面=watcher 与存储/admission 的接线；起网关需平台适配器与外部服务，属推演轮范畴 | 真网关进程（否决：本批不可重复、依赖环境） | 是 |
| D3 | dreaming 活体测试按解释器＋标记门控自动 skip | CI/单测环境无 hindsight_client/守护；活体证据由部署机显式跑出（本批实录 1 passed 48.8s） | 默认常跑（否决：环境依赖+分钟级时长污染常规门禁） | 是 |
| D4 | 信封 unwrap 修在 run_dreaming 侧不改 provider 工具返回 | 工具信封是 provider 既有契约（UI 消费同一形状），改它波及面大；dreaming 是唯一裸消费方 | 改 `_tool_reflect` 返回裸文本（否决：破坏工具契约） | 是 |
| D5 | scratch bank 隔离＋可整体删除，不触生产 bank | 生产 bank 是团队共享记忆；验证写入必须可整体回收 | 写生产 bank 再删（否决：consolidation 可能已吸收，删不干净） | 是 |

## 验证

- TS：outbox＋notify＋ratchet＋收件箱 68/68；typecheck:harness 零错误。
- Python（homebrew pytest）：接线＋既有全家族 63/63；dreaming 单测 8/8（unwrap 不改 FakeProvider 裸串路径行为）。
- 活体（anaconda py312）：`test_memory_dreaming_live.py` **1 passed in 48.8s**——种子→抽取（实测 ~10s 索引延迟，短于 10 字符的琐碎内容无可抽取事实=0 memory unit，种子须实质内容）→reflect 综合（clean text）→dream retain→预算戳→产物 60s 窗内可召回。
- 补丁 792 重放：clean+inject complete 逐枚 applied（786-792）。
- 全量 `npm test` 与推演级活体（网关进程内三 watcher 运行态）仍属 run31 推演面——本批覆盖到「接线级＋守护级」，网关进程级留推演轮（机制预算 sunset 判据不变）。

## 设计文档影响

DESIGN_SYNC: none

纯验证批：不新增机制面（补丁 792 内两处修复不改变 §3.6.1 描述的行为语义——unwrap 属实现缺陷修复、scan 提升属可测性重构）；父 spec 的「未验证项」表述由本批验证段替代性更新不在本批执行（receipts 已绑定，改写需 SPEC_REBIND，留待下轮推演复盘批一并处理）。
