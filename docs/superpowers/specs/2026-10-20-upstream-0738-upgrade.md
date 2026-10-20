# upstream hermes-studio 0.7.37 → 0.7.38 升级轮（补丁全量适配）

> 日期：2026-10-20 深夜。分支：`feat/upstream-0738`。本文是本批变更正本。
> 背景：后端启动日志提示 0.7.38 可用（13 提交、267 文件、±1.3 万行，核心为
> "automatic API mode + namespaced model IDs" 与 TOS/package 合规整备）。

## 一、升级流程（净树三段式，全轮唯一可信判据）

1. `npm run clean` 反注入 → upstream `git checkout v0.7.38`（锁文件残留 restore）。
2. 逐补丁适配（详见第二节），收敛判据=**净树全序列重放**：
   `clean → checkout -- . → git clean -fdq packages bin tests → 严格顺序重放`，
   310 个 studio 补丁全部通过；zcode 参考仓补丁按既定容错跳过。
3. 官方 `npm run inject`：rc=0，382 补丁全量应用。

## 二、决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 升级走净树三段式（clean→checkout→全序列重放收敛） | 单补丁 reverse-check 在叠加污染下双双失效，只有从零重放是可信判据 |
| D2 | 幽灵 hunk（内容已被前序/上游吸收）直接剥离，不保留 no-op | 空补丁/hunk 会让重放假失败；上游原生化内容交还给上游 |
| D3 | series 归档 504/537 两条（注释保留编号与原因） | 补丁整体为空；git 历史+spec 记录存档即可回溯 |
| D4 | 上游新增 ekko-studio:// 深链 scheme 保持原样不重品牌 | 改名 swarmstudio 会与 537 处理器撞车；隔离协议名无品牌暴露面 |
| D5 | mimo 注册表块归属前序补丁，393 只留类型+清单 | 双增即 TS1117 重复键，服务端起不来 |
| D6 | 客户端验证以派生 vite 配置为准，裸 vue-tsc 的 @/custom TS2307 记为预期 | 别名只在 overlay 派生配置定义，0.7.37 同态非回归 |

## 三、适配清单（26 文件改动）

**再生/重建 25 个补丁**（025/041-043/102/197/201/251/329/393/394/398/473/504/515/523/524/537/570/587/640/641/650/667/668 + series）：

- **hunk 归属外科**：多个补丁的整文件替换式 hunk 在上游改动后整体拒——按
  「上游改动落在我们替换掉的代码里→取补丁侧」3way/手工重建；被前序补丁
  吸收的 hunk（幽灵 hunk）剥离；同一文件多补丁叠加时按标记词切分所有权
  （102/201 的 banner 与 filter、524/650 的 features 与空态、393/394 的 mimo）。
- **series 归档 2 条**：504（matrix 死入口已被前序清除，补丁为空）、
  537（深链+徽章五组件已被前序携带，品牌行归 329）。
- **上游新特性裁决**：0.7.38 新增 `ekko-studio://` provider import 深链
  （protocols 注册）——保持上游 scheme 原样，不改名 swarmstudio（避免与
  537 的 swarmstudio:// 处理器撞车）；可见品牌串仍由 329 全局重品牌。
- **重复键根治**：agent-status-registry 的 mimo 块被 393 与前序各加一次
  （TS1117）——393 的 registry 段重建为「类型联合+AGENT_ORDER」两 hunk，
  块级新增归前序补丁。
- **上游已原生化的内容**：mimo 类型联合（agent-status/coding-agents/chat.ts）、
  zcode 原生集合覆盖（isNativeCodingAgent）、useKeyboard 的
  isContentEditable cast——对应 hunk 变 no-op 后剥离。

## 四、验证账

- 净树全序列重放：310 studio 补丁全过（含两次修复后复跑）。
- 官方 inject：rc=0 / 382 applied（zcode WARN=既定容错）。
- 服务端启动实测：PORT=8699 隔离 home 引导成功，`/api/health` 401
  （与 0.7.37 基线同态=鉴权门正常）。
- 客户端 `npm run build`（upstream 裸配置）：rc=0。注：裸 vue-tsc 报
  `@/custom/*` TS2307 属预期——@/custom 别名只在 overlay 派生 vite 配置
  中定义（0.7.37 同态，非本批回归）；派生配置下的正式构建走
  `vite.config.overlay.ts`。
- overlay 全量测试：见提交后回归记录（vitest 套件走派生别名，不依赖
  裸 vue-tsc）。

## 五、方法论沉淀（本轮踩坑入账）

1. **净树重放是唯一可信判据**：单补丁 reverse-check 在「后期补丁动过同区域」
   时双双失效，信它会把已注补丁误判为失败并在脏树上正向重放（本轮 126 假
   失败事故的根因）。
2. **重置必须含 untracked**：`git checkout -- .` 不清补丁新文件产物
   （auth.ts/mimo.svg/custom-modules.d.ts），下轮重放即 "already exists"。
3. **手写 hunk 三陷阱**：空上下文行必须带前导空格；每个 hunk 头行数必须
   机械重算（人工数必错）；`git diff`（对 HEAD）≠ 补丁 N 的增量——树上有
   前序补丁时必须用 before/after 快照对 `git diff --no-index`。
4. **叠加序变化**：重建某补丁的 import 块会改变后序补丁的锚点顺序
   （197 重建→loop-socket/command-post 顺序变→398/667 上下文连锁调整）。
