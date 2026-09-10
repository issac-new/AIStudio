<!-- overlay/custom/client/ia2/components/SpecList.vue -->
<!-- 模板卡片列表（P3 Task 6，spec §8 编排"先只读展示"）：
     卡片 = 名称/版本/节点数/模板种类描述，主动作「创建 loop」（R4 三步内跑起来
     的第一步）。组件薄壳：数据由父层（OrchestrateView）注入，只展示与转发事件。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { SpecCard, SpecTemplateKind } from '../adapters/orchestrate'

const props = defineProps<{
  cards: SpecCard[]
  /** 首拉完成前不判空（空态防闪） */
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'open', card: SpecCard): void
  (e: 'create', card: SpecCard): void
}>()

const { t } = useI18n()

function kindLabel(kind: SpecTemplateKind): string {
  return t(`ia2.orchestrate.kind.${kind}`)
}

function descLabel(kind: SpecTemplateKind): string {
  return t(`ia2.orchestrate.desc.${kind}`)
}
</script>

<template>
  <div class="spec-list" data-spec-list>
    <div v-if="props.cards.length === 0 && !props.loading" class="spec-list__empty" data-spec-list-empty>
      <p class="spec-list__empty-title">{{ t('ia2.orchestrate.empty.title') }}</p>
      <p class="spec-list__empty-hint">{{ t('ia2.orchestrate.empty.hint') }}</p>
    </div>

    <div v-else class="spec-list__grid">
      <article
        v-for="card in props.cards"
        :key="card.id"
        class="spec-card"
        :class="`spec-card--${card.kind}`"
        :data-spec-card="card.id"
        @click="emit('open', card)"
      >
        <header class="spec-card__head">
          <span class="spec-card__kind">{{ kindLabel(card.kind) }}</span>
          <span v-if="card.version > 0" class="spec-card__version">v{{ card.version }}</span>
        </header>
        <h3 class="spec-card__name">{{ card.name }}</h3>
        <p class="spec-card__desc">{{ descLabel(card.kind) }}</p>
        <footer class="spec-card__foot">
          <span class="spec-card__meta">
            {{ card.nodeCount }} {{ t('ia2.orchestrate.nodes') }}
            · {{ card.edgeCount }} {{ t('ia2.orchestrate.edges') }}
          </span>
          <button class="spec-card__create" @click.stop="emit('create', card)">
            {{ t('ia2.orchestrate.createLoop') }}
          </button>
        </footer>
      </article>
    </div>
  </div>
</template>

<style scoped>
.spec-list { min-height: 0; }
.spec-list__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.spec-list__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 48px 16px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-standard, 6px);
  text-align: center;
}
.spec-list__empty-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--text-primary); }
.spec-list__empty-hint { margin: 0; font-size: 12px; color: var(--text-muted, var(--color-text-secondary, #878c99)); }

.spec-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-standard, 6px);
  background: var(--bg-card);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.spec-card:hover {
  border-color: var(--accent-primary, var(--color-primary, #3b82f6));
  box-shadow: 0 0 0 1px var(--accent-primary, var(--color-primary, #3b82f6));
}
.spec-card:focus-visible {
  outline: 2px solid var(--accent-primary, var(--color-primary, #3b82f6));
  outline-offset: -2px;
}
.spec-card__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.spec-card__kind {
  padding: 1px 8px;
  border-radius: var(--radius-pill, 999px);
  background: var(--bg-secondary);
  font-size: 11px;
  color: var(--text-secondary);
}
.spec-card--daily-brief .spec-card__kind { color: var(--color-warning, #f59e0b); }
.spec-card__version {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.spec-card__name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.spec-card__desc {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.spec-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 6px;
}
.spec-card__meta { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--text-secondary); }
.spec-card__create {
  padding: 3px 10px;
  border: 1px solid var(--accent-primary, var(--color-primary, #3b82f6));
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: var(--accent-primary, var(--color-primary, #3b82f6));
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.spec-card__create:hover {
  background: var(--accent-primary, var(--color-primary, #3b82f6));
  color: var(--color-on-accent, #fff);
}
</style>
