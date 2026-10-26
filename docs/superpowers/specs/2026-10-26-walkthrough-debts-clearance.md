# 2026-10-26 走查未做项清偿（用量探针自扰 + clean 残留兜底）

## 变更

前轮走查（2026-10-26-walkthrough-bugs-fix.md）交付时挂账两项，本轮清偿：

1. **zcode-usage.live.test.ts 时敏自扰根治**——三个失败测试（sessions 首行/rounds ttft/context promptTokens）共同根因：探针绑死 `sessions[0]`，而 sessions 按 last_at 倒序、`sessions[0]` 恰是**正在运行探针的本会话**——回合未收口时 ttft 为 null、tokens 聚合为 0，断言随机红（全量跑批时本会话活跃必红；静默期单跑绿，昨夜绿今晨红的时敏性由此而来）。修复：探针改为「前 N 会话中取首个数据完备样本」（sessions=turns+billedTokens 完备；rounds/tools=同会话 ttft 真值+readOnly 工具齐备；context=requests[0].promptTokens>0），保留真库探针语义（聚合管道在真库上有完备产出）不绑定特定行。
2. **inject --clean 补上承诺未兑现的 tracked 残留兜底**——上轮 21 文件残留挂账定性完成：①全净态闭环（inject→clean→inject→clean）双验证无损（399 补丁全反放、零残留、重放绿），**非 0.7.39 基线缺陷**；②残留场景=半注入态（手工重置个别 vendor 文件后 clean），locale 补丁反放上下文失配级联失败；③根因=reversePatches 反放 fail-soft（WARN 继续）而 clean:260 注释承诺的「tracked 残留由随后的 git checkout/restore 步兜底」从未实现——restoreNonPatchArtifacts 只管非 patch 产物，patch 触碰面 tracked 残留无网。修复：clean 反放循环后新增 `restorePatchTouchedResidue` 兜底步——对 series 触碰面内仍 ` M` 的 tracked 文件 `git checkout --` 还原（hermes-studio/hermes-agent 双树），clean 契约「vendor 回到 HEAD」从此自愈成立；非触碰面本地改动不动（仍交 inject dirty-check 拦截）。

## 决策记录

- **探针语义=「存在性」非「特定行」**：不排除活跃会话（识别哪个会话在活跃需要引入时间窗启发式，脆），改为扫描前 10 会话取首个完备样本——数据形状变化（新工具版本写入、会话进行中）不再影响探针。
- **clean 兜底范围=series 触碰面 ∩ tracked modified**：不碰非触碰面（尊重用户对 vendor 的有意本地改动，那类留给 inject 的 dirty-check 报告）；不删 untracked（已有既有步骤管 patch 新增文件）。
- **两修同批一收口**：同属走查未做项清偿任务，一分支两提交一合并。

## 验证

- 探针：`npx vitest run custom/server/controllers/ide/__tests__/zcode-usage.live.test.ts` 绿（4/4）；自扰场景复现验证=测试运行中本会话为 sessions[0] 时仍绿（完备样本从后续会话取得）。
- clean 兜底：半注入态复现（注入→手工重置 2 个 locale 文件→clean）→ 残留被兜底步还原为零、随后 inject 重放绿；全净态闭环回归不回归（正常路径无残留、兜底步零输出）。
- inject.mjs 改动后常规 inject 全量重放绿（399 补丁+689 在位）。
