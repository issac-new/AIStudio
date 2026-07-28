## 具体操作命令手册

### Linear（Sprint/Epic 管理）

```bash
# Install
brew install linear

# Sprint 管理
linear issue list --team "Engineering" --state "Backlog"   # 查看待办
linear issue create --team "Engineering" --title "..." --description "..." --priority urgent
linear issue update --id <issue-id> --estimate 3            # 设置估时
linear issue update --id <issue-id> --state "In Progress"

# Epic 管理
linear issue create --team "Engineering" --title "Epic: ..." --label "epic"
linear issue list --label "epic"                            # 查看所有 Epic
```

### xlsxwriter（RICE 评分与 Sprint 排期表）

```bash
# Install
pip install xlsxwriter

# RICE 评分表
python3 << 'EOF'
import xlsxwriter
wb = xlsxwriter.Workbook('rice_scoring.xlsx')
ws = wb.add_worksheet('RICE Scores')
bold = wb.add_format({'bold': True, 'bg_color': '#2E86AB', 'font_color': 'white'})
rice_fmt = wb.add_format({'num_format': '0.0'})
ws.write('A1', 'ID', bold); ws.write('B1', '需求', bold)
ws.write('C1', 'Reach', bold); ws.write('D1', 'Impact', bold)
ws.write('E1', 'Confidence', bold); ws.write('F1', 'Effort', bold); ws.write('G1', 'RICE', bold)
rows = [['R1','用户登录优化',5000,3,0.8,2],['R2','搜索增强',2000,2,0.6,1]]
for i, (id_, name, reach, impact, conf, effort) in enumerate(rows, 2):
    rice = reach * impact * conf / effort
    ws.write(i-1, 0, id_); ws.write(i-1, 1, name)
    ws.write(i-1, 2, reach); ws.write(i-1, 3, impact)
    ws.write(i-1, 4, conf); ws.write(i-1, 5, effort)
    ws.write(i-1, 6, round(rice, 1), rice_fmt)
wb.close()
print('rice_scoring.xlsx generated')
EOF
```

### jq（Backlog JSON 排序）

```bash
# Install
brew install jq

# 按 RICE 排序
cat backlog.json | jq 'sort_by(.rice) | reverse | .[:10] | .[] | {id, title, rice}'

# 按优先级分组
cat backlog.json | jq 'group_by(.priority) | .[] | {priority: .[0].priority, count: length}'
```

### date / gdate（Sprint 日历）

```bash
# macOS 用 gdate (brew install coreutils)
gdate -d "+2 weeks" "+%Y-%m-%d"                # Sprint 结束日期
gdate -d "2025-07-21" "+%A"                     # 查看星期几
python3 -c "
from datetime import date, timedelta
sprint_start = date(2025, 7, 21)
sprint_end = sprint_start + timedelta(weeks=2)
print(f'Sprint: {sprint_start} → {sprint_end} ({sprint_end.weekday()})')
"
```

### gh CLI（GitHub Issue/PR 跟踪）

```bash
# Install
brew install gh

# Sprint 跟踪
gh issue list --label "sprint-24" --state open    # 查看 Sprint Issue
gh issue view <issue-number>                       # 查看详情
gh issue comment <issue-number> --body "RICE: 1200"

# 里程碑
gh issue list --milestone "Q3-2025"
```

### Python RICE 计算器

```bash
# 一键计算 RICE 分数
python3 -c "
def rice(reach, impact, confidence, effort):
    return round(reach * impact * confidence / effort, 1)
print(f'R1 RICE={rice(5000, 3, 0.8, 2)}')
print(f'R2 RICE={rice(2000, 2, 0.6, 1)}')
"

# Sprint 容量计算
python3 -c "
team_size = 5; sprint_weeks = 2; efficiency = 0.7
tech_debt = 1; meetings = 0.5
capacity = team_size * sprint_weeks * efficiency - tech_debt - meetings
print(f'Team capacity: {capacity} person-weeks')
print(f'Recommended max: {capacity * 0.8} person-weeks (80%)')
"
```

### graphviz（依赖关系图）

```bash
# Install
brew install graphviz

# 生成依赖关系图
python3 << 'EOF'
with open('deps.dot', 'w') as f:
    f.write('''
digraph SprintDeps {
    rankdir=LR;
    R1 -> R2 [label="blocks"];
    R1 -> R3 [label="blocks"];
    R4 -> R5 [label="depends on"];
}
''')
import subprocess
subprocess.run(['dot', '-Tpng', 'deps.dot', '-o', 'deps.png'])
print('deps.png generated')
EOF
```
---


---
