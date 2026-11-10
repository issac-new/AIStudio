# ekko / hermes profile 技能存储合一（同树读写）（2026-11-10）

> 用户指令：合并 ekko 和 hermes 的 profile 及技能，不允许两份不一致的存储并存。合并形态经用户裁决＝**同树读写**：ekko 的 profile 技能根直接指向 hermes profile 树，两套 UI/agent 读写同一棵树。
>
> 本批是 `2026-11-10-execution-kernel-unification.md`（下称「大 spec」）的独立实施批次：大 spec §5 已裁「`dist/ekko-skills` 打包项一并下线」、Ekko runtime P3 断装配。本批不等 P3，**现在就把技能存储收成一份**，消除日常漂移源；P3 时 ekko 技能面代码随 runtime 一并消亡。

## 变更

### 1. 现状：两份存储、零一致性保证（2026-11-10 本机实测）

| 面 | Ekko 侧 | Hermes 侧 | 分裂后果 |
|---|---|---|---|
| 技能树 | `~/.hermes-web-ui/.ekko/skills/<profile>/`（52 目录 × 22 内置技能，逐 profile 字节级拷贝，实测 52/52 同 hash） | `~/.hermes/profiles/<profile>/skills/`（49 profile 真实工作技能） | 两树内容几乎不相交（orchestrator 侧交集仅 `github` 1 个）；ekko UI 编辑的技能 hermes 会话不可见，反之亦然 |
| 同步机制 | `EkkoBuiltinSkillSynchronizer` 每次 studio 启动把 `dist/ekko-skills` 按镜像 profile 名单复制 52 份（`packages/ekko-agent/src/directories.ts:417-473`） | `tools/skills_sync.py:396-457` 种子复制安装树技能（一次性，非每启动） | ekko 每启动重写 52 份拷贝；用户在 ekko UI 改内置技能会被下次启动按 bundle 哈希回滚 |
| profile 名单 | `modules/ekko/services/manager.ts:281` 镜像 `listProfileNames()`（读 hermes profiles 根） | `hermes_cli/profiles.py`（正身） | 名单本身无第二份定义；分裂面在存储不在名单 |
| 外部目录注册 | `.ekko/config/config.json` 的 `skills.profiles.<p>.externalDirectories` | profile `config.yaml` 的 `skills.external_dirs` | 两套独立注册，互不感知 |

两侧扫描器都是全递归、互相兼容布局（hermes＝rglob `agent/skill_utils.py:38-42`；ekko＝`packages/ekko-agent/src/tools/skills.ts:653-718`），**同树读写无需格式转换**。

### 2. 终态设计

```
~/.hermes/profiles/<p>/skills/            ← 唯一技能树（hermes + ekko 两套 UI/agent 都读写）
~/.hermes/hermes-agent/studio-skills/     ← 22 个原 ekko 内置技能正本（一份，只读共享根）
     ↑ hermes: skills.external_dirs（TIER_EXTERNAL，同名时 profile 版胜出）
     ↑ ekko:  config skills.profiles.<p>.externalDirectories（profile 根先、共享根后，同名语义一致）
~/.hermes-web-ui/.ekko/skill-sidecar/<p>/ ← ekko 备份/归档/元数据外移区（防 hermes rglob 扫到幽灵 SKILL.md）
~/.hermes-web-ui/.ekko/skills/            ← 旧树迁移后删除，不再重建
```

四条验收口径：

1. 唯一技能树＝hermes profile 树；ekko 的 `profileSkillsPath` 解析到同一物理目录。
2. 旧 `.ekko/skills` 树不可达、不可被重建（builtin 同步彻底断开，验收按可达性写）。
3. 22 个内置技能在两个内核视角均可见（hermes 走 `external_dirs`、ekko 走 `externalDirectories`），同名时 profile 版胜出（与 hermes tier 规则一致：external 最低优先级）。
4. ekko 的 `.ekko-backups`/`.ekko-archive`/`.ekko-skill.json` 不再落在共享树内。

### 3. 改动清单

**B 类补丁（patches/760-764，从主树注入态提取）**

| # | 文件 | 改动 |
|---|---|---|
| 760 | `packages/ekko-agent/src/directories.ts` | `profileSkillsPath/profileSkillsDirectory` 改由注入的 hermes profile 解析器落位（不自带第二份映射；`default` 随 hermes 侧解析）；`synchronizeProfileSkills`/builtin 同步断开；`resetLegacySkillsDirectory` 改造为一次性迁移器（marker `.ekko-skill-store-unified-v3.json`：搬旧树独有技能→hermes 树，同名 hermes 胜；剩余 rename 隔离后删除）；`checkProfileSkills` 改校验 external 注册与共享根可读 |
| 761 | `packages/ekko-agent/src/tools/skills.ts` | `.ekko-backups`/`.ekko-archive`/`.ekko-skill.json` 落点外移到 `skill-sidecar` 区——必须做，否则备份/归档里的 SKILL.md 会被 hermes rglob 扫成幽灵技能 |
| 762 | `packages/ekko-agent/src/setup.ts` ＋ `packages/server/src/modules/ekko/services/manager.ts` | 启动幂等注册每 profile `externalDirectories = [<hermes profile skills 根>, <studio-skills 共享根>]`（保留用户已有条目）；与补丁 566 同文件 hunk 分离 |
| 763 | `packages/server/src/modules/ekko/services/skill-import.ts`/`skills.ts` | 导入与 CRUD 落点跟随新根（经 layout 传递，预计小改；与补丁 618 hunk 分离） |
| 764 | `scripts/build-server.mjs`＋`packages/desktop/electron-builder.yml`＋`packages/desktop/scripts/verify-packaged-webui.mjs` | 去 `dist/ekko-skills` 拷贝/打包/校验，落实大 spec §5 下线项 |

