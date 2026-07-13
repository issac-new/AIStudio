# 驾驶舱技术债清理 · 批次 4：#7 #8 #12 视觉细化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 折叠竖条 label 字号 11→15px、协作图画布加 hint 提示、归档态 banner 变灰；测试 107 不回归。

**Spec:** `docs/superpowers/specs/2026-06-22-cockpit-techdebt-batch4-visual-polish-design.md`

---

## 前置
**分支：** overlay 基于 main 建 `fix/cockpit-techdebt-batch4-visual-polish`。起点核验 HEAD==main。
**基线：** `npm test` = 13 passed / 107 passed。
**边界：** 不改 #6；不改逐控件半透明；不碰 upstream。

## 文件结构
| 文件 | 动作 |
|------|------|
| `cockpit/styles/cockpit.scss` | 改 #7 rail label 15px |
| `cockpit/components/CockpitCollabMap.vue` | 改 #8 canvas hint |
| `cockpit/components/CockpitWorkspace.vue` | 改 #12 banner archived 变灰 |

---

### Task 1: 建分支 + 基线

- [ ] **Step 1**
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
[ "$(git rev-parse HEAD)" = "$(git rev-parse main)" ] && echo OK || echo MISMATCH
git checkout -b fix/cockpit-techdebt-batch4-visual-polish
npm test 2>&1 | grep -E "Test Files|Tests "
```
Expected: OK + 新分支 + 13/107。不提交。

---

### Task 2: #7 rail label 字号（cockpit.scss）

- [ ] **Step 1: 改 font-size**

定位 `cockpit/styles/cockpit.scss` 里 `.cockpit-rail .cockpit-rail__label { ... font-size: 11px; ... }`，把 `font-size: 11px` 改为 `font-size: 15px`（对齐原型:78）。

- [ ] **Step 2: 测试 + 提交**
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm test 2>&1 | grep -E "Test Files|Tests "
git add custom/client/cockpit/styles/cockpit.scss
git commit -m "style(cockpit): rail label 11px→15px to match prototype (#7)

Hi-fi prototype cockpit-final-polished.html:78 sets the collapsed rail
label at 15px (more legible vertical text). Overlay had 11px."
```

---

### Task 3: #8 canvas hint（CockpitCollabMap）

- [ ] **Step 1: 模板加 hint**

在 `CockpitCollabMap.vue` 的 `<div v-if="hasTask" class="cockpit-map__canvas">` 内，`<svg>...</svg>` 之后、`<CockpitGraphNode v-for=...>` 之前，加：
```html
      <span class="cockpit-map__hint">拖拽节点 · 点节点切时序源</span>
```
（硬编码中文，与种子数据风格一致；TODO 后续 i18n 化。）

- [ ] **Step 2: 样式加 hint**

在 `<style scoped lang="scss">` 的 `.cockpit-map__svg { ... }` 之后加：
```scss
.cockpit-map__hint { position: absolute; bottom: 4px; left: 8px; font-size: 8px; color: var(--text-muted); pointer-events: none; }
```

- [ ] **Step 3: 测试 + 提交**
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm test 2>&1 | grep -E "Test Files|Tests "
git add custom/client/cockpit/components/CockpitCollabMap.vue
git commit -m "feat(cockpit): add canvas hint text (#8)

Hi-fi prototype cockpit-final-polished.html:154 has a bottom-left hint
on the topology canvas ('drag nodes'). Overlay was missing it. Hardcoded
zh for now (matches seed data style); TODO i18n later."
```

---

### Task 4: #12 banner 归档变灰（CockpitWorkspace）

- [ ] **Step 1: 模板 banner 加 archived class**

定位 `CockpitWorkspace.vue` 的 `<div class="cockpit-workspace__banner">`，改为：
```html
        <div class="cockpit-workspace__banner" :class="{ 'is-archived': isReadOnly }">
```

- [ ] **Step 2: 样式加 archived 变体**

在 `<style scoped lang="scss">` 的 `.cockpit-workspace__banner-sub { ... }` 之后加：
```scss
.cockpit-workspace__banner.is-archived {
  background: var(--bg-secondary);
  border-color: var(--border-color);
  .cockpit-workspace__banner-dot { background: var(--text-muted); }
}
```

- [ ] **Step 3: 测试 + 提交**
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm test 2>&1 | grep -E "Test Files|Tests "
git add custom/client/cockpit/components/CockpitWorkspace.vue
git commit -m "style(cockpit): banner turns grey in archived mode (#12)

Hi-fi prototype :398-399 dims the banner (bg-2 + border) and dot (k4)
under .sw.archived. Overlay's banner stayed warning-yellow in archive
mode. Add is-archived variant on the banner element."
```

---

### Task 5: 合并 + 收尾

- [ ] **Step 1**
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm test 2>&1 | grep -E "Test Files|Tests "                     # 13/107
git log --oneline main..HEAD                                    # 3 commits
git diff --name-only main..HEAD | grep -vE "cockpit/" && echo WARN || echo CLEAN
```
- [ ] **Step 2**
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git checkout main
git merge fix/cockpit-techdebt-batch4-visual-polish --no-ff -m "Merge fix/cockpit-techdebt-batch4-visual-polish: #7 #8 #12 visual polish"
npm test 2>&1 | grep -E "Test Files|Tests "
git branch -d fix/cockpit-techdebt-batch4-visual-polish
```

---

## Self-Review
**覆盖**：#7→Task2；#8→Task3；#12→Task4；#6 跳过（spec §1）。每项含原型行号依据。**占位符**：无。**稳健性**：每 Task 先测 107 不回归再提交。
