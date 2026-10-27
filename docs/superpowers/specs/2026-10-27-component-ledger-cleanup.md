# 2026-10-27 技术组件调研台账结构整理

## 变更

将 `docs/upstream-analysis/component-ledger.md` 从按调研批次追加的形态，重组为长期维护的固定结构：

1. 使用与维护：三份账分工、维护规则。
2. 当前状态：基线结论与分类导航。
3. 当前待办与触发条件：只保留未决事项。
4. 组件主账：基线、参照树、运行时镜像、开源组件、闭源产品、协议标准。
5. 技能与知识来源：swarm-yuan 运行时、team/skills 来源、标准规范、方法论来源。
6. 历史索引与维护边界：已完成事项、过程 spec、关联文档。

同步修正两处失效证据路径：diagram-design 与 mattpocock-skills 的物化清单改为 `skills/swarm-yuan/runtime/` 下的真实路径；CyberSec 条目统一为“无需刷新”，消除与待办节的矛盾。

## 决策记录

- D1：正文按“当前事实与未决事项”组织，不再按调研轮次堆叠。完成事项只进历史索引，避免下轮误领。
- D2：保真改写，不删除原组件、版本事实、能力差异、未决事项和证据；同源多用途不做跨口径总数加总。
- D3：三份账继续分工，不把 `vendor/VENDOR.md` 与 `capability-map.md` 合并进来；本台账只做版本、差异和清单层入口。

## 验证

- 关键条目完整性检查：原组件与技能来源无缺失。
- 引用路径检查：diagram-design 与 mattpocock-skills 清单真实存在。
- 表格结构检查：无异常。
- `python3 ~/.zcode/skills/gongwen-bifa/scripts/gongwen-lint.py docs/upstream-analysis/component-ledger.md`：散文段硬违规清零；表格并列枚举按 linter 自注保留。
- `npx vitest run custom/__tests__/docs-ssot-guard.test.ts`：6/6 通过。
- 纯文档整理，不运行业务全量测试。

## 设计文档影响

DESIGN_SYNC: none（仅整理台账正本的组织与表述，不改变整合正本或数字总账的机制、数字与决策；本 spec 随批登记附录 A 索引）
