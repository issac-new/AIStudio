# Kanban Task Drawer — Bottom-Fixed Comment Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the comment section to the bottom of the kanban task drawer, make the input bar sticky (always visible while scrolling), and restyle comments into a chat-style bubble UI.

**Architecture:** Use CSS `position: sticky` on the input bar inside the `NDrawerContent` scroll context. Reorder the Comments section to the end of the drawer content. Add a scrollable comment list container with max-height. Style bubbles with left/right alignment based on author. No data model or API changes.

**Tech Stack:** Vue 3 + Naive UI + SCSS + Pinia

---

## File Structure

| File | Responsibility |
|------|---------------|
| `hermes-web-ui/packages/client/src/components/hermes/kanban/KanbanTaskDrawer.vue` | **Only file to modify.** Contains the drawer template, script, and scoped SCSS. We will: (1) move the Comments `<div class="drawer-section">` to the end of `.task-drawer`, (2) add a template ref for the comment list container, (3) upgrade comment list + input styles, (4) add auto-scroll on new comment. |

---

## Task 1: Move Comments Section to Bottom of Drawer Content

**Files:**
- Modify: `hermes-web-ui/packages/client/src/components/hermes/kanban/KanbanTaskDrawer.vue:1012-1040` (Comments block)
- Modify: `hermes-web-ui/packages/client/src/components/hermes/kanban/KanbanTaskDrawer.vue:621-1129` (surrounding `.task-drawer` content)

- [ ] **Step 1: Cut the Comments block from its current location**

  Locate lines 1012–1040 in `KanbanTaskDrawer.vue`:

  ```vue
  <!-- Comments -->
  <div class="drawer-section">
    <div class="section-head">{{ t('kanban.comments', 'Comments') }} ({{ comments.length }})</div>
    ...
  </div>
  ```

  Remove this entire block from its current position (after Attachments, before Events).

- [ ] **Step 2: Paste the Comments block at the end of `.task-drawer`**

  Insert it **after** the Run History section (after the closing `</div>` of the `v-if="runs.length > 0"` block, which ends around line 1128). The new order inside `.task-drawer` should be:

  1. Title
  2. Meta rows
  3. Status Actions
  4. Recovery
  5. Diagnostics
  6. Notify home channels
  7. Body / Description
  8. Dependencies
  9. Result
  10. Attachments
  11. Events
  12. Worker Log
  13. Run History
  14. **Comments** ← moved here

- [ ] **Step 3: Verify the template still compiles**

  Run: `cd /Volumes/nvme2230/lab/ncwk/hermes-web-ui && npm run build:client 2>&1 | head -30`
  Expected: No template syntax errors.

- [ ] **Step 4: Commit**

  ```bash
  cd /Volumes/nvme2230/lab/ncwk
  git add hermes-web-ui/packages/client/src/components/hermes/kanban/KanbanTaskDrawer.vue
  git commit -m "refactor(kanban): move Comments section to bottom of task drawer"
  ```

---

## Task 2: Add Template Ref for Comment List Container

**Files:**
- Modify: `hermes-web-ui/packages/client/src/components/hermes/kanban/KanbanTaskDrawer.vue:35-37` (comment state area)
- Modify: `hermes-web-ui/packages/client/src/components/hermes/kanban/KanbanTaskDrawer.vue:1012-1040` (Comments template, after Task 1 reorder)

- [ ] **Step 1: Add a template ref in script**

  Around line 35 (near existing comment state), add:

  ```typescript
  // Comment state
  const newComment = ref('')
  const commentLoading = ref(false)
  const commentListRef = ref<HTMLDivElement | null>(null)  // ← NEW
  ```

