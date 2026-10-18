# push-stalled 检测器闭包修复（2026-10-18）

**主旨**：main `4ab303d2`「冲突双保留」合并时漏掉了 `detectPushStalled` 的收尾三行，使 `detectors.ts` 成为语法错误文件——clusterinspector 12 个测试套件全部加载失败。本变更只补闭包，不改任何判定逻辑。

## 证据

- 失败面：`custom/server/clusterinspector/__tests__/*` 12 套件（全量回归 693 文件中 12 failed、4940 passed、0 用例失败——套件加载失败而非断言失败）。
- 语法错误：`detectors.ts:573` `Expected ":" but found "function"`——`out.push({...})` 未闭合，紧随其后的 `active-no-artifact` JSDoc/函数被吞进对象字面量。
- 修复前 `detectors.ts` 的 `detectPushStalled` 末尾只有 `detail: {...},`，缺 `})`、`}`（for 循环）、`return out`、`}`（函数）。

## 决策记录

- D-1：只补 `})` / `}` / `return out` / `}` 四层闭包，不动检测逻辑与阈值。理由=合并事故只吞了收尾，语义应由原实现决定；顺手改逻辑会把一个语法修复变成行为变更，无法对账。
- D-2：在独立 `fix/inspector-detectors-closers` 分支修复后合入 main，不在 main 工作区直接改。理由=AGENTS.md §2 worktree 纪律；该文件属于并行会话产物，独立分支便于追溯与回滚。
- D-3：修复后跑 clusterinspector 全目录（13 文件 128 用例）作为回归面，再跑全量。理由=套件加载失败会掩盖同文件的其它用例；只跑一个套件不足以证明。
- D-4：保留原 JSDoc 与注释的「未接线/fail-soft」语义，不因编译修复而升级为强制。理由=检测器当前就是可选接入面，行为不变。

## 验收

- `custom/server/clusterinspector/__tests__` 13 文件通过 / 1 跳过；128 用例通过 / 1 跳过。
- 全量 `vitest run` 693 文件 0 failed、用例 0 失败。
