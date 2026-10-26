# Ycode 技能根兼容与项目技能落点实证（2026-10-26）

分支：`fix/skill-roots-claude-compat`（worktree `skill-roots`，自 origin/main 08adb0589 起）

## 变更

第九点逻辑第 6/7 点要求「Ycode 加载 swarm-yuan 生成的项目技能 XXX-dev」。实证发现：分叉与官方引擎的项目级技能根都只认 `.zcode/skills` 与 `.agents/skills`，不直读 `.claude/skills`；core-chain 批次（未合入）初版把落点定为 `.claude/skills`，其后已自行修正为「`.claude` 产物＋`~/.zcode/skills` 用户级软链」（官方引擎经用户级根可读，方案自洽）。本批两件事：

1. **zcode-patches/009**：Ycode 分叉 `skills/roots.ts` 追加 `.claude/skills` 兼容根（source 复用 `"agents"` 兼容生态族，优先级排在原生 `.zcode`/`.agents` 之后），补对既有 Claude 生态资产的兼容——分叉日后回切默认时，`.claude` 产物可被项目级直读，与 core-chain 软链方案互补。
2. **落点结论**：若走「项目级直读」（不依赖软链），项目技能（XXX-dev）应落 **`.agents/skills`**——官方与分叉引擎都读它，三引擎通吃；`.claude/skills` 的项目级直读仅分叉（打 009 后）与 Claude Code 支持。两条路径（`.agents` 直读 / `.claude`＋用户级软链）都成立，本 spec 记清边界。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 分叉加 `.claude/skills` 兼容根，source 复用 `"agents"` 不改 SkillSource 联合类型 | Claude Code 生态资产需要可读；新增 `"claude"` 源要改 contracts 联合类型并涟漪到展示面，复用兼容族零类型改动 | 新增 `"claude"` 源（否决：类型涟漪）；不加兼容根（否决：既有 .claude 资产永久不可见） | 是（单行补丁可回退） |
| D2 | 项目技能「项目级直读」落点=`.agents/skills`；同时认可 core-chain 的「`.claude` 产物＋`~/.zcode/skills` 用户级软链」方案 | 项目级直读时官方引擎只读 `.agents`/`.zcode`（实测），故直读落点应 `.agents`；core-chain 已改用软链到用户级 `.zcode/skills`（官方/分叉均读用户级根），同样成立，与 009 兼容根互补 | 把 `.claude` 项目级直读当唯一方案（否决：官方引擎读不到）；强制 core-chain 改 `.agents`（否决：其软链方案已可行，不抢让渡面） | 是 |
| D3 | 不改 core-chain 让渡文件；两方案并存由本 spec 记清边界 | core-chain 的软链方案与 009 解决的是同一「项目技能被引擎看见」问题的两条路径，无冲突；本批只动 zcode-patches 与本 spec，零撞面 | 直接改 core-chain 的 D4（否决：让渡面双写，且其方案已自洽） | 是 |

## 设计文档影响

DESIGN_SYNC: touched
- docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md — §3.2 编码委托链段尾补「技能装载根」一句：项目技能根=`.agents/skills`（官方/分叉通吃）＋`.zcode/skills`；`.claude/skills` 由补丁 009 在分叉侧兼容。

## 验证

- **三引擎技能根对照**（`/tmp/skill-roots-verify`，`.claude`/`.zcode`/`.agents` 各放 demo 技能，`zcode skills list --json`）：
  - 分叉打 009 前：命中 `agents-demo`+`zcode-demo`，`claude-demo` 缺席（基线）。
  - 分叉打 009 后：三根全命中（`agents/claude/zcode-demo`）。
  - 官方引擎（/Applications/ZCode.app 捆绑）：`agents-demo`+`zcode-demo` 命中，`claude-demo` 缺席——证明当前默认引擎下项目技能必须落 `.agents/skills`。
  - 部署位重装后（`~/.hermes/ycode/zcode.cjs`）：三根全命中。
- **补丁可应用性**：`git apply --check` 在 upstream 纯净基线通过；series 已登记 009。
- **构建**：turbo 依赖闭包重建 11 任务全过（分叉 dist 28.7MB）。
- 未验证项：模型按技能实际执行的端到端回合——coding-plan 额度 1310（2026-10-27 02:17 重置）未恢复，本批验证的是技能**发现与装载机制**（skills list），不是模型行为。`zcode skills list` 不需要模型，不受额度影响。
- 关联实测：主树注入态全量 6,381 用例＝6,366 过/4 败/11 跳过（4 败=并行会话 TDD 红测 security-boost-bar，正身补丁未随批，非本轮面）；workspace 关联端点 25/25 绿（绝对/相对/逃逸/scratch 预测契约）。

## 挂账

- core-chain 的落点方案已自洽（`.claude` 产物＋`~/.zcode/skills` 用户级软链，官方引擎经用户级根可读），无需返工；本批 009 与其互补——分叉日后回切默认时，`.claude` 产物亦可被项目级直读。若未来想省掉软链，可把生成落点改 `.agents/skills`（三引擎项目级直读），作为可选简化而非必须修正。
- 模型按技能执行的端到端验证待额度恢复后补（口令：临时项目落 `.agents/skills/<xxx>-dev`，ACP 会话断言引擎引用该技能）。
