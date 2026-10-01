<!-- overlay/custom/client/ia2/views/gov/GovDocsReviewView.vue -->
<!-- 文档评审（2026-10-01 单层页签重构）：原治理中心二级分区五升平级页签。
     板块=治理工件库（四组清单+markdown 全文，KanbanMarkdown 复用）· 待裁决评审
     （G2 语义就地裁决，approvals API review 域）· 管理维护（应用资产表+组织关系，
     保存即提交 git）。数据真仓实查（/api/governance/*，缺失如实灰态不编造）。
     testid 沿用原 GovernanceView（gov-docs/gov-doc-*/gov-reviews/…），
     守门测试随迁不断代。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import KanbanMarkdown from '@/custom/kanban/components/KanbanMarkdown.vue'
import AppRegistryEditor from '../../components/gov/AppRegistryEditor.vue'
import OrgEditor from '../../components/gov/OrgEditor.vue'
import {
  fetchGovernanceOverview, fetchGovernanceDoc,
  type GovernanceOverview, type GovernanceDoc,
} from '@/custom/governance/api/governance'
import { governanceMessages } from '@/custom/governance/i18n'
import {
  fetchPendingApprovals, dedupePending, decideApproval, type PendingApprovalItem,
} from '@/custom/cockpit/api/approvals'
import { useTasksTabsText } from '../../i18n-tasks-tabs'

const i18nCtx = useI18n()
/** 文案单一事实源=custom/governance/i18n.ts；legacy i18n 无 mergeLocaleMessage，
 *  组件内按当前 locale 选表（zh* → zh，其余 en）。 */
const L = computed(() => {
  const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
  return loc.startsWith('zh') ? governanceMessages.zh.governance : governanceMessages.en.governance
})
const tabText = useTasksTabsText()

const overview = ref<GovernanceOverview | null>(null)
const selectedKind = ref('')
const doc = ref<GovernanceDoc | null>(null)
const error = ref('')
const loading = ref(false)
const reviews = ref<PendingApprovalItem[]>([])
const acting = ref<Set<string>>(new Set())

