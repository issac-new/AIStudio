# 2026-11-06 设计正本固定文件名（docs/DESIGN.md）与旧址指针

## 变更

用户 2026-11-06 反馈「文档太多，不知道哪份是终稿终态的设计文档」。根因不是文档数量，而是**正本混在 592 份带日期的 spec 里、文件名也带日期**，从名字无法分辨。本批把唯一性写进文件名：

1. **正本迁址**：`docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md` → `docs/DESIGN.md`（`git mv`，历史可追）。文件头加一行「位置」说明：固定文件名即终稿标识，原路径现为指针。
2. **相对链接逐条重算**：迁移后文档深度从 `docs/superpowers/specs/` 变为 `docs/`，全部 30 条仓库内相对链接按新深度改写（`../../../x`→`../x`、`../../USAGE.md`→`USAGE.md`、同级 spec→`superpowers/specs/…`），脚本校验零断链。
3. **旧址保留指针**：原路径重建为 12 行指针文件（声明「不是设计内容」、指向 `docs/DESIGN.md`、保留历史链接可达性与附录 A 的机械盘点）。
4. **活入口引用改指**：`docs/README.md`（唯一设计正本行改为 `DESIGN.md` 并注明固定文件名）、`docs/USAGE.md`（2 处）、`docs/manuals/aistudio-training-and-user-guide.md`（1 处）、`docs/superpowers/specs/2026-10-21-ncwk-unified-product-design.md`（导航的角色表）、`docs/manuals/aistudio-design-document-guide.md`（26 处路径引用）、`docs/manuals/aistudio-operations-reference.md`（7 处）。
5. **提交强拦配置同批改**：`.swarm-yuan/hooks/precheck.conf` 的 `DESIGN_DOCS` 由旧路径改为 `docs/DESIGN.md`——否则改正本时 design-sync 门核不到变更集。
6. **附录 A 角色行改述**：该行由「当前终态正本」改为「正本旧址指针（2026-11-06 起）」，说明正本已迁 `docs/DESIGN.md`；A.1 与标题计数不变（旧路径文件仍存在）。
7. **历史 spec 的旧路径不改**：按 `docs/README.md`「历史文档里的旧路径按当时事实保留」规则，历史 spec／报告中的旧路径原样保留，靠指针文件保证仍可点开。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 用固定文件名 `docs/DESIGN.md`，而不是在 specs 内改名 `000-…` | 用户痛点是「从名字分不出终稿」。`000-` 仍在 592 份里、仍排在日期堆中；`docs/DESIGN.md` 是仓库根下唯一以主题命名的稳定文件，打开 `docs/` 第一眼就是它 |
| D2 | 旧路径保留指针文件，不直接删除 | 两个硬约束：①历史 spec／报告里的链接数以百计，全改违反「历史路径按当时事实保留」；②附录 A 守门按 specs 直接根 .md 盘点，删文件要同步改 A.1／角色表／标题计数三处，指针文件让机械面零变化 |
| D3 | 只改活入口（README／USAGE／导读／运维参考／培训手册／导航／附录 A 角色行），不改历史 spec | 同 D2；活入口是「现在该看哪份」的答案面，历史档案是「当时是什么」的记录面，两类不混改 |
| D4 | 迁移与链接重算同批做，并用脚本验证 | 相对链接深度变化是本改动唯一会静默出错的面（Markdown 不报错，读者点开才 404）。脚本逐条 `os.path.exists` 断言，零断链才提交 |
| D5 | `DESIGN_DOCS` 与新路径同批更新 | spec-first 的 design-sync 门按 `DESIGN_DOCS` 核变更集；不改配置会让「改正本」这件事在门里不可见（fail-open） |
| D6 | 机械索引仍链接旧路径（指向指针） | 索引是「specs 目录的文件级机械清单」，按定义收录该目录的文件；它不承担「现行性判断」（索引自查声明已写明），指向指针文件即正确语义 |

## 验证

- 链接自检：`docs/DESIGN.md` 全部仓库内相对链接逐条解析，**0 断链**（含 30 条迁移后重写的路径）。
- `npx vitest run custom/__tests__/docs-ssot-guard.test.ts`：6/6（A.1 583＋角色表 9＝592 不变，标题计数不变）。
- `node scripts/merge-invariants.mjs --check`：docs-index 592 specs covered；l2-parity；receipts。
- `npx vitest run custom/__tests__/l2-kit-parity.test.ts`：`DESIGN_DOCS` 在两份 conf 间一致（本机 `.claude/skills/aistudio-dev/scripts/precheck.conf` 同步改，该副本不入库）。
- `npm run docs:check`：投影块无漂移。
- 提交钩子实测：本批 spec 的 `DESIGN_SYNC: touched` 列 `docs/DESIGN.md` 且该路径在变更集内，L2 放行（与上一批 basename 写法被拒形成对照）。
- `npm test` 全量（合并前）。
- 未验证项：无 UI 变更，不走查页面。

## 设计文档影响

DESIGN_SYNC: touched —— 正本自身迁址并改头部：

- `docs/DESIGN.md`：新增「位置」行（固定文件名标识＋原路径指针说明）；正文内容不变（上一批已重排，本批只搬位置与改链接）。

配套同批修订：`docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`（改为旧址指针）、
`docs/README.md`、`docs/USAGE.md`、`docs/manuals/aistudio-design-document-guide.md`、
`docs/manuals/aistudio-operations-reference.md`、`docs/manuals/aistudio-training-and-user-guide.md`、
`docs/superpowers/specs/2026-10-21-ncwk-unified-product-design.md`、
`docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`（角色行改述）、
`.swarm-yuan/hooks/precheck.conf`（DESIGN_DOCS 指向新路径）。
附录 A 三处登记不变（标题 583／A.1 582／机械索引行数 592 均无变化）。
