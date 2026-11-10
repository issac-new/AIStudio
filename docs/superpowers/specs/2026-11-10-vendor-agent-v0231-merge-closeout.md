# 2026-11-10 vendor agent v0.23.1 合入收口实录

> 承接 `2026-11-10-vendor-upgrade-agent-v0231.md`（主批）。本 spec 只记合入窗口的并发处置与三个新坑的定谳，终态=origin/main ad5b400bf＋本批。不引入新行为面。

## 变更

1. **合入窗口**：main 在批内新增 4 提交（记忆统一/IDE 面板收窄/记忆 M1 收口）；worktree rebase main 四文件冲突全并集解（receipts 台账/scope 登记块/附录 A 计数 609→610＋代登记 IDE 批未登项 608→609/机械索引链接三行＋计数 617→619）。
2. **pre-commit 钩子 merge commit 误伤 pristine 基线变更**：merge 提交 a6c23d199 的 vendor/hermes-agent 面变更=0——「inject 注入态不入提交」撤出规则对 merge commit 同样生效，把分支带来的 pristine 基线换血整面撤出。修复=main 上 git rm+archive+add 后普通提交 3f9089c00（VENDOR_SYNC=1，2781 文件与上游 diff 精确吻合）。
3. **VENDOR.md 台账漏入**：git rm 目录时未 add 台账（M 状态残留随 stash/rebase 漂移）→6129cf932 补齐＋3dcce1215 合并。
4. **培训手册投影块 121↔122 三方摇摆定谳**：056d3de33 误信 docs:sync 瞬时输出写 122；main/worktree 双树真链复测均 121（page 80/redirect 41）→ad5b400bf revert 归位真值。IDE 面板收窄批的 docs:sync 属主域已闭环（其原提交状态在册）。
5. **终态验证**：main clean+inject 461/461 complete；拼合树 pytest 152/0；release:check 四模块全绿；merge-invariants 五项过；pre-push qgate L0 全过；推送 2f31b492b..ad5b400bf。main npm test 8655 过/2 失败（overlay-replay 宿主预检中止=环境性，sim 重定向单跑 1/1 过；route-manifest=121/122 摇摆窗口，推送态 release:check 绿）。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | vendor 基线变更经 merge 合入后必须抽验 merge 提交 vendor 面 diff 非零 | 本批实测 merge 提交被 pre-commit 撤出成空面——silent 回退主嫌；三组件协调纪律（AGENTS.md 规则 12）同型教训 |
| D2 | 投影块计数摇摆以双树真链实测为准，不信单次 docs:sync 输出 | 056d3de33 误信 sync 输出落错值；121=main/worktree 双树一致 |
| D3 | 并发登记冲突一律并集＋计数链接续（含代登记） | 仓规先例（附录 A 三代并集/代登记）；IDE 批漏登由本批代补并留痕 |

## 验证

- [x] merge 提交 vendor 面抽验（D1 新坑发现并清偿）：3f9089c00 的 vendor/hermes-agent diff=2781 文件=上游差量精确值。
- [x] main 复注入 461/461 applied complete＋拼合树 pytest 152/0＋release:check＋invariants＋pre-push 门全过。
- [x] 推送态 release:check 绿（ad5b400bf revert 后）。
- [x] 推送态守门 overlay-pristine-replay 经 sim 重定向单跑 1/1 过（56s）。

## 设计文档影响

DESIGN_SYNC: touched —— `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`（版本核对叙事追加合入实录段，两表值 v0.23.1/v0.23.1-team.1 主批已落）；`docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`（A.1 表行＋标题计数 610→611＋覆盖链＋收口实录 1）；`docs/manuals/aistudio-design-document-index.md`（链接行＋计数 619→620）；scope.yaml 同批登记。
