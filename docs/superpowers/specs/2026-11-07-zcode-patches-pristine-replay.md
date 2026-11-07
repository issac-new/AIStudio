# 2026-11-07 zcode 补丁 002 pristine 重生成＋补丁系列重放守门

## 变更

- `zcode-patches/002-import-session-rpc.patch` 按 v3.17.2 pristine 基线重切（旧版按 3.17.1 基线再生成，3.17.2 同步批「零重生成」未跟——fresh 树 inject 在 002 断链并连锁跳过 003-009）。重切口径=diff(pristine 3.17.2 → main 注入态) 限定 002 原有三文件（zcodeAgentService.ts/validation.ts/transport.ts），与系列其余补丁零文件交叠（已验证），终态源码与 main 注入态字节同源。
- 新增守门 `scripts/__tests__/overlay-pristine-replay.test.ts`：临时 git worktree（pristine）跑真实 `npm run clean && npm run inject` 管线，断言清单 `status=complete`、零 failed 补丁、zcode 002-009 落盘与 002 内容在树——补丁×基线漂移（同步批漏重生成）当场红，堵住「CI 不跑 inject＋main 增量跳过」的双重盲区。

## 决策记录

- **根因链**：e0333ee35（3.17.1 轮 002/006 重生成，8/8 重放绿）→ 474bc28da（3.17.2 同步，8 补丁零重生成、未重放验证）→ 基线漂移潜伏 → 2026-11-06 全量门在 worktree 首次真重放时现形（002 zcodeAgentService.ts:201/validation.ts:1218 context 不匹配）。
- **为何重切而非手改 hunk 行号**：三文件注入态=纯 002 内容（其余补丁零触及，已逐一验证），`diff(pristine→注入态)` 即补丁语义本体，工具生成优于手工行号修补。
- **守门为何跑真管线而非 `git apply --check` 链**：①`--check` 不落盘，后置补丁 preimage 依赖前置应用，逐枚 check 必假红；②inject.mjs 无 import 护栏（import 即执行全量注入），不能模块复用其路由；③git 2.56 对 lane 根裸 `git apply` 有「Skipped patch」静默跳过陷阱（路径按 cwd 解析、exit 0 零改动——本批实测踩中），必须用 inject 的 `--directory` 语义。
- **验收**：worktree 全量 clean+inject `status=complete`；三 lane 终态与 main 注入态源码零真差（仅主树构建产物 .turbo/dist、运行锁、一个 CRLF 邮箱元数据文件差异）。
- **回滚**：还原 002 旧版即回 3.17.1 基线态（但 pristine 重放守门将红，提醒同步补丁与基线必须同拍）。

## 验证

- worktree `npm run clean && npm run inject` EXIT=0、`RESULT status=complete`、zcode lane 8 枚全 applied（/tmp/inject-replay.log）。
- 终态对账：`diff -rq` 三 lane 排除 node_modules/.turbo/dist 后——zcode 与 hermes-studio 零差异文件；hermes-agent 仅 `contributors/emails/uperLu@…`（CRLF-only 差异，2026-11-02 同步期产物，非补丁内容）。
- 守门测试 `npx vitest run scripts/__tests__/overlay-pristine-replay.test.ts` 绿（43s 真管线）；根全量 `npx vitest run --no-file-parallelism` EXIT=0 全绿（1121 文件/8585 测试/0 fail/0 error）。注：并行模式两轮均现 `[vitest-worker]: Timeout calling onTaskUpdate`（vitest 内部 RPC 抖动，0 测试红、与本批改动无关），按仓记忆配方 `--no-file-parallelism` 串行复跑即净绿。

## 设计文档影响

- DESIGN_SYNC: none（补丁工装面变更，vendor 台账 VENDOR.md 的 zcode 基线行仍是 3.17.2 不变、补丁枚举数不变（002 重切非增删），未触及整合正本机制/数字/口径；附录 A 与设计文档索引仅登记本 spec 条目）。
