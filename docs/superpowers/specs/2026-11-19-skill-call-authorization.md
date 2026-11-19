# 技能四层授权：安装与调用分离

> 日期：2026-11-19
> 状态：实施中（用户指令「继续 完成所有」）
> 来源：SoduWork 治理闭环调研（`docs/reports/2026-11-19-sodowork-research.md`）
> 关联：`2026-10-26-acp-client-hardening.md`（技能治理三段）、`2026-11-19-delivery-truth-acceptance.md`（同日结果交付批）
> 读者：需要判断「某个 profile/用户能不能装、能不能调用某个技能」的运维与开发

## 变更

### 问题

技能治理已有扫描（`skill-scan.ts`）与执行拦截（`skill-guard-hook.ts`），但只有「最近扫描判定 dangerous 才拦」，没有「谁能调用哪个技能」的策略：

1. `skill-guard-hook.ts` 的 `preExecute` 只声明 `profileId` 且未使用，Ekko tool context 里的 `userId/sessionId/runId` 被整体丢弃（`vendor/hermes-studio/.../tools/types.ts:45-57`、`handle-ekko-agent-run.ts:1375-1382`）。
2. `skillprovision` 的 profile ACL 只覆盖安装写接口，不消费 `profiles.yaml` 的 `skills_enabled/skills_pinned`；安装面没有 per-skill 规则。
3. 按精确名 `skill_view` 不受 profile disabled 约束；disabled 只影响提示词/自动路由。
4. 审计（`skill-guard.jsonl`）没有身份字段，无法回答「是谁装载了这个技能」。

### 范围

**新增**

- `custom/server/skillgov/skill-acl.ts`：策略解析、技能名通配、install/invoke/edit 三层判定、deny 优先、fail-closed（坏策略）。
- `custom/server/skillgov/__tests__/skill-acl.test.ts`：纯函数 10 例。
- `custom/server/skillgov/__tests__/skill-guard-acl.test.ts`：钩子集成 6 例。

**修改**

- `custom/server/skillgov/skill-guard-hook.ts`：`preExecute` 接收完整 tool context，按 `skill_view→invoke`、`skill_manage→edit` 判定；审计写入 `userId/profileId/sessionId/runId`；`postExecute` 记录身份。
- `custom/server/skillprovision/provision.ts`：安装循环增加 `install` 规则判定，拒绝项以 `acl:<reason>` 进 `skipped`。
- `custom/server/skillprovision/__tests__/skill-provision.test.ts`：新增安装面 ACL 用例。

**不做**

- 不改 Python `skills_tool.py` / Zcode CLI 的 `Skill` 工具：两者没有 Studio 用户身份，硬接会引入第二套身份源；本批边界=Studio Ekko runtime + 技能供给。文档明确声明。
- 不把 profile disabled 升级为 `skill_view` 硬拦（会改变既有语义，另批）。
- 不做插件/工具级 ACL（已有 toolpolicy/enforce-gate）。

### 验收判据

1. 无 ACL 文件：所有 skill_view/skill_manage/install 保持现状放行。
2. ACL 拒绝：`preExecute` 返回 `{allow:false}`，审计 entry 含 `userId/profileId/sessionId/runId` 与 `detail=acl:<reason>`。
3. ACL 允许：放行；`skill_manage` 只吃 `edit` 规则，不与 `invoke` 串用。
4. 用户 deny 与 profile allow 同时存在：deny 优先。
5. 显式 `allow: []`：关闭式清单拒绝。
6. `default: deny`：未命中 principal 时拒绝。
7. 策略 JSON 解析失败：fail-closed（`source=acl_invalid`）。
8. `SKILLGOV_ENFORCE` 关闭：ACL 完全不生效（零行为变化）。
9. 安装面：ACL 拒绝的技能不进 `planned`，以 `acl:<reason>` 跳过。

## 任务卡

### 完成条件

技能调用与安装两个面都能按 profile/user 判定；拒绝可审计到人；无 ACL 文件时行为不变。

### 输入与来源

`skill-acl.json`（`SKILLGOV_ACL_PATH` 或 `<webUi>/skillgov/skill-acl.json`）；Ekko tool context 的 `userId/profileId/sessionId/runId`；`skillprovision` 的目标 profile 与技能名。

### 工作流边界

只覆盖 Studio Ekko runtime 的 `skill_view/skill_manage` 与 `skillprovision` 的安装循环；不改 Python/Zcode 技能工具，不改 profile disabled 的提示词语义。

### 工具与副作用

`preExecute` 返回 `{allow:false}` 阻断；`skillprovision` 跳过不复制；只追加审计 JSONL，不改技能文件。

### 结果与证据

`skill-guard.jsonl` 记录 `userId/profileId/sessionId/runId` 与命中规则；`applyProvision` 结果 `skipped[].reason` 以 `acl:` 开头。

### 异常与恢复

ACL 文件坏 → fail-closed 并报 `acl_invalid`；文件缺失 → 放行；`SKILLGOV_ENFORCE` 关闭 → ACL 不生效。恢复方式：修正 JSON 或删文件。

### 验收反例

用户 deny 覆盖 profile allow 应拒；`allow: []` 应拒；`default: deny` 未命中应拒；坏 JSON 应拒；`skill_manage` 只用 invoke 规则应拒；enforce 关闭时 deny 不应生效。

## 决策记录

### D1 策略文件放 `<webUi>/skillgov/skill-acl.json`

与 `skill-guard.jsonl` 同目录，沿用 `SKILLGOV_ACL_PATH` 覆盖；不进 `team/` 部署正本，先由运维按需放置。理由：运行时策略是部署态，不是仓库静态事实；API/CLI 后续可加写接口。

### D2 三层动作分离

`install` / `invoke` / `edit` 各自规则，不串用。理由：SoduWork 的四层授权证明「能装 ≠ 能调用」；`skill_manage` 是写动作，语义上更接近 edit 而不是 invoke。

### D3 deny 优先、用户与 profile 同时生效

任一 principal 命中 deny 即拒绝；至少一个 allow 才放行；未命中回落 `default`。理由：安全面取并集，避免「profile 放行覆盖用户拒绝」。

### D4 无文件=放行、坏文件=拒绝

缺失策略保持零行为变化；显式存在的坏策略 fail-closed。理由：与仓库「fail-soft 读模型 / fail-closed 执法」纪律一致。

### D5 复用 `SKILLGOV_ENFORCE`

不新增总开关。理由：技能治理已有一个执法开关；再开一个会让运维组合爆炸。ACL 是 dangerous 拦截之后的第二道判定。

### D6 审计写身份但不改审计容量

沿用 `AUDIT_CAP=500` 环形；新增字段只加不减。理由：容量治理是既有债，不在本批扩大。

## 验证

```sh
cd .claude/worktrees/sodowork-followups
npx vitest run \
  custom/server/skillgov/__tests__/skill-acl.test.ts \
  custom/server/skillgov/__tests__/skill-guard-acl.test.ts \
  custom/server/skillprovision/__tests__/skill-provision.test.ts
```

结果：**40 passed**（10 纯函数 + 6 钩子 + 24 供给）。

未覆盖：Python `skills_tool.py` 与 Zcode CLI 的 `Skill` 工具；真实 Ekko 会话走查（需启动 Studio 并发起 skill_view）。

## 设计文档影响

DESIGN_SYNC: none

理由：新增运行时策略文件与钩子判定，不触及整合正本、数字总账或架构图；策略 schema 以 `skill-acl.ts` 头部注释与 spec 为单一事实源。