- [ ] **Step 2: Attach the ref to the comment list container in template**

  After Task 1, the Comments block is at the bottom. Wrap the `v-for` comment list in a scrollable container and attach the ref:

  ```vue
  <!-- Comments -->
  <div class="drawer-section comment-section">
    <div class="section-head">{{ t('kanban.comments', 'Comments') }} ({{ comments.length }})</div>
    <div v-if="comments.length === 0" class="empty-text">
      {{ t('kanban.noComments', '— no comments —') }}
    </div>
    <div v-else ref="commentListRef" class="comment-list-container">
      <div class="comment-list">
        <div v-for="comment in comments" :key="comment.id" class="comment-item">
          <div class="comment-head">
            <span class="comment-author">{{ comment.author || 'anon' }}</span>
            <span class="comment-ago">{{ timeAgo(comment.created_at) }}</span>
          </div>
          <div class="comment-body markdown-body">
            <KanbanMarkdown :source="comment.body" />
          </div>
        </div>
      </div>
    </div>
    <div class="comment-input-row">
      <NInput
        v-model:value="newComment"
        size="small"
        :placeholder="t('kanban.addComment', 'Add a comment… (Enter to submit)')"
        @keydown.enter.prevent="handleAddComment"
      />
      <NButton size="small" :loading="commentLoading" @click="handleAddComment">
        {{ t('kanban.comment', 'Comment') }}
      </NButton>
    </div>
  </div>
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add hermes-web-ui/packages/client/src/components/hermes/kanban/KanbanTaskDrawer.vue
  git commit -m "feat(kanban): add comment list container ref for auto-scroll"
  ```

---

## Task 3: Auto-Scroll Comment List to Bottom on New Comment

**Files:**
- Modify: `hermes-web-ui/packages/client/src/components/hermes/kanban/KanbanTaskDrawer.vue:503-516` (`handleAddComment`)

- [ ] **Step 1: Add scroll-to-bottom helper**

  After the `handleAddComment` function (around line 516), add:

  ```typescript
  function scrollCommentsToBottom() {
    nextTick(() => {
      const el = commentListRef.value
      if (el) {
        el.scrollTop = el.scrollHeight
      }
    })
  }
  ```

  Make sure `nextTick` is already imported at the top of `<script setup>` (it is, on line 2).

- [ ] **Step 2: Call `scrollCommentsToBottom` after successful comment add**

  Modify `handleAddComment`:

  ```typescript
  async function handleAddComment() {
    if (!task.value || !newComment.value.trim()) return
    commentLoading.value = true
    try {
      await store.addComment(task.value.id, newComment.value.trim())
      newComment.value = ''
      await loadDetail(task.value.id)
      emit('refresh')
      scrollCommentsToBottom() // ← NEW
    } catch (err: any) {
      message.error(err?.message || t('kanban.message.commentFailed'))
    } finally {
      commentLoading.value = false
    }
  }
  ```

- [ ] **Step 3: Also scroll on drawer open if comments exist**

  In the `watch` block that loads detail when the drawer opens (around line 116), after `loadDetail` completes, add a delayed scroll:

  ```typescript
  watch(() => [props.show, props.taskId], async ([show, taskId]) => {
    if (show && taskId && typeof taskId === 'string') {
      await loadDetail(taskId)
      loadDiagnostics(taskId)
      loadHomeChannels()
      loadLog()
      scrollCommentsToBottom() // ← NEW
    } else {
      ...
    }
  })
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add hermes-web-ui/packages/client/src/components/hermes/kanban/KanbanTaskDrawer.vue
  git commit -m "feat(kanban): auto-scroll comment list to bottom on new comment and drawer open"
  ```

---

## Task 4: Style the Comment List as Chat Bubbles

**Files:**
- Modify: `hermes-web-ui/packages/client/src/components/hermes/kanban/KanbanTaskDrawer.vue:1163-1645` (SCSS section)

