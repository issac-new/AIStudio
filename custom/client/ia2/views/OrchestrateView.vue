<!-- overlay/custom/client/ia2/views/OrchestrateView.vue -->
<!-- 编排区（P3 Task 6，spec §8 编排"先只读展示"，R4 三步内跑起来）：
     ①模板库列表（GET /api/graph/specs → 模板卡片，五阶段编译模板 + 每日 Brief 可见）
     ②点卡片进详情（本地选中态，不增设子路由）——GraphSpec 只读可视化（复用
       runcenter RunGraphCanvas 同一布局器）+ JSON 可折叠查看 + 导出（导入 P4 置灰）
     ③「创建 loop」弹层（名称/goal/执行节奏三字段 + 可选租户）→ POST /api/loop/loops
       → 跳运行列表——模板可见、拓扑可读、三步可跑。
     数据与校验经 adapters/orchestrate 纯函数；P4 画布编辑不在本期。 -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { runRest } from '@/custom/loop/runcenter/api'
import { loopRest } from '@/custom/loop/api/loop-rest'
import SpecList from '../components/SpecList.vue'
import SpecDetail from '../components/SpecDetail.vue'
import {
  projectSpecCard, validateInstantiateForm, buildCreatePayload,
  type GraphSpecLike, type SpecCard, type InstantiateError,
} from '../adapters/orchestrate'
import '@/custom/ia2/styles/ia2.scss'

const router = useRouter()
const { t } = useI18n()

// ── 模板库 ──
const specs = ref<GraphSpecLike[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const booted = ref(false)

async function loadSpecs(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    specs.value = await runRest.listSpecs()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
    booted.value = true
  }
}
onMounted(() => { void loadSpecs() })

const cards = computed<SpecCard[]>(() => specs.value.map(projectSpecCard))

// ── 详情：本地选中态（比子路由少一截路由表，刷新回列表可接受——模板库是入口页）──
const selectedId = ref<string | null>(null)
const selectedCard = computed<SpecCard | null>(() =>
  cards.value.find(c => c.id === selectedId.value) ?? null)
const selectedSpec = computed<GraphSpecLike | null>(() =>
  selectedId.value ? specs.value.find(s => s.id === selectedId.value) ?? null : null)

function openDetail(card: SpecCard): void {
  selectedId.value = card.id
}
function backToList(): void {
  selectedId.value = null
}

// ── 实例化弹层（R4 三步的第 3 步：填三字段 → POST → 跳运行列表）──
const createCard = ref<SpecCard | null>(null)
const form = reactive({ name: '', goal: '', cron: '0 9 * * *', tenant: '' })
const errors = ref<InstantiateError[]>([])
const submitting = ref(false)
const submitError = ref<string | null>(null)

const ERROR_KEYS: Record<InstantiateError, string> = {
  nameRequired: 'ia2.orchestrate.err.nameRequired',
  goalRequired: 'ia2.orchestrate.err.goalRequired',
  cronInvalid: 'ia2.orchestrate.err.cronInvalid',
}

function openCreate(card: SpecCard): void {
  createCard.value = card
  // 预填：名称取模板名（可改），goal 留空必填，cron 落常用日调度
  form.name = card.name
  form.goal = ''
  form.cron = '0 9 * * *'
  form.tenant = ''
  errors.value = []
  submitError.value = null
}
function closeCreate(): void {
  createCard.value = null
}

