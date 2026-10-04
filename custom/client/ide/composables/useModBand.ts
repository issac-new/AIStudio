// overlay/custom/client/ide/composables/useModBand.ts
// P4 输入区上方模组横幅带（2026-10-04 九源轮）：注册式插槽基建。
//
// 出处：dsh v0.2.1 Claude Code Mods 兼容层的 band 语义（每会话一条、按加载
// 顺序绘制、可让渡）+ Claude Code Mods 的 ui.render(AbovePrompt) 位点。
// 本仓 v1：静态注册表（宿主传入 specs）+ priority 排序 + 单条隐藏（settings-layers
// user 层持久化，`ide_modband_hidden` 数组）+ 一键恢复。会话级让渡/热重载后续轮。
import { computed, ref } from 'vue'
import { readSetting, writeSetting } from '@/custom/settings-layers/index'

export interface ModBandSpec {
  /** 稳定 id（隐藏持久化与槽位路由用） */
  id: string
  /** 小者在上（recap=10 / 注入=20 / 审批记忆=30 / 运行行=40 / 轮结果=50 / todo=60） */
  priority: number
  /** 该模组当前是否有内容（无内容不渲染也不占隐藏位） */
  visible: boolean
  /** false=自带关闭钮的条（如 recap 自身 dismiss），带级 ✕ 不再叠一个 */
  hideable?: boolean
}

const HIDDEN_KEY = 'ide_modband_hidden'

function readHiddenIds(): string[] {
  const res = readSetting<string[]>(HIDDEN_KEY, [])
  return Array.isArray(res.value) ? res.value.filter((v) => typeof v === 'string') : []
}

export function useModBand() {
  const hidden = ref<string[]>(readHiddenIds())

  const ordered = computed(() => (specs: ModBandSpec[]) =>
    specs
      .filter((s) => s.visible && !hidden.value.includes(s.id))
      .slice()
      .sort((a, b) => a.priority - b.priority))

  function hideMod(id: string): void {
    if (hidden.value.includes(id)) return
    hidden.value = [...hidden.value, id]
    writeSetting('user', HIDDEN_KEY, hidden.value)
  }

  function showMod(id: string): void {
    hidden.value = hidden.value.filter((x) => x !== id)
    writeSetting('user', HIDDEN_KEY, hidden.value.length ? hidden.value : null)
  }

  const hiddenCount = computed(() => hidden.value.length)

  return { ordered, hidden, hiddenCount, hideMod, showMod }
}