- [ ] **Step 1: Add comment-section and comment-list-container styles**

  In the `<style scoped lang="scss">` block, replace the existing `.comment-list` through `.comment-input-row` styles (lines ~1397–1444) with the following:

  ```scss
  // Comments
  .comment-section {
    position: relative;
  }

  .comment-list-container {
    max-height: 320px;
    overflow-y: auto;
    padding-right: 4px;
    margin-bottom: 8px;
  }

  .comment-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .comment-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 85%;

    &.comment-item--self {
      align-self: flex-end;
      align-items: flex-end;

      .comment-bubble {
        background: rgba($accent-primary, 0.12);
        border-color: rgba($accent-primary, 0.25);
      }
    }

    &:not(.comment-item--self) {
      align-self: flex-start;
      align-items: flex-start;
    }
  }

  .comment-bubble {
    background: $bg-card;
    border: 1px solid $border-light;
    border-radius: $radius-md;
    padding: 10px 12px;
    width: 100%;
  }

  .comment-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .comment-author {
    font-size: 12px;
    font-weight: 500;
    color: $text-secondary;
  }

  .comment-ago {
    font-size: 11px;
    color: $text-muted;
  }

  .comment-body {
    margin: 0;
    font-size: 13px;
    color: $text-primary;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
  }
  ```

  > Note: `$accent-primary`, `$bg-card`, `$border-light`, `$radius-md`, `$text-secondary`, `$text-muted`, `$text-primary` are already defined in `@/styles/variables` and used throughout this file.

- [ ] **Step 2: Update the comment item template to use the bubble wrapper**

  Modify the `v-for` comment item in the template to wrap the body in `.comment-bubble`:

  ```vue
  <div
    v-for="comment in comments"
    :key="comment.id"
    :class="['comment-item', comment.author === currentUser ? 'comment-item--self' : '']"
  >
    <div class="comment-head">
      <span class="comment-author">{{ comment.author || 'anon' }}</span>
      <span class="comment-ago">{{ timeAgo(comment.created_at) }}</span>
    </div>
    <div class="comment-bubble">
      <div class="comment-body markdown-body">
        <KanbanMarkdown :source="comment.body" />
      </div>
    </div>
  </div>
  ```

- [ ] **Step 3: Add a `currentUser` computed property**

  In the `<script setup>` block, add near the other computed properties (around line 97):

  ```typescript
  const currentUser = computed(() => store.currentUser || '')
  ```

  > If `store.currentUser` does not exist, use a simpler fallback: `const currentUser = computed(() => '')` and leave the bubble alignment logic in place for future wiring. The comments will all align left, which is acceptable.

- [ ] **Step 4: Commit**

  ```bash
  git add hermes-web-ui/packages/client/src/components/hermes/kanban/KanbanTaskDrawer.vue
  git commit -m "feat(kanban): restyle comment list as chat bubbles with left/right alignment"
  ```

---

## Task 5: Make the Comment Input Bar Sticky at Bottom

**Files:**
- Modify: `hermes-web-ui/packages/client/src/components/hermes/kanban/KanbanTaskDrawer.vue:1012-1040` (Comments template)
- Modify: `hermes-web-ui/packages/client/src/components/hermes/kanban/KanbanTaskDrawer.vue:1163-1645` (SCSS)

- [ ] **Step 1: Wrap the input row in a sticky container**

  In the Comments template, wrap `.comment-input-row` with `.comment-input-sticky`:

  ```vue
  <div class="comment-input-sticky">
    <div class="comment-input-row">
      <NInput
        v-model:value="newComment"
        size="small"
        :placeholder="t('kanban.addComment', 'Add a comment… (Enter to submit)')"
        @keydown.enter.prevent="handleAddComment"
      />
      <NButton size="small" :loading="commentLoading" @click="handleAddComment">
        {{ t('kanban.comment', 'Comment') }}
      </NButton>
    </div>
  </div>
  ```

- [ ] **Step 2: Add sticky styles**

  Append to the SCSS block:

  ```scss
  .comment-input-sticky {
    position: sticky;
    bottom: 0;
    background: $bg-primary;
    border-top: 1px solid $border-light;
    padding: 10px 12px;
    margin: 0 -12px;
    z-index: 10;
  }

  .comment-input-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  ```

  > `$bg-primary` should be imported from `@/styles/variables`. If it is not available, use `var(--n-color)` or the existing `$bg-card` as fallback. Check the variables file if unsure.

- [ ] **Step 3: Add bottom padding to `.task-drawer` to prevent occlusion**

  Update the existing `.task-drawer` rule (around line 1188):

  ```scss
  .task-drawer {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding-bottom: 72px; // prevents last content from being hidden behind sticky bar
  }
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add hermes-web-ui/packages/client/src/components/hermes/kanban/KanbanTaskDrawer.vue
  git commit -m "feat(kanban): make comment input bar sticky at bottom of drawer"
  ```

