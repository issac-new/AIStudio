<script setup lang="ts">
// IdeGitPane — IDE 工作区列的 Git 页签（对标 zcode git.* MVP 子集）。
//
// 变更分组列表（已暂存/未暂存/未跟踪）+ 选中文件 diff 视图 + 暂存/取消暂存
// + commit。REST 走 ideGitApi（/api/ide/git/*）。push/分支切换/Git 图谱列
// backlog（见 parity-analysis §二 G2）。
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdeStore } from '../store/ide'
import IdeGitLog from './IdeGitLog.vue'
import {
  ideGitApi,
  toGroups,
  type GitChange,
  type GitStatus,
  type GitChangeGroup,
} from '../api/git'

const ide = useIdeStore()
const { t } = useI18n()

const gitView = ref<'status' | 'graph'>('status')
const status = ref<GitStatus | null>(null)
const loading = ref(false)
const errorCode = ref<string | null>(null)
const errorMessage = ref('')
const selected = ref<{ file: string; staged: boolean } | null>(null)
const diffText = ref('')
const diffLoading = ref(false)
const commitMessage = ref('')
const committing = ref(false)
const actionError = ref('')

const KIND_CLASS: Record<GitChange['kind'], string> = {
  added: 'is-added',
  modified: 'is-modified',
  deleted: 'is-deleted',
  renamed: 'is-renamed',
  conflicted: 'is-conflicted',
  untracked: 'is-untracked',
}

type ChangeGroup = GitChangeGroup

const groups = computed(() => (status.value ? toGroups(status.value.changes) : []))
// 未解决的冲突（kind=conflicted）不计入可提交数：git 对 unmerged 拒绝 commit，
// 提前放行只会把 git 的报错挪到提交按钮上；解决（编辑后 git add）自动移出冲突组
const stagedCount = computed(() => status.value?.changes.filter((c) => c.kind !== 'untracked' && c.kind !== 'conflicted' && c.indexStatus !== ' ').length ?? 0)
const canCommit = computed(() => stagedCount.value > 0 && commitMessage.value.trim().length > 0 && !committing.value)
// M4：分支切换 + push（/api/ide/git/branches|checkout|push）
const branches = ref<Array<{ name: string; current: boolean }>>([])
const branchMenuOpen = ref(false)
const pushing = ref(false)
async function loadBranches(): Promise<void> {
  const root = ide.workspace
  if (!root) return
  try {
    const res = await ideGitApi.branches(root)
    branches.value = res.branches
  } catch { branchMenuOpen.value = false }
}
async function checkout(branch: string): Promise<void> {
  const root = ide.workspace
  branchMenuOpen.value = false
  if (!root) return
  try {
    await ideGitApi.checkout(root, branch)
    await refresh()
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
    errorCode.value = 'checkout_failed'
  }
}
async function push(): Promise<void> {
  const root = ide.workspace
  if (!root || pushing.value) return
  pushing.value = true
  try {
    await ideGitApi.push(root)
    await refresh()
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
    errorCode.value = 'push_failed'
  } finally {
    pushing.value = false
  }
}

const branchLabel = computed(() => {
  const s = status.value
  if (!s) return ''
  const aheadBehind = s.ahead || s.behind ? ` ↑${s.ahead} ↓${s.behind}` : ''
  return `${s.branch}${aheadBehind}`
})

async function refresh(): Promise<void> {
  const root = ide.workspace
  diffRequestSeq++ // 刷新作废在途 diff 响应（列表已重建，选中态清空）
  selected.value = null
  diffText.value = ''
  if (!root) {
    status.value = null
    errorCode.value = null
    return
  }
  loading.value = true
  errorCode.value = null
  try {
    status.value = await ideGitApi.status(root)
  } catch (err) {
    status.value = null
    // 错误码判别走 duck-typing：ideGitApi 包装为 GitApiError，但底层
    // request 抛出的原始错误同样携带 code 字段，两者都要落到面板错误态
    const code = (err as { code?: unknown }).code
    if (typeof code === 'string' && code) {
      errorCode.value = code
      errorMessage.value = err instanceof Error ? err.message : String(err)
    } else {
      errorCode.value = 'request_failed'
      errorMessage.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    loading.value = false
  }
}

// diff 请求序号：慢响应晚归会覆盖新选择的内容（out-of-order response），
// 每次新选择/刷新递增，过期响应按序号丢弃。
let diffRequestSeq = 0

async function selectChange(change: GitChange, staged: boolean): Promise<void> {
  if (!ide.workspace) return
  const seq = ++diffRequestSeq
  selected.value = { file: change.file, staged }
  diffLoading.value = true
  diffText.value = ''
  try {
    const result = await ideGitApi.diff(ide.workspace, change.file, staged)
    if (seq !== diffRequestSeq) return
    diffText.value = result.diff
  } catch (err) {
    if (seq !== diffRequestSeq) return
    diffText.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (seq === diffRequestSeq) diffLoading.value = false
  }
}

async function stage(change: GitChange, staged: boolean): Promise<void> {
  if (!ide.workspace) return
  actionError.value = ''
  try {
    await ideGitApi.stage(ide.workspace, [change.file], staged)
    await refresh()
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err)
  }
}

