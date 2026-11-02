# 发布载体对账清偿：cockpit 底座对齐 v1.0.9＋yuan-skill 追平 v2.98.5

> 挂账来源双线：①v1.0.9 升级批（main 87abf26c2）升级了 vendor/hermes-studio 底座但 cockpit 版本载体滞留 0.8.0-studio.5，`verify-release-manifest.test.ts` 断言「cockpit 三位底座须=VENDOR.md studio 底座」红；②AI Native 测试方法论吸收批 B/C/F 三次升 swarm-yuan CHANGELOG（v2.98.3/4/5）未同步 RELEASE-MANIFEST.json 的 yuan-skill version（v2.98.2），`verify-release-manifest.mjs` 报「CHANGELOG 首个版本标题 v2.98.5 ≠ 清单 v2.98.2」，连带 lock-guard「真树全绿」红。两项合计 3 个存量红测试。

## 变更

1. `RELEASE-MANIFEST.json`：cockpit version `0.8.0-studio.5`→`1.0.9-studio.6`（底座跳 v1.0.9，`-studio.N` 全局递增序延续 5→6，与 0.7.39→0.8.0 期 studio.2/3/4/5 递增惯例一致）；yuan-skill version `v2.98.2`→`v2.98.5`（CHANGELOG 是真源，清单只抄录——verify 脚本 ：99-104 严格口径）。
2. `RELEASE-NOTES.md` 版本节首行：`0.8.0-studio.5` 行改 `1.0.9-studio.6`，说明=「hermes-studio 基线 v0.8.0→v1.0.9 升级批（023/042/718 适配＋207 退役）＋element-web v1.12.33＋AI Native 测试方法论六项吸收（DSL/根因分类/MAET/检索协议/Grader 环/动词表）」；旧 0.8.0-studio.5 行下移保留（历史版本节不删，同 2.x 明细节惯例）。
3. 不动：agent-teams（v0.22.5-team.7 底座未变）、ycode（3.17.1 未变）、package.json/lock 整包 1.0.7-overlay（三载体已对齐，本轮非发布轮不进整包位）。

## 决策记录

1. **studio.N 取 6 而非新底座重置为 1**：仓内惯例 `-studio.N` 是「本仓扩展发布序」全局递增（RELEASE-NOTES 版本节自述「`-studio.N` 为本仓扩展发布序」），0.7.39→0.8.0 期间 studio.2→5 连续递增未因底座更换重置；verify 脚本正则 `[1-9]\d*` 只锁格式，无重置语义。
2. **yuan-skill 版本随批追平而非等下一发布轮**：清单落后真源三个版本是吸收批的机械漏同步（本系列批次的欠账），修复属对账性回填；CHANGELOG 首标题=清单版本的严格口径由 verify 脚本执法。
3. **不升整包 1.0.8**：三红不涉整包载体（package.json/lock/manifest 顶层三处 1.0.7-overlay 一致）；整包进位属发布轮决策（需八载体同批，先例 v1.0.7 轮），本批禁越权。
4. **DESIGN_SYNC: none**——RELEASE-NOTES/manifest 是发布载体非设计正本；版本规则自述已在载体文件内。

## 验证

- `npx vitest run custom/__tests__/release-manifest-lock-guard.test.ts scripts/__tests__/verify-release-manifest.test.ts`（3 红全转绿）
- `node scripts/verify-release-manifest.mjs` exit 0 零失配
- `npx vitest run custom/__tests__/`（守门层无回归）

## 设计文档影响

DESIGN_SYNC: none——发布载体对账回填；附录 A.1 本 spec 已随批登记。
