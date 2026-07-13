# Design Doc: Kanban Task Drawer — Maximize Button & Resizable Comment Input

**Date:** 2026-06-19
**Status:** Approved
**Scope:** `KanbanTaskDrawer.vue` maximize toggle & textarea resize enhancement

---

## 1. Goal

Add a **maximize toggle button** to the top-right of the kanban task drawer, allowing users to expand the drawer from its default 720px width to a near-fullscreen width (with margins). Also enable **native drag-to-resize** on the comment textarea so users can manually adjust its height.

---

## 2. Current State

- Drawer: `NDrawer` (right-side, fixed `width="720"`) + `NDrawerContent` with `native-scrollbar="false"`
- Header: Custom `drawer-header` with only task ID on the left
- Comment input: Fixed `width: 720px` at bottom of viewport using `position: fixed`
- Textarea: `NInput type="textarea"` with `:autosize="{ minRows: 1, maxRows: 4 }"`

---

## 3. Proposed Changes

### 3.1 Maximize Toggle

**State:**
- `isMaximized` ref (`false` by default)
- `drawerWidth` computed property: returns `720` when normal, `calc(100vw - 40px)` when maximized (20px margin on each side)

**Template:**
- Bind `NDrawer :width="drawerWidth"`
- Add maximize button to `drawer-header` (right side), using `NButton` with icon:
  - Normal state: `⛶` (maximize icon) — clicking expands
  - Maximized state: `⛶` (restore icon, or a different icon like `⊓`) — clicking restores
- Button toggles `isMaximized.value = !isMaximized.value`

**Fixed comment input bar:**
- `.comment-input-sticky` width must sync with drawer width
- Use same `drawerWidth` computed property for the `width` style binding
- When maximized, input bar expands to fill the wider drawer

**CSS transition:**
- Add `transition: width 0.3s ease` to `NDrawer` wrapper (if Naive UI supports it via style/class) or accept instant width change
- The drawer may animate from right; width change might be instant depending on Naive UI internals

### 3.2 Textarea Resize Handle

**Change:**
- Add `style="resize: vertical"` to the comment `NInput` (or override via CSS)
- Remove or increase `maxRows` limit when user manually resizes (autosize may conflict with manual resize)
- **Decision:** Keep `autosize` for initial height, but allow `resize: vertical` so user can drag beyond maxRows. If Naive UI's autosize conflicts with native resize, we may need to:
  - Option A: Remove autosize, use static `:rows="2"` + `resize: vertical`
  - Option B: Keep autosize, accept that resize handle works but may reset on re-render
  - **Recommended:** Option A for predictable behavior — remove autosize, use `rows="2"` + `resize: vertical`

### 3.3 Header Layout Update

Current `drawer-header`:
```
[Task ID]                    [Naive UI close button — built-in]
```

New `drawer-header`:
```
[Task ID]                    [⛶ Maximize] [Naive UI close button]
```

The maximize button sits between the task ID and the Naive UI close button. Use flex `justify-content: space-between` or `margin-left: auto` to push it right.

---

## 4. Data Flow & State

| State | Type | Initial | Description |
|-------|------|---------|-------------|
| `isMaximized` | `Ref<boolean>` | `false` | Toggle between normal and maximized width |
| `drawerWidth` | `Computed<string | number>` | `720` | Dynamic width value for NDrawer and fixed input bar |

No data-model or API changes. Purely UI state.

---

## 5. Accessibility & UX Considerations

- **Keyboard:** Maximize button should be focusable and triggerable via Enter/Space
- **Screen readers:** Add `aria-label` to maximize button ("Maximize drawer" / "Restore drawer")
- **Mobile:** On mobile screens, maximized width may equal normal width (both ~100vw). Button can be hidden or disabled on small screens via media query
- **State persistence:** Maximize state resets to normal when drawer closes (no persistence needed per spec)

---

## 6. Implementation Checklist

- [ ] Add `isMaximized` ref in script setup
- [ ] Add `drawerWidth` computed property returning `720` or `calc(100vw - 40px)`
- [ ] Bind `NDrawer :width="drawerWidth"`
- [ ] Add maximize toggle button to `drawer-header` template
- [ ] Add `toggleMaximize()` function
- [ ] Update `.comment-input-sticky` width to bind `drawerWidth`
- [ ] Add `resize: vertical` to comment textarea (CSS)
- [ ] Remove `:autosize` from comment textarea, use static `:rows="2"`
- [ ] Style maximize button in header (flex layout)
- [ ] Add `aria-label` and title to maximize button
- [ ] Test width transition in browser
- [ ] Test textarea resize handle in browser
- [ ] Test maximized state with fixed input bar alignment

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Naive UI `NDrawer` width prop doesn't accept `calc()` string | Test with string; if fails, use `window.innerWidth - 40` numeric value |
| Fixed input bar width doesn't sync smoothly with drawer animation | Accept instant width change; drawer animation and bar width change may be decoupled |
| `resize: vertical` conflicts with Naive UI textarea autosize | Remove autosize, use static rows |
| Maximized drawer covers too much on small screens | Hide/disable maximize button on screens < 800px |

---

## 8. Out of Scope

- Persisting maximize state across sessions
- Animating width transition (Naive UI may not support smooth width animation)
- Custom resize handle for drawer width (drag edge to resize)
- Fullscreen mode (F11-style true fullscreen)

---

*Approved by user on 2026-06-19.*
