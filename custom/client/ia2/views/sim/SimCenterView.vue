<!-- overlay/custom/client/ia2/views/sim/SimCenterView.vue -->
<!-- 推演中心壳（B1·三中心重构波 2 首件）：顶部六签单层页签 + 内容区。
     六签路由与挂面冻结自 docs/superpowers/specs/2026-10-16-sim-center-detailed-design.md：
     签 1 轮次总览 /app/sim（默认签）、签 2 监督面板、签 3 运行观测、签 4 证据库、
     签 5 交付健康、签 6 需求追溯——六条兄弟路由共用本组件（workbench 复用模式，
     当前签由路由名单一推导）。本壳只含导航与占位空态：签内容（数据面）由
     B2-B7 逐签实装，占位文案注明各签将消费的 X1 已就绪端点（正身=custom/server/
     simcenter 控制器族，X1 已合入）。场景编排挂面（/app/sim/orchestration，
     A8+D9）是壳层挂面非第七签，随其工单挂入。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSimTabsText } from './sim-tabs'

const route = useRoute()
const router = useRouter()
const text = useSimTabsText()

/** 六签单一事实源：路由名 + 该签将消费的 X1 端点清单（占位展示用，
 *  非数据面调用；端点全集见 simcenter-controller，POST 标注写法面） */
type TabKey = 'overview' | 'supervision' | 'ops' | 'evidence' | 'delivery' | 'trace'
interface SimTab { key: TabKey; name: string; endpoints: string[] }

const TABS: ReadonlyArray<SimTab> = [
  { key: 'overview', name: 'ia2.sim', endpoints: ['/api/hermes/sim/run-state', '/api/hermes/sim/deliverables', '/api/hermes/sim/issues'] },
  { key: 'supervision', name: 'ia2.simSupervision', endpoints: ['/api/hermes/sim/journal'] },
  { key: 'ops', name: 'ia2.simOps', endpoints: ['/api/hermes/sim/topology', '/api/hermes/sim/dispatcher-health', '/api/hermes/sim/sleeping-workers'] },
  { key: 'evidence', name: 'ia2.simEvidence', endpoints: ['/api/hermes/sim/anchor', 'POST /api/hermes/sim/evidence/mark'] },
  { key: 'delivery', name: 'ia2.simDelivery', endpoints: ['/api/hermes/sim/branches'] },
  { key: 'trace', name: 'ia2.simTrace', endpoints: ['/api/hermes/sim/trace'] },
]
type TabTextKey = 'tabOverview' | 'tabSupervision' | 'tabOps' | 'tabEvidence' | 'tabDelivery' | 'tabTrace'
const TAB_LABEL_KEY: Record<TabKey, TabTextKey> = {
  overview: 'tabOverview',
  supervision: 'tabSupervision',
  ops: 'tabOps',
  evidence: 'tabEvidence',
  delivery: 'tabDelivery',
  trace: 'tabTrace',
}

/** 当前签：由路由名推导（六条兄弟路由共用本组件）；未知名兜底默认签=轮次总览 */
const activeTab = computed<TabKey>(() =>
  TABS.find(t => t.name === String(route.name))?.key ?? 'overview',
)

/** 页签点击=路由切换（页签位置可分享/刷新保持；同签点击不产生导航） */
function goTab(tab: SimTab): void {
  if (tab.key === activeTab.value) return
  void router.push({ name: tab.name })
}
</script>

<template>
  <div class="sim-center">
    <header class="sim-center__head">
      <h2 class="sim-center__title">{{ text.shellTitle }}</h2>
      <nav class="sim-center__tabs" role="tablist" :aria-label="text.shellTitle">
        <button
          v-for="(tab, i) in TABS"
          :key="tab.key"
          type="button"
          role="tab"
          class="sim-center__tab"
          :class="{ 'sim-center__tab--active': activeTab === tab.key }"
          :aria-selected="activeTab === tab.key"
          :data-testid="`ia-sim-tab-${tab.key}`"
          @click="goTab(tab)"
        >
          {{ text[TAB_LABEL_KEY[tab.key]] }}
        </button>
      </nav>
    </header>

    <main class="sim-center__body">
      <!-- 六签占位（B1 壳：标题+空态说明+将消费端点；签内容 B2-B7 实装） -->
      <section
        v-for="(tab, i) in TABS"
        v-show="activeTab === tab.key"
        :key="tab.key"
        class="sim-center__panel"
        :data-testid="`ia-sim-panel-${tab.key}`"
      >
        <h3 class="sim-center__panel-title">签 {{ i + 1 }}·{{ text[TAB_LABEL_KEY[tab.key]] }}</h3>
        <p class="sim-center__pending">
          <span class="sim-center__badge">{{ text.pendingBadge }}</span>{{ text.pendingLead }}
        </p>
        <p class="sim-center__endpoints">{{ text.endpointsLead }}</p>
        <ul class="sim-center__endpoint-list">
          <li v-for="ep in tab.endpoints" :key="ep" class="sim-center__endpoint">{{ ep }}</li>
        </ul>
      </section>
    </main>
  </div>
</template>

<style scoped>
.sim-center {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  overflow: auto;
  gap: 12px;
}

.sim-center__head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.sim-center__title { margin: 0; font-size: 16px; }

/* 六签单层页签（无二级页签——全站单层纪律同 /app/board） */
.sim-center__tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.sim-center__tab {
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.sim-center__tab--active {
  border-color: var(--accent-primary, var(--color-primary, #3b82f6));
  background: var(--accent-bg, var(--hover-bg, rgba(127, 127, 127, 0.08)));
}

/* 占位面板（B1 壳空态） */
.sim-center__body { flex: 1; min-height: 0; }
.sim-center__panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 32px 20px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-standard, 6px);
}
.sim-center__panel-title { margin: 0; font-size: 15px; }
.sim-center__pending {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  line-height: 1.6;
}
.sim-center__badge {
  display: inline-block;
  margin-right: 8px;
  padding: 1px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-pill, 999px);
  font-size: 11px;
}
.sim-center__endpoints {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.sim-center__endpoint-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sim-center__endpoint {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
}
</style>
