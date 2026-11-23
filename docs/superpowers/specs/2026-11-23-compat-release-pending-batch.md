# 2026-11-23 兼容升级与 v1.0.19 发版挂账台账

口径：按挂账台账化约定（2026-11-03 用户令），未做项收敛为编号台账——每条给锚点/根因层/验收判据/状态。本台账承接 `2026-11-23-tech-ledger-latest-compat.md`（v0.8.30 兼容批）与 `2026-11-23-release-v1.0.19-overlay.md`（发版轮，含发布后补正段）两批后真正剩下的面；复盘与后续批 spec 引用编号，不重复展开。

## 待办

### N33-1 noop-inject 信任缺口（树还原后清单残留即静默跳过）——P1 主项
- 锚点：`scripts/platform/inject/manifest.mjs:157-215`（planIncrement 增量判定：baseline treeOids＋series 逐项 sha＋前缀一致 → `kind:'noop'`，**不验补丁落盘**）；`scripts/ensure-injected.mjs`（noop 早退路径）；`.overlay-injected.json`（gitignored 状态文件，`git checkout -- vendor/` 后残留）。
- 根因层：v1.0.19 发版轮两次中毒实录——①主检出复基线（merge 前配方）后清单残留，后续 inject 判 noop，毒化树上 docs:sync 生成 130（page 88/redirect 42，pristine 顶层多出 `hermes.history`×2）误入手册 → CI parity 红（run 45105228226，junit failures=1）；②同因污染路由实验全程（matrix 开关假因果、钉面方案全错，靠 tag-commit 临时 worktree＋ensure-injected 真注入对照才定谳）。毒化判别法：`rg -c connectionsExtras vendor/hermes-studio/packages/client/src/components/hermes/connections/ConnectionsPanel.vue`（5=真注入）＋ s3-feature-gates 13/13。
- 验收判据：①noop 路径加哨兵抽验（每 lane 抽 ≥1 枚补丁的落盘特征，失配→拒绝 noop 走全量重放）或等价树校验；②负例测试：注入后手工 revert vendor 再跑 ensure-injected，必须触发重放而非 noop；③机制预算登记 sunset＋配对删除/降级（仓规 13）；④全量 `npm test` 绿。
- 状态：**已根治（2026-11-23 N33 清偿批 `2026-11-23-n33-closeout-batch.md`）**——`scripts/platform/inject/lane-touch.mjs` noopSentinel 三态接入 inject/ensure-injected 两处 noop 分支；TDD 三例 RED→5/5 GREEN＋注入族 42/42＋健康 noop 不回归。验收③按 bugfix 口径收敛（既有 inject 机制内缺陷修复、非新门/钩子/脚本/账本，不触发 rule 13 登记——判定见清偿批 D3）。

### N33-2 REA 6.9→6.10 能力差异盘点
- 锚点：`team/shared/research/tech-components-ledger-20261027/tech-components-ledger.md` §3.1 REA 行（本机 6.10.1 已对齐 latest；§4.5 未写）。
- 根因层：本批发版优先只做版本对齐（npm 11-20 发 6.10.1，双通道实测一致），能力差异未盘点。
- 验收判据：台账新增 §4.5（release notes 主题→本机核验命令→breaking 面对照，先例 §4.4 格式）。
- 状态：**已盘点（同日 N33 清偿批）**——§4.5 入册（Evidence rev2 判定不适用本仓；Ghidra 12.2+JDK25 前提已满足）。

### N33-3 台账 9 条 🔴 升档候选待派卡裁决
- 锚点：台账 §二 2026-11-23 批注＋分域行（addyosmani 164c/SkillOpt 429c/Sage 48c/ARL-Next v1.5.1 90c/OpenSecurity 200c/os-taxonomy 214c/DeepInfer nv-dev 29c/element-web develop 282c/CyberStrikeAI v1.8.1 24c）。
- 根因层：台账契约 §一.4「判级即派卡依据，放行前交用户裁决」——AI 不越权派卡。
- 验收判据：用户逐条裁决派卡与否，裁决落 `.swarm-yuan/decisions.jsonl`（UserChallenge）。
- 状态：**部分已裁决派卡（2026-11-23 用户 AskUserQuestion：三线全派）**——
  ① **addyosmani/agent-skills 0.6.13...0.6.17=164c**（11-18 四版连发；review findings 验证主题）；
  ② **microsoft/SkillOpt v0.2.0...main=429c**（v0.2.0=07-02；技能文档可训练状态＋验证集严格门）；
  ③ **Sage v2.2.0...main=48c**（11-13 发 v2.2.0；「产出候选不激活」人审采纳＋声明式安全面）。
  以上三卡按 delta-research-dispatch 冻结五件验收（精确 commit 总数=compare 实测已备/主题聚类表/基线过期结论清单/吸收建议三档/关键论断带 sha 锚点＋落盘路径）。
  其余六线维持候选记档：**ARL-Next v1.5.1（90c）/OpenSecurity（200c）/os-taxonomy（214c）/DeepInfer nv-dev（29c）/element-web develop（282c）/CyberStrikeAI v1.8.1（24c）**——本轮用户未选，下轮点名随新实测再裁决。

