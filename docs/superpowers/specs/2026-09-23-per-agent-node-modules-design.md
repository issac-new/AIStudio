# 每-agent 独立 node_modules store 设计（shared-node-modules-wipe 的根治）

- 日期：2026-09-23（aipaydev 推演收口轮，问题单 shared-node-modules-wipe 产品化）
- 状态：基建设计（推演/多 agent 同仓工作场景），条款缓解已在位，本设计给代码化路径
- 关联：推演报告 §五-b「shared-node-modules-wipe」、aipaydev-dev 技能「依赖隔离」条款（95031e4）
- 一句话：多 agent 在同一仓库工作树里各自 `npm install`，node_modules 互相覆盖/清空——条款只能管「记得别这么干」，根治要让「这么干不了」。

## 一、问题与触发证据

推演中 12 编制各持有 aipaydev 仓的 worktree（或克隆），都要跑 `npm install` 才能跑测试。事故形态（ISSUES-LOG 在案）：

- agent A 在自己 worktree `npm install` 完成、测试跑通；agent B 在共享路径的 `npm install`/`npm ci` 把 node_modules 重写，A 的依赖树被清空/降级，A 的测试突然挂掉，排查半天发现是邻居动了它的依赖。
- 根因：npm 默认把 node_modules 落在项目根（worktree 根），多 agent 若共享同一 checkout 或在彼此可达路径安装，依赖树即共享态——**谁后装谁覆盖**。

现状缓解：aipaydev-dev 技能已加「依赖隔离」条款（95031e4）：依赖只在各自 worktree 安装、绝不 `npm install` 共享 checkout。但条款是**自觉**，推演已证明自觉会破（夜间高并发时 agent 按习惯动作）。

## 二、设计目标与原则

**目标**：把「依赖隔离」从条款变成**结构性不可能互踩**。

**原则**（与用户全局决策倾向对齐）：
- 根治优先于打补丁：不改「记得」，改「结构」。
- 单一事实源：依赖安装入口收敛到一个脚本，散落的 `npm install` 直调全部归并。
- 自动化门禁：靠脚本/检查拦截，不靠纪律巡检。

## 三、方案：每-agent 独立 store + 链接注入

三层结构：

```
1. 内容寻址 store（共享只读）：
   $SIM_ROOT/pnpm-store（或 npm cache 等价物）
   —— 包内容一份，全 agent 共享磁盘，天然去重。

2. 每-agent 独立 node_modules（私有可写）：
   $(user_root <u>)/node_modules/<project>/
   —— 安装时按「worktree 路径哈希 + lockfile 哈希」定目录，
     例：node_modules/aipaydev-<wtHash>-<lockHash>/
   —— 哈希变更（切分支/升级依赖）自动落到新目录，旧目录惰性回收。

3. 链接注入：
   worktree 根 node_modules → symlink 到该 agent 的私有目录
   —— 工具链（vite/vitest/tsc）透明工作，无感知。
```

实现选型：

- **首选 pnpm**（`pnpm install --store-dir $SIM_ROOT/pnpm-store`）：内容寻址 store 是 pnpm 原生能力，硬链接注入即 pnpm 默认行为，改动最小。
- **npm 兜底**：`npm install --cache <per-agent>` + 手动 symlink 层；npm 无原生 per-project store，硬链接面靠脚本补。项目当前为 npm（package-lock.json 在仓），迁移到 pnpm 是另一决策（lockfile 格式变更、CI 同步），**本设计默认 npm 兜底路径先行**，pnpm 迁移单列。

## 四、落地点（按优先级）

1. **install 入口收敛**：aipaydev 仓加 `scripts/install-deps.sh`——按 worktree 路径+lockfile 哈希计算私有目录，`npm ci --cache` 到私有目录后 symlink 进 worktree。所有 agent 技能/剧本把「npm install」改写为「跑 install-deps.sh」。
2. **门禁检查**：aipaydev-dev 技能补守门——检测到 worktree 根 node_modules 是**实体目录**（非 symlink）即告警并拒绝跑测试（防绕过入口直装）。
3. **回收**：`aipay-down.sh` 增加惰性回收：私有 store 里 7 天未被任何 worktree 引用的目录删除（`find -mtime +7` + 引用扫描）。

## 五、验收口径

- 两个 agent worktree 并发 `install-deps.sh`，互相跑测试不出现邻居依赖串扰（复现原事故形态做回归）。
- 绕过入口直接 `npm install` → 守门告警拦截。
- 磁盘占用对比：store 去重后 N 个 worktree 总占用 ≈ 1 份内容 + N 份链接元数据（而非 N 份实体拷贝）。
- 条款退役：代码化落地后，aipaydev-dev 技能「依赖隔离」条款从「自觉要求」降级为「指向 install-deps.sh 的引用」。