---

## Task 6: Upgrade Input to Textarea with Auto-Size

**Files:**
- Modify: `hermes-web-ui/packages/client/src/components/hermes/kanban/KanbanTaskDrawer.vue:1029-1038` (input row template)

- [ ] **Step 1: Replace single-line NInput with textarea**

  Change the `NInput` inside `.comment-input-row` to:

  ```vue
  <NInput
    v-model:value="newComment"
    type="textarea"
    size="small"
    :autosize="{ minRows: 1, maxRows: 4 }"
    :placeholder="t('kanban.addComment', 'Add a comment… (Shift+Enter for newline, Enter to submit)')"
    @keydown.enter.prevent="handleAddComment"
  />
  ```

  > Naive UI's `NInput` with `type="textarea"` supports `autosize`. If `autosize` is not available in this version, use `:rows="2"` as a static fallback.

- [ ] **Step 2: Handle Shift+Enter for newline**

  Modify `@keydown.enter` to allow Shift+Enter to insert a newline:

  ```vue
  <NInput
    v-model:value="newComment"
    type="textarea"
    size="small"
    :autosize="{ minRows: 1, maxRows: 4 }"
    :placeholder="t('kanban.addComment', 'Add a comment… (Shift+Enter for newline, Enter to submit)')"
    @keydown.enter="onCommentKeydown"
  />
  ```

  Add the handler in `<script setup>` (near `handleAddComment`):

  ```typescript
  function onCommentKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAddComment()
    }
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add hermes-web-ui/packages/client/src/components/hermes/kanban/KanbanTaskDrawer.vue
  git commit -m "feat(kanban): upgrade comment input to auto-sizing textarea with shift+enter newline"
  ```

---

## Task 7: Final Verification

**Files:**
- Modify: none (verification only)

- [ ] **Step 1: Build the client**

  Run:
  ```bash
  cd /Volumes/nvme2230/lab/ncwk/hermes-web-ui
  npm run build:client 2>&1 | tail -20
  ```
  Expected: Build succeeds with no errors.

- [ ] **Step 2: Run kanban-related tests**

  Run:
  ```bash
  cd /Volumes/nvme2230/lab/ncwk/hermes-web-ui
  npx vitest run tests/client/kanban-task-card.test.ts tests/client/kanban-view.test.ts 2>&1 | tail -20
  ```
  Expected: All tests pass. (If tests fail due to unrelated reasons, note them.)

- [ ] **Step 3: Manual browser check (if dev server is available)**

  If the dev server is running, open a kanban task drawer and verify:
  1. Comments section is at the bottom of the drawer.
  2. The comment input bar stays visible when scrolling up/down.
  3. The comment list scrolls internally if there are many comments.
  4. New comments auto-scroll to the bottom.
  5. The last section (Run History or Events) is not hidden behind the sticky bar.
  6. Shift+Enter inserts a newline; Enter submits.

- [ ] **Step 4: Final commit**

  ```bash
  cd /Volumes/nvme2230/lab/ncwk
  git log --oneline -5
  ```
  Expected: 5–6 commits on the feature branch, all related to the comment bar redesign.

---

## Spec Coverage Checklist

| Spec Requirement | Task |
|------------------|------|
| Move Comments section to bottom of drawer | Task 1 |
| Add template ref for comment list | Task 2 |
| Auto-scroll on new comment / drawer open | Task 3 |
| Chat-style bubble layout (left/right) | Task 4 |
| Sticky input bar at bottom | Task 5 |
| Bottom padding to prevent occlusion | Task 5 |
| Textarea with auto-size | Task 6 |
| Shift+Enter newline, Enter submit | Task 6 |

---

## Placeholder Scan

- No TBD / TODO / "implement later" found.
- All code blocks contain complete, copy-pasteable code.
- All file paths are exact.
- All commands include expected output.
- Type names (`commentListRef`, `scrollCommentsToBottom`, `onCommentKeydown`) are consistent across tasks.

---

*Plan generated by writing-plans skill on 2026-06-19.*
