# 技能供给对账与主机供给（2026-10-18）

分支：`feat/skill-provisioning`
来源：2026-10-18 teamai-cli 四轮调研 + 本工具首轮真实对账。**先纠正一个早期错误**：手工数 `SKILL.md` 不跟随符号链接，曾得出“主机 profile 中位 6 个技能”；hermes 的技能扫描是跟随链接的（`agent/skill_utils.py` 的 `os.walk(followlinks=True)`），按同一语义实测主机 49 个 profile 的有效技能数中位 **296**（范围 8–563），orchestrator 为 309。主机**不是**技能供给不足，早期“一锅端/供给断层”的量化前提已被证伪。

仍然成立的三件事：
1. 同一份“角色 → 技能”映射写了三处：`_shared/06-observability/skill-catalog.md`（人读，58 行有效表格）、skillgov 角色映射 UI（四仓 + launchd + `~/bin` + cron 均无消费者，存储文件不存在）、`simharness/mux/mx-lib.sh` 的 `case *-tester)`（唯一可执行，仅推演树）。
2. 文档声明与全局库对不上：catalog 声明 58 行，按启发式匹配后主机缺口 509 项（含大量“所有/通用”误配，仅作对账参考）。
3. 期望技能存在真实缺口：按内置示例清单对账，50 个 profile 共 104 个“期望但未装”，其中 53 个在主机全局库根本没有同名来源；可供给的实际约 51 项。
4. 推演树与主机 profile 名几乎不重合（sim-only 41 个）；没有同名 profile 时 sim 列**不可比**，不能把空数组当“零缺口”。

## 目标

1. **P1 只读对账**：每个 profile 一行，列出文档声明（catalog）、清单期望（manifest）、主机有效实得（含符号链接）、推演同名实得、主机缺口、推演缺口、已装但被 `skills.disabled` 关闭的技能、期望技能在全局库无来源的情况。推演树无同名 profile 时标“不可比”且不计算缺口。
2. **P2 主机供给**：以一份机器可读 manifest 为唯一期望源，把缺失且有全局来源的技能从主机全局库复制到 profile；默认只增不改、干跑优先、执行需显式确认、写供给台账、支持回滚；用户改过的副本一律不覆盖。

## 非目标

- 不给六个 WebUI 托管媒体技能加限制（实测 49/49 在位、无人禁用，危害≈0）。
- 不修改 `simharness` 仓（工作区规则：overlay 对 simharness 只读）；推演树只作为对账列读取，不参与本轮供给。
- 不做经验候选 → 技能草稿（P3 需要单独拍板自动生成边界）。
- 不重建知识库、新鲜度、健康分。

## 设计

### 唯一期望源

manifest 默认路径 `~/.hermes-web-ui/overlay/skill-provisioning.json`，可用 `SKILL_PROVISION_MANIFEST` 覆盖。格式：

```json
{
  "version": 1,
  "roles": [
    { "match": "orchestrator", "skills": ["kanban-orchestrator", "cognition-lattice"] },
    { "match": "*-tester", "skills": ["backend-integration-testing"] },
    { "match": "*", "skills": ["memory-consolidation"] }
  ]
}
```

匹配优先级：精确名 > 最长后缀 `*x` > 最长前缀 `x*` > `*`；同名同优先级的多条合并技能集合并报告冲突。manifest 不存在时报告使用内置示例清单并标 `source=builtin`，**供给端点拒绝执行**，避免用示例清单误装。

### 扫描口径

只数 `SKILL.md`，不数顶层目录（分类目录如 `apple/` 只有一个 `DESCRIPTION.md`，不是技能）。符号链接按真实目录去重，防环；单根上限 5000 目录。profile 的 `skills.disabled` 单独解析，与“目录缺失”分列。

### 端点

全部挂在已由 606 号补丁挂载的 `/api/skillgov` router 下，不新增上游 patch、不触发 inject：

- `GET /provision/report`
- `GET /provision/manifest`
- `PUT /provision/manifest`（校验后原子写，旧文件备份 `.bak-<ISO>`）
- `POST /provision/apply`（`dryRun` 默认 true；非干跑必须 `confirm: true`）
- `POST /provision/rollback`（同样需 `confirm: true`）

### 供给与回滚纪律

- 只增不改：目标技能目录已存在即跳过，绝不覆盖用户编辑。
- 复制走临时目录 + rename；源必须是主机全局库中同名的 `SKILL.md` 目录；同名多源且内容不同判 `ambiguous` 跳过。
- 每个 profile 写 `.skill-provisioning.json` 台账（来源路径、安装哈希、时间）；回滚只删“台账在册且当前哈希等于安装哈希”的目录，用户改过的一律跳过并报告。
- profile 名限定 `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`，所有写入路径必须落在 `<hostRoot>/profiles/<profile>/skills` 下。

## 决策记录

- D-1：manifest 用 JSON 不用 YAML。overlay 依赖面没有 YAML 解析库，新增依赖会扩散到共享 `node_modules`；JSON 足够表达且零依赖。
- D-2：不新增 patch。新增上游 patch 需要整树 inject，会干扰并行会话；复用已挂载的 skillgov router 即可。
- D-3：报告同时保留 catalog 声明与 manifest 期望。catalog 是人读文档、匹配为启发式；manifest 才是可执行期望。两者不一致本身就是要暴露的漂移。
- D-4：供给默认干跑、执行需确认、只增不改、可回滚。主机上可能有人有意只保留少量技能，任何自动覆盖都不可接受。
- D-5：推演树只读对账。工作区规则禁止改 simharness；本轮不把 manifest 写进推演安装管线。
- D-6：sim 列只在“同名 profile 存在”时计算缺口。实测 sim-only 41 个，若按名字强行对账会把“没有同名账号”误报成技能缺口。
- D-7：扫描跟随符号链接，与 hermes `os.walk(followlinks=True)` 同语义。手工不跟随链接的计数会严重低估有效技能集（实测 6 vs 296），这是本轮第一个被工具自身纠正的错误。

## 验证

- 新增 `custom/server/skillprovision/__tests__/skill-provision.test.ts`：扫描只数 `SKILL.md`、角色匹配优先级、报告三列与 disabled 分列、干跑零写入、执行只补缺失、二次执行幂等、回滚只删未改副本、用户编辑保护、profile 名路径安全。
- `npx vitest run custom/server/skillprovision/__tests__/skill-provision.test.ts`：18 项通过。
- 真实只读对账（2026-10-18 首跑）：50 个 host profile、有效技能中位 296；内置示例清单下 host 缺口 104、全局无源 53；sim 42 个 profile、sim-only 41；catalog 58 行。
- 不跑整树 inject/dev server：避免扰动并行会话与共享 upstream 树。UI 改动只做静态构建可解析性检查，真机走查留给合入后的热更新轮。

## 回滚

- 供给：`POST /provision/rollback`（确认后按台账删除未改副本）；或直接忽略，供给本身只增不改。
- manifest：每次写入前备份 `.bak-<ISO>`；删除 manifest 文件即回到 `source=builtin`（只读报告态，不可供给）。
