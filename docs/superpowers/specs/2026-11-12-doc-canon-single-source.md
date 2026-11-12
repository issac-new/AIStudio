# 2026-11-12 文档口径单一源：正本指针修正＋附录 A 冻结＋覆盖义务迁机械索引

> 决策事实源。来源：2026-11-12 全仓设计复盘 P0-1「文档口径单一源」。
> 现场病：README 三处把「唯一正本」指向一份 12 行旧址指针；附录 A（手维护 636 行）与
> 设计索引（生成 645 行）描述同一集合、重叠 640 条；spec 总数三处三个值（文件系统/索引/
> 附录）；设计索引头部还自带「多批计数漂移 6 于本批对齐」的记录。

## 变更

### 1. README 正本指针修正（3 处）

- `README.md:105` 整合正本链接：`docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`
  （12 行旧址指针）→ `docs/DESIGN.md`。
- `README.md:114` 「docs/superpowers/（整合正本、专题规格与决策档案）」→ 去掉「整合正本」，
  注明正本在 `docs/DESIGN.md`。
- `README.md:175` 「AIStudio 终态设计文档…唯一正本」→ 指向 `docs/DESIGN.md`。
- `README.md:183` 「历史 spec 索引见附录 A」→ 现行索引指向机械索引；附录 A 标注已冻结。

### 2. 附录 A 冻结为历史档案

- 顶部加冻结声明：保留既有条目与逐份主旨摘要，只做结构完整性校验；新增 spec 只进机械索引；
  覆盖义务的单一来源是机械索引。
- 不再追加新条目、不再滚动标题计数（冻结值 635；本批 spec 自身即第一个不登记的例子）。

### 3. 覆盖义务迁到生成物（单一来源）

- `scripts/merge-invariants.mjs` 的 `docs-index` 检查改为直接执行
  `node scripts/maintenance/gen-doc-indexes.mjs --check`（链接集合＝specs 直接根集合＋头计数
  一致），删除自带的附录解析与集合等式（`compareDocsSets`/`parseAppendix` 及 `readdirSync`
  依赖一并移除）。
- `custom/__tests__/docs-ssot-guard.test.ts` 改为复用生成器的 `compareIndex`/`machineRegion`/
  `parseListLinks`：覆盖测试针对机械索引；附录 A 只守「无重复、A.1 与角色表不重叠、每个路径
  仍存在于 specs 根或 archive」。
- 新增两条守门：附录 A 顶部必须含冻结声明与机械索引指针；README 必须指向 `docs/DESIGN.md`
  且不得再出现旧址指针文件名。

### 4. 导读与目录入口同步

- `docs/manuals/aistudio-design-document-guide.md`：附录 A 行改为「历史档案（已冻结）」；
  §4.7 删掉 631/621/613/177 四个手写分母，改为「看机械索引生成行」；维护规则 4 由「同时更新
  两处」改为「只生成机械索引」。
- `docs/README.md` archive 行的入口改为机械索引＋已冻结附录 A。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|---|---|
| D1 | 附录 A 冻结，不删除也不改成生成物 | 逐份主旨摘要是人工判断，无法从 spec 正文生成；删除会丢历史信息。冻结保留价值、去掉增量税 |
| D2 | 覆盖义务改由 `gen-doc-indexes --check` 承担 | 该脚本已是索引的唯一生成器，检查它＝检查生成物与事实源一致；再让 merge-invariants/测试各自解析一遍＝第二实现（正是复盘批评的重复） |
| D3 | merge-invariants 删除自带解析器 | 两套解析器对 640+ 行表格的理解迟早漂移；保留对 `--check` 的子进程调用，失败信息由生成器给出 |
| D4 | 附录 A 仍校验「路径存在（specs 根或 archive）」 | 冻结不等于放弃完整性：幽灵路径会让历史检索 404；archive 视为合法归宿，避免归档即红 |
| D5 | README 正本指针纳入守门测试 | 这次漂移能存活数周，是因为没有任何测试断言「README 指向正本」；加一条断言成本极低 |

## 验证

- `npx vitest run custom/__tests__/docs-ssot-guard.test.ts`：8 用例全过（原 7 + 新增冻结声明/
  README 指针；覆盖测试改指机械索引）。
- `node scripts/maintenance/gen-doc-indexes.mjs --check`：`actual=linked、declared` 三项一致，
  0 problem（生成行读数以命令输出为准）。
- `node scripts/merge-invariants.mjs --check`：`docs-index: pass`，其余项 pass/skip 不变。
- `npx vitest run scripts/__tests__/merge-invariants.test.ts`：--help 契约绿（删除的纯函数测试
  随实现一起移除）。
- 手工核对：README 不再出现 `2026-10-23-swarmstudio-integrated-design.md`；附录 A 首屏三行含
  冻结声明与机械索引链接。

## 设计文档影响

DESIGN_SYNC: none

理由：四正本（`docs/DESIGN.md`、design-ledger、harness2 workbench、rrsi workbench）均未改动。
本批改的是「索引与正本指针」这一类导航物：正本内容不变，只是把它从一份旧址指针后面挪到
README 的直接链接；覆盖机制从人工表迁到生成器，属于治理执行面调整。
