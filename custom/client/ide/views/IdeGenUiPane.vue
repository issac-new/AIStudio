<script setup lang="ts">
// IdeGenUiPane — G6 Gen UI 预览（对齐 zcode ::visualize 契约）。
// 只接受工作区内绝对路径；读文件上限 512 KiB；iframe sandbox=allow-scripts（无同源），
// 注入 CSP 禁网络。渲染失败/越界/超大都给诚实错误，不回退成"假装渲染"。
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeWorkspace } from '../composables/useIdeWorkspace'
import { readFile } from '@/api/studio/files'
import {
  collectGenUiReferences, isWithinWorkspace, wrapGenUiHtml, GEN_UI_MAX_SOURCE_BYTES,
  type GenUiReference,
} from '../utils/genui'
import { checkDiagram, type DiagramCheckResultDto } from '../utils/diagram-api'
import { IDE_LOCAL_TEXT, ideLocaleOf } from '../i18n'

const { locale } = useI18n()
const chat = useChatStore()
const { root } = useIdeWorkspace()
const tx = computed(() => IDE_LOCAL_TEXT[ideLocaleOf(locale)].genui)

type Row = GenUiReference & { messageId?: string }
const rows = computed<Row[]>(() =>
  collectGenUiReferences((chat.activeSession?.messages ?? []) as never, root.value) as Row[])

const selected = ref<Row | null>(null)
const html = ref('')
const loading = ref(false)
const error = ref('')
const fullscreen = ref(false)
const checking = ref(false)
const checkResult = ref<DiagramCheckResultDto | null>(null)
const checkError = ref('')

function clear(): void {
  selected.value = null
  html.value = ''
  error.value = ''
  fullscreen.value = false
  checkResult.value = null
  checkError.value = ''
}

async function open(row: Row): Promise<void> {
  selected.value = row
  html.value = ''
  error.value = ''
  checkResult.value = null
  checkError.value = ''
  if (!root.value) { error.value = tx.value.needWorkspace; return }
  if (!isWithinWorkspace(row.path, root.value)) { error.value = tx.value.outside; return }
  loading.value = true
  try {
    const res = await readFile(row.path, root.value)
    if (res.size > GEN_UI_MAX_SOURCE_BYTES) { error.value = tx.value.tooLarge; return }
    html.value = wrapGenUiHtml(res.content, row.title)
  } catch (e) {
    error.value = `${tx.value.loadFailed}: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    loading.value = false
  }
}

function refresh(): void {
  clear()
}

/** 项3 机械门禁：对当前选中产物跑 self_check（服务端=vendored self_check.py） */
async function runCheck(): Promise<void> {
  if (!selected.value || checking.value) return
  checking.value = true
  checkResult.value = null
  checkError.value = ''
  try {
    checkResult.value = await checkDiagram(selected.value.path)
  } catch (e) {
    checkError.value = `${tx.value.checkFailed}: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    checking.value = false
  }
}

watch(() => chat.activeSessionId, () => clear())
</script>