async function stageGroup(group: ChangeGroup): Promise<void> {
  if (!ide.workspace) return
  actionError.value = ''
  try {
    await ideGitApi.stage(ide.workspace, group.changes.map((c) => c.file), group.key !== 'staged')
    await refresh()
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err)
  }
}

async function commit(): Promise<void> {
  if (!ide.workspace || !canCommit.value) return
  actionError.value = ''
  committing.value = true
  try {
    await ideGitApi.commit(ide.workspace, commitMessage.value.trim())
    commitMessage.value = ''
    await refresh()
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : String(err)
  } finally {
    committing.value = false
  }
}

/** diff 文本 → 行数组（含前缀符），模板按前缀着色 */
const diffLines = computed(() =>
  diffText.value ? diffText.value.split('\n') : [],
)

watch(() => ide.workspace, () => { void refresh() })
onMounted(() => { void refresh() })

defineExpose({ refresh, toGroups })
</script>

<template>
  <div class="ide-git">
    <header class="ide-git__head">
      <span class="ide-git__branch" :title="status?.upstream ?? ''">{{ branchLabel || '—' }}</span>
      <div class="ide-git__viewtabs" role="tablist">
        <button type="button" class="ide-git__viewtab" :class="{ 'is-active': gitView === 'status' }" data-testid="ide-git-view-status" @click="gitView = 'status'">{{ t('ide.gitViewStatus') }}</button>
        <button type="button" class="ide-git__viewtab" :class="{ 'is-active': gitView === 'graph' }" data-testid="ide-git-view-graph" @click="gitView = 'graph'">{{ t('ide.gitViewGraph') }}</button>
      </div>
      <div class="ide-git__branch-switch">
        <button type="button" class="ide-git__mini" data-testid="ide-git-branch-toggle" :title="t('ide.gitBranchSwitcher')" @click="branchMenuOpen = !branchMenuOpen; branchMenuOpen && loadBranches()">⎇</button>
        <ul v-if="branchMenuOpen" class="ide-git__branch-menu" data-testid="ide-git-branch-menu">
          <li v-for="b in branches" :key="b.name" :class="{ 'is-current': b.current }" @click="!b.current && checkout(b.name)">
            {{ b.current ? '● ' : '' }}{{ b.name }}
          </li>
        </ul>
      </div>
      <button type="button" class="ide-git__mini" data-testid="ide-git-push" :disabled="pushing" :title="t('ide.gitPush')" @click="push">{{ pushing ? '…' : '↑' }}</button>
      <button
        type="button"
        class="ide-git__refresh"
        :title="t('ide.gitRefresh')"
        :disabled="loading"
        @click="refresh"
      >⟳</button>
    </header>
    <IdeGitLog v-if="gitView === 'graph'" class="ide-git__graph" />

    <div v-if="!ide.workspace && gitView === 'status'" class="ide-git__state">{{ t('ide.gitNeedWorkspace') }}</div>
    <div v-else-if="loading" class="ide-git__state">{{ t('ide.loading') }}</div>
    <div v-else-if="errorCode === 'not_a_repo'" class="ide-git__state">{{ t('ide.gitNotRepo') }}</div>
    <div v-else-if="errorCode" class="ide-git__state ide-git__state--error">
      {{ t('ide.gitError', { message: errorMessage }) }}
    </div>
    <template v-else>
      <div class="ide-git__changes">
        <div v-if="!groups.length" class="ide-git__state">{{ t('ide.gitEmpty') }}</div>
        <section v-for="group in groups" :key="group.key" class="ide-git__group">
          <div class="ide-git__group-head">
            <span>{{ t(group.labelKey) }} ({{ group.changes.length }})</span>
            <button
              type="button"
              class="ide-git__group-action"
              @click="stageGroup(group)"
            >{{ group.key === 'staged' ? t('ide.gitUnstageAll') : t('ide.gitStageAll') }}</button>
          </div>
          <button
            v-for="change in group.changes"
            :key="group.key + change.file"
            type="button"
            class="ide-git__change"
            :class="{ 'is-selected': selected?.file === change.file && selected?.staged === (group.key === 'staged') }"
            @click="selectChange(change, group.key === 'staged')"
          >
            <span class="ide-git__kind" :class="KIND_CLASS[change.kind]">{{ change.kind[0].toUpperCase() }}</span>
            <span class="ide-git__file" :title="change.renamedFrom ? `${change.renamedFrom} → ${change.file}` : change.file">
              {{ change.file }}
            </span>
            <!-- 冲突行：＋= 编辑解决后 git add 标记已解决；不给「−」——restore --staged
                 会把 index 重置回 HEAD，对 unmerged 是误导操作 -->
            <span
              v-if="group.key === 'conflicted'"
              class="ide-git__stage-btn"
              :title="t('ide.gitMarkResolved')"
              data-testid="ide-git-conflict-resolve"
              @click.stop="stage(change, true)"
            >＋</span>
            <span
              v-else
              class="ide-git__stage-btn"
              :title="group.key === 'staged' ? t('ide.gitUnstage') : t('ide.gitStage')"
              @click.stop="stage(change, group.key !== 'staged')"
            >{{ group.key === 'staged' ? '−' : '＋' }}</span>
          </button>
        </section>
      </div>

      <div class="ide-git__diff">
        <div class="ide-git__diff-head">
          <span class="ide-git__diff-file">{{ selected?.file ?? t('ide.gitDiffEmpty') }}</span>
          <span v-if="selected?.staged" class="ide-git__diff-tag">{{ t('ide.gitStaged') }}</span>
        </div>
        <div v-if="diffLoading" class="ide-git__state">{{ t('ide.loading') }}</div>
        <pre v-else-if="diffLines.length" class="ide-git__diff-body"><code
          v-for="(line, index) in diffLines"
          :key="index"
          class="ide-git__diff-line"
          :class="line.startsWith('+') ? 'is-add' : line.startsWith('-') ? 'is-del' : line.startsWith('@@') ? 'is-hunk' : ''"
        >{{ line }}</code></pre>
        <div v-else class="ide-git__state">{{ selected ? t('ide.gitNoDiff') : t('ide.gitDiffEmpty') }}</div>
      </div>

      <footer class="ide-git__commit">
        <div v-if="actionError" class="ide-git__commit-error">{{ actionError }}</div>
        <textarea
          v-model="commitMessage"
          class="ide-git__commit-input"
          rows="2"
          :placeholder="t('ide.gitCommitPlaceholder')"
        />
        <button
          type="button"
          class="ide-git__commit-btn"
          :disabled="!canCommit"
          @click="commit"
        >{{ t('ide.gitCommit') }} ({{ stagedCount }})</button>
      </footer>
    </template>
  </div>
