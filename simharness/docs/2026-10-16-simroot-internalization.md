# Spec：SIM_ROOT 默认值全量内置化（外置 nvme2230 引用清零）

- 分支：`main`（挂账收尾批，随 20:39 清扫工作树落库）
- 日期：2026-10-16
- 上游：NVMe 外置盘退役迁移（[[docs/specs 前批]] run20 挂账会话 sess_a4ff3f6b 遗留工作树，21:32 会话结束后由后继会话验证落库）

## 问题

外置盘 `/Volumes/nvme2230/lab/ncwk-sim-mux` 进入归档态（仅余 archive/ logs/ var/ 壳目录，
runs/、creds/ 已迁走）。simharness 各脚本默认 SIM_ROOT 仍指外置，导致：

1. `mx-gateway-nanny.sh` 等保活/巡检件落到外置写死数字（外置 gateway-nanny.log 0 字节、
   gateway.log 869B 停更 20:37，统计全是死数字）；
2. 报告链（unified-report-layer / final-report-merge / demo-kit-gen）路径兜底指向已不存在的
   外置树，一旦触发即断链。

现役执行面在内置 `/Users/cuishi/lab/ncwk-sim-mux`（网关 PID 25733 实测写
`hermes/logs/gateway.log`，lsof 实证）。

## 修复

34 文件 38 处 `nvme2230` 引用全量改内置，零新增外置引用
（`git diff | grep -c '^+.*nvme2230'` = 0）。涵盖：网关保母/babysit、mx-clean、
报告链三件、门禁一致性测试断言（harness-gate-integrity.test.ts 4 行随迁）、README。

剩余唯一 `nvme2230` 引用：`skills/aipaydev-dev/.swarm-yuan/effects/20261010T121737Z/precheck.conf`
——历史效果快照（工件存档），不随迁。

## 验收

- `bash -n` 15 个改动 shell 脚本全过；
- vitest 全量 8 文件 181/181 绿（19.3s）；
- vitest 重生成的 4 个 fixture 时间戳搅动件（unified-mini×2、report-three-elements×2）
  已恢复 HEAD 不随批（非语义改动）。

## 决策记录

| # | 决策 | 理由 | 替代（否） | 可逆 |
|---|---|---|---|---|
| D1 | 默认值改内置而非环境变量注入 | 现役执行面已全在内置，外置为归档态；默认值应指向活水 | 保留外置默认+部署侧覆盖（多一层隐性配置） | 可逆 |
| D2 | 历史效果快照不随迁 | effects/ 为 2026-10-10 时点工件存档，改写历史快照破坏存档语义 | 同步改快照（伪造历史） | 不可逆故不做 |
| D3 | fixture 搅动件恢复不提交 | 纯时间戳/epoch 差异，非本批语义 | 随批提交（污染 diff 口径） | 可逆 |
| D4 | 本批不带自动化 prompt 修正 | run20 15min 监控自动化随宿主会话 21:32 终止（rtk-bridge 全量活动实证 21:32 后零调用），无活流量；其 prompt 属 simharness 工作区自动化存储，本会话（ncwk 工作区）不可达 | 跨工作区改自动化（不可达） | — |
