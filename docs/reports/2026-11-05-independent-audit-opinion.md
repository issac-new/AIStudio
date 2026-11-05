# 独立审计意见（2026-11-05，seed=20261105）

> 审计对象：AIStudio qgate 治理体系与 spec 收据。
> 审计方式：固定种子抽 5 个 PASS 门 + 5 份 spec；独立会话复核证据，不参与实现。
> 结论：**有条件通过**——抽样可复现、3/5 收据哈希逐字一致；发现 9 项，已处置 8 项，1 项保留为已知限制。

## 一、门抽检

| 门 | verdict | 证据锚点 | 独立判断 |
|---|---|---|---|
| L0.convention-alignment | PASS | `run-20261105053953-f8f3de2e.json` | 真实执行（54ms）；但唯一规则只作用于 2 个文件，summary 的「5000 files」是扫描面上限而非覆盖量 |
| L0.registers | PASS | `run-20261105053958-66a3a03f.json` | 数字可对账（assumptions 3 条 confirmed、decisions 4 条）；confirmed 为治理会话自评，无外部锚 |
| L0.requirement-trace | PASS | `run-20261105054000-73c06d7f.json` | AC 与同批 PASS 门互相背书，产品代码零覆盖 |
| L0.scope-check | PASS | `run-20261105054003-83c0e4d1.json` | 4ms 判完；当次 diff 仅 2 个账本文件，判定近恒真 |
| L0.acceptance-coverage | PASS | `run-20261105053955-3088c258.json` | 判据只有「非空映射」，不执行测试；应称「声明完整性门」 |

共性事实：

1. 5 个最新 run 同属 commit `5741e7a9`，该提交只改两个 `.swarm-yuan` 账本文件——最新指针丢掉了覆盖代码的 `8a2c1409e` 跑批。
2. run 内 `treeHash` 互不相同且不等于该提交真实树 `a70e6fa7…`，字段语义不可对账。
3. pre-push 传 `--trigger pre_commit` 是「提交时该跑的门集」的既有命名，不是标签写错；`qgate.yaml` 注释「默认只告警」与 hook `QGATE_PREPUSH_ENFORCE:-1` 相反（已改注释）。
4. 近 3 天 `L0.convention-alignment` 70 次 CONDITIONAL / 4 次 PASS，门并非全程恒 PASS。

## 二、spec 抽检

| spec | 四段 | 收据 | 独立判断 |
|---|---|---|---|
| `2026-11-02-supervisor-nudge-gate-aware.md` | 全 | `spec-receipts.jsonl:122` 哈希一致，commit `c734ce7e7` 存在 | 通过 |
| `2026-11-01-dod-session-context-wiring.md` | 全 | `:83` 哈希一致，commit `8d9c22460` 存在 | 通过 |
| `2026-10-26-swarm-yuan-single-source-refactor.md` | 全 | 无收据 | 早于收据机制（2026-10-30 上线），零漂移可证；不追认 |
| `2026-10-21-fibo-ssot-merge.md` | 缺「变更」「设计文档影响」 | 无收据 | `spec-sections-baseline.txt` 在册豁免，口径自洽 |
| `2026-10-31-matrix-autologin-deviceid.md` | 全 | `:17` 哈希一致，commit `6ba60444b` 存在 | 通过 |

## 三、发现与处置

| # | 发现 | 处置 |
|---|---|---|
| 1 | 被审样本未写入 `.swarm-yuan/audit-samples.jsonl` | 已修：`--record` 重跑入账，并加入 `release:preflight` |
| 2 | 门区为空仍算成功样本（退出码 0） | 已修：空门池记 finding，退出码 3 |
| 3 | `state.json` 锚定账本空转提交 | 保留为已知限制：health 取最新 run；近 3 天历史 run 可区分真实代码跑批。后续可在 run 增 `lastCodeCoveringRun` |
| 4 | `treeHash` 与 git tree 不可对账 | 保留为已知限制：该字段是「输入摘要」，不是 git tree sha；改名需全量回填，另立 spec |
| 5 | `qgate.yaml` 注释与默认强制档相反 | 已修注释 |
| 6 | `L0.acceptance-coverage` 无验收证据力 | 接受为「声明完整性门」，对外材料不得表述为「验收通过」 |
| 7 | 两份无收据 spec | 判为历史遗留；不事后回填（回填只证明回填时内容），下次触碰时首次绑定 |
| 8 | fibo 缺段被重复报为 finding | 已修：审计脚本读 `spec-sections-baseline.txt`，在册豁免不再计 finding |
| 9 | 基线注释指向不存在的 `spec-sections-ratchet.test.ts` | 已修：改指 `custom/__tests__/l2-kit-parity.test.ts` |

## 四、审计脚本残余盲区

1. **抽样池预筛偏差**：只从 `health==='ok'` 抽样，抽不到 CONDITIONAL/FAIL/STALE；样本代表最好尾部，不能代表治理常态。
2. **收据只验路径、不验内容与提交**：伪造 `receipt`/假 commit 仍得 `hasReceipt:true`；哈希一致性本次由独立会话手工复算。
3. **四段检查是标题正则**：不要求正文非空、不排除代码块内标题；已用 baseline 豁免降低假阳性，但假阴性仍在。

## 五、审计结论

治理体系「有执行、有证据、有历史分辨力」，但最新快照会被账本自更新覆盖，且部分门只证明声明完整性。建议对外表述使用「可测量、可拦截、可追责」，不使用「已全部达标」。