</template>

<style scoped lang="scss">
.ide-git {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.ide-git__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.ide-git__branch {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-family: Menlo, Monaco, 'Courier New', monospace;
  color: var(--accent-primary, #4cc9f0);
}

.ide-git__refresh {
  padding: 2px 8px;
  font: inherit;
  color: var(--text-muted, #9aa0aa);
  background: transparent;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 4px;
  cursor: pointer;

  &:hover:not(:disabled) { color: var(--text-primary, #e6e6e6); }
  &:disabled { opacity: 0.4; }
}

.ide-git__state {
  padding: 18px 12px;
  font-size: 12px;
  color: var(--text-muted, #9aa0aa);
  text-align: center;
}

.ide-git__state--error { color: #e5484d; }

.ide-git__changes {
  flex-shrink: 0;
  max-height: 42%;
  overflow-y: auto;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.ide-git__group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px 2px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #9aa0aa);
}

.ide-git__group-action {
  font: inherit;
  font-size: 11px;
  color: var(--accent-primary, #4cc9f0);
  background: transparent;
  border: none;
  cursor: pointer;
}

.ide-git__change {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  font: inherit;
  font-size: 12px;
  color: var(--text-primary, #e6e6e6);
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;

  &.is-selected { background: var(--accent-primary-soft, rgba(76, 201, 240, 0.14)); }
  &:hover { background: rgba(255, 255, 255, 0.04); }
}

.ide-git__kind {
  flex-shrink: 0;
  width: 14px;
  font-size: 10px;
  font-weight: 700;

  &.is-added { color: #46a758; }
  &.is-modified { color: #f5a623; }
  &.is-deleted { color: #e5484d; }
  &.is-renamed { color: #8b8bf7; }
  &.is-conflicted { color: #e5484d; }
  &.is-untracked { color: #9aa0aa; }
}

.ide-git__file {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: Menlo, Monaco, 'Courier New', monospace;
}

.ide-git__stage-btn {
  flex-shrink: 0;
  padding: 0 6px;
  color: var(--text-muted, #9aa0aa);
  border-radius: 3px;

  &:hover { color: var(--accent-primary, #4cc9f0); }
}

.ide-git__diff {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ide-git__diff-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.ide-git__diff-file {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-family: Menlo, Monaco, 'Courier New', monospace;
  color: var(--text-muted, #9aa0aa);
}

.ide-git__diff-tag {
  flex-shrink: 0;
  padding: 0 6px;
  font-size: 10px;
  color: var(--accent-primary, #4cc9f0);
  border: 1px solid currentColor;
  border-radius: 8px;
}

.ide-git__diff-body {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 6px 0;
  overflow: auto;
  font-family: Menlo, Monaco, 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.5;
}

.ide-git__diff-line {
  display: block;
  padding: 0 10px;
  white-space: pre;
  color: var(--text-primary, #e6e6e6);

  &.is-add { color: #4cc38a; background: rgba(70, 167, 88, 0.12); }
  &.is-del { color: #e5484d; background: rgba(229, 72, 77, 0.1); }
  &.is-hunk { color: #7ca2df; }
}

.ide-git__commit {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
  padding: 8px 10px;
  border-top: 1px solid var(--border-color, #e0e0e0);
}

.ide-git__commit-error {
  flex-basis: 100%;
  font-size: 11px;
  color: #e5484d;
}

.ide-git__commit-input {
  flex: 1;
  resize: none;
  padding: 6px 8px;
  font: inherit;
  font-size: 12px;
  color: var(--text-primary, #e6e6e6);
  background: var(--bg-primary, #14161a);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 4px;
  outline: none;

  &:focus { border-color: var(--accent-primary, #4cc9f0); }
}

.ide-git__commit-btn {
  align-self: flex-end;
  padding: 6px 12px;
  font: inherit;
  font-size: 12px;
  color: var(--text-primary, #e6e6e6);
  background: var(--accent-primary, #4cc9f0);
  border: none;
  border-radius: 4px;
  cursor: pointer;

  &:disabled { opacity: 0.4; cursor: not-allowed; }
}

.ide-git__viewtabs {
  display: inline-flex;
  gap: 2px;
  margin: 0 4px;
  padding: 2px;
  border-radius: 6px;
  background: var(--bg-primary, #14161a);
}

.ide-git__viewtab {
  height: 18px;
  padding: 0 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted, #9aa0aa);
  font-size: 11px;
  cursor: pointer;

  &.is-active { background: var(--bg-tertiary, #ebebeb); color: var(--text-primary, #e6e6e6); }
}

.ide-git__graph { flex: 1; min-height: 0; }

.ide-git__branch-switch { position: relative; display: inline-flex; }

.ide-git__branch-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 20;
  min-width: 160px;
  max-height: 240px;
  overflow-y: auto;
  margin: 2px 0 0;
  padding: 4px;
  list-style: none;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 7px;
  background: var(--bg-secondary, #1b1e24);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);

  li {
    padding: 4px 8px;
    border-radius: 5px;
    font-size: 12px;
    color: var(--text-primary, #e6e6e6);
    cursor: pointer;

    &:hover { background: var(--bg-tertiary, #ebebeb); }
    &.is-current { color: var(--accent-primary, #4cc9f0); cursor: default; }
  }
}

.ide-git__mini {
  height: 20px;
  min-width: 24px;
  padding: 0 6px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted, #9aa0aa);
  font-size: 11px;
  cursor: pointer;

  &:hover:not(:disabled) { color: var(--text-primary, #e6e6e6); border-color: var(--accent-primary, #4cc9f0); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
</style>