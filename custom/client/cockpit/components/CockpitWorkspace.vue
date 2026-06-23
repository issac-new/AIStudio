<script setup lang="ts">
import { computed } from 'vue'
import { useCockpitStore, type WorkDecision } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'
import CockpitFileTree from './CockpitFileTree.vue'

const store = useCockpitStore()
const { t } = useI18n()
defineEmits<{ (e: 'submit'): void; (e: 'later'): void }>()

interface DecisionOption {
  key: WorkDecision
  labelKey: string
  descKey?: string
  recommended?: boolean
}
const decisions: DecisionOption[] = [
  { key: 'conditional', labelKey: 'cockpit.decisionConditional', descKey: 'cockpit.decisionConditionalDesc', recommended: true },
  { key: 'reject', labelKey: 'cockpit.decisionReject' },
  { key: 'approve', labelKey: 'cockpit.decisionApprove' },
]

const ALL_TAGS = ['concurrency', 'test-gap', 'performance', 'compatibility']

const workItem = computed(() => store.workItemForSelectedTask)
const hasTask = computed(() => !!store.selectedTask)
const templateName = computed(() => store.templates[0]?.name ?? 'PR-审核-v1')
const templateDiffs = computed(() => 2)
const isReadOnly = computed(() => store.archivedMode)
</script>

<template>
  <div class="cockpit-workspace">
    <div class="cockpit-workspace__form">
      <div v-if="hasTask && workItem" class="cockpit-workspace__body">
        <!-- 待办 banner -->
        <div class="cockpit-workspace__banner" :class="{ 'is-archived': isReadOnly }">
          <span class="cockpit-workspace__banner-dot" />
          <div>
            <div class="cockpit-workspace__banner-title">{{ store._attentionFocusTitle || t('cockpit.pendingTodo') }}</div>
            <div class="cockpit-workspace__banner-sub">{{ store._attentionFocusDesc || workItem.opinion }}</div>
          </div>
        </div>

        <!-- 模板提示 -->
        <div class="cockpit-workspace__ref">
          {{ t('cockpit.basedOnTemplate', { tpl: templateName, n: templateDiffs }) }}
        </div>

        <!-- 修改文件列表（从 workItem 动态渲染）-->
        <div class="cockpit-workspace__files">
          <span class="cockpit-workspace__files-label">{{ t('cockpit.modified') || 'Modified' }}</span>
          <span v-for="f in (workItem.modifiedFiles ?? [])" :key="f" class="cockpit-workspace__file">{{ f }}</span>
        </div>

        <!-- 决定 -->
        <div class="cockpit-workspace__field">
          <label class="cockpit-workspace__label">{{ t('cockpit.yourDecision') }} *</label>
          <button
            v-for="d in decisions"
            :key="d.key"
            type="button"
            :data-decision="d.key"
            class="cockpit-workspace__opt"
            :class="{ 'is-selected': workItem.decision === d.key }"
            @click="store.updateWorkItem({ decision: d.key })"
          >
            <span class="cockpit-workspace__opt-dot" />
            <span class="cockpit-workspace__opt-info">
              <span class="cockpit-workspace__opt-header">
                <span class="cockpit-workspace__opt-name">{{ t(d.labelKey) }}</span>
                <span v-if="d.recommended" class="cockpit-workspace__opt-rec">{{ t('cockpit.recommend') }}</span>
              </span>
              <span v-if="d.descKey" class="cockpit-workspace__opt-desc">{{ t(d.descKey) }}</span>
            </span>
          </button>
        </div>

        <!-- 风险标签 -->
        <div class="cockpit-workspace__field">
          <label class="cockpit-workspace__label">{{ t('cockpit.riskTags') }} <span class="cockpit-workspace__sub">{{ t('cockpit.agentPrefilled') }}</span></label>
          <div class="cockpit-workspace__chips">
            <button
              v-for="tag in ALL_TAGS"
              :key="tag"
              type="button"
              :data-tag="tag"
              class="cockpit-workspace__chip"
              :class="{ 'is-on': workItem.riskTags.includes(tag) }"
              @click="store.toggleRiskTag(tag)"
            >{{ tag }}</button>
          </div>
        </div>

        <!-- 评估打分 -->
        <div class="cockpit-workspace__field">
          <label class="cockpit-workspace__label">{{ t('cockpit.reviewOpinion') }} · 评估</label>
          <div class="cockpit-workspace__score">
            <button v-for="n in 5" :key="n" type="button" class="cockpit-workspace__star" :class="{ 'is-on': (workItem.score ?? 0) >= n }" @click="store.updateWorkItem({ score: n })">★</button>
          </div>
        </div>

        <!-- 评审意见 -->
        <div class="cockpit-workspace__field">
          <label class="cockpit-workspace__label">{{ t('cockpit.reviewOpinion') }}</label>
          <textarea
            class="cockpit-workspace__textarea"
            :value="workItem.opinion"
            @input="store.updateWorkItem({ opinion: ($event.target as HTMLTextAreaElement).value })"
          />
        </div>
      </div>
      <div v-else class="cockpit-workspace__empty">{{ t('cockpit.noWorkItem') }}</div>

      <!-- 底部操作 -->
      <div class="cockpit-workspace__foot">
        <template v-if="!isReadOnly">
          <button type="button" class="cockpit-workspace__btn" @click="store.openTemplateManager()">📋 {{ t('cockpit.templateManager') }}</button>
          <button type="button" class="cockpit-workspace__btn" @click="store.enterTerminal()">⌘ {{ t('cockpit.modeTerm') }}</button>
          <button type="button" class="cockpit-workspace__btn" @click="$emit('later')">{{ t('cockpit.handleLater') }}</button>
          <button type="button" data-action="submit" class="cockpit-workspace__btn is-pri" @click="$emit('submit')">{{ t('cockpit.submit') }}</button>
        </template>
        <button v-else type="button" class="cockpit-workspace__btn is-pri" @click="store.openTemplateManager()">{{ t('cockpit.newCollabFromArchive') }}</button>
      </div>
    </div>

    <!-- 文件资源管理器 -->
    <CockpitFileTree />
  </div>
