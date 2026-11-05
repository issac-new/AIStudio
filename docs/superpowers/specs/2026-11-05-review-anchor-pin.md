# 2026-11-05 评审锚钉与判词锚守卫（G2 复评读旧稿根治）

## 变更

- 新增 `simharness/mux/mx-pin-review-object.sh`：评审对象钉锚脚本——派发复评前把锚版评审对象文件（`git show <锚>:<路径>`）覆写进评审人工作区同路径，评审人读到的即派单锚版本；幂等放行（锚空/非 git 仓）与记障退出（锚:路径缺席 exit 1）两态。
- `simharness/aipay-scenario.sh` G2 复评段两处：
  1. 修订落仓取锚后、派发前调用钉锚，派单文案增「已钉入你工作区同路径；存疑以 git show <锚>:<路径> 为准」；
  2. 判词等待超时支路（breaker_trip 之前）加判词锚守卫：卡面 body 未引用本轮修订锚＝评审人读旧稿的错配判词——**不计闸轮（不 trip）**，重钉锚重派复评后 `fail` 交监督器续跑重入；幂等键 `g2_anchor_mismatch_redispatched` 防死循环（再错配走正常熔断语义）。
- 新增 `simharness/tests/review-anchor-pin.test.ts`：钉锚三态守门（钉成内容=锚版／幂等放行／记障 exit 1），夹具自持（临时 git 仓 v1→v2 两版）。

## 决策记录

- 根因（run27 实锤两次熔断）：修订推仓后 3 秒派复评，评审回合读本地未 fetch 的旧稿——卡面判词锚定 v1.1@72de4e9 而派单锚是 ce4f09c，旧版没修缺项→合理 FAIL→复审窗口翻负→熔断。属「锚在文案里、内容在工作区里」的双源漂移。
- 修法取**钉锚**（把锚内容物理写进评审人读的文件）而非仅强化派单文案：run27 已证 prompt-only 锚不绑定 agent 读取行为；钉锚让「读到的=派单锚」成为物理事实。fetch 仍执行（把锚对象取进对象库），覆写只碰评审对象单一文件，不动评审人分支/未提交工作。
- 守卫取**不计轮＋重派**而非放行/拦截判词：错配判词既非真 PASS 也非真 FAIL，计入任一侧都污染闸语义；重派一轮的成本（分钟级）远低于熔断复位周期（run27 实测 ~40 分钟/次）。
- 范围只落 G2 复评段（本轮实锤点）；G3/G5 等其他锚基评审段同型风险挂账晨间批统一收口（helper 已独立可复用）。

## 验证

- `npx vitest run tests/review-anchor-pin.test.ts`（simharness 树）：3/3 全绿（钉成/幂等放行/记障三态，夹具含 HEAD 停 v1、origin/master 在 v2 的未 fetch 形态）。
- `bash -n simharness/aipay-scenario.sh` 语法门过。
- 判词锚守卫复用既有 `kanban_card_body_contains`（run27 现场实证可检出：卡面含 72de4e9 不含 ce4f09c）。

## 设计文档影响

DESIGN_SYNC: none——harness 驱动段机制加固，不触及整合正本/数字总账；理由=闸语义（轮次/熔断阈值）与判词协议未变，仅消除「评审对象与派单锚不一致」这一实现层漂移。