async function submitCreate(): Promise<void> {
  if (submitting.value) return
  submitError.value = null
  errors.value = validateInstantiateForm(form)
  if (errors.value.length > 0) return
  submitting.value = true
  try {
    await loopRest.createLoop(buildCreatePayload(form, Date.now()))
    // R4：创建即达——运行列表聚合新 loop 的运行状态
    await router.push('/app/runs')
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : String(e)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="ia-area ia-orchestrate">
    <header class="ia-orchestrate__head">
      <h2 class="ia-orchestrate__title">{{ t('ia2.orchestrate.title') }}</h2>
      <span v-if="!selectedCard" class="ia-orchestrate__hint">{{ t('ia2.orchestrate.listHint') }}</span>
      <span v-if="error" class="ia-orchestrate__error">
        {{ t('ia2.orchestrate.loadFailed') }}<code>{{ error }}</code>
        <button class="ia-orchestrate__retry" @click="loadSpecs">{{ t('ia2.orchestrate.retry') }}</button>
      </span>
    </header>

    <SpecDetail
      v-if="selectedCard"
      :card="selectedCard"
      :spec="selectedSpec"
      @back="backToList"
      @create="openCreate"
    />
    <SpecList
      v-else
      :cards="cards"
      :loading="loading && !booted"
      @open="openDetail"
      @create="openCreate"
    />

    <!-- 实例化弹层 -->
    <div v-if="createCard" class="oc-dialog" data-create-dialog>
      <div class="oc-dialog__overlay" @click="closeCreate" />
      <form class="oc-dialog__panel" @submit.prevent="submitCreate">
        <h3 class="oc-dialog__title">
          {{ t('ia2.orchestrate.form.title') }}
          <span class="oc-dialog__source">{{ createCard.name }}</span>
        </h3>

        <label class="oc-dialog__field">
          {{ t('ia2.orchestrate.form.name') }}
          <input v-model="form.name" data-form-name :placeholder="t('ia2.orchestrate.form.namePlaceholder')">
        </label>
        <span v-if="errors.includes('nameRequired')" class="oc-dialog__err">{{ t(ERROR_KEYS.nameRequired) }}</span>

        <label class="oc-dialog__field">
          {{ t('ia2.orchestrate.form.goal') }}
          <textarea v-model="form.goal" data-form-goal rows="3" :placeholder="t('ia2.orchestrate.form.goalPlaceholder')" />
        </label>
        <span v-if="errors.includes('goalRequired')" class="oc-dialog__err">{{ t(ERROR_KEYS.goalRequired) }}</span>

        <label class="oc-dialog__field">
          {{ t('ia2.orchestrate.form.cron') }}
          <input v-model="form.cron" data-form-cron :placeholder="t('ia2.orchestrate.form.cronPlaceholder')">
        </label>
        <span v-if="errors.includes('cronInvalid')" class="oc-dialog__err">{{ t(ERROR_KEYS.cronInvalid) }}</span>

        <label class="oc-dialog__field">
          {{ t('ia2.orchestrate.form.tenant') }}
          <input v-model="form.tenant" data-form-tenant :placeholder="t('ia2.orchestrate.form.tenantPlaceholder')">
        </label>

        <div v-if="submitError" class="oc-dialog__submit-error" data-submit-error>
          {{ t('ia2.orchestrate.err.submitFailed') }}<code>{{ submitError }}</code>
        </div>

        <div class="oc-dialog__actions">
          <button type="button" class="oc-dialog__cancel" @click="closeCreate">
            {{ t('ia2.orchestrate.form.cancel') }}
          </button>
          <button type="submit" class="oc-dialog__submit" data-form-submit :disabled="submitting">
            {{ submitting ? t('ia2.orchestrate.form.submitting') : t('ia2.orchestrate.form.submit') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.ia-orchestrate {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px 16px;
  overflow: auto;
}
.ia-orchestrate__head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}
.ia-orchestrate__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.ia-orchestrate__hint { font-size: 12px; color: var(--text-muted, var(--color-text-secondary, #878c99)); }
.ia-orchestrate__error {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  color: var(--error, var(--color-danger, #e11d48));
  word-break: break-all;
}
.ia-orchestrate__error code { font-size: 11px; }
.ia-orchestrate__retry {
  border: 1px solid currentColor;
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  padding: 1px 8px;
}

/* 实例化弹层（LoopCreateWizard 同构布局，字段三枚 + 可选租户） */
.oc-dialog { position: fixed; inset: 0; z-index: 1010; }
.oc-dialog__overlay { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5); }
.oc-dialog__panel {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90%;
  max-width: 520px;
  max-height: 85vh;
  overflow: auto;
  padding: 20px;
  border-radius: 12px;
  background: var(--bg-card, var(--color-bg-primary, #fff));
}
.oc-dialog__title {
  margin: 0 0 12px;
  font-size: 15px;
  color: var(--text-primary);
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.oc-dialog__source {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.oc-dialog__field {
  display: block;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--text-secondary);
}
.oc-dialog__field input,
.oc-dialog__field textarea {
  width: 100%;
  margin-top: 4px;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--color-bg-input, transparent);
  color: inherit;
  font-size: 13px;
  font-family: inherit;
  box-sizing: border-box;
}
.oc-dialog__err {
  display: block;
  margin: -6px 0 10px;
  font-size: 12px;
  color: var(--error, var(--color-danger, #e11d48));
}
.oc-dialog__submit-error {
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--error, var(--color-danger, #e11d48));
  word-break: break-all;
}
.oc-dialog__submit-error code { font-size: 11px; }
.oc-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.oc-dialog__actions button {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: inherit;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
.oc-dialog__submit {
  border: none !important;
  background: var(--accent-primary, var(--color-primary, #3b82f6)) !important;
  color: var(--color-on-accent, #fff) !important;
}
.oc-dialog__submit:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