/** 工件库四组（单一事实源=server GOVERNANCE_DOCS.group 值；标题本地化） */
const DOC_GROUPS: Array<{ key: string; zh: string }> = [
  { key: 'gate', zh: '六闸工件' },
  { key: 'admin', zh: '管理档案' },
  { key: 'analysis', zh: '分析档案' },
  { key: 'evidence', zh: '测试证据' },
]
const docGroups = computed(() =>
  DOC_GROUPS.map(g => ({ ...g, docs: (overview.value?.docs ?? []).filter(d => (d.group || 'gate') === g.key) }))
    .filter(g => g.docs.length))

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    overview.value = await fetchGovernanceOverview()
    const pending = await fetchPendingApprovals()
    reviews.value = dedupePending(pending.items ?? []).filter((i) => i.kind === 'review')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function openDoc(kind: string): Promise<void> {
  selectedKind.value = kind
  doc.value = null
  error.value = ''
  try {
    doc.value = await fetchGovernanceDoc(kind)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function decide(item: PendingApprovalItem, decision: 'approve' | 'request_changes'): Promise<void> {
  if (acting.value.has(item.id)) return
  acting.value = new Set(acting.value).add(item.id)
  try {
    await decideApproval(item.id, decision)
    await refresh()
  } finally {
    const next = new Set(acting.value)
    next.delete(item.id)
    acting.value = next
  }
}

function fmtTime(ts: number): string {
  return ts ? new Date(ts).toLocaleString('zh-CN') : ''
}

onMounted(() => void refresh())
</script>

<template>
  <div class="ia-area gov-docs" data-testid="ia-tasks-panel-gov-docs">
    <div class="gov-docs__bar">
      <div>
        <h2 class="gov-docs__title">{{ tabText.tabGovDocs }}</h2>
        <p class="gov-docs__sub">{{ L.pageSub }}<template v-if="overview">
          · {{ L.repoLabel }}: {{ overview.repo }}</template></p>
      </div>
      <button type="button" class="gov-docs__refresh" data-testid="gov-refresh" :disabled="loading" @click="refresh()">
        {{ loading ? '⏳ …' : '⟳ ' + L.refresh }}
      </button>
    </div>

    <div v-if="error" class="gov-docs__error" data-testid="gov-error">{{ L.loadFailed }}：{{ error }}</div>

    <div class="gov-docs__main">
      <!-- 左：工件清单 -->
      <aside class="gov-docs__list" data-testid="gov-docs">
        <h3 class="gov-docs__list-title">{{ L.docsTitle }}</h3>
        <template v-for="g in docGroups" :key="g.key">
          <div class="gov-docs__group-title" :data-group="g.key">{{ g.zh }}</div>
          <button
            v-for="d in g.docs"
            :key="d.kind"
            type="button"
            class="gov-docs__doc"
            :class="{ 'is-selected': selectedKind === d.kind, 'is-missing': !d.exists }"
            :data-testid="`gov-doc-${d.kind}`"
            :disabled="!d.exists"
            @click="openDoc(d.kind)"
          >
            <span class="gov-docs__doc-title">{{ d.title }}</span>
            <span class="gov-docs__doc-meta">{{ d.exists ? (d.ref ? d.ref.replace('origin/', '') + ' · ' : '') + d.commit : L.missing }}</span>
          </button>
        </template>
      </aside>

      <!-- 右：文档全文 + 待裁决 -->
      <section class="gov-docs__content">
        <div v-if="doc" class="gov-docs__docview">
          <div class="gov-docs__docview-hd">
            <b>{{ doc.title }}</b>
            <span class="gov-docs__docview-meta">
              {{ `${doc.markdown.split('\n').length} 行 · ${doc.commit} · ${doc.committedAt?.slice(0, 10)}` }}
            </span>
          </div>
          <div class="gov-docs__docview-body" data-testid="gov-doc-md">
            <KanbanMarkdown :source="doc.markdown" />
          </div>
        </div>
        <div v-else class="gov-docs__empty">{{ L.selectDoc }}</div>

        <!-- 待裁决评审（G2 语义就地裁决） -->
        <div class="gov-docs__reviews" data-testid="gov-reviews">
          <h3 class="gov-docs__list-title">{{ L.reviewsTitle }}<span v-if="reviews.length" class="gov-docs__count">{{ reviews.length }}</span></h3>
          <div v-if="!reviews.length" class="gov-docs__reviews-empty">{{ L.noReviews }}</div>
          <div v-for="item in reviews" :key="item.id" class="gov-docs__review-row" :data-testid="`gov-review-${item.id}`">
            <div class="gov-docs__review-main">
              <div class="gov-docs__review-title">{{ item.title }}</div>
              <div class="gov-docs__review-meta">{{ fmtTime(item.createdAt) }}<template v-if="item.taskId"> · {{ item.taskId }}</template></div>
            </div>
            <div class="gov-docs__review-actions">
              <button type="button" class="gov-docs__btn is-approve" :disabled="acting.has(item.id)" @click="decide(item, 'approve')">✓ {{ L.approve }}</button>
              <button type="button" class="gov-docs__btn is-reject" :disabled="acting.has(item.id)" @click="decide(item, 'request_changes')">✕ {{ L.reject }}</button>
            </div>
          </div>
        </div>
      </section>

      <!-- P7/P8 管理维护（补遗④）：应用资产表 + 组织关系，保存即提交 git（R13） -->
      <section class="gov-docs__admin" data-testid="gov-admin-maintain">
        <AppRegistryEditor />
        <OrgEditor />
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gov-docs {
  gap: 10px;
  padding: 12px 16px;
  overflow: auto;
}
.gov-docs__bar { display: flex; align-items: flex-start; gap: 10px; flex-shrink: 0; }
.gov-docs__title { margin: 0; font-size: 15px; font-weight: 600; }
.gov-docs__sub { margin: 2px 0 0; font-size: 11.5px; color: var(--text-muted, #878c99); }
.gov-docs__refresh {
  margin-left: auto; flex-shrink: 0;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  background: var(--bg-primary, #fff);
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  &:hover { background: var(--bg-secondary, #f1f2f4); }
  &:disabled { opacity: 0.6; cursor: wait; }
}
.gov-docs__error { color: #dc2626; font-size: 12px; }

.gov-docs__main {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 12px;
  min-height: 360px;
}
.gov-docs__list {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: auto;
  background: var(--bg-primary, #fff);
}
.gov-docs__list-title {
  margin: 0 0 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #878c99);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.gov-docs__doc {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 7px;
  background: var(--bg-primary, #fff);
  padding: 7px 9px;
  cursor: pointer;
  font-family: inherit;
  &:hover:not(:disabled) { background: var(--bg-secondary, #f1f2f4); }
  &.is-selected { border-color: var(--accent-primary, #3b82f6); background: rgba(59, 130, 246, 0.06); }
  &.is-missing { opacity: 0.5; cursor: not-allowed; }
}
.gov-docs__group-title {
  margin: 8px 0 2px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-muted, #878c99);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.gov-docs__doc-title { font-size: 12.5px; font-weight: 600; color: var(--text-primary, inherit); }
.gov-docs__doc-meta { font-size: 10.5px; color: var(--text-muted, #878c99); font-family: ui-monospace, monospace; }

.gov-docs__content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.gov-docs__docview {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  background: var(--bg-primary, #fff);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.gov-docs__docview-hd {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  font-size: 13px;
}
.gov-docs__docview-meta { font-size: 10.5px; color: var(--text-muted, #878c99); font-family: ui-monospace, monospace; }
.gov-docs__docview-body { padding: 12px 16px; overflow: auto; font-size: 12.5px; line-height: 1.7; }
.gov-docs__empty {
  border: 1px dashed var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 22px;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-muted, #878c99);
}
.gov-docs__reviews {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--bg-primary, #fff);
  flex-shrink: 0;
}
.gov-docs__reviews-empty {
  font-size: 12px;
  color: var(--text-muted, #878c99);
  padding: 4px 0;
}
.gov-docs__count {
  margin-left: 6px;
  font-size: 11px;
  color: var(--accent-primary, #3b82f6);
  font-weight: 600;
}
.gov-docs__review-row {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 7px;
  padding: 7px 9px;
}
.gov-docs__review-main { flex: 1; min-width: 0; }
.gov-docs__review-title { font-size: 12.5px; font-weight: 600; }
.gov-docs__review-meta { font-size: 10.5px; color: var(--text-muted, #878c99); }
.gov-docs__review-actions { display: flex; gap: 6px; }
.gov-docs__btn {
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  background: var(--bg-primary, #fff);
  font-family: inherit;
  &.is-approve { color: #059669; border: 1px solid #05966944; }
  &.is-reject { color: #dc2626; border: 1px solid #dc266444; }
  &:disabled { opacity: 0.5; cursor: wait; }
}
.gov-docs__admin { display: flex; flex-direction: column; gap: 14px; }

@media (max-width: 1100px) {
  .gov-docs__main { grid-template-columns: 1fr; }
}
</style>
