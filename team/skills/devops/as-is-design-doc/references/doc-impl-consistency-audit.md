# 设计文档 ↔ 实现 ↔ 跨文档 一致性机械审计

> 来源：2026-08-27 全集群设计文档排查实战（用户要求"排查整体设计文档及实现，修正设计/实现/实际工作中的逻辑连贯与组织孤立/断裂/割裂"）。
> 配合本 skill 的"数字一律重测"纪律——但**扩展到跨文档**：同一系统被多份文档描述时，数字/实体/层级必须完全自洽。

## 审计总纲（三线，缺一线即漏）

1. **文档 ↔ 实现**：文档声称的路径/脚本/cron/数字，逐一用 `ls`/`find`/`sqlite`/`python` 复验
2. **文档 ↔ 文档**：终态设计文档 + 统一治理框架 + 一致性报告 描述同一系统，数字/实体/层级必须一致
3. **引用 ↔ 存在**：文档/SOUL 引用的 `.md` 文件名、profile 名、skill 名，必须真实存在

## 关键机械配方（copy-paste）

### A. 跨文档数字漂移（最易漏——两份文档对同一实体计数不同）
```bash
grep -nE "9 board|7 board|27 profile" doc1.md doc2.md
# 命中即矛盾：例如治理框架写 "27 profile × 9 board"，终态设计文档写 7 board → 真实 7
```

### B. 悬空 .md 引用（_shared 文档 + 所有 SOUL）
```python
import os, re, glob
root='/Users/YOURNAME/.hermes'
existing={os.path.basename(p) for p in glob.glob(root+'/**/*.md', recursive=True)}
for f in glob.glob(root+'/profiles/_shared/*.md')+glob.glob(root+'/profiles/*/SOUL.md'):
    for m in re.findall(r'`?([a-z0-9][a-z0-9_\-]+\.md)`?', open(f).read()):
        if m not in existing: print(os.path.basename(f),'->',m)
# 例：review-gates.md 附录引用 intervention-ledger.md / worker-appeal-protocol.md /
#     kanban-advanced.md，三者已并入正文但文件名仍悬空 → 改附录文案或去掉文件名
```

### C. 幽灵 profile / 实体引用（引用了未激活的 profile）
```bash
grep -rlnE "hack-c2|hack-weapons" ~/.hermes/profiles/*/SOUL.md ~/.hermes/profiles/*/*rules.md
# 命中后核对 profiles/ 目录是否真有该 profile 激活目录（非 .archived）
# 例：hack-c2 / hack-weapons 在 6 文件被引用，但 profile 未激活 → 要么建归档说明，要么清理引用
```

### D. cron 真实计数（非沿用旧值）
```python
import json,glob
total=0
for jf in glob.glob('/Users/YOURNAME/.hermes/profiles/*/cron/jobs.json'):
    d=json.load(open(jf)); jobs=d.get('jobs',d)
    if isinstance(jobs,dict): jobs=list(jobs.values())
    total+=len(jobs)
print('TOTAL cron =',total)   # 文档写 19，实机 25（20 recurring + 4 once + 1 interval）
```

### E. skill 唯一计数（master + profile-native，去重）
```python
import os,glob
def keys(r): return {os.path.relpath(os.path.dirname(p),r) for p in glob.glob(r+'/**/SKILL.md',recursive=True)}
m=keys('/Users/YOURNAME/.hermes/skills'); nat=set()
for pd in glob.glob('/Users/YOURNAME/.hermes/profiles/*/skills'):
    if os.path.basename(os.path.dirname(pd))=='_shared': continue
    nat|=keys(pd)-m
print('master',len(m),'native',len(nat),'total unique',len(m)+len(nat))
# 文档写 818/768，实机 unique ≈993（800 master + 193 profile-native）
```

### F. 目录承诺 ↔ 实际结构（如 knowledge/ 五层）
```bash
find ~/.hermes/profiles/_shared/knowledge -maxdepth 1   # 对比文档声称的 main/applications/candidate/personal/template 5 层
```

### G. symlink 死链 / 重复实体目录
```bash
find ~/.hermes/skills ~/.hermes/profiles/*/skills -xtype l          # 死链
diff -rq <dirA> <dirB>                                          # 确认 stale 备份目录是否等于 canonical（可安全删）
```

## 本次实战抓出的病灶（归类存档）

| 类别 | 实例 | 处置 |
|------|------|------|
| 跨文档实体矛盾 | 治理框架 "9 board" vs 设计文档 "7 board"（真实 7） | 改治理框架为 7 |
| 数字漂移 | 文档 cron 19 / skills 818·768 | 实机 25 / ≈993，文档对齐实机 |
| 幽灵实体引用 | hack-c2 / hack-weapons 在 6 文件被引但未激活 | 清理引用或建归档说明 |
| 悬空 .md 引用 | review-gates 附录三文件名 | 改文案或补文件 |
| 目录承诺不符 | knowledge 宣称 5 层，实机 2 文件 | 实装 5 层或改文档 |
| 重复目录 | cybersecurity-symlink-backup==canonical；cybersecurity-legacy 是子集 | `diff -rq` 确认后删冗余 |

## 修复优先级纪律
- 先修**真实实现缺口**（缺文件/补丁/接线）→ 再修**文档↔文档矛盾**（单一事实源，挑准的文档为准，错的改对的）→ 最后修**文档↔实现数字漂移**（文档对齐实机，实机有错则先修实机）
- 任何"修复设计文档"类任务，完成判定必须含"已跑上述机械审计且零悬空/零漂移"，否则不算闭环
