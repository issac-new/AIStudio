# package-lock 版本归一——发布载体补第八件＋release:check 防漂移门

日期：2026-10-31
状态：implemented
类型：chore（发布基建）
背景：v1.0.4-overlay 发布轮报告的遗留项（package-lock.json 根 version 自 v1.0.0 起四轮未同步），用户指示「版本归一」。

## 变更

1. **package-lock.json 两处根 version（root 与 packages."")**：1.0.0-overlay → 1.0.4-overlay，与 package.json 真源对齐（累积四轮漂移一次归零）。
2. **scripts/verify-release-manifest.mjs 新增「整体包版本三载体对账」节**：package.json version 必须等于 RELEASE-MANIFEST 的 fullPackage.version；package-lock.json 两处根 version 必须等于 package.json——任一失配 release:check 非零退出。用既有 readCarrier/AIStudio_TestCarrierOverride 测试钩子，负面 fixture 可注入。
3. **新增守门测试** `custom/__tests__/release-manifest-lock-guard.test.ts`：真树全绿＋注入陈旧 lock（packages."".version 回退 1.0.0-overlay）断言非零退出与人话报错。
4. 附录 A.1 登记（430→431）。

## 决策记录

1. **package-lock 定位为派生载体（发布载体第八件）**：真源仍是 package.json；发布批改 package.json 版本时必须同批同步 lock 两处 root version，release:check 拦截漂移。不依赖「npm install 顺带修复」——本仓根 node_modules 是指向 vendor/hermes-studio/node_modules 的借用软链，根目录从不跑 install，四轮无人触发即是实证。
2. **不回改 v1.0.4 已发布产物、不重打 tag**：整体包与 cockpit 包内的 lock 仍为 1.0.0-overlay 属历史事实；「tag 必须指向实际打包的 commit」优先于元数据修补，归一自下一发布轮生效。
3. **手工两字段编辑而非 `npm install --package-lock-only`**：后者可能引发无关 lock 区块 churn；手工编辑与 npm 对 root version 的语义等价且字节最小。
4. **守门测试走脚本既有 override 钩子**：不复制脚本逻辑、不碰真文件，篡改 fixture 注入即断言（与 manifest 既有设计一致）。

## 验证

1. `npm run release:check`：归一后全绿（新对账节无失配）。
2. 负面测试：守门测试注入陈旧 lock fixture，断言非零退出＋报错含「package-lock.json 根版本」与「1.0.0-overlay」。
3. `npx vitest run custom/__tests__/release-manifest-lock-guard.test.ts` 2/2 绿。

## 设计文档影响

DESIGN_SYNC: none（发布载体口径的单一事实源在 RELEASE-MANIFEST.json 与 release:check 门禁；本批不改设计正本机制面）