<template>
  <div class="ide-genui" :class="{ 'is-full': fullscreen }" data-testid="ide-genui-pane">
    <header class="ide-genui__head">
      <strong>{{ tx.title }}</strong>
      <span class="ide-genui__spacer" />
      <button type="button" class="ide-genui__btn" data-testid="ide-genui-refresh" @click="refresh">{{ tx.refresh }}</button>
      <button v-if="selected" type="button" class="ide-genui__btn" data-testid="ide-genui-check" :disabled="checking" @click="runCheck">
        {{ checking ? tx.checking : tx.check }}
      </button>
      <button v-if="selected" type="button" class="ide-genui__btn" data-testid="ide-genui-full" @click="fullscreen = !fullscreen">
        {{ fullscreen ? tx.exitFullscreen : tx.fullscreen }}
      </button>
    </header>

    <div v-if="!rows.length" class="ide-genui__empty" data-testid="ide-genui-empty">{{ tx.empty }}</div>
    <div v-else class="ide-genui__body">
      <ul class="ide-genui__list" data-testid="ide-genui-list">
        <li v-for="r in rows" :key="`${r.path}-${r.offset}`" :class="{ 'is-active': selected?.path === r.path && selected?.offset === r.offset }">
          <button type="button" class="ide-genui__item" :data-testid="`ide-genui-item-${r.offset}`" @click="open(r)">
            <span class="ide-genui__title">{{ r.title || tx.untitled }}</span>
            <span class="ide-genui__path">{{ r.path }}</span>
          </button>
        </li>
      </ul>

      <div class="ide-genui__preview">
        <div v-if="checkResult" class="ide-genui__verdict" :class="checkResult.ok ? 'is-pass' : 'is-fail'" data-testid="ide-genui-verdict">
          <template v-if="checkResult.runnerError">⚠ {{ checkResult.runnerError }}</template>
          <template v-else-if="checkResult.ok">✓ {{ tx.checkPass }}（{{ checkResult.durationMs }}ms）</template>
          <template v-else>
            ✗ {{ tx.checkFail }}
            <ul class="ide-genui__findings">
              <li v-for="(f, i) in checkResult.findings" :key="i">{{ f.message }}</li>
            </ul>
          </template>
        </div>
        <div v-else-if="checkError" class="ide-genui__verdict is-fail" data-testid="ide-genui-verdict">{{ checkError }}</div>
        <p v-if="loading" class="ide-genui__hint">…</p>
        <p v-else-if="error" class="ide-genui__error" data-testid="ide-genui-error">{{ error }}</p>
        <iframe
          v-else-if="html"
          class="ide-genui__frame"
          data-testid="ide-genui-frame"
          sandbox="allow-scripts"
          referrerpolicy="no-referrer"
          :title="selected?.title || tx.untitled"
          :srcdoc="html"
        />
        <p v-else class="ide-genui__hint">{{ tx.sandboxNote }}</p>
      </div>
      <p class="ide-genui__note">{{ tx.sandboxNote }}</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-genui { display: flex; flex-direction: column; min-height: 0; height: 100%; font-size: 12px; }
.ide-genui.is-full { position: absolute; inset: 0; z-index: 30; background: var(--bg-primary); }
.ide-genui__head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--border-color); }
.ide-genui__spacer { flex: 1; }
.ide-genui__btn { border: 1px solid var(--border-color); background: transparent; color: var(--text-primary); border-radius: 6px; padding: 3px 8px; font-size: 11px; cursor: pointer; }
.ide-genui__btn:hover { border-color: var(--primary-color); color: var(--primary-color); }
.ide-genui__empty { padding: 16px 12px; color: var(--text-muted); line-height: 1.6; }
.ide-genui__body { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 8px 10px 12px; gap: 8px; }
.ide-genui__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow: auto; }
.ide-genui__list li.is-active .ide-genui__item { border-color: var(--primary-color); }
.ide-genui__item { width: 100%; text-align: left; border: 1px solid var(--border-color); border-radius: 6px; background: transparent; padding: 5px 8px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
.ide-genui__title { color: var(--text-primary); font-size: 12px; }
.ide-genui__path { color: var(--text-muted); font-size: 10.5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
.ide-genui__preview { flex: 1; min-height: 180px; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; background: var(--bg-secondary); display: flex; flex-direction: column; }
.ide-genui__frame { flex: 1; width: 100%; height: 100%; border: none; background: var(--bg-primary); }
.ide-genui__hint { padding: 12px; color: var(--text-muted); margin: 0; }
.ide-genui__error { padding: 12px; color: var(--error-color); margin: 0; word-break: break-word; }
.ide-genui__verdict { padding: 8px 12px; font-size: 11px; line-height: 1.6; border-bottom: 1px solid var(--border-color); }
.ide-genui__verdict.is-pass { color: var(--success-color, #2e7d32); }
.ide-genui__verdict.is-fail { color: var(--error-color); }
.ide-genui__findings { margin: 4px 0 0; padding-left: 16px; color: var(--text-secondary); }
.ide-genui__note { margin: 0; color: var(--text-muted); font-size: 10.5px; line-height: 1.5; }
</style>