</template>

<style scoped lang="scss">
.cockpit-workspace { display: flex; flex: 1; min-height: 0; }
.cockpit-workspace__form { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cockpit-workspace__body { flex: 1; overflow-y: auto; padding: 20px 24px; max-width: 640px; }
.cockpit-workspace__banner-title { font-size: 13px; }
.cockpit-workspace__label { font-size: 13px; }
.cockpit-workspace__empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 12px; }
.cockpit-workspace__banner { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 8px; background: rgba(var(--warning-rgb), 0.08); border: 1px solid rgba(var(--warning-rgb), 0.3); margin-bottom: 16px; }
.cockpit-workspace__banner-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--warning); margin-top: 4px; flex-shrink: 0; }
.cockpit-workspace__banner-title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.cockpit-workspace__banner-sub { font-size: 10px; color: var(--text-muted); margin-top: 2px; }
.cockpit-workspace__banner.is-archived {
  background: var(--bg-secondary);
  border-color: var(--border-color);
  .cockpit-workspace__banner-dot { background: var(--text-muted); }
}
.cockpit-workspace__ref { background: var(--bg-secondary); border-radius: 6px; padding: 8px 11px; font-size: 11px; color: var(--text-secondary); margin-bottom: 14px; }
.cockpit-workspace__files { display: flex; align-items: center; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
.cockpit-workspace__files-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; }
.cockpit-workspace__file { font-family: ui-monospace, monospace; font-size: 10px; background: var(--bg-secondary); padding: 2px 7px; border-radius: 3px; color: var(--text-secondary); }
.cockpit-workspace__field { margin-bottom: 16px; }
.cockpit-workspace__label { display: block; font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.cockpit-workspace__sub { font-size: 10px; color: var(--text-muted); font-weight: 400; margin-left: 6px; }
.cockpit-workspace__opt { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 6px; cursor: pointer; background: var(--bg-card); font: inherit; color: var(--text-primary); width: 100%; text-align: left;
  &:hover { border-color: var(--text-muted); }
  &.is-selected { border-color: var(--accent-primary); background: var(--bg-secondary); }
}
.cockpit-workspace__opt-dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--text-muted); flex-shrink: 0; margin-top: 1px; }
.is-selected .cockpit-workspace__opt-dot { border-color: var(--accent-primary); background: radial-gradient(var(--accent-primary) 45%, transparent 50%); }
.cockpit-workspace__opt-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cockpit-workspace__opt-header { display: flex; align-items: center; gap: 8px; }
.cockpit-workspace__opt-name { font-size: 13px; font-weight: 600; }
.cockpit-workspace__opt-rec { font-size: 9px; padding: 1px 6px; border-radius: 3px; background: var(--accent-primary); color: var(--text-on-accent); font-weight: 600; white-space: nowrap; }
.cockpit-workspace__opt-desc { font-size: 11px; color: var(--text-muted); line-height: 1.4; }
.cockpit-workspace__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cockpit-workspace__chip { font-size: 12px; padding: 4px 12px; border: 1px solid var(--border-color); border-radius: 14px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font: inherit;
  &:hover { border-color: var(--text-muted); }
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}
.cockpit-workspace__textarea { width: 100%; font-family: inherit; font-size: 13px; border: 1px solid var(--border-color); border-radius: 6px; padding: 7px 10px; background: var(--bg-card); color: var(--text-primary); min-height: 64px; resize: vertical; }
.cockpit-workspace__foot { flex-shrink: 0; padding: 12px 16px; border-top: 1px solid var(--border-color); background: var(--bg-card); display: flex; gap: 8px; }
.cockpit-workspace__btn { font-family: inherit; font-size: 13px; border-radius: 6px; padding: 6px 14px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-secondary); cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
  &.is-pri { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); font-weight: 600; }
}

.cockpit-workspace__form.is-readonly .cockpit-workspace__body { opacity: 0.5; pointer-events: none; }
.cockpit-workspace__score { display: flex; gap: 4px; }
.cockpit-workspace__star { font-size: 20px; color: var(--border-color); cursor: pointer; border: none; background: none; font: inherit; padding: 0;
  &.is-on { color: var(--warning); }
}
</style>
