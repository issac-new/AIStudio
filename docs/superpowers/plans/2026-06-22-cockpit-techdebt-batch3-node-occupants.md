# 驾驶舱技术债清理 · 批次 3：#4 协作图节点显示在场者 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 协作图节点上显示在场者（小圆点 + hover 名字），实现设计 §5.4"谁在哪个空间"的视觉；测试 105 → 107（+2 断言）全绿。

**Architecture:** GraphNode 加可选 `occupants?: string[]`；CockpitGraphNode 在 label 下横排圆点（首字符，最多 3，超出 +N，title hover）；种子补值。沿 Pure Ink，不引入头像组件。

**Spec:** `docs/superpowers/specs/2026-06-22-cockpit-techdebt-batch3-node-occupants-design.md`

---

## 前置准备

**分支：** overlay 基于 main 建 `feat/cockpit-techdebt-batch3-node-occupants`。**起点核验**：`git rev-parse HEAD` == `git rev-parse main` 才建。

**基线：** `cd /Volumes/nvme2230/lab/ncwk/overlay && npm test` = 13 passed / 105 passed。

**边界：** 不做双栏布局（spec §1）；不接 API；不改连线标注；不碰 upstream。

---

## 文件结构

| 文件 | 动作 | 职责 |
|------|------|------|
| `cockpit/store/cockpit.ts` | 改 | GraphNode 加 occupants? 字段 |
| `cockpit/components/CockpitGraphNode.vue` | 改 | 渲染 occupants 圆点 + title hover |
| `cockpit/fixtures/seed.ts` | 改 | n1/n2 补 occupants |
| `cockpit/__tests__/cockpit-graph-node.test.ts` | 改 | +2 断言（有/无 occupants 渲染） |

---

### Task 1: 建分支 + 基线

- [ ] **Step 1: 起点核验 + 建分支 + 基线**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
[ "$(git rev-parse HEAD)" = "$(git rev-parse main)" ] && echo "HEAD==main OK" || echo MISMATCH
git checkout -b feat/cockpit-techdebt-batch3-node-occupants
npm test 2>&1 | grep -E "Test Files|Tests "
```
Expected: `OK` + 新分支 + `13 passed / 105 passed`。不满足则停止。

- [ ] **Step 2: 不提交**

---

### Task 2: store 加 occupants 字段

**Files:** Modify `cockpit/store/cockpit.ts`

- [ ] **Step 1: GraphNode 加 occupants**

定位 `export interface GraphNode { ... }`（约第 51-59 行），在 `links?: string[]` 后加：

```ts
export interface GraphNode {
  id: string
  taskId: string
  label: string
  kind: GraphNodeKind
  focus: boolean
  /** 连线目标节点 id 列表（无向，由调用方去重） */
  links?: string[]
  /** 该节点的在场者（谁在处理这个文件/测试），节点上以小圆点显示，hover 出名字。 */
  occupants?: string[]
}
```

- [ ] **Step 2: 测试无回归**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npm test 2>&1 | grep -E "Test Files|Tests |Error"
```
Expected: `13 passed / 105 passed`（可选字段，向后兼容）。

- [ ] **Step 3: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/store/cockpit.ts && git commit -m "feat(cockpit): GraphNode gains optional occupants field (#4)

For design §5.4 'who is in which space' — nodes will display occupants
(small dots + hover name). Field is optional/backward-compatible; seed
and component rendering follow in next commits."
```

---

### Task 3: CockpitGraphNode 渲染 occupants 圆点

**Files:** Modify `cockpit/components/CockpitGraphNode.vue`

- [ ] **Step 1: script 加 occupants 派生（前 3 个 + 溢出计数）**

把 `<script setup>` 末尾（`function onMousedown` 之前，约第 22 行）加：

```ts
// 在场者：最多显示前 3 个，超出计为 +N
const visibleOccupants = computed(() => (props.node.occupants ?? []).slice(0, 3))
const extraOccupants = computed(() => Math.max((props.node.occupants ?? []).length - 3, 0))
```

（需在文件顶部 import 里确认有 `computed`——当前 import 是 `import { computed } from 'vue'`，已有。）

- [ ] **Step 2: template 在 focus 标记后加 occupants 圆点行**

把 template 里 `<span v-if="node.focus" class="cockpit-graph-node__focus">焦点</span>` 之后、`</button>` 之前，加：

```html
    <span v-if="visibleOccupants.length" class="cockpit-graph-node__occupants">
      <span
        v-for="name in visibleOccupants"
        :key="name"
        class="cockpit-graph-node__occ"
        :title="name"
      >{{ name.charAt(0) }}</span>
      <span v-if="extraOccupants > 0" class="cockpit-graph-node__occ cockpit-graph-node__occ--more" :title="`还有 ${extraOccupants} 位`">+{{ extraOccupants }}</span>
    </span>
```

- [ ] **Step 3: style 加 occupants 圆点样式**

在 `<style scoped lang="scss">` 的 `.cockpit-graph-node__focus { ... }` 之后加：

```scss
.cockpit-graph-node__occupants { display: flex; gap: 2px; margin-top: 2px; align-items: center; }
.cockpit-graph-node__occ {
  width: 14px; height: 14px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  font-size: 8px; font-weight: 700; color: var(--text-on-accent); background: var(--accent-primary);
  border: 1px solid var(--bg-card); cursor: help;
}
.cockpit-graph-node__occ--more { background: var(--bg-secondary); color: var(--text-muted); border-color: var(--border-color); font-size: 8px; }
```

- [ ] **Step 4: 测试无回归**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npm test 2>&1 | grep -E "Test Files|Tests |Error"
```
Expected: `13 passed / 105 passed`（现有测试 props 不含 occupants，不渲染该行）。

