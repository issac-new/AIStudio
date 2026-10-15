# 严格姿态轮 runbook（批次五备件，V8.29 §1.5/§5.9）

> 执行窗口：run20 收官后、且 prelaunch 十六项全绿（含 ⑯ 代偿清偿门——上一轮 open 代偿须先 resolve/waive）。
> 目标：full × strict 一轮，「跑死即产出」——产出=新发现缺陷 N+代偿点 M+死点 K 三张清单，验收线=清单完整性而非六闸全绿（§5.9）。

## 启动序列

```bash
cd <simharness>
bash mux/mx-prelaunch-check.sh          # 十六项全绿为前置（⑯ 读上一轮台账 check-clearance）
# 严格姿态声明（三选一）：
export MX_POSTURE=strict                 # 方式一：env（驱动/哨兵/代批环同源读）
# 方式二：开跑命令行内联；方式三：起跑后 state.env 会落 posture=strict 键可复核
RUN_ID=2026xxxx-v8-runXX LC_ALL=C MX_POSTURE=strict \
  nohup bash mux/run-driver-supervisor.sh --run $RUN_ID --start-step smoke \
  > <SIM_ROOT>/logs/$RUN_ID-supervisor.log 2>&1 &
```

## 随行观察（人+workflow 影子）

```bash
bash mux/mx-state-query.sh --run $RUN_ID summary     # 单一查询入口（posture/闸态/台账）
bash mux/mx-state-query.sh --run $RUN_ID product      # PR-0/PR-1 端点探查（缺席=文件面）
bash mux/mx-compensation-ledger.sh --run $RUN_ID list --status open
```

## strict 语义速查（本批已落码）

- 派发词→自主组织短单（不预设拆分/人日）；评审卡不代建；卡不代走 done；集成合并不代做；空转不代偿提醒——全部改为记问题单（issue 型 strict-*）。
- 哨兵：ready 滞留不直派（记 gw-dispatch-stall-observed）；休眠不群提醒（记 agent-sleep-observed）。
- 代批环：criteria 模式，只读安全操作放行、其余缓批留痕。
- 代偿台账在 strict 下应接近零笔（strict-* 问题单是预期产物，不是事故）。

## 收官判据

1. 缺陷清单 N：本轮 issues.log 全量归类（含 strict-* 观察型）。
2. 代偿点 M：台账 open 笔+类型→PR 编号映射。
3. 死点 K：停滞/中止点+根因初判（区分产品缺陷/组织能力缺口）。
4. 报告走 mx-report-gen（姿态页+净额对账节自动生成）；audit 判据按 §5.9 三线。
5. 复盘将 N/M/K 逐项挂 PR 或新立 PR——进下一轮清偿门。
