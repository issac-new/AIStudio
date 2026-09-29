<script setup lang="ts">
// IdeImportHistory — 多源会话导入（遗留清单 L8，#22：codex/kimi/claude 三源）。
// 链路：选源+输入服务器上 JSONL 路径 → GET /api/zcode-engine/import/history-preview
// （session-importer 解析：行数/坏行/预览）→「导入写入」按钮调引擎 importSession
// RPC（zcode-patches 草稿 498-import-session-rpc；RPC 未开时如实报错不虚标）。
import { ref } from 'vue'
import { useIdeStore } from '../store/ide'

const ide = useIdeStore()
const open = ref(false)
const source = ref<'codex' | 'kimi' | 'claude'>('claude')
const filePath = ref('')
const preview = ref<{ rowCount: number; skippedRows: number; preview: Array<{ role: string; text: string }> } | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)

async function runPreview(): Promise<void> {
  error.value = null
  preview.value = null
  if (!ide.workspace) { error.value = '无工作区'; return }
  loading.value = true
  try {
    const res = await fetch(`/api/zcode-engine/import/history-preview?source=${source.value}&ref=${encodeURIComponent(filePath.value)}`)
    const body = await res.json() as { ok?: boolean; detail?: string; rowCount?: number; skippedRows?: number; preview?: Array<{ role: string; text: string }> }
    if (!res.ok || !body.ok) throw new Error(body.detail ?? `http_${res.status}`)
    preview.value = { rowCount: body.rowCount ?? 0, skippedRows: body.skippedRows ?? 0, preview: body.preview ?? [] }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

async function doImport(): Promise<void> {
  error.value = null
  try {
    const res = await fetch('/api/zcode-engine/import/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspacePath: ide.workspace, source: source.value, ref: filePath.value }),
    })
    const body = await res.json() as { ok?: boolean; detail?: string; sessionId?: string }
    if (!res.ok || !body.ok) throw new Error(body.detail ?? `http_${res.status}`)
    preview.value = null
    filePath.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <div class="ide-import" data-testid="ide-import-history">
    <button type="button" class="ide-import__btn" title="导入外部会话历史（codex/kimi/claude）" data-testid="ide-import-open" @click="open = !open">⇪ 导入</button>
    <div v-if="open" class="ide-import__panel" data-testid="ide-import-panel">
      <div class="ide-import__head">
        会话导入
        <select v-model="source" data-testid="ide-import-source">
          <option value="claude">claude</option>
          <option value="codex">codex</option>
          <option value="kimi">kimi</option>
        </select>
        <input v-model="filePath" class="ide-import__path" placeholder="服务器上 JSONL 路径" data-testid="ide-import-path">
        <button type="button" class="ide-import__run" :disabled="loading || !filePath.trim()" data-testid="ide-import-preview" @click="runPreview">{{ loading ? '解析中…' : '解析预览' }}</button>
      </div>
      <p v-if="error" class="ide-import__error" data-testid="ide-import-error">{{ error }}</p>
      <template v-if="preview">
        <p class="ide-import__summary" data-testid="ide-import-summary">
          {{ preview.rowCount }} 行 · 坏行 {{ preview.skippedRows }}
        </p>
        <div v-for="(r, i) in preview.preview" :key="i" class="ide-import__row">[{{ r.role }}] {{ r.text }}</div>
        <button type="button" class="ide-import__do" data-testid="ide-import-do" @click="doImport">导入写入（引擎 importSession RPC——未开时如实报错）</button>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-import { position: relative; display: inline-block; }
.ide-import__btn { border: none; background: transparent; cursor: pointer; font-size: 11px; color: var(--text-color-3, #999); padding: 0 4px; &:hover { color: var(--text-color-1, #333); } }
.ide-import__panel {
  position: absolute; bottom: calc(100% + 6px); right: 0; z-index: 95;
  background: var(--card-color, #fff); border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px; padding: 8px 10px; min-width: 320px; max-width: 420px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12); font-size: 11px;
}
.ide-import__head { display: flex; align-items: center; gap: 6px; font-weight: 600; flex-wrap: wrap; }
.ide-import__path { flex: 1; min-width: 120px; border: 1px solid var(--border-color, #e0e0e0); border-radius: 4px; padding: 2px 6px; font-size: 11px; background: var(--bg-primary, #fff); color: var(--text-color-1, #333); }
.ide-import__run, .ide-import__do { border: 1px solid var(--primary-color, #18a058); color: var(--primary-color, #18a058); background: transparent; border-radius: 4px; font-size: 11px; padding: 1px 8px; cursor: pointer; }
.ide-import__do { width: 100%; margin-top: 6px; }
.ide-import__error { color: var(--error-color, #d03050); word-break: break-all; }
.ide-import__summary { color: var(--text-color-2, #555); margin: 4px 0; }
.ide-import__row { color: var(--text-color-3, #999); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