**A 类（仓内自有面）**

- `runtime/studio-skills/studio/<name>/`：22 技能正本，从主树**注入态**提取（含 patch 329/690 品牌化，不从 pristine vendor 提取）。
- `runtime-manifest.json`：登记 studio-skills 条目（模式同 coding-delegate）。
- `scripts/runtime/register-runtime.mjs`：扩展注册 studio-skills external_dirs（幂等）。
- `team/shared/generate-configs.py`：profile config 模板内置 `skills.external_dirs` 共享根（team 部署重写 config 后不丢）。
- `scripts/maintenance/ekko-skill-store-migration.mjs`：本机一次性迁移脚本（规则与产品内嵌迁移器一致：校验→归档→删→报告）。
- 测试：`custom/__tests__/ekko-skill-store-unification.test.ts`（迁移器行为/路径指向/sidecar 外移/external 注册幂等/build 不产 dist/ekko-skills）。

### 4. 迁移语义（产品内嵌与脚本同规则）

1. 扫旧 `.ekko/skills/<p>/` 中**非 bundle** 独有技能（本机实测为零，但存量机器可能有）→ 搬入 hermes 对应 profile 树；目标同名已存在则跳过（hermes 版胜）。
2. 剩余旧树 rename 进隔离区后删除（复用现有 quarantine 机制）。
3. 写 v3 marker 幂等（已存在即跳过）。
4. 本机执行顺序：studio 升级重启后产品内嵌迁移器自动跑；`scripts/maintenance/` 脚本作独立通道（可先跑），二者规则一致、幂等可交错。

## 决策记录

| # | 决策 | 依据 | 备选（否决理由） |
|---|---|---|---|
| D1 | 合并形态＝同树读写：ekko 技能根指向 hermes profile 树，两套 UI 读写同一棵 | 用户裁决（2026-11-10 plan mode） | 写面切 hermes API（否决：改动面大且 ekko 面 P3 终将下线，投入在垂死面上） |
| D2 | 唯一技能树＝`~/.hermes/profiles/<p>/skills` | hermes 是钉版上游、协作件全在 Python 侧；大 spec D1 已定 Hermes 唯一所有者 | 以 `.ekko/skills` 为基（否决：52 份拷贝模式本身是漂移源） |
| D3 | 22 内置技能收编到 `studio-skills` 共享根，经 `external_dirs`/`externalDirectories` 只读挂载 | hermes 现成 TIER_EXTERNAL 机制；AIStudio 已有 register-runtime 逐 profile 注册先例；消除 52 份拷贝 | 逐 profile 复制进 hermes 树（否决：回到拷贝漂移老路） |
| D4 | ekko 备份/归档/元数据外移 `.ekko/skill-sidecar` | hermes rglob 全递归会把 `.ekko-backups` 里的 SKILL.md 扫成幽灵技能 | 留在共享树（否决：污染 hermes 目录） |
| D5 | `dist/ekko-skills` 打包面本批下线（build/electron-builder/verify 三处） | 大 spec §5 已裁；本批收编完成后 bundle 消费者已消失 | 留到 P3（否决：共享根正本在 runtime/，bundle 再无消费方） |

## 验证

### 1. 测试与构建

- `npx vitest run custom/__tests__/ekko-skill-store-unification.test.ts` 绿。
- `npm test` 全量绿；`npm run typecheck`（涉 server 面）rc=0。
- `npm run inject` 重放无冲突；`npm run runtime:doctor` 0 败（manifest 新条目）。

### 2. 本机数据迁移核验

- `~/.hermes-web-ui/.ekko/skills/` 不存在且 studio 重启后不被重建。
- hermes 技能列表可见 `studio/` 类目 22 技能；ekko 技能列表＝hermes 树＋studio 22 技能。
- 同名技能（`github`）两侧均为 hermes profile 版。
- 共享树内无 `.ekko-backups`/`.ekko-archive`/`.ekko-skill.json`。

### 3. 未验证项（如实披露）

- SIM 面回归不在本批：mx 供给链不涉 `.ekko`（探查实证零联动）。
- 本机外存量机器未验证：靠产品内嵌迁移器自行收敛，发布后按反馈跟进。

## 设计文档影响

DESIGN_SYNC: none

理由：本批不触及 `docs/DESIGN.md` 总账所列执行面计数（架构内核/具名后端/入口/事实源等）——技能存储合一是存储面收敛，执行面归属（Hermes 唯一所有者）已由大 spec 随批修订 DESIGN.md。大 spec §5「dist/ekko-skills 下线」由本批执行，属实施落地非设计变更；数字总账「技能存储 2→1」属运行态非设计计数。
