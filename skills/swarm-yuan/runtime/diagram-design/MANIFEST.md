# runtime/diagram-design — CLI 层运行时物化（第 15 个外部运行时）

> **定位**：上游图表生产技能本体的忠实镜像，按需调用。生成器在 spec/设计文档/架构说明/审查报告/发布说明需要“可发布图表”时，读取 `skills/diagram-design/SKILL.md` 与所选类型参考原文并按之执行。与方法论层 [references/diagram-production-methodology.md](../../references/diagram-production-methodology.md) 构成双层：方法论层是 swarm-yuan 消化后的选型/流程/门禁改写，本目录是上游原语全文（45 类图表参考、模板、示例、自检脚本）。
> **分发**：随 install.sh 整体安装到 8 宿主（runtime/ 不在分发排除清单）；不进 generate-skill.sh UNIVERSAL_FILES（目标技能产物不携带，体积预算不受影响）。目标技能侧通过 `scripts/diagram-check.sh` 做结构自检，完整上游自检脚本在本目录。

## 来源登记

| 项 | 值 |
|---|---|
| 上游仓库 | https://github.com/cathrynlavery/diagram-design （Cathryn Lavery，MIT，LICENSE 副本在本目录） |
| 物化基线 | main `0b9b10cab`（2026-10-24，plugin version 2.6.120；2.6.119→2.6.120 取用范围一处字节差异：skills/.../scripts/mermaid_extract.py fragment digest 区域摘要（alt/else、par/and、critical/option 关键词+unlabeled 显式），gates/verify-geometry.py 零变化） |
| 物化日期 | 2026-10-20（R124 运行时例行刷新轮；R140 零差异升锚；R141 mermaid digest 刷新） |
| 范围 | `skills/diagram-design/` 整目录（SKILL.md + 45 个 type-*.md + 共享 references + assets 模板/示例 + scripts 提取/导出/自检） |
| 附加吸收 | `gates/verify-geometry.py`（上游仓库级几何门禁，原样拷贝；用于标签遮罩遮挡与连接线规则的辅助检查） |

## 不取清单与理由

| 上游路径 | 理由 |
|---|---|
| `.claude-plugin/`、`.codex-plugin/`、`.factory-plugin/`、`.agents/plugins/` | 上游宿主安装清单；swarm-yuan 自带 8 宿主安装器，重复清单会造成两套事实源 |
| `commands/`、`prompts/` | 上游斜杠命令面；宿主相关，且本运行时的消费方式是读原文执行，不注册额外命令 |
| 仓库根 `scripts/`（除 verify-geometry.py） | 上游 CI 自举门禁（lint-skin/lint-render/verify-docs-sync/screenshot 等）依赖上游基线文件与 Playwright，不作为目标项目门禁；技能内 `scripts/self_check.py` 才是随技能分发的自检入口 |
| `docs/`、`assets/logo*`、`.github/` | 上游站点/品牌/CI 资产，与运行时能力无关 |

## 刷新方法（运行时例行刷新轮）

```bash
git clone --depth 1 https://github.com/cathrynlavery/diagram-design /tmp/diagram-design
# 基线核对：git -C /tmp/diagram-design log -1 --format='%h %ci %s'
rm -rf swarm-yuan/runtime/diagram-design/skills/diagram-design
cp -R /tmp/diagram-design/skills/diagram-design swarm-yuan/runtime/diagram-design/skills/
cp /tmp/diagram-design/scripts/verify-geometry.py swarm-yuan/runtime/diagram-design/gates/
cp /tmp/diagram-design/LICENSE swarm-yuan/runtime/diagram-design/LICENSE
# 更新本文件「物化基线」行与 assets/facts.conf 的 FACT_DIAGRAM_DESIGN_VERSION
# 回归：bash tests/test-r122-diagram-capability.sh
```

## 使用立场

- **读原文执行，不复述摘要**：先读 `skills/diagram-design/SKILL.md`，再读所选类型的 `references/type-*.md`；语义行为负载重时先读 `references/semantic-patterns.md`。
- **单一风格事实源**：颜色/字体/token 只认 `references/style-guide.md`；类型参考里的 `{ink}` 等占位符按该文件解析，禁止在生成物里另造一套色板。
- **先自检再交付**：生成 HTML 后跑 `python3 skills/diagram-design/scripts/self_check.py <file>`；从本仓目录还可跑 `python3 gates/verify-geometry.py <file>` 做几何辅助检查（几何门禁按上游模板比例标定，对非模板产物按 advisory 处理）。
- **许可见 LICENSE**：MIT，上游署名保留；本仓不改上游文件内容（刷新时整目录替换，不产生本地 diff 噪音）。
- **安装链不复制**：不运行上游的 `npx skills add`/插件市场命令；物化即达，避免与 8 宿主安装器形成两套更新路径。
