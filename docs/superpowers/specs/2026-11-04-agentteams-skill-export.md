# AgentTeams 吸收批四：技能 ZIP 导出 + 统一 registry URI

来源：AgentTeams「Skill ZIP 下载能力」+「统一 Skill Registry」（hiclaw-find-skill 双后端 nacos:// URI）。
前三批 spec：project-workflow / execution-records / project-graph（同日）。

## 变更

1. **技能 ZIP 导出**（patch 736，hermes-studio）：`GET /api/hermes/skills/:category/:skill/export`
   打包技能目录（含 SKILL.md 全文件），响应用 attachment + no-store（照 theme.ts:214 范式）。
   路由必须插在通配 `GET /api/hermes/skills/{*path}`（routes/skills.ts:16）**之前**。
   来源策略：builtin/hub/local 可导出；external 目录技能不导出（403，只读挂载不是本仓资产）。
2. **导入侧三道限**（同 patch 736，堵既有 zip-bomb 面）：单 entry 上限 50MB、解压总量 200MB、
   entry 数上限 20000（现有只有总上传 50MB）。
3. **客户端导出按钮**（同 patch 736）：SkillDetail.vue 加「导出 ZIP」，fetch→blob→a.download
   （带鉴权下载照 api/studio/theme.ts:147 形态）。
4. **统一 registry URI 解析器**（patch 737，hermes-agent）：新模块
   `tools/skills_hub_uri.py` `parse_skill_uri(raw) -> {source_id, identifier} | None`——
   支持 `nacos://…`（预留后端推断位，本仓无实例不接真实 Nacos）、既有全前缀
   （well-known:/official//clawhub//lobehub//browse-sh//skills-sh//skills.sh//github/、裸 https://*.md）。
   接进 `hermes_cli/skills_hub.py` 的 `_resolve_source_meta_and_bundle`（:258 起先走解析器，
   解析不出回落现状链）与 `_registry_from_identifier`（:749）。**只加解析不改现有源匹配行为**。
   runtime 镜像 + manifest 登记（skills_hub.py 此前不在 manifest，本批补入使解析器上宿主）。

## 决策记录

| # | 决策 | 备选 | 取舍理由 |
|---|---|---|---|
| D1 | 导出实时打包不缓存 | 预生成 zip | 技能可变（updateSkill），缓存=陈旧面；单技能体量小（≤200MB 上限内）实时可接受 |
| D2 | external 源禁导 | 全源可导 | external 是用户自挂目录（可能是他人版权资产），导出=再分发，收敛到本仓三源 |
| D3 | nacos:// 只留形状 | 实接 Nacos | 无实例；AgentTeams 也只是默认 market.hiclaw.io 的远端配置。真接属外部依赖引入，挂账（pending-batch 已裁定不处置） |
| D4 | URI 解析器在分发链最前 | 只改 _registry_prefixes | 短路分发可少试 N 个源（性能+语义），且解析器可独立表驱动测试 |
| D5 | 导入三道限 | 维持现状 | AgentTeams skills_handler.go:224 有 zip-bomb 防线（64MB 双限），本仓导入只有总上传限——导出落地等于把解包面翻倍，先补闸 |

## 验证

- 目标测试：`npx vitest run custom/__tests__/skills-export-contract.test.ts`（契约测试：读 736 文本断言路由序在通配前/三道限常量/外部源 403 分支——标记断言注明；URI 解析器走 python 表驱动 pytest）
- pytest：`vendor/hermes-agent/tests/tools/test_skills_hub_uri.py`（表驱动：全前缀/nacos://形状/裸 URL/歧义回落/大小写）
- 全量：`npm test`（对照基线 4 存量红，0 新增）
- 行为验证：导出 local/builtin 各一次解压核对文件数；external 403；导入一个 >200MB 解压量的恶意 zip（构造小高压缩比）被 413/400 拒
- 补丁正确性：干净树 reset→inject 重放→涉改文件 cmp 快照一致

## 设计文档影响

DESIGN_SYNC: none
技能管理面增量；不触及整合正本既有章节。
