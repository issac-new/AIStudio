<script setup lang="ts">
// IdeVideoFramesDialog — 视频抽帧入会话（A7：/api/ide/video-frames 此前零客户端，
// kimi 视频输入链路最后一公里的服务端形态——按路径抽帧，覆盖 agent 录屏产物与
// 不便经浏览器 FileReader 的大视频；粘贴/选文件的小视频由 ChatInput 浏览器端
// 抽帧原生覆盖）。产出=PNG File 列表，经 ChatInput defineExpose(addFiles) 入输入框。
import { ref } from 'vue'
import { authFetch } from '../utils/auth-fetch'

const props = defineProps<{ workspace?: string | null }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'frames', files: File[]): void }>()

const videoPath = ref('')
const framesCount = ref(8)
const busy = ref(false)
const error = ref('')

/** base64 → File（帧固定 PNG，见 frame-extract.ts 输出 frame-%02d.png）。 */
function base64ToPngFile(dataBase64: string, index: number): File {
  const bin = atob(dataBase64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], `video-frame-${index + 1}.png`, { type: 'image/png' })
}

async function extract(): Promise<void> {
  const raw = videoPath.value.trim()
  if (!raw || busy.value) return
  // 相对路径按当前 workspace 解析（与文件树口径一致）
  const abs = raw.startsWith('/') ? raw : (props.workspace ? `${props.workspace.replace(/\/$/, '')}/${raw}` : raw)
  busy.value = true
  error.value = ''
  try {
    const res = await authFetch('/api/ide/video-frames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoPath: abs, frames: framesCount.value, widthPx: 1280 }),
    })
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; frames?: Array<{ index: number; dataBase64: string }>; detail?: string }
    if (!res.ok || !body.ok || !Array.isArray(body.frames)) {
      error.value = body.detail || `HTTP ${res.status}`
      return
    }
    emit('frames', body.frames.map((f) => base64ToPngFile(f.dataBase64, f.index)))
    emit('close')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="ide-vf__backdrop" data-testid="ide-vf" @click.self="emit('close')">
    <div class="ide-vf__dialog">
      <div class="ide-vf__head">视频抽帧入会话<span class="ide-vf__hint">（按路径抽帧为 PNG 帧序列，作为图片附件投喂）</span></div>
      <div class="ide-vf__row">
        <input v-model="videoPath" data-testid="ide-vf-path" placeholder="视频路径（相对 workspace 或绝对路径）" />
      </div>
      <div class="ide-vf__row">
        <label>帧数 <input v-model.number="framesCount" type="number" min="1" max="32" data-testid="ide-vf-frames" /></label>
        <button type="button" data-testid="ide-vf-extract" :disabled="busy || !videoPath.trim()" @click="extract">{{ busy ? '抽帧中…' : '抽帧' }}</button>
      </div>
      <div v-if="error" class="ide-vf__error" data-testid="ide-vf-error">{{ error }}</div>
      <div class="ide-vf__foot"><button type="button" data-testid="ide-vf-close" @click="emit('close')">取消</button></div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-vf__backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 500; display: flex; align-items: center; justify-content: center; }
.ide-vf__dialog { width: 460px; background: var(--card-color, #fff); border-radius: 10px; padding: 14px 16px; font-size: 12px; }
.ide-vf__head { font-weight: 600; margin-bottom: 8px; }
.ide-vf__hint { font-weight: 400; font-size: 10px; color: var(--text-color-3, #999); }
.ide-vf__row { display: flex; gap: 8px; margin: 8px 0; align-items: center; }
.ide-vf__row input[type], .ide-vf__row input:not([type]) { flex: 1; border: 1px solid var(--border-color, #ddd); border-radius: 4px; padding: 4px 8px; font-size: 12px; }
.ide-vf__row input[type="number"] { flex: 0 0 64px; }
.ide-vf__row button { border: 1px solid var(--primary-color, #18a058); color: var(--primary-color, #18a058); background: none; border-radius: 6px; padding: 3px 14px; cursor: pointer; }
.ide-vf__error { color: var(--error-color, #d03050); font-size: 11px; }
.ide-vf__foot { display: flex; justify-content: flex-end; }
.ide-vf__foot button { border: 1px solid var(--border-color, #ddd); background: none; border-radius: 6px; padding: 3px 12px; cursor: pointer; }
</style>