### N33-4 sia RETIRED 线到点复核（定时）
- 锚点：台账 §3.2 sia 行（静默 89 天，观察至 2026-11-24）。
- 验收判据：11-24 实测 pushed_at——零 push→按 §一.3 转 RETIRED；有 push→复活按新增量重判级。
- 状态：dated（2026-11-24）——11-23 中间检查实测 pushed_at=2026-08-26 零新 push（v0.6.0...main=1c 持平），按趋势 11-24 到线即转 RETIRED。

### N33-5 decisions.jsonl 哈希链历史断点的 verify-chain 容忍策略
- 锚点：`.swarm-yuan/decisions.jsonl` 行 126-129（无链字段）＋130-140（`previous_checksum=''` 重启链后再断）；`trace-log.sh --verify-chain` 自此恒 FAIL。
- 根因层：历史多会话写账未带链字段（本轮 141 起链字段齐全、未伪造链接）。红线：不改写历史行。
- 验收判据：verify-chain 增加「从最新连续段起算＋历史断点计数披露」策略（或等价），既不造假链也不长期红灯钝化；改判属低优先。
- 状态：open（low；治理工具批顺带）。

## 已裁定不处置（本轮）

- **product-tests@9f16cfc 的 FAIL 无对应绿记录**：由 `c92c5f25a`（docs-only）修复，按 workflow paths-ignore 设计不触发 CI——设计行为非缺口；下个触及代码的推送自然见绿（本地已 50/50＋s3 13/13 验证生成侧与 CI 一致）。
- **rsi-theory-audit worktree/分支残留**：属他会话在途资产（其分支已由属主合入 main），按多会话红线只通报不动手；属主自清。
- **session-projection `lastOutcome` 不透传**：X5 白名单契约的设计行为（消费面需要时先扩形状），已在头注立法，非债。
- **发版中 matrix/路由「平台分叉」假象**：已证伪为毒树伪影（mac 真注入树与 CI 生成逐项一致 129/86/43），相关实验性钉面代码已全部还原未合入。

## 计数

待办 5（P1×1＝N33-1；例行×3＝N33-2/3/4；low×1＝N33-5）｜awaiting-user 1（N33-3 并入待办计数）｜已裁定不处置 4｜dated 1（N33-4 并入待办计数）。

## 变更

1. 立本台账：收敛 v0.8.30 兼容批＋v1.0.19 发版轮的全部剩余面（含发布后补正段披露的 noop-inject 缺口），编号 N33-1..5（承接 run31 N32 之后的序列语义）。
2. 同批登记决策留痕（decisions.jsonl：挂账台账化执行）。

## 决策记录

| # | 决策 | 依据 | 备选与否决理由 |
|---|---|---|---|
| D1 | noop-inject 缺口列 P1 主项、根治方向=noop 哨兵抽验 | 一次根因两次爆雷（投影误植＋实验污染）；「等更好条件不构成搁置理由」教训 | 只记档不修（否决：下轮必复发）／立即热修（否决：机制新增须过预算流程，且发版刚收口宜另立小批） |
| D2 | CI 旧 FAIL 记录与 rsi worktree 归「已裁定不处置」 | 前者=paths-ignore 设计行为＋修复已验证；后者=多会话属主红线 | 补推空提交触发 CI（否决：为绿而绿） |

## 验证

- 台账锚点均为本会话实测（file:line / run id / 命令输出见两份承接 spec）。
- `node scripts/maintenance/gen-doc-indexes.mjs --write` 随批重建索引 0 problem；docs 门随批复跑。

## 设计文档影响

DESIGN_SYNC: none。本台账为过程留痕与待办收敛，不触及整合正本与数字总账；noop-inject 根治批实施时按 N33-1 验收判据④另做门验证。