- [ ] **Step 5: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/components/CockpitGraphNode.vue && git commit -m "feat(cockpit): graph node renders occupants dots (#4)

Show who's in each space: below the node label, render up to 3 occupant
dots (first char on accent background, hover title = full name), +N for
overflow. Hidden entirely when no occupants. Implements design §5.4
'node displays occupants' (not the audit's two-column reading, which the
hi-fi prototype never landed)."
```

---

### Task 4: 种子节点补 occupants

**Files:** Modify `cockpit/fixtures/seed.ts`

- [ ] **Step 1: n1/n2 补 occupants**

定位 `export const seedAppTopology: GraphNode[] = [...]`，改为：

```ts
export const seedAppTopology: GraphNode[] = [
  { id: 'n1', taskId: '1', label: 'refresh.ts', kind: 'file', focus: true, links: ['n2'], occupants: ['张三', 'review-agent'] },
  { id: 'n2', taskId: '1', label: 'auth.spec', kind: 'test', focus: false, links: [], occupants: ['qa-agent'] },
]
```

- [ ] **Step 2: 测试无回归**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npm test 2>&1 | grep -E "Test Files|Tests |Error"
```
Expected: `13 passed / 105 passed`。

- [ ] **Step 3: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/fixtures/seed.ts && git commit -m "chore(cockpit): seed graph nodes with occupants

n1 (refresh.ts) → 张三 + review-agent (submit + review the impl);
n2 (auth.spec) → qa-agent (qa fills the test). Makes the occupants dots
show meaningful people on first load."
```

---

### Task 5: 新增 2 个组件断言

**Files:** Modify `cockpit/__tests__/cockpit-graph-node.test.ts`

- [ ] **Step 1: 在 describe 块末尾（最后一个 it 之后、`})` 之前）加 2 断言**

```ts
  it('renders occupant dots with title when node has occupants', () => {
    const w = mount(CockpitGraphNode, {
      props: { ...props, node: { ...props.node, occupants: ['张三', 'review-agent'] } },
    })
    const occs = w.findAll('.cockpit-graph-node__occ')
    expect(occs).toHaveLength(2)
    expect(occs[0].attributes('title')).toBe('张三')
    expect(occs[0].text()).toBe('张')
    expect(occs[1].attributes('title')).toBe('review-agent')
  })

  it('shows +N overflow dot when occupants exceed 3 and hides row when none', () => {
    // 超出 3 个 → 前 3 圆点 + 一个 +N
    const wMore = mount(CockpitGraphNode, {
      props: { ...props, node: { ...props.node, occupants: ['a', 'b', 'c', 'd', 'e'] } },
    })
    const dotsMore = wMore.findAll('.cockpit-graph-node__occ')
    expect(dotsMore).toHaveLength(4) // 3 个 + 1 个 +N
    expect(dotsMore.at(-1)!.classes()).toContain('cockpit-graph-node__occ--more')
    expect(dotsMore.at(-1)!.text()).toBe('+2')

    // 无 occupants → 不渲染该行
    const wNone = mount(CockpitGraphNode, { props })
    expect(wNone.findAll('.cockpit-graph-node__occ')).toHaveLength(0)
  })
```

- [ ] **Step 2: 跑测试，期望 107**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && npm test 2>&1 | grep -E "Test Files|Tests |FAIL|Error"
```
Expected: `13 passed / 107 passed`。若失败，常见：computed 未 import（已确认有）、class 选择器拼写、occupants 切片逻辑。

- [ ] **Step 3: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && git add custom/client/cockpit/__tests__/cockpit-graph-node.test.ts && git commit -m "test(cockpit): cover occupants dots rendering and +N overflow"
```

---

### Task 6: 合并 + 收尾

- [ ] **Step 1: 最终测试 + 纯净度**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm test 2>&1 | grep -E "Test Files|Tests "                     # 期望 13/107
git log --oneline main..HEAD                                    # 期望 5 commits
git diff --name-only main..HEAD | grep -vE "cockpit/" && echo WARN || echo CLEAN
```

- [ ] **Step 2: 合入 main + 复测 + 删分支**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout main
git merge feat/cockpit-techdebt-batch3-node-occupants --no-ff -m "Merge feat/cockpit-techdebt-batch3-node-occupants: #4 graph node occupants"
npm test 2>&1 | grep -E "Test Files|Tests "                     # 期望 13/107
git branch -d feat/cockpit-techdebt-batch3-node-occupants
```

---

## Self-Review

**Spec 覆盖**：§4.1 occupants 字段→Task2；§4.2 圆点展示（前3+overflow+title+无occupants不渲染）→Task3 + 断言2覆盖；§4.3 种子 n1/n2→Task4；§3 非目标（不做双栏/不接API/不改连线/不复用ProfileAvatar）→ 全计划无相关改动。死字段/类型一致：occupants 在 store 定义→组件 props→断言拼写一致。

**占位符**：无。每 step 含完整代码/命令。

**稳健性**：Task2/3/4 各自先测 105 不回归（隔离字段加/组件改/种子改三类问题），Task5 期望明确 107。
