# 归档清理"部分恢复"事故取证（2026-08-27 对账）

> pitfall 23 的深层材料。一次"零丢失"声明不实 + 计数口径四轮漂移的完整根因链。
> 适用于：任何 skills-archive 归档/去重/清理操作后的完整性对账。

## 时间线还原（archive mtime 批次法）

```bash
find ~/.hermes/skills-archive -name "SKILL.md" -exec stat -f "%Sm" -t "%m-%d %H:%M" {} \; \
  | sort | uniq -c | sort -k2
# 实测批次：08-17 ×1 / 08-19 ×141 / 08-22 ×141 / 08-25 ×141+135 / 08-26 ×15+18+22
# 08-26 16:56 的 22 个 = hack-exploit exploit 专属（本次事故源）
```

批次 = 一次清理动作；批次大小与对应看板卡的声明清单对不上 = 部分恢复嫌疑。

## 对账三板斧

1. **断链检测**：`find -L ~/.hermes/skills -name "SKILL.md" -type l`（实测 0 = 无断链，排除断链假说）
2. **归档时间线**（上文）→ 锁定嫌疑批次
3. **名单级双查**：对声明清单逐项验证
   - 存在性：skill 目录在 master 哪个分类（不限一个，逐分类 `ls | grep`）
   - 可见性：该分类是否被目标 profile 挂链（`ls profiles/<p>/skills/ | grep <分类>`）

## 本次实证结果（供复现参照）

- 22 个 exploit 专属：16 个已在 master（其中 sliver/havoc/stratus 落在 `cybersecurity-defense/` 但 hack-exploit 未挂该分类链 = 隐性不可见），6 个只在 archive
- 修复：`cp -r` 恢复 6 个到 `master/cybersecurity/` + `ln -s` 补链 defense 分类 → 名单终验 `FINAL missing: 0 / 22`
- 计数闭环：master 703→709；全集 785（709+76）；恢复文件逐个验证 frontmatter `name:` 字段

## 分发机制源码锚点（实测读 hermes-agent 仓库）

- `agent/skill_utils.py:346` — `skills.disabled` + `platform_disabled` 解析（无按名 allowlist）
- `hermes_cli/skills_config.py:100` — `_toggle_by_category`：分类启用 = 从 disabled 整类移除
- `tools/skills_tool.py:599` — `_find_all_skills` 扫描 + disabled 过滤（索引层）
- 排查命令组合见 pitfall 23 第 3 条（两个 python3 -c 片段可直接复用）

## 伏笔链（Open flag 隔夜演化事故）

08-26 去重卡 t_7d6e4cbd 的 Open flag #3 已记录"cybersecurity-defense 运行时未启用"，
当日未修 → 次日成为 hack-exploit 看不到 3 个 skill 的直接根因，并与归档漏恢复叠加成
6 个静默丢失。**教训：Open flag 涉及可见性/加载路径时，与修复不得隔夜过卡。**
