import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionSearch } from './useSessionSearch'

export function useKeyboard() {
  const router = useRouter()
  const { sessionSearchOpen, openSessionSearch, closeSessionSearch } = useSessionSearch()

  function isEditableTarget(target: EventTarget | null): boolean {
    const el = target instanceof Element ? target : null
    if (!el) return false
    if (el.closest('.monaco-editor')) return true
    const tag = el.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
  }

  function handleKeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey

    if (mod && e.key === 'n') {
      e.preventDefault()
      void import('@/stores/hermes/chat').then(({ useChatStore }) => {
        useChatStore().newChat()
      })
      return
    }

    if (mod && e.key === 'j') {
      e.preventDefault()
      router.push({ name: 'hermes.jobs' })
      return
    }

    if (mod && e.key === ',') {
      if (router.currentRoute.value.name === 'login') return
      e.preventDefault()
      router.push({ name: 'hermes.settings' })
      return
    }

    // ⌘F opens session search (was ⌘K, which collided with the IDE command
    // palette). Skip editable targets so monaco's in-editor find and text
    // inputs keep the browser/editor-native behavior.
    if (mod && e.key.toLowerCase() === 'f' && !isEditableTarget(e.target)) {
      if (router.currentRoute.value.name === 'login') return
      e.preventDefault()
      openSessionSearch()
      return
    }

    if (e.key === 'Escape') {
      if (sessionSearchOpen.value) {
        e.preventDefault()
        closeSessionSearch()
        return
      }
      // Close any open modals — naive-ui handles this internally
      const modal = document.querySelector('.n-modal-mask')
      if (modal) {
        const closeBtn = modal.querySelector('.n-base-close') as HTMLElement
        closeBtn?.click()
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
}
