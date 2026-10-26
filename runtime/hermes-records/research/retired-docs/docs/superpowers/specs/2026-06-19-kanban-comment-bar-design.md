# Design Doc: Kanban Task Drawer — Bottom-Fixed Comment Bar

**Date:** 2026-06-19
**Status:** Approved
**Scope:** `KanbanTaskDrawer.vue` comment section UX redesign

---

## 1. Goal

Move the comment input bar to the **bottom of the `NDrawer` and keep it fixed (sticky) while scrolling**, so users can add remarks at any time without scrolling. Also restyle the comment list and input to look like a **chat-style UI** (bordered, background-colored, rounded).

Reference: hermes agent dashboard kanban plugins bottom-fixed comment UX.

---

## 2. Current State

- Drawer: `NDrawer` (right-side, 720 px) + `NDrawerContent` with `native-scrollbar="false"`.
- Comments section sits **in the middle** of the drawer content (after Attachments, before Events).
- Input row is a plain `NInput` + `NButton` flex row with no background/border styling.
- The comment list is a simple stacked card list with no scroll containment.

**Relevant file:**
- `hermes-web-ui/packages/client/src/components/hermes/kanban/KanbanTaskDrawer.vue`

---

## 3. Proposed Changes

### 3.1 DOM Reorder

Move the entire **Comments** section block to the **end** of `.task-drawer` (after the Run History section). This ensures the comment list sits at the bottom of the scrollable content, and the sticky input bar naturally anchors to the bottom edge of the drawer viewport.

### 3.2 Sticky Input Bar

Wrap the comment input row in a container with:

```scss
.comment-input-sticky {
  position: sticky;
  bottom: 0;
  background: $bg-primary;      // or a slightly elevated surface color
  border-top: 1px solid $border-light;
  padding: 10px 12px;
  margin: 0 -12px;                // bleed to drawer-content edges if needed
  z-index: 10;
}
```

> Note: `NDrawerContent` uses its own internal scroll container. `position: sticky` works inside that scroll context as long as the sticky element is a direct child of the scrollable block (or nested within a block that has overflow). The `.task-drawer` flex column is inside `NDrawerContent`’s body, so sticky should work.

### 3.3 Chat-Style Visual Upgrade

#### Comment List
- Switch from bordered cards to **bubble-style messages**:
  - Current user (author matches session) on the **right**, others on the **left**.
  - Rounded corners (`$radius-lg` for bubbles, `$radius-md` for the list container).
  - Subtle background tint per author side (`$bg-card` vs. a tinted surface).
- Add a **scrollable comment list container** with `max-height` so long comment threads don’t push the entire drawer content down indefinitely. If the list exceeds the container height, it scrolls internally.

#### Input Bar
- Background: slightly elevated surface (`$bg-primary` or a new `$surface-elevated` variable) to visually separate from content.
- Border: `1px solid $border-light` on top, plus a rounded container around the input + button.
- Input: `NInput` with `type="textarea"` (1–2 rows, auto-resize if Naive UI supports it) or a larger `NInput` with a paper-plane-style submit button inside the input area (using `NInput`’s `#suffix` slot).
- Placeholder: keep existing i18n key.

### 3.4 Bottom Padding for Content

Add bottom padding to `.task-drawer` (or to the last non-comment section) so that when the user scrolls to the very bottom, the last content element isn’t hidden behind the sticky input bar.

```scss
.task-drawer {
  padding-bottom: 72px; // approximate height of sticky bar + gap
}
```

### 3.5 Auto-Scroll on New Comment

When a new comment is added (after `handleAddComment` succeeds), auto-scroll the comment list container to the bottom so the newest message is visible.

---

## 4. Data Flow & State

No data-model changes. Re-use existing:

- `comments` computed from `detail.value?.comments`
- `newComment` ref + `commentLoading` ref
- `handleAddComment()` handler

Add one new ref:
- `commentListRef` — template ref to the comment list scroll container for programmatic scroll-to-bottom.

---

## 5. Accessibility & UX Considerations

- **Keyboard**: Enter still submits; Shift+Enter should insert a newline if we switch to textarea.
- **Focus**: After submitting, keep focus in the input so the user can keep typing.
- **Mobile**: Sticky positioning works on modern mobile browsers; ensure `z-index` doesn’t conflict with drawer header/footer.
- **i18n**: No new keys needed unless we add “Send” button label or “No comments yet” empty state copy.

---

## 6. Implementation Checklist

- [ ] Move `<div class="drawer-section">` (Comments) to the end of `.task-drawer` in template.
- [ ] Wrap `.comment-input-row` in `.comment-input-sticky` div.
- [ ] Update `.comment-list` styles to bubble/chat layout (left/right alignment, rounded corners, background colors).
- [ ] Add `.comment-list-container` with `max-height` and `overflow-y: auto`.
- [ ] Style `.comment-input-sticky` with background, border-top, padding, `position: sticky`, `bottom: 0`.
- [ ] Add `padding-bottom` to `.task-drawer` to prevent content occlusion.
- [ ] Add `commentListRef` and auto-scroll-to-bottom after `handleAddComment`.
- [ ] (Optional) Change `NInput` to `type="textarea"` with `:autosize="{ minRows: 1, maxRows: 4 }"` for multi-line comments.
- [ ] (Optional) Add current-user detection to align bubbles right/left.
- [ ] Test in browser: verify sticky bar stays at bottom during scroll, padding prevents occlusion, new comments auto-scroll.

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `position: sticky` fails inside `NDrawerContent` internal scroll wrapper | Verify in browser; fallback to `position: fixed` with calculated width if needed. |
| Long comment list pushes other sections too far down | Cap comment list height with internal scroll container. |
| Visual regression in dark/light themes | Use existing SCSS variables (`$bg-primary`, `$border-light`, etc.) so theme switching is automatic. |
| Multi-line textarea breaks layout | Use `autosize` and ensure sticky bar height stays reasonable (max 4 rows). |

---

## 8. Out of Scope

- Real-time comment updates (WebSocket / polling) — not part of this task.
- Comment editing / deletion — not part of this task.
- Markdown toolbar in comment input — not part of this task.
- Drawer width or placement changes — not part of this task.

---

*Approved by user on 2026-06-19.*
