# diagram-design vendored 正本来源（PROVENANCE）

- 上游仓库：https://github.com/cathrynlavery/diagram-design
- 版本：v2.6（plugin manifests 2.6.110）
- 锚定 commit：`550fd66`（chore(release): bump plugin manifests to 2.6.110）
- 收编日期：2026-10-19
- 许可证：MIT（见同目录 `LICENSE`，上游原件）
- 收编方式：`rsync -a --exclude='.git' <upstream>/skills/diagram-design/ <本目录>/`，内容零改动（原味正本，决策记录 D-2/D-3）
- 品牌化妆：不发生在本目录。SwarmStudio 品牌皮在 `assets/skills/diagram-design-brand/swarmstudio.profile.md`，由 `scripts/sync-diagram-skill.mjs` 在同步到主机全局库后以 copy-over load 语义覆盖主机副本的 `references/style-guide.md`。
- 升级对账：重收编时比对上游 `skills/diagram-design/` 全量 diff；品牌 profile 的 token 行若有 schema 新增行，按 `references/profiles.md` 的结构化回补规则处理。
